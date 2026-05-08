// =============================================================================
// JOE LEFFEW PROPERTIES — CHATTANOOGA TAX LOOKUP FUNCTION
// =============================================================================
// Takes a Hamilton County address, returns parcel data + projected tax bill.
// Zero external dependencies — uses plain regex for HTML parsing.
// Netlify Functions v2 (export default).
// =============================================================================

// -----------------------------------------------------------------------------
// 2025 CERTIFIED MILLAGE RATES (per $100 of assessed value)
// Source: Hamilton County Assessor announcement, June 2025
// In effect through next reappraisal cycle (2029).
// -----------------------------------------------------------------------------
const COUNTY_RATE = 1.5157;

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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// -----------------------------------------------------------------------------
// HTML HELPERS — strip tags, decode entities, no external library
// -----------------------------------------------------------------------------
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// -----------------------------------------------------------------------------
// PARSE ADDRESS
// -----------------------------------------------------------------------------
function parseAddress(raw) {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const number = match[1];
  let name = match[2];

  name = name.replace(/\s+(Rd|Road|St|Street|Dr|Drive|Ln|Lane|Ave|Avenue|Blvd|Boulevard|Cir|Circle|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Hwy|Highway|Trl|Trail)\.?$/i, '');
  name = name.replace(/\s+(Apt|Unit|#|Suite|Ste)\s*\S*$/i, '');

  return { number, name: name.trim() };
}

// -----------------------------------------------------------------------------
// SEARCH ASSESSOR
// -----------------------------------------------------------------------------
async function searchAssessor(streetNumber, streetName) {
  const formData = new URLSearchParams({
    'StreetName': streetName,
    'StreetNumber': streetNumber,
    'ParcelID': '',
    'Owner': '',
  });

  const response = await fetch('https://assessor.hamiltontn.gov/search', {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Assessor search failed: HTTP ${response.status}`);
  }

  const html = await response.text();

  // Look for any link to /card/PARCELID
  const linkMatch = html.match(/href=["']\/card\/([^"'?#]+)["']/i);
  if (linkMatch) {
    return decodeURIComponent(linkMatch[1]).replace(/\+/g, ' ');
  }

  // Fallback: look for a parcel-id-shaped string in the HTML
  // Hamilton County parcel IDs look like "067I C 038.03" (3 digits + optional letter, space, letter, space, digits with optional decimal)
  const idMatch = html.match(/\b(\d{3}[A-Z]?\s+[A-Z]\s+\d+(?:\.\d+)?)\b/);
  if (idMatch) return idMatch[1];

  return null;
}

// -----------------------------------------------------------------------------
// FETCH PARCEL CARD
// -----------------------------------------------------------------------------
async function fetchParcelCard(parcelId) {
  const url = `https://assessor.hamiltontn.gov/card/${encodeURIComponent(parcelId)}`;
  const response = await fetch(url, { headers: BROWSER_HEADERS });

  if (!response.ok) {
    throw new Error(`Parcel card fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const text = stripTags(html);

  // Helper: pull short value following a label, stops at next label or 2+ spaces
  const grab = (label) => {
    const re = new RegExp(label + '\\s+([^\\n\\r]+?)(?=\\s{2,}|$)', 'i');
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };

  // Helper: extract dollar amount following a label
  const grabDollar = (label) => {
    const re = new RegExp(label + '\\s+\\$?([\\d,]+)', 'i');
    const m = text.match(re);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  };

  return {
    parcelId,
    location: grab('Location'),
    owner: grab('Owner'),
    city: grab('City'),
    district: grab('District'),
    yearBuilt: grab('built about'),
    salePrice: grabDollar('Sale Price'),
    saleDate: grab('Sale Date'),
    buildingValue: grabDollar('Building Value'),
    landValue: grabDollar('Land Value'),
    totalValue: grabDollar('Total Value'),
    assessedValue: grabDollar('Assessed Value'),
    sourceUrl: url,
  };
}

// -----------------------------------------------------------------------------
// CALCULATE TAXES
// -----------------------------------------------------------------------------
function calculateTaxes(parcelData, purchasePrice) {
  const district = (parcelData.district || 'COUNTY').toUpperCase().trim();
  const cityRate = CITY_RATES[district] || 0;
  const isUnincorporated = (district === 'COUNTY');
  const combinedRate = COUNTY_RATE + cityRate;

  const currentAssessed = parcelData.assessedValue || 0;
  const currentAnnual = (currentAssessed * combinedRate) / 100;

  let projectedAnnual = null;
  let projectedAssessed = null;
  let monthlyDifference = null;

  if (purchasePrice && purchasePrice > 0) {
    projectedAssessed = purchasePrice * 0.25;
    projectedAnnual = (projectedAssessed * combinedRate) / 100;
    monthlyDifference = (projectedAnnual - currentAnnual) / 12;
  }

  return {
    district,
    isUnincorporated,
    countyRate: COUNTY_RATE,
    cityRate,
    combinedRate: parseFloat(combinedRate.toFixed(4)),
    current: {
      assessedValue: currentAssessed,
      annualTax: Math.round(currentAnnual),
      monthlyTax: Math.round(currentAnnual / 12),
    },
    projected: purchasePrice ? {
      purchasePrice: purchasePrice,
      assessedValue: Math.round(projectedAssessed),
      annualTax: Math.round(projectedAnnual),
      monthlyTax: Math.round(projectedAnnual / 12),
      monthlyDifference: Math.round(monthlyDifference),
      annualDifference: Math.round(projectedAnnual - currentAnnual),
      effectiveYear: 2029,
    } : null,
  };
}

// -----------------------------------------------------------------------------
// MAIN HANDLER (Netlify Functions v2)
// -----------------------------------------------------------------------------
export default async (req, context) => {
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
      } catch (e) { /* ignore */ }
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
        JSON.stringify({ error: 'Could not parse address. Try format: "1524 Green Pond Rd"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parcelId = await searchAssessor(parsed.number, parsed.name);
    if (!parcelId) {
      return new Response(
        JSON.stringify({
          error: 'No parcel found for that address',
          searched: parsed,
          hint: 'The assessor search may use different field names. Check function logs.',
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    const parcelData = await fetchParcelCard(parcelId);
    const taxes = calculateTaxes(parcelData, purchasePrice);

    return new Response(
      JSON.stringify({
        success: true,
        parcel: parcelData,
        taxes: taxes,
        disclaimer: 'Projected taxes are estimates based on Tennessee\'s 25% residential assessment ratio applied to your purchase price, with current 2025 certified millage rates. Actual taxes may vary at the next county-wide reappraisal in 2029. Verify with the Hamilton County Assessor of Property.',
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
        stack: err.stack,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};
