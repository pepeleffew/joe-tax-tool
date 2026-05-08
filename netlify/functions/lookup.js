// =============================================================================
// JOE LEFFEW PROPERTIES — CHATTANOOGA TAX LOOKUP FUNCTION (v5)
// =============================================================================
// v5 (2026-05): Replaced MACITY-based jurisdiction detection with a true
// point-in-polygon spatial join against the Municipalities layer. MACITY is a
// USPS mailing artifact and misclassifies unincorporated parcels with city
// mailing addresses (e.g. 1524 Green Pond Rd has MACITY "Soddy Daisy" but is
// actually unincorporated Hamilton County — should bill at county-only rate).
//
// v5 logic:
//   1. Query Live_Parcels with returnGeometry=true (same SR as Municipalities).
//   2. Compute centroid of the parcel polygon.
//   3. Spatial-query Municipalities/2 (esriSpatialRelIntersects) for the NAME.
//   4. Use that NAME (or "COUNTY" if empty/Hamilton County) for tax calc.
//
// MACITY is retained in the response for transparency and rollout diagnostics
// so we can surface parcels where mailing city ≠ taxing jurisdiction.
//
// Data sources:
//   Parcels:        https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer/0
//   Municipalities: https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Administrative/MapServer/2
//
// Both layers use spatialReference wkid 103152 (TN State Plane, US Feet) —
// no reprojection required.
//
// No external dependencies. Netlify Functions v2 (export default).
// =============================================================================

// -----------------------------------------------------------------------------
// 2025 CERTIFIED MILLAGE RATES (per $100 of assessed value)
// -----------------------------------------------------------------------------
const COUNTY_RATE = 1.5157;

// City rates keyed to the exact NAME values returned by Municipalities/2.
// Verified spelling/casing against the layer's own attribute list.
const CITY_RATES = {
  'Chattanooga':      1.5500,
  'Collegedale':      1.0690,
  'East Ridge':       0.7993,
  'Lakesite':         0.1336,
  'Lookout Mountain': 1.5500,
  'Red Bank':         0.8968,
  'Ridgeside':        1.9150,
  'Signal Mountain':  1.1002,
  'Soddy Daisy':      0.9070,
  'Walden':           0.6900, // approximate — verify
};

const PARCELS_QUERY_URL =
  'https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer/0/query';

const MUNICIPALITIES_QUERY_URL =
  'https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Administrative/MapServer/2/query';

const SPATIAL_REF_WKID = 103152;

