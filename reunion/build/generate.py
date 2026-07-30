#!/usr/bin/env python3
"""
Generate reunion/data/class-data.js from the Class Creator export.

Reads the Classmates CSV + the three photo sets, matches photos to people by
name, copies them to clean web-safe filenames keyed by Member ID, and writes
the site data file.

PRIVACY: street address, phone numbers, email, and full birth dates are
intentionally NOT written to the public data file. City/State and reunion-
appropriate profile fields are kept.
"""
import csv, os, re, json, shutil, unicodedata, collections, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_CSV = os.environ.get("CSV_PATH")
PH = os.path.join(ROOT, "assets", "photos")          # extracted source photos
IMG = os.path.join(ROOT, "assets", "img")            # clean output photos
OUT = os.path.join(ROOT, "data", "class-data.js")

# ---------------------------------------------------------------- helpers ----
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\(.*?\)", "", s)                     # drop parentheticals
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return s

def first_tok(s):
    p = re.split(r"\s+", (s or "").strip())
    return p[0] if p and p[0] else ""

def clean(s):
    s = html.unescape(s or "")            # decode &quot; &amp; &#39; etc.
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def person_keys(r):
    """Candidate match keys for a CSV person."""
    keys = set()
    firsts = {norm(r["First Name"]), norm(first_tok(r["First Name"]))}
    lasts = {norm(r["Last Name"]), norm(r.get("Married Name", ""))}
    for l in lasts:
        for f in firsts:
            if l and f:
                keys.add(l + "|" + f)
    return keys

def photo_keys(name_no_ext):
    """Candidate keys from a photo basename 'Last, First (Alt)'."""
    base = name_no_ext
    alt = ""
    m = re.search(r"\((.*?)\)", base)
    if m:
        alt = m.group(1)
    base_noparen = re.sub(r"\(.*?\)", "", base).strip()
    if "," in base_noparen:
        last, first = base_noparen.split(",", 1)
    else:
        parts = base_noparen.split()
        last, first = parts[0], " ".join(parts[1:]) if len(parts) > 1 else ""
    keys = set()
    lasts = {norm(last), norm(alt)}
    firsts = {norm(first), norm(first_tok(first))}
    for l in lasts:
        for f in firsts:
            if l and f:
                keys.add(l + "|" + f)
    return keys

def index_flat(dirname):
    """Map key -> filepath for a flat directory of image files."""
    idx = {}
    d = os.path.join(PH, dirname)
    if not os.path.isdir(d):
        return idx
    for f in sorted(os.listdir(d)):
        p = os.path.join(d, f)
        if not os.path.isfile(p):
            continue
        for k in photo_keys(os.path.splitext(f)[0]):
            idx.setdefault(k, p)
    return idx

def index_dirs(dirname):
    """Map key -> sorted list of image files inside per-person subfolders."""
    idx = {}
    base = os.path.join(PH, dirname)
    if not os.path.isdir(base):
        return idx
    for sub in sorted(os.listdir(base)):
        subp = os.path.join(base, sub)
        if not os.path.isdir(subp):
            continue
        imgs = sorted(
            os.path.join(subp, f) for f in os.listdir(subp)
            if os.path.isfile(os.path.join(subp, f))
            and f.lower().endswith((".jpg", ".jpeg", ".png"))
        )
        if not imgs:
            continue
        for k in photo_keys(sub):
            idx.setdefault(k, imgs)
    return idx

def merge_dupes(rows):
    """Collapse rows that are the same person (same normalized last|first).
    Keep the richest row as the base and fill each field with the longest
    non-empty value seen; deceased status wins."""
    groups = collections.OrderedDict()
    for r in rows:
        k = norm(r["Last Name"]) + "|" + norm(first_tok(r["First Name"]))
        groups.setdefault(k, []).append(r)
    out = []
    for grp in groups.values():
        if len(grp) == 1:
            out.append(grp[0])
            continue
        grp.sort(key=lambda r: sum(1 for v in r.values() if clean(v)), reverse=True)
        base = dict(grp[0])
        for r in grp[1:]:
            for col, val in r.items():
                if clean(val) and len(clean(val)) > len(clean(base.get(col, ""))):
                    base[col] = val
            if "Deceased" in r.get("Member Type", ""):
                base["Member Type"] = r["Member Type"]
        out.append(base)
    return out

def match(idx, keys):
    for k in keys:
        if k in idx:
            return idx[k]
    return None

