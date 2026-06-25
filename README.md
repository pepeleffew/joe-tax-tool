# Strike Zone Chattanooga — Website

Marketing site for **Strike Zone Chattanooga**, a baseball & softball training
facility in Hixson, TN. The site drives traffic to the scheduling app where
families reserve hitting and pitching lanes.

> Built on the `claude/strike-force-website-0801yt` branch. The original
> Hamilton County tax-lookup tool still lives on `main`.

## What it is

A single, self-contained landing page (`public/index.html`) — no build step,
no framework. Netlify publishes the `public/` directory as-is.

Sections: hero, training programs, coaches (David – baseball; collegiate
softball coach), booking-app walkthrough, facility, pricing, testimonials,
FAQ, and location/contact.

## Real details wired in

- **Address:** 5230 Hixson Pike, Hixson, TN 37343
- **Owner:** Eric Helton — (423) 827-5665
- **Domain:** strikezoneofchattanooga.com

## Placeholders to replace before/at launch

Everything below is intentionally a placeholder, clearly labeled in the UI:

| Item | Where | What to do |
|------|-------|------------|
| **Booking app link** | `<script>` → `BOOKING_APP_URL` | Set the real scheduling-app URL. Every "Book a Lane" button routes through it. |
| **Coach names/bios/photos** | `#coaches` | Replace "[Name]" for the softball coach, add headshots (swap the placeholder panels). |
| **Facility photos** | `#facility` | Replace the three "Photo Coming Soon" lane panels with real images. |
| **Pricing** | `#pricing` | Replace `$XX` placeholder rates. |
| **Testimonials** | `#reviews` | Swap in real parent reviews. |
| **Social links** | footer | Point Instagram / Facebook / TikTok at real profiles. |

## Local preview

It's a static file — open `public/index.html` in a browser, or:

```
npx serve public
```

## Deploy

Netlify auto-deploys `public/` (see `netlify.toml`). No build needed for the
site itself.
