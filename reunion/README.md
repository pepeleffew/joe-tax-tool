# Soddy-Daisy High School — Class of 1993 (new site)

A modern, mobile-friendly rebuild of the old Class Creator reunion site.
Everything is static (HTML/CSS/JS) — no server, no database, no login required
to view.

## Sections

- **Home** — hero, live class stats, quick links
- **Classmates** — searchable/filterable directory with photos & profiles
- **Then & Now** — yearbook vs. today photo pairs (auto-built from profiles)
- **In Memory** — memorial page
- **Reunion** — event news, live countdown, past-reunion timeline

## The only file you edit: `data/class-data.js`

The entire site is driven by that one file. To load the real roster:

1. In Class Creator (as admin): **Manage Classmates → Download Class List →**
   export to Excel/CSV with the fields you want.
2. Hand that file over and it gets converted into the `classmates` array.
   Or edit by hand — each entry needs only a `name`; everything else is
   optional. Missing photos become clean initials avatars automatically.

Set a classmate's `status` to `"active"`, `"missing"`, or `"memory"` to route
them to the right section.

## Preview locally

Because the browser blocks `file://` for some features, serve the folder:

```bash
cd reunion
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

It's a plain static folder — drop it on Netlify, GitHub Pages, Cloudflare
Pages, or any host. (The data loads via a `<script>` tag, so it also works
straight from `file://` in most browsers.)
