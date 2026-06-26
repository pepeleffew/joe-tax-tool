# 810 Younger Circle — Listing Site

A revamped single-property landing page for **810 Younger Circle, Chattanooga, TN 37415**
(canonical home: https://810youngercir.com/).

`index.html` is a **single, fully self-contained file** — all 33 photos are embedded as
base64, and the only external requests are Google Fonts and the Google Maps embed. Drop it
on any static host (Netlify, S3, the existing 810youngercir.com host, etc.) as the site root.

## What changed in the revamp

The previous version leaned hard on price-drop urgency — a pulsing red "JUST REDUCED AGAIN"
ribbon, a corner price-cut ribbon, strikethrough prices in five places, and a "they relisted
and rebuilt" section that openly told buyers the home had failed to sell. That signals
desperation and invites lowball offers.

This version repositions the home from *desperate* to *desirable*:

- **Photo-first hero** using the striking red-colonial exterior, with one confident price.
- **Kitchen spotlight** — the genuinely strong, fully renovated kitchen leads the story.
- **Accurate copy** — e.g. the fireplace is described as a gas fireplace with wood mantel
  and granite surround (not "tile surround"), and $/sq ft is corrected to $230.
- **Curated photo tour** with a working lightbox (click any photo) and a "View all photos"
  expander, all photos correctly captioned room-by-room.
- **The Traditions community** and **location** sections, plus a clean "by the numbers" block.
- **Working inquiry form** that composes a pre-filled email to Joe and shows a confirmation
  (works on any host, no backend required), alongside tap-to-call / text / email buttons.
- Retained and tightened the SEO metadata, Open Graph/Twitter cards, JSON-LD structured data,
  and the 2.5% buyer's-agent commission notice.

## Editing

`index.html` is generated, but it is plain HTML/CSS/JS and safe to hand-edit. To change a
photo you would swap the corresponding `data:image/...;base64,...` string. Price, copy, and
contact details are all inline text.