def copy_img(src, dst_rel):
    dst = os.path.join(ROOT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    return dst_rel.replace(os.sep, "/")

def ext_of(p):
    e = os.path.splitext(p)[1].lower()
    return ".jpg" if e in ("", ".jpeg") else e

# ------------------------------------------------------------------- main ----
def build():
    if os.path.isdir(IMG):
        shutil.rmtree(IMG)
    rows = list(csv.DictReader(open(SRC_CSV, encoding="latin-1")))
    rows = [r for r in rows if clean(r["First Name"]) or clean(r["Last Name"])]
    rows = merge_dupes(rows)

    yb = index_flat("yearbook_photos")
    ob = index_flat("obituary_photos")
    pf = index_dirs("profile_photos")

    people = []
    stats = {"yearbook": 0, "profile": 0, "obituary": 0, "memory": 0, "reconnected": 0}

    for r in rows:
        mid = clean(r.get("Member ID")) or str(len(people) + 1)
        first, last = clean(r["First Name"]), clean(r["Last Name"])
        married = clean(r.get("Married Name"))
        name = (first + " " + last).strip()
        keys = person_keys(r)

        deceased = "Deceased" in r.get("Member Type", "") or bool(clean(r.get("Year Deceased")))
        joined = bool(clean(r.get("Joined On"))) or bool(clean(r.get("Last Login")))
        status = "memory" if deceased else ("active" if joined else "missing")

        p = {"id": mid, "name": name, "status": status}
        if married and married.lower() != last.lower():
            p["maidenName"] = married
        for src, key in [("city", "City"), ("state", "State"),
                         ("occupation", "Occupation:"), ("spouse", "Spouse/Partner:"),
                         ("children", "Children:"), ("college", "Did you finish College?"),
                         ("military", "Military Service:"), ("homepage", "Homepage:"),
                         ("story", "School Story:"), ("comments", "Comments:")]:
            v = clean(r.get(key, ""))
            if v:
                p[src] = v

        # photos -----------------------------------------------------------
        y = match(yb, keys)
        if y:
            p["photoThen"] = copy_img(y, f"assets/img/then/{mid}{ext_of(y)}")
            stats["yearbook"] += 1
        gal = match(pf, keys)
        if gal:
            urls = []
            for i, g in enumerate(gal, 1):
                urls.append(copy_img(g, f"assets/img/gallery/{mid}/{i:03d}{ext_of(g)}"))
            p["photoNow"] = urls[0]
            if len(urls) > 1:
                p["gallery"] = urls
            stats["profile"] += 1
        if status == "memory":
            o = match(ob, keys)
            if o:
                p["photoMem"] = copy_img(o, f"assets/img/mem/{mid}{ext_of(o)}")
                stats["obituary"] += 1
            yd = clean(r.get("Year Deceased"))
            if yd:
                p["passedYear"] = yd
            ou = clean(r.get("Obituary URL"))
            if ou:
                p["obituaryUrl"] = ou

        if status == "memory":
            stats["memory"] += 1
        if status == "active":
            stats["reconnected"] += 1
        people.append(p)

    people.sort(key=lambda x: (x["name"].split()[-1].lower() if x["name"] else "", x["name"].lower()))

    data = {
        "site": {
            "school": "Soddy-Daisy High School",
            "town": "Soddy-Daisy, Tennessee",
            "classYear": 1993,
            "mascot": "Trojans",
            "colors": {"primary": "#0b2340", "accent": "#c9a24a"},
            "tagline": "Thirty-plus years, one class, still connected.",
        },
        "reunion": {
            "title": "Class of 1993 Reunion",
            "date": None,
            "location": "Soddy-Daisy, TN",
            "blurb": "Details for the next gathering are being finalized. "
                     "Browse the directory, revisit the yearbook, and check back soon.",
            "rsvpUrl": None,
            "pastReunions": [
                {"year": 2003, "label": "10-Year Reunion", "photos": 0},
                {"year": 2013, "label": "20-Year Reunion", "photos": 0},
                {"year": 2018, "label": "25-Year Reunion", "photos": 0},
            ],
        },
        "classmates": people,
        "gallery": [],
    }

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED from the Class Creator export by build/generate.py.\n")
        f.write("   Edit the CSV/photos and re-run, or hand-edit below. */\n")
        f.write("window.CLASS_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    print("people:", len(people))
    print("stats:", stats)
    thennow = sum(1 for p in people if p.get("photoThen") and p.get("photoNow"))
    print("then&now pairs:", thennow)
    print("missing (not reconnected):", sum(1 for p in people if p["status"] == "missing"))

if __name__ == "__main__":
    build()
