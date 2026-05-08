// =============================================================================
// JOE LEFFEW PROPERTIES — CHATTANOOGA TAX LOOKUP FUNCTION (v4)
// =============================================================================
// v4 (2026-05): Pivoted from scraping assessor.hamiltontn.gov (Blazor app —
// not scrapable) to querying Hamilton County's public GIS REST API directly.
// Same data, clean JSON, no auth required.
//
// Data source: Live_Parcels MapServer, layer 0
//   https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer/0
//
// Tax-district determination note: the GIS DISTRICT field is a Hamilton County
// civil district code (1-9 for elections/admin), NOT a city code. We use
// MACITY as the proxy for taxing jurisdiction with explicit confidence flags.
// A future v5 should spatially join parcel centroids against a city-limits
// polygon layer for pixel-perfect accuracy.
//
// No external dependencies. Netlify Functions v2 (export default).
// =============================================================================

// -----------------------------------------------------------------------------
// 2025 CERTIFIED MILLAGE RATES (per $100 of assessed value)
// Source: Hamilton County Assessor + city certifications, June 2025.
// In effect through the next reappraisal cycle (2029).
// -----------------------------------------------------------------------------
const COUNTY_RATE = 1.5157;

// City rates keyed by MACITY values as they appear in the GIS data.
const CITY_RATES = {
  'CHATTANOOGA':       1.5500,
  'COLLEGEDALE':       1.0690,
  'EAST RIDGE':        0.7993,
  'LAKESITE':          0.1336,
  'LOOKOUT MOUNTAIN':  1.5500,
  'RED BANK':          0.8968,
  'RIDGESIDE':         1.9150,
  'SIGNAL MOUNTAIN':   1.1002,
  'SODDY DAISY':       0.9070,
  'SODDY-DAISY':       0.9070,
  'WALDEN':            0.6900, // approximate — verify
};

// MACITY values that are mailing-address artifacts of unincorporated
// Hamilton County (not actual taxing cities).
const NON_TAXING_MAILING_CITIES = new Set([
  'HIXSON',
  'OOLTEWAH',
  'HARRISON',
  'SALE CREEK',
  'BIRCHWOOD',
  'APISON',
  'FLAT TOP MOUNTAIN',
  'GEORGETOWN',
]);

const GIS_QUERY_URL =
  'https://mapsdev.hamiltontn.gov/hcwa03/rest/services/Live_Parcels/MapServer/0/query';

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
// QUERY GIS — find parcels matching the address
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
      returnGeometry: 'false',
      resultRecordCount: '10',
    });

    const url = `${GIS_QUERY_URL}?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      throw new Error(`GIS query failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`GIS error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    if (data.features && data.features.length > 0) {
      return data.features.map(f => f.attributes);
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
// DETERMINE TAXING CITY from MACITY (with confidence flag)
// -----------------------------------------------------------------------------
function determineTaxingCity(macity) {
  if (!macity) return { name: 'COUNTY', cityRate: 0, confidence: 'low' };

  const normalized = macity.trim().toUpperCase();

  if (CITY_RATES[normalized] !== undefined) {
    return {
      name: normalized,
      cityRate: CITY_RATES[normalized],
      confidence: 'medium', // MACITY is mailing, not situs — usually right
    };
  }

  if (NON_TAXING_MAILING_CITIES.has(normalized)) {
    return {
      name: 'COUNTY',
      cityRate: 0,
      confidence: 'high',
    };
  }

  return {
    name: 'COUNTY',
    cityRate: 0,
    confidence: 'low',
    unknownMacity: normalized,
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

  // Always derive current assessed from APPVALUE × 0.25 for residential.
  // ASSVALUE comes back as 0 for some commercial/exempt parcels — APPVALUE
  // is the reliable signal.
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
function shapeParcel(rec) {
  return {
    parcelId: rec.TAX_MAP_NO || rec.GISLINK,
    address: rec.ADDRESS,
    mailingCity: rec.MACITY,
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
    const parcel = shapeParcel(best);
    const taxingCity = determineTaxingCity(best.MACITY);
    const taxes = calculateTaxes(best, taxingCity, purchasePrice);

    return new Response(
      JSON.stringify({
        success: true,
        parcel,
        taxes,
        disclaimer:
          'Estimated using 2025 certified Hamilton County millage rates and ' +
          "Tennessee's 25% residential assessment ratio. Actual taxes may " +
          'vary at the next county-wide reappraisal in 2029, when certified ' +
          'rates are recalibrated. Verify with the Hamilton County Assessor.',
        dataSource: 'Hamilton County GIS — Live_Parcels',
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
