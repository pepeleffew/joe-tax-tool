// =============================================================================
// JOE LEFFEW PROPERTIES — CHATTANOOGA TAX LOOKUP FUNCTION
// =============================================================================
// Takes a Hamilton County address, returns parcel data + projected tax bill.
//
// Workflow:
//   1. Parse the address into street number + street name
//   2. POST that to assessor.hamiltontn.gov/search to get parcel results
//   3. Extract the first parcel ID from the results table
//   4. GET the parcel detail card to extract assessed value + district
//   5. Apply the appropriate millage rate
//   6. Project the future tax bill if a purchase price was provided
//   7. Return clean JSON
// =============================================================================

const cheerio = require('cheerio');

// -----------------------------------------------------------------------------
// 2025 CERTIFIED MILLAGE RATES (per $100 of assessed value)
// Source: Chattanoogan.com, Hamilton County Assessor announcement, June 2025
// These rates were certified after the 2025 county-wide reappraisal
// and are in effect through the next reappraisal cycle (2029).
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
  'SODDY-DAISY':       0.9070, // handle both spellings
  'WALDEN':            0.6900, // approximate — verify with city
};

// Headers that mimic a real browser. The assessor site returns 403 to default
// scraper user-agents, so we always send these.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// -----------------------------------------------------------------------------
// PARSE ADDRESS — split "1524 Green Pond Rd" into number=1524, name="green pond"
// The assessor search wants the street name WITHOUT the suffix (Rd, Dr, etc.)
// because their database stores names that way.
// -----------------------------------------------------------------------------
function parseAddress(raw) {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const number = match[1];
  let name = match[2];

  // Strip common street suffixes — the assessor often stores "Green Pond" not "Green Pond Rd"
  // Strip apartment/unit info too
  name = name.replace(/\s+(Rd|Road|St|Street|Dr|Drive|Ln|Lane|Ave|Avenue|Blvd|Boulevard|Cir|Circle|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Hwy|Highway|Trl|Trail)\.?$/i, '');
  name = name.replace(/\s+(Apt|Unit|#|Suite|Ste)\s*\S*$/i, '');

  return { number, name: name.trim() };
}

// -----------------------------------------------------------------------------
// SEARCH ASSESSOR — submits the search form and returns the first parcel ID
// -----------------------------------------------------------------------------
async function searchAssessor(streetNumber, streetName) {
  // The form posts to /search with fields: StreetName, StreetNumber, ParcelID, Owner
  // Field names guessed from screenshot — may need adjustment after first test
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
  const $ = cheerio.load(html);

  // Look for a results table. From the screenshot, Parcel ID is the first column.
  // We grab the first parcel link/row.
  let parcelId = null;

  // Strategy 1: look for links to /card/...
  $('a[href*="/card/"]').each((_, el) => {
    if (!parcelId) {
      const href = $(el).attr('href');
      const m = href.match(/\/card\/([^/?#]+)/);
      if (m) parcelId = decodeURIComponent(m[1]);
    }
  });

  // Strategy 2: look for parcel-id-shaped text in table cells (like "067I C 038.03")
  if (!parcelId) {
    $('td').each((_, el) => {
      if (parcelId) return;
      const text = $(el).text().trim();
      if (/^\d{3}[A-Z]?\s+[A-Z]\s+\d+/.test(text)) {
        parcelId = text;
      }
    });
  }

  return parcelId;
}

// -----------------------------------------------------------------------------
// FETCH PARCEL CARD — returns structured data from the parcel detail page
// -----------------------------------------------------------------------------
async function fetchParcelCard(parcelId) {
  const url = `https://assessor.hamiltontn.gov/card/${encodeURIComponent(parcelId)}`;
  const response = await fetch(url, { headers: BROWSER_HEADERS });

  if (!response.ok) {
    throw new Error(`Parcel card fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const text = $('body').text();

  // Helper: pull the value that follows a label
  const grab = (label) => {
    const re = new RegExp(label + '\\s*([^\\n\\r]+?)(?=\\s{2,}|$|\\n)', 'i');
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };

  // Helper: extract dollar amount
  const grabDollar = (label) => {
    const re = new RegExp(label + '\\s*\\$?([\\d,]+)', 'i');
    const m = text.match(re);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  };

  return {
    parcelId,
    location: grab('Location'),
    owner: grab('Owner'),
    city: grab('City'),
    district: grab('District'), // COUNTY, CHATTANOOGA, SODDY DAISY, etc.
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

  // CURRENT tax bill — based on current assessed value from the assessor
  const currentAssessed = parcelData.assessedValue || 0;
  const currentAnnual = (currentAssessed * combinedRate) / 100;

  // PROJECTED tax bill — based on user's purchase price
  // Tennessee residential assessment ratio is 25%
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
      effectiveYear: 2029, // next reappraisal
    } : null,
  };
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------
exports.handler = async (event) => {
  // CORS — allow joeleffew.com to call this from the browser
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // tighten to 'https://joeleffew.com' in prod
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    // Read params from query string OR JSON body
    const params = event.queryStringParameters || {};
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch (e) { /* ignore */ }
    }
    const address = params.address || body.address;
    const purchasePrice = parseFloat(params.price || body.price || 0) || null;

    if (!address) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required parameter: address' }),
      };
    }

    // Parse address
    const parsed = parseAddress(address);
    if (!parsed) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Could not parse address. Try format: "1524 Green Pond Rd"',
        }),
      };
    }

    // Search for parcel
    const parcelId = await searchAssessor(parsed.number, parsed.name);
    if (!parcelId) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'No parcel found for that address',
          searched: parsed,
        }),
      };
    }

    // Fetch parcel details
    const parcelData = await fetchParcelCard(parcelId);

    // Calculate taxes
    const taxes = calculateTaxes(parcelData, purchasePrice);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=86400', // 24-hour browser cache
      },
      body: JSON.stringify({
        success: true,
        parcel: parcelData,
        taxes: taxes,
        disclaimer: 'Projected taxes are estimates based on Tennessee\'s 25% residential assessment ratio applied to your purchase price, with current 2025 certified millage rates. Actual taxes may vary at the next county-wide reappraisal in 2029. Verify with the Hamilton County Assessor of Property.',
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Lookup failed',
        message: err.message,
      }),
    };
  }
};
