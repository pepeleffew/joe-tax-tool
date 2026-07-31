/* Soddy-Daisy Class of 1993 — app logic */
(function () {
  "use strict";
  var D = window.CLASS_DATA || {};
  var site = D.site || {};
  var mates = Array.isArray(D.classmates) ? D.classmates : [];

  if (site.colors) {
    var rs = document.documentElement.style;
    if (site.colors.primary) rs.setProperty("--primary", site.colors.primary);
    if (site.colors.accent) rs.setProperty("--accent", site.colors.accent);
  }

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var initials = function (name) {
    var p = String(name || "?").trim().split(/\s+/);
    return ((p[0] || "")[0] || "?").toUpperCase() + ((p[p.length - 1] || "")[0] || "").toUpperCase();
  };
  var hue = function (name) { var h = 0, s = String(name || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  function avatar(m, cls, prefer, mono) {
    var src = prefer === "then" ? (m.photoThen || m.photoMem || m.photoNow) : (m.photoNow || m.photoThen || m.photoMem);
    if (src) return '<img class="avatar ' + (cls || "") + '" loading="lazy" alt="' + esc(m.name) + '" src="' + esc(src) + '">';
    var bg = mono
      ? "linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,var(--accent)))"
      : (function () { var h = hue(m.name); return "linear-gradient(135deg,hsl(" + h + ",45%,42%),hsl(" + ((h + 40) % 360) + ",55%,55%))"; })();
    return '<div class="avatar ' + (cls || "") + '" style="background:' + bg + '" aria-hidden="true">' + esc(initials(m.name)) + '</div>';
  }
  var byStatus = function (s) { return mates.filter(function (m) { return (m.status || "active") === s; }); };
  var loc = function (m) { return [m.city, m.state].filter(Boolean).join(", "); };

  /* ---- Header + hero ---- */
  var fullTitle = (site.school || "Our Class") + " — Class of " + (site.classYear || "");
  document.title = fullTitle;
  var setText = function (sel, txt) { var e = $(sel); if (e) e.textContent = txt; };
  setText("#brand-name", site.school || "Class Reunion");
  setText("#brand-sub", site.town || "");
  setText("#hero-kicker", (site.town || "") + (site.mascot ? " · " + site.mascot : ""));
  setText("#hero-lead", site.tagline || "");

  var active = byStatus("active"), memory = byStatus("memory");
  var living = mates.filter(function (m) { return m.status !== "memory"; });
  function updateHeroCounts() {
    active = byStatus("active"); memory = byStatus("memory");
    living = mates.filter(function (m) { return m.status !== "memory"; });
    var portraits = mates.filter(function (m) { return m.photoThen; }).length;
    var counts = { "#stat-total": living.length, "#stat-active": portraits, "#stat-memory": memory.length };
    Object.keys(counts).forEach(function (sel) { var e = $(sel); if (e) { e.setAttribute("data-count", counts[sel]); e.textContent = counts[sel]; } });
  }
  updateHeroCounts();

  // Hero mosaic built from real yearbook faces.
  (function buildMosaic() {
    var wall = $("#hero-mosaic"); if (!wall) return;
    var faces = mates.filter(function (m) { return m.photoThen; }).map(function (m) { return m.photoThen; });
    for (var i = faces.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = faces[i]; faces[i] = faces[j]; faces[j] = t; }
    var n = Math.min(faces.length, 80), html = "";
    for (var k = 0; k < n; k++) html += '<img loading="lazy" alt="" src="' + esc(faces[k]) + '">';
    wall.innerHTML = html;
  })();

  // Animated count-up.
  function animateCounts() {
    $$("[data-count]").forEach(function (el) {
      var target = +el.getAttribute("data-count") || 0, start = null, dur = 1400;
      function step(ts) { if (!start) start = ts; var p = Math.min((ts - start) / dur, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target); if (p < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    });
  }

  // Reveal-on-scroll.
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (ents) {
    ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.15 }) : null;
  function bindReveals() { if (!io) { $$(".reveal").forEach(function (e) { e.classList.add("in"); }); return; }
    $$(".reveal:not(.in)").forEach(function (e) { io.observe(e); }); }

  /* ---- Detail modal ---- */
  var modal = $("#modal"), modalBody = $("#modal-body");
  function field(label, val) { return val ? '<div class="fld"><span>' + esc(label) + '</span><div>' + esc(val) + '</div></div>' : ""; }
  function openModal(m) {
    var big = m.photoNow || m.photoThen || m.photoMem;
    var html = '<div class="modal-head">' +
      (big ? '<img class="modal-photo" src="' + esc(big) + '" alt="' + esc(m.name) + '">' : avatar(m, "modal-photo")) +
      '<div><h3>' + esc(m.name) + (m.maidenName ? ' <span class="maiden">(' + esc(m.maidenName) + ')</span>' : "") + '</h3>' +
      (loc(m) ? '<div class="muted">' + esc(loc(m)) + '</div>' : "") +
      (m.status === "memory" ? '<div class="mem-tag">In Memory' + (m.passedYear ? " · " + esc(m.passedYear) : "") + '</div>' : "") +
      (m.status === "missing" ? '<div class="mem-tag find">Help us reconnect</div>' : "") +
      '</div></div>';
    if (m.photoThen && m.photoNow) {
      html += '<div class="modal-tn"><figure><img src="' + esc(m.photoThen) + '"><figcaption>1993</figcaption></figure>' +
              '<figure><img src="' + esc(m.photoNow) + '"><figcaption>Now</figcaption></figure></div>';
    }
    html += field("Occupation", m.occupation) + field("Spouse / Partner", m.spouse) +
            field("Children", m.children) + field("College", m.college) +
            field("Military Service", m.military);
    if (m.story) html += '<div class="fld"><span>School Story</span><p>' + esc(m.story) + '</p></div>';
    if (m.comments) html += '<div class="fld"><span>Life Since</span><p>' + esc(m.comments) + '</p></div>';
    if (m.homepage) html += '<div class="fld"><span>Website</span><div><a href="' + esc(m.homepage) + '" target="_blank" rel="noopener">' + esc(m.homepage) + '</a></div></div>';
    if (m.obituaryUrl) html += '<div class="fld"><span>Obituary</span><div><a href="' + esc(m.obituaryUrl) + '" target="_blank" rel="noopener">Read remembrance</a></div></div>';
    if (m.memNote) html += '<div class="fld"><span>Remembrance</span><p>' + esc(m.memNote) + '</p></div>';
    if (m.memGallery && m.memGallery.length) {
      var fn = String(m.name || "").split(" ")[0];
      html += '<div class="fld"><span>Remembering ' + esc(fn) + '</span><div class="thumbs">' +
        m.memGallery.map(function (g) { return '<img src="' + esc(g) + '" loading="lazy" alt="">'; }).join("") + '</div></div>';
    }
    if (m.gallery && m.gallery.length > 1) {
      html += '<div class="fld"><span>Photos</span><div class="thumbs">' +
        m.gallery.map(function (g) { return '<img src="' + esc(g) + '" loading="lazy" alt="">'; }).join("") + '</div></div>';
    }
    modalBody.innerHTML = html;
    // Make any thumbnail open the lightbox.
    var thumbs = $$(".thumbs img", modalBody);
    thumbs.forEach(function (img, i) {
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox(thumbs.map(function (t) { return { src: t.src, who: m.name }; }), i);
      });
    });
    if (window.ClassSite && typeof window.ClassSite.onModalOpen === "function") window.ClassSite.onModalOpen(m, modalBody);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  window.__openModal = openModal;   // let the live layer reopen a profile after an edit
  function closeModal() { modal.classList.remove("open"); document.body.style.overflow = ""; }
  modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  /* ---- Directory ---- */
  var dirState = { q: "", filter: "all" };
  function matchQ(m, q) {
    if (!q) return true; q = q.toLowerCase();
    return [m.name, m.maidenName, m.city, m.state, m.occupation, m.story, m.comments]
      .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
  }
  function pool() {
    if (dirState.filter === "all") return mates.filter(function (m) { return m.status !== "memory"; });
    return byStatus(dirState.filter);
  }
  function renderDirectory() {
    var list = pool().filter(function (m) { return matchQ(m, dirState.q); });
    var el = $("#directory-grid");
    $("#dir-count").textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty">No classmates match “' + esc(dirState.q) + '”.</div>'; return; }
    el.innerHTML = list.map(function (m, i) {
      var badge = "";
      return '<article class="card" data-i="' + i + '" tabindex="0" role="button">' + badge + avatar(m) +
        '<div class="name">' + esc(m.name) + (m.maidenName ? ' <span class="maiden">(' + esc(m.maidenName) + ')</span>' : "") + '</div>' +
        (loc(m) ? '<div class="loc">' + esc(loc(m)) + '</div>' : "") +
        (m.occupation ? '<div class="bio">' + esc(m.occupation) + '</div>' : "") +
        '</article>';
    }).join("");
    var current = list;
    $$("#directory-grid .card").forEach(function (c) {
      var open = function () { openModal(current[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }
  $("#dir-search").addEventListener("input", function (e) { dirState.q = e.target.value; renderDirectory(); });
  $$(".dir-filter").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".dir-filter").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); dirState.filter = b.dataset.filter; renderDirectory();
    });
  });

  /* ---- Then & Now ---- */
  var tn = $("#thennow-grid");
  function renderThenNow() {
    if (!tn) return;
    var pairs = mates.filter(function (m) { return m.photoThen && m.photoNow && m.status !== "memory"; });
    if (!pairs.length) {
      tn.innerHTML = '<div class="empty">📸 No Then &amp; Now photos yet.<br>' +
        'Open any classmate in the <strong>Classmates</strong> tab and add their current photo — once approved it pairs with their 1993 yearbook shot right here.</div>';
      return;
    }
    tn.innerHTML = pairs.map(function (m, i) {
      return '<div class="tn" data-i="' + i + '"><div class="pair">' +
        '<figure><img loading="lazy" alt="then" src="' + esc(m.photoThen) + '"><figcaption>1993</figcaption></figure>' +
        '<figure><img loading="lazy" alt="now" src="' + esc(m.photoNow) + '"><figcaption>Now</figcaption></figure>' +
        '</div><div class="cap">' + esc(m.name) + '</div></div>';
    }).join("");
    $$("#thennow-grid .tn").forEach(function (c) { c.addEventListener("click", function () { openModal(pairs[+c.dataset.i]); }); });
  }
  renderThenNow();

  /* ---- In Memory ---- */
  var mem = $("#memory-grid");
  function renderMemorial() {
    if (!mem) return;
    var list = byStatus("memory").sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (!list.length) { mem.innerHTML = '<div class="empty">No memorial entries.</div>'; return; }
    mem.innerHTML = list.map(function (m, i) {
      return '<div class="mem-card" data-i="' + i + '" tabindex="0" role="button">' + avatar(m, "", "then", true) +
        '<div class="name">' + esc(m.name) + '</div>' +
        (m.passedYear ? '<div class="muted">' + esc(m.passedYear) + '</div>' : "") +
        '</div>';
    }).join("");
    $$("#memory-grid .mem-card").forEach(function (c) {
      var open = function () { openModal(list[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }
  renderMemorial();

  /* ---- Yearbook wall ---- */
  var ybPeople = mates.filter(function (m) { return m.photoThen; })
    .sort(function (a, b) { return String(a.name.split(" ").slice(-1)).localeCompare(String(b.name.split(" ").slice(-1))); });
  var wall = $("#yearbook-wall");
  if (wall) {
    setText("#yb-count", ybPeople.length);
    wall.innerHTML = ybPeople.map(function (m, i) {
      return '<figure class="yb" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(m.name) + '">' +
        '<img loading="lazy" alt="' + esc(m.name) + '" src="' + esc(m.photoThen) + '">' +
        '<figcaption class="cap">' + esc(m.name) + '</figcaption></figure>';
    }).join("");
    $$("#yearbook-wall .yb").forEach(function (c) {
      var open = function () { openModal(ybPeople[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  /* ---- Reunion ---- */
  var R = D.reunion || {};
  setText("#home-reunion-blurb", R.blurb || "");
  $("#reunion-title").textContent = R.title || "Class Reunion";
  $("#reunion-location").textContent = R.location || "";
  $("#reunion-blurb").textContent = R.blurb || "";
  var rsvp = $("#reunion-rsvp");
  if (rsvp) { if (R.rsvpUrl) { rsvp.href = R.rsvpUrl; rsvp.style.display = "inline-block"; } else { rsvp.style.display = "none"; } }
  $("#reunion-timeline").innerHTML = (R.pastReunions || []).map(function (p) {
    return '<li><span class="yr">' + esc(p.year) + '</span><span>' + esc(p.label) +
      (p.photos ? " · " + p.photos + " photos" : "") + '</span></li>';
  }).join("") || '<li class="muted">Past reunions will be listed here.</li>';

  var cd = $("#countdown");
  if (R.date) {
    var target = new Date(R.date).getTime();
    var tick = function () {
      var diff = target - Date.now();
      if (diff <= 0) { cd.innerHTML = '<div class="cd"><b>🎉</b><span>It’s reunion time!</span></div>'; return; }
      var d = Math.floor(diff / 86400000), h = Math.floor(diff / 3600000) % 24,
          mn = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
      cd.innerHTML = [[d, "Days"], [h, "Hours"], [mn, "Minutes"], [s, "Seconds"]]
        .map(function (u) { return '<div class="cd"><b>' + u[0] + '</b><span>' + u[1] + '</span></div>'; }).join("");
    };
    tick(); setInterval(tick, 1000);
  } else { cd.innerHTML = '<div class="cd" style="min-width:auto;padding:14px 20px"><span>Date to be announced</span></div>'; }

  /* ---- Photo albums + lightbox ---- */
  var titleCase = function (s) { return String(s || "").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  var candids = [];
  mates.forEach(function (m) {
    if (m.gallery && m.gallery.length) m.gallery.forEach(function (src) { candids.push({ src: src, who: m.name }); });
    else if (m.photoNow) candids.push({ src: m.photoNow, who: m.name });
  });
  var albums = [
    { key: "candids", label: "Through the Years", photos: candids },
    { key: "r10", label: "10-Year Reunion · 2003", photos: [] },
    { key: "r20", label: "20-Year Reunion · 2013", photos: [] },
    { key: "r25", label: "25-Year Reunion · 2018", photos: [] },
    { key: "r30", label: "30-Year Reunion · 2023", photos: [] },
    { key: "next", label: "Next Reunion", photos: [] }
  ];
  var curAlbum = albums[0];
  function renderAlbumChips() {
    var el = $("#album-chips"); if (!el) return;
    el.innerHTML = albums.map(function (a) {
      return '<button class="chip album-chip' + (a === curAlbum ? " active" : "") + '" data-album="' + a.key + '">' + esc(a.label) + '</button>';
    }).join("");
    $$("#album-chips .album-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        curAlbum = albums.filter(function (a) { return a.key === b.dataset.album; })[0];
        renderAlbumChips(); renderPhotos();
      });
    });
  }
  function renderPhotos() {
    var el = $("#photo-grid"); if (!el) return;
    if (!curAlbum.photos.length) {
      el.className = "";
      el.innerHTML = '<div class="album-empty"><div style="font-size:38px">📸</div><p style="margin:.6em 0 0"><strong>No photos in this album yet.</strong><br>' +
        'Got some from this event? Tap <strong>“Add photos”</strong> above to share them — they’ll appear here once approved.</p></div>';
      return;
    }
    el.className = "masonry";
    var canDel = window.ClassSite && window.ClassSite.canDelete;
    el.innerHTML = curAlbum.photos.map(function (p, i) {
      var del = (canDel && p.id) ? '<button class="ph-del" data-id="' + esc(p.id) + '" data-path="' + esc(p.path || "") + '" title="Delete photo" aria-label="Delete photo">✕</button>' : "";
      return '<div class="ph" data-i="' + i + '">' + del + '<img loading="lazy" alt="' + esc(p.who || "") + '" src="' + esc(p.src) + '">' +
        (p.who ? '<div class="who">' + esc(p.who) + '</div>' : "") + '</div>';
    }).join("");
    $$("#photo-grid .ph").forEach(function (c) {
      c.addEventListener("click", function (e) { if (e.target.closest(".ph-del")) return; openLightbox(curAlbum.photos, +c.dataset.i); });
    });
    $$("#photo-grid .ph-del").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (window.ClassSite && window.ClassSite.deletePhoto) window.ClassSite.deletePhoto(btn.dataset.id, btn.dataset.path);
      });
    });
  }

  var lb = $("#lightbox"), lbImg = $("#lb-img"), lbCap = $("#lb-cap"), lbList = [], lbIdx = 0;
  function showLb() { var p = lbList[lbIdx] || {}; lbImg.src = p.src || ""; lbCap.textContent = p.who || ""; }
  function openLightbox(list, i) { lbList = list; lbIdx = i; showLb(); lb.classList.add("open"); document.body.style.overflow = "hidden"; }
  function closeLb() { lb.classList.remove("open"); document.body.style.overflow = ""; lbImg.src = ""; }
  function stepLb(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); }
  if (lb) {
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.closest("[data-lb-close]")) closeLb(); });
    $("[data-lb-prev]").addEventListener("click", function (e) { e.stopPropagation(); stepLb(-1); });
    $("[data-lb-next]").addEventListener("click", function (e) { e.stopPropagation(); stepLb(1); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLb(); else if (e.key === "ArrowLeft") stepLb(-1); else if (e.key === "ArrowRight") stepLb(1);
    });
  }

  /* ---- Class stats ---- */
  function topCounts(vals, n, fmt) {
    var m = {};
    vals.forEach(function (v) { v = (v || "").trim(); if (!v) return; var k = fmt ? fmt(v) : v; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; })
      .sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); }).slice(0, n);
  }
  var JOB_CATS = [
    ["Education", /teach|educat|school|professor|principal|tutor/i],
    ["Healthcare", /nurse|health|medical|doctor|dental|therap|\brn\b|pharm|care|hospital/i],
    ["Sales & Business", /sales|manager|business|account|market|realtor|real estate|insurance|bank|finance|owner|director/i],
    ["Trades & Mfg.", /mechanic|maintenance|electric|construct|weld|plumb|machin|factory|manufactur|technician|hvac|operator|driver|labor/i],
    ["Engineering & IT", /engineer|software|develop|program|\bit\b|computer|network|analyst|data/i],
    ["Military & Public", /military|army|navy|air force|marine|police|firefight|govern|federal|\btva\b|postal/i],
    ["Ministry & Nonprofit", /pastor|minist|church|missionar|nonprofit/i],
    ["Homemaker", /homemaker|stay.?at.?home|housewife|\bmom\b/i]
  ];
  function jobCategory(o) { for (var i = 0; i < JOB_CATS.length; i++) if (JOB_CATS[i][1].test(o)) return JOB_CATS[i][0]; return "Other"; }

  function barChart(sel, data, gold) {
    var el = $(sel); if (!el) return;
    if (!data.length) { el.innerHTML = '<div class="muted">No data yet.</div>'; return; }
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }));
    el.innerHTML = data.map(function (d) {
      var pct = Math.round(d.value / max * 100);
      return '<div class="bar-row"><span class="bar-label" title="' + esc(d.label) + '">' + esc(d.label) + '</span>' +
        '<span class="bar-track"><span class="bar-fill' + (gold ? " gold" : "") + '" data-w="' + pct + '" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-val">' + d.value + '</span></div>';
    }).join("");
  }
  function animateBars() { $$(".bar-fill").forEach(function (f) { f.style.width = f.getAttribute("data-w") + "%"; }); }

  (function renderStats() {
    var cities = living.map(function (m) { return m.city; }).filter(Boolean);
    var states = living.map(function (m) { return (m.state || "").toUpperCase().trim(); }).filter(Boolean);
    var st = $("#stat-tiles");
    if (st) {
      var distinctCities = topCounts(cities, 9999, titleCase).length;
      var distinctStates = states.filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
      var data = [
        [living.length, "Classmates"], [active.length, "With Profiles"],
        [mates.filter(function (m) { return m.photoThen; }).length, "Senior Portraits"],
        [distinctCities, "Cities"], [distinctStates, "States"], [memory.length, "In Memory"]
      ];
      st.innerHTML = data.map(function (d) { return '<div class="stat-tile"><b>' + d[0] + '</b><span>' + d[1] + '</span></div>'; }).join("");
    }
    barChart("#chart-states", topCounts(states, 8), false);
    barChart("#chart-cities", topCounts(cities, 8, titleCase), true);
    barChart("#chart-college", topCounts(living.map(function (m) { return m.college; }), 6), false);
    barChart("#chart-jobs", topCounts(living.map(function (m) { return m.occupation ? jobCategory(m.occupation) : ""; }), 8), true);
  })();

  renderAlbumChips(); renderPhotos();

  // Hooks for the optional live layer (live.js) to add approved uploads.
  window.ClassSite = {
    albums: albums,
    renderPhotos: renderPhotos,
    currentAlbumKey: function () { return curAlbum ? curAlbum.key : null; },
    openLightbox: openLightbox,
    mates: mates,
    onModalOpen: null,             // live.js sets this to inject admin controls
    showView: function (v) {},     // replaced once show() is defined
    renderThenNow: renderThenNow,
    // Re-render everything that depends on classmate status/data (used after
    // an admin moves someone to In Memory, adds a Now photo, etc.).
    refresh: function () { updateHeroCounts(); renderDirectory(); renderMemorial(); renderThenNow(); }
  };

  /* ---- Tabs ---- */
  function show(view, keepUrl) {
    if (!view || !document.getElementById("view-" + view)) view = "home";  // ignore auth-redirect hashes etc.
    $$("section.view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + view); });
    $$(".tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    document.body.classList.toggle("home", view === "home");
    window.scrollTo({ top: 0, behavior: "auto" });
    // keepUrl leaves the hash untouched — used on load when it still holds a
    // Supabase sign-in token that live.js needs to read before we rewrite it.
    if (!keepUrl && history.replaceState) history.replaceState(null, "", "#" + view);
    if (view === "home") { animateCounts(); }
    if (view === "stats") { setTimeout(animateBars, 60); }
    bindReveals();
  }
  $$(".tabs button, [data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.view || b.dataset.goto); });
  });

  window.ClassSite.showView = show;

  // Solidify the header once the user scrolls off the hero.
  var onScroll = function () { document.body.classList.toggle("scrolled", window.scrollY > 30); };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  renderDirectory();
  var initialView = (location.hash || "").slice(1);
  // On a Supabase auth redirect the hash carries the sign-in token — render home
  // but KEEP the hash so live.js can read it; Supabase clears it once consumed.
  var isAuthRedirect = /access_token|refresh_token|[=&]/.test(initialView);
  show(isAuthRedirect ? "home" : initialView, isAuthRedirect);
})();