// -----------------------------------------------------------------------------
// PARSE ADDRESS — extract street number + street name for LIKE query
// -----------------------------------------------------------------------------
function parseAddress(raw) {
  const cleaned = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const number = match[1];
  let name = match[2];

  name = name.replace(/\s+(RD|ROAD|ST|STREET|DR|DRIVE|LN|LANE|AVE|AVENUE|BLVD|BOULEVARD|CIR|CIRCLE|CT|COURT|WAY|PL|PLACE|PKWY|PARKWAY|TER|TERRACE|HWY|HIGHWAY|TRL|TRAIL|PIKE)\.?$/i, '');
  name = name.replace(/\s+(APT|UNIT|#|SUITE|STE)\s*\S*$/i, '');
  name = name.replace(/^(N|S|E|W|NE|NW|SE|SW)\s+/i, '');

  // Escape single quotes for SQL LIKE
  name = name.replace(/'/g, "''");

  return { number, name: name.trim(), original: cleaned };
}

// -----------------------------------------------------------------------------
// QUERY GIS — find parcels matching the address (with geometry for v5 join)
// -----------------------------------------------------------------------------
async function queryParcels(streetNumber, streetName) {
  const tries = [
    // Most specific: number + name as a contiguous LIKE pattern
    `ADDRESS LIKE '${streetNumber} %${streetName}%'`,
    // Fallback: STNUM exact + STNAME LIKE (handles odd spacing/punctuation)
    `STNUM = '${streetNumber}' AND STNAME LIKE '%${streetName}%'`,
  ];

  for (const where of tries) {
    const params = new URLSearchParams({
      where,
      outFields: '*',
      f: 'json',
      returnGeometry: 'true',           // v5: need geometry for centroid
      outSR: String(SPATIAL_REF_WKID),  // v5: lock to State Plane (matches Municipalities/2)
      resultRecordCount: '10',
    });

    const url = `${PARCELS_QUERY_URL}?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      throw new Error(`GIS parcels query failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`GIS error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    if (data.features && data.features.length > 0) {
      // Return both attributes and geometry as a unified record
      return data.features.map(f => ({
        ...f.attributes,
        _geometry: f.geometry,
      }));
    }
  }

  return [];
}

// -----------------------------------------------------------------------------
// PICK BEST MATCH — when multiple parcels come back, prefer exact STNUM
// -----------------------------------------------------------------------------
function pickBestMatch(records, streetNumber) {
  if (records.length === 0) return null;
  if (records.length === 1) return records[0];

  const exact = records.find(
    r => String(r.STNUM).trim() === String(streetNumber).trim()
  );
  return exact || records[0];
}

// -----------------------------------------------------------------------------
// COMPUTE CENTROID from polygon rings
// Averages all unique vertices across all rings. Drops the closing-duplicate
// vertex (last == first) per ring. Adequate for point-in-polygon membership;
// not a true area-weighted centroid, but parcels are convex enough that the
// averaged-vertex centroid reliably falls inside the parcel.
// -----------------------------------------------------------------------------
function computeCentroid(geometry) {
  if (!geometry || !Array.isArray(geometry.rings) || geometry.rings.length === 0) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const ring of geometry.rings) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    // Last vertex closes the ring (== first); drop it.
    for (let i = 0; i < ring.length - 1; i++) {
      const [x, y] = ring[i];
      if (typeof x === 'number' && typeof y === 'number') {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
}

// -----------------------------------------------------------------------------
// SPATIAL QUERY — point-in-polygon against Municipalities/2
// Returns the municipality NAME, or null if the centroid falls outside all
// city limits (i.e. unincorporated). Treats "Hamilton County" as unincorporated.
// -----------------------------------------------------------------------------
async function querySpatialJurisdiction(centroid) {
  if (!centroid) return null;

  const geometryJson = JSON.stringify({
    x: centroid.x,
    y: centroid.y,
    spatialReference: { wkid: SPATIAL_REF_WKID },
  });

  const params = new URLSearchParams({
    geometry: geometryJson,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME',
    returnGeometry: 'false',
    f: 'json',
  });

  const url = `${MUNICIPALITIES_QUERY_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    throw new Error(`GIS municipalities query failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`GIS error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  if (!data.features || data.features.length === 0) {
    return null; // unincorporated
  }

  // Filter out "Hamilton County" — it represents the county polygon itself,
  // not a taxing city. If it's the only match, the parcel is unincorporated.
  const cityFeatures = data.features.filter(
    f => f.attributes && f.attributes.NAME && f.attributes.NAME !== 'Hamilton County'
  );

  if (cityFeatures.length === 0) return null;
  return cityFeatures[0].attributes.NAME;
}

// -----------------------------------------------------------------------------
// DETERMINE TAXING CITY from spatial-join result
// -----------------------------------------------------------------------------
function determineTaxingCity(spatialName) {
  if (!spatialName) {
    return { name: 'COUNTY', cityRate: 0, confidence: 'high' };
  }

  if (CITY_RATES[spatialName] !== undefined) {
    return {
      name: spatialName,
      cityRate: CITY_RATES[spatialName],
      confidence: 'high', // verified by point-in-polygon, not mailing address
    };
  }

  // Spatial join returned a NAME we don't have a rate for. Shouldn't happen
  // given the 10 known NAMEs in Municipalities/2, but surface it loudly.
  return {
    name: 'COUNTY',
    cityRate: 0,
    confidence: 'low',
    unknownJurisdiction: spatialName,
  };
}

// -----------------------------------------------------------------------------
// PICK MOST RECENT MEANINGFUL SALE (skip $0 family transfers)
// -----------------------------------------------------------------------------
function extractLastSale(rec) {
  for (let i = 1; i <= 4; i++) {
    const date = rec[`SALE${i}DATE`];
    const price = rec[`SALE${i}CONSD`];
    if (date && price && price > 0) {
      return {
        date: new Date(date).toISOString().slice(0, 10),
        price: Math.round(price),
      };
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// CALCULATE TAXES
// -----------------------------------------------------------------------------
function calculateTaxes(rec, taxingCity, purchasePrice) {
  const combinedRate = COUNTY_RATE + taxingCity.cityRate;

  const appraised = rec.APPVALUE || 0;
  const currentAssessed = appraised * 0.25;
  const currentAnnual = (currentAssessed * combinedRate) / 100;

  let projected = null;
  if (purchasePrice && purchasePrice > 0) {
    const projectedAssessed = purchasePrice * 0.25;
    const projectedAnnual = (projectedAssessed * combinedRate) / 100;
    projected = {
      purchasePrice,
      assessedValue: Math.round(projectedAssessed),
      annualTax: Math.round(projectedAnnual),
      monthlyTax: Math.round(projectedAnnual / 12),
      annualDifference: Math.round(projectedAnnual - currentAnnual),
      monthlyDifference: Math.round((projectedAnnual - currentAnnual) / 12),
      effectiveYear: 2029,
    };
  }

  return {
    district: taxingCity.name,
    isUnincorporated: taxingCity.name === 'COUNTY',
    countyRate: COUNTY_RATE,
    cityRate: taxingCity.cityRate,
    combinedRate: parseFloat(combinedRate.toFixed(4)),
    confidence: taxingCity.confidence,
    current: {
      appraisedValue: Math.round(appraised),
      assessedValue: Math.round(currentAssessed),
      annualTax: Math.round(currentAnnual),
      monthlyTax: Math.round(currentAnnual / 12),
    },
    projected,
  };
}

// -----------------------------------------------------------------------------
// SHAPE THE PARCEL OBJECT for the response
// -----------------------------------------------------------------------------
function shapeParcel(rec, taxingJurisdiction) {
  return {
    parcelId: rec.TAX_MAP_NO || rec.GISLINK,
    address: rec.ADDRESS,
    mailingCity: rec.MACITY,                 // for transparency / debugging
    taxingJurisdiction: taxingJurisdiction,  // v5: from spatial join
    owner: (rec.OWNERNAME1 || '').trim() || null,
    coOwner: (rec.OWNERNAME2 || '').trim() || null,
    appraisedValue: rec.APPVALUE,
    assessedValue: rec.ASSVALUE,
    landValue: rec.LANDVALUE,
    buildingValue: rec.BUILDVALUE,
    yardItemsValue: rec.YardItemsV,
    acres: rec.CALCACRES,
    neighborhood: (rec.NEIGHBOR_1 || '').trim() || null,
    propType: (rec.PROPTYPE || '').trim() || null,
    legalDescription: (rec.LEGALDESC1 || '').trim() || null,
    rawDistrict: (rec.DISTRICT || '').trim(),
    lastSale: extractLastSale(rec),
    assessorCardUrl: rec.RecordsOnl || null,
  };
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------
export default async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let address = url.searchParams.get('address');
    let priceRaw = url.searchParams.get('price');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        address = address || body.address;
        priceRaw = priceRaw || body.price;
      } catch (_) { /* ignore body parse errors */ }
    }

    const purchasePrice = parseFloat(priceRaw) || null;

    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: address' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parsed = parseAddress(address);
    if (!parsed) {
      return new Response(
        JSON.stringify({
          error: 'Could not parse address',
          hint: 'Try format: "1524 Green Pond Rd"',
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const records = await queryParcels(parsed.number, parsed.name);

    if (records.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No parcel found for that address',
          searched: parsed,
          hint: 'Verify the address at https://assessor.hamiltontn.gov',
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Multiple matches with no exact STNUM hit — return candidates for disambiguation
    if (records.length > 1) {
      const exactMatch = records.find(
        r => String(r.STNUM).trim() === parsed.number
      );
      if (!exactMatch) {
        return new Response(
          JSON.stringify({
            multipleMatches: true,
            candidates: records.map(r => ({
              address: r.ADDRESS,
              parcelId: r.TAX_MAP_NO,
              owner: (r.OWNERNAME1 || '').trim(),
              city: r.MACITY,
            })),
          }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    const best = pickBestMatch(records, parsed.number);

    // v5: Spatial join — point-in-polygon against Municipalities/2
    const centroid = computeCentroid(best._geometry);
    const spatialName = await querySpatialJurisdiction(centroid);
    const taxingCity = determineTaxingCity(spatialName);

    const parcel = shapeParcel(best, taxingCity.name);
    const taxes = calculateTaxes(best, taxingCity, purchasePrice);

    return new Response(
      JSON.stringify({
        success: true,
        parcel,
        taxes,
        // Diagnostic block — surfaces parcels where mailing city ≠ taxing
        // jurisdiction. Useful during v5 rollout; remove once confident.
        _diagnostic: {
          version: 'v5',
          mailingCity: best.MACITY,
          spatialJurisdiction: spatialName || 'Unincorporated',
          mailingMatchesSpatial:
            (best.MACITY || '').trim().toUpperCase() ===
            (spatialName || 'COUNTY').toUpperCase(),
          centroid: centroid
            ? { x: Math.round(centroid.x), y: Math.round(centroid.y) }
            : null,
        },
        disclaimer:
          'Estimated using 2025 certified Hamilton County millage rates and ' +
          "Tennessee's 25% residential assessment ratio. Actual taxes may " +
          'vary at the next county-wide reappraisal in 2029, when certified ' +
          'rates are recalibrated. Verify with the Hamilton County Assessor.',
        dataSource:
          'Hamilton County GIS — Live_Parcels + Live_Administrative (Municipalities)',
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=86400',
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Lookup failed',
        message: err.message,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};
