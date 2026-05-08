# Joe Leffew Properties — Chattanooga Tax Lookup Tool

This is the backend API for the address-to-tax-projection tool on joeleffew.com.

## What it does

Given a Hamilton County, TN address, it:

1. Searches the public Hamilton County Assessor's database
2. Pulls the matching parcel record
3. Determines the tax district (city limits or county-only)
4. Calculates the **current** annual property tax
5. If a purchase price is provided, calculates the **projected** annual tax
   that the buyer can expect after the next county reappraisal in 2029
6. Returns clean JSON for the frontend to display

## Endpoints

```
GET  /api/lookup?address=ADDRESS&price=PRICE
POST /api/lookup    body: { "address": "...", "price": 750000 }
```

## Files

- `netlify/functions/lookup.js` — main serverless function
- `netlify.toml` — Netlify deployment config
- `package.json` — Node dependencies (cheerio for HTML parsing)
- `public/index.html` — placeholder landing page

## Local testing

After Netlify deploys, hit the endpoint in a browser:

```
https://YOUR-SITE.netlify.app/api/lookup?address=1524+Green+Pond+Rd
```

You should get JSON back with parcel data and tax calculations.

## Notes

- Millage rates are 2025 certified rates from the Hamilton County Assessor.
  Update annually after the city/county certified rate announcements (typically June).
- The next reappraisal cycle is 2029.
- Tennessee residential assessment ratio is 25% of appraised value.
