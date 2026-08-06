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
  var fixUrl = function (u) { u = String(u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "http://" + u : u; };
  var cleanUrl = function (u) { return String(u || "").replace(/^https?:\/\//i, "").replace(/\/$/, ""); };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var bMonth = function (m) { return +m.birthMonth || 0; };
  var bDay = function (m) { return +m.birthDay || 0; };
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
    var ybPages = (window.YEARBOOK_PAGES_OF && window.YEARBOOK_PAGES_OF[m.id]) || null;
    var ybPortrait = window.YEARBOOK_PAGE_OF ? window.YEARBOOK_PAGE_OF[m.id] : undefined;
    if (ybPages && ybPages.length && window.ClassSite && window.ClassSite.openYearbook) {
      var others = ybPages.filter(function (i) { return i !== ybPortrait; }).sort(function (a, b) { return a - b; });
      var ordered = (ybPortrait != null ? [ybPortrait] : []).concat(others);
      var chips = ordered.map(function (i) {
        var isP = (i === ybPortrait);
        return '<button class="chip yb-chip' + (isP ? " yb-portrait" : "") + '" data-ybpage="' + i + '">' + (isP ? "★ Senior portrait" : "Page " + (i + 1)) + '</button>';
      }).join("");
      html += '<div class="fld"><span>📖 In the 1993 Yearbook <span class="muted" style="font-weight:400">— tap a page to open the book there</span></span><div class="yb-chips">' + chips + '</div></div>';
    }
    if (bMonth(m) && bDay(m)) html += field("Birthday", MONTHS[bMonth(m) - 1] + " " + bDay(m));
    html += field("Occupation", m.occupation) + field("Spouse / Partner", m.spouse) +
            field("Children", m.children) + field("College", m.college) +
            field("Military Service", m.military);
    if (m.story) html += '<div class="fld"><span>School Story</span><p>' + esc(m.story) + '</p></div>';
    if (m.comments) html += '<div class="fld"><span>Life Since</span><p>' + esc(m.comments) + '</p></div>';
    if (m.homepage) html += '<div class="fld"><span>Website</span><div><a href="' + esc(m.homepage) + '" target="_blank" rel="noopener">' + esc(m.homepage) + '</a></div></div>';
    if (m.bizList === "yes" && (m.bizName || m.bizWhat || m.bizUrl || m.bizPhone)) {
      var bsite = m.bizUrl || m.homepage || "";
      html += '<div class="fld biz-fld"><span>💼 Business</span><div>' +
        (m.bizName ? '<strong>' + esc(m.bizName) + '</strong>' : "") +
        (m.bizWhat ? (m.bizName ? " — " : "") + esc(m.bizWhat) : "") +
        (m.bizDesc ? '<br>' + esc(m.bizDesc) : "") +
        (bsite ? '<br><a href="' + esc(fixUrl(bsite)) + '" target="_blank" rel="noopener">' + esc(cleanUrl(bsite)) + '</a>' : "") +
        (m.bizPhone ? '<br>📞 ' + esc(m.bizPhone) : "") +
        '</div></div>';
    }
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
    $$(".yb-chip", modalBody).forEach(function (b) {
      b.addEventListener("click", function () { closeModal(); window.ClassSite.openYearbook(+b.dataset.ybpage); });
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

  /* ---- Businesses — "Support Our Own" (opt-in) ---- */
  function renderBusinesses() {
    var el = $("#biz-grid"); if (!el) return;
    var list = mates.filter(function (m) { return m.bizList === "yes"; })
      .sort(function (a, b) { return String(a.bizName || a.name).localeCompare(String(b.bizName || b.name)); });
    if (!list.length) {
      el.className = "";
      el.innerHTML = '<div class="album-empty"><div style="font-size:38px">💼</div><p style="margin:.6em 0 0"><strong>No businesses listed yet.</strong><br>' +
        'Own a business or offer a service? Open your profile in <strong>Classmates</strong>, tap <strong>“Edit my profile,”</strong> and add it — you could be the first!</p></div>';
      return;
    }
    el.className = "biz-grid";
    el.innerHTML = list.map(function (m) {
      var idx = mates.indexOf(m);
      var title = m.bizName || m.occupation || m.name;
      var what = m.bizWhat || (m.bizName ? m.occupation : "") || "";
      var site = m.bizUrl || m.homepage || "";
      return '<article class="biz-card" data-i="' + idx + '" tabindex="0" role="button">' +
        '<div class="biz-head">' + avatar(m, "biz-av") + '<div class="biz-headtext"><h3>' + esc(title) + '</h3>' +
        '<div class="biz-by">' + esc(m.name) + (m.maidenName ? ' (' + esc(m.maidenName) + ')' : "") + (loc(m) ? ' · ' + esc(loc(m)) : "") + '</div>' +
        (what ? '<div class="biz-what">' + esc(what) + '</div>' : "") + '</div></div>' +
        (m.bizDesc ? '<p class="biz-desc">' + esc(m.bizDesc) + '</p>' : "") +
        '<div class="biz-links">' +
        (site ? '<a class="biz-link" href="' + esc(fixUrl(site)) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">🌐 ' + esc(cleanUrl(site)) + '</a>' : "") +
        (m.bizPhone ? '<a class="biz-link" href="tel:' + esc(String(m.bizPhone).replace(/[^0-9+]/g, "")) + '" onclick="event.stopPropagation()">📞 ' + esc(m.bizPhone) + '</a>' : "") +
        '</div></article>';
    }).join("");
    $$("#biz-grid .biz-card").forEach(function (c) {
      var open = function () { openModal(mates[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keypress", function (e) { if (e.key === "Enter") open(); });
    });
  }
  renderBusinesses();

  /* ---- Birthdays this month (home) ---- */
  function renderBirthdays() {
    var band = $("#birthdays-band"), el = $("#birthday-list");
    if (!el) return;
    var now = new Date(), mo = now.getMonth() + 1, dd = now.getDate();
    var list = mates.filter(function (m) { return m.status !== "memory" && bMonth(m) === mo; })
      .sort(function (a, b) { return bDay(a) - bDay(b); });
    if (!list.length) { if (band) band.style.display = "none"; return; }
    if (band) band.style.display = "";
    el.innerHTML = list.map(function (m) {
      var idx = mates.indexOf(m), today = bDay(m) === dd;
      return '<div class="bday-card' + (today ? " today" : "") + '" data-i="' + idx + '" role="button" tabindex="0">' +
        avatar(m, "bday-av") +
        '<div class="bday-info"><div class="bday-name">' + esc(m.name) + '</div>' +
        '<div class="bday-date">' + MONTHS[mo - 1] + ' ' + bDay(m) + (today ? ' · 🎉 Today!' : '') + '</div></div></div>';
    }).join("");
    $$("#birthday-list .bday-card").forEach(function (c) {
      c.addEventListener("click", function () { openModal(mates[+c.dataset.i]); });
      c.addEventListener("keypress", function (e) { if (e.key === "Enter") openModal(mates[+c.dataset.i]); });
    });
  }
  renderBirthdays();

  /* ---- Guess Who? game ---- */
  var gwPool = mates.filter(function (m) { return m.photoThen && m.status !== "memory"; });
  var GW_MAX = Math.min(100, gwPool.length);   // no-repeat run, capped
  var gw = { queue: [], idx: 0, score: 0, streak: 0, answered: false, current: null, done: false };
  function gwSet(id, v) { var e = $(id); if (e) e.textContent = v; }
  function gwShuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function gwStart() {
    gw.queue = gwShuffle(gwPool).slice(0, GW_MAX);
    gw.idx = 0; gw.score = 0; gw.streak = 0; gw.done = false;
    gwRound();
  }
  function gwRound() {
    if (gwPool.length < 4) return;
    if (gw.idx >= gw.queue.length) { gwFinal(); return; }
    gw.answered = false;
    var fb = $("#gw-feedback"); if (fb) { fb.textContent = ""; fb.className = "gw-feedback"; }
    var nx = $("#gw-next"); if (nx) nx.style.display = "none";
    gw.current = gw.queue[gw.idx];
    var img = $("#gw-photo"); if (img) { img.style.display = ""; img.src = gw.current.photoThen; }
    var others = gwShuffle(gwPool.filter(function (m) { return m !== gw.current; })).slice(0, 3);
    var box = $("#gw-options"); if (!box) return;
    box.innerHTML = gwShuffle([gw.current].concat(others)).map(function (m) {
      return '<button class="gw-opt" data-name="' + esc(m.name) + '">' + esc(m.name) + '</button>';
    }).join("");
    $$("#gw-options .gw-opt").forEach(function (b) { b.addEventListener("click", function () { gwGuess(b); }); });
    gwSet("#gw-round", "Question " + (gw.idx + 1) + " of " + gw.queue.length);
    gwSet("#gw-score", gw.score); gwSet("#gw-streak", gw.streak);
  }
  function gwGuess(btn) {
    if (gw.answered) return; gw.answered = true;
    var correct = btn.dataset.name === gw.current.name;
    $$("#gw-options .gw-opt").forEach(function (b) {
      if (b.dataset.name === gw.current.name) b.classList.add("right");
      else if (b === btn) b.classList.add("wrong");
      b.disabled = true;
    });
    var fb = $("#gw-feedback");
    if (correct) { gw.score++; gw.streak++; if (fb) { fb.textContent = "✅ Correct — " + gw.current.name + "!"; fb.className = "gw-feedback ok"; } }
    else { gw.streak = 0; if (fb) { fb.textContent = "❌ That was " + gw.current.name + "."; fb.className = "gw-feedback err"; } }
    gw.idx++;
    gwSet("#gw-score", gw.score); gwSet("#gw-streak", gw.streak);
    var nx = $("#gw-next"); if (nx) { nx.style.display = ""; nx.textContent = (gw.idx >= gw.queue.length) ? "See results →" : "Next →"; }
  }
  function gwFinal() {
    gw.done = true;
    var img = $("#gw-photo"); if (img) img.style.display = "none";
    var nx = $("#gw-next"); if (nx) nx.style.display = "none";
    var fb = $("#gw-feedback"); if (fb) { fb.textContent = ""; fb.className = "gw-feedback"; }
    var n = gw.queue.length, pct = n ? Math.round(gw.score / n * 100) : 0;
    var msg = pct >= 90 ? "🏆 Class legend!" : pct >= 70 ? "🎉 You really know your class!" : pct >= 40 ? "👍 Not bad at all!" : "😅 Might be time for a reunion!";
    gwSet("#gw-round", "Game over");
    var box = $("#gw-options");
    if (box) {
      box.innerHTML = '<div class="gw-final"><div class="gw-final-score">' + gw.score + ' / ' + n + '</div><div class="gw-final-msg">' + msg + '</div><button class="btn gw-again">Play again</button></div>';
      var again = box.querySelector(".gw-again"); if (again) again.addEventListener("click", gwStart);
    }
  }
  (function () { var nx = $("#gw-next"); if (nx) nx.addEventListener("click", gwRound); })();
  window.ClassSite = window.ClassSite || {};
  window.ClassSite.startGame = function () { if (!gw.queue.length || gw.done) gwStart(); };

  /* ---- Where We Are Now (map) ---- */
  var STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
  var STATE_FIPS = { AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56" };
  var NAME_TO_ABBR = (function () { var o = {}; Object.keys(STATE_NAMES).forEach(function (a) { o[STATE_NAMES[a].toLowerCase()] = a; }); return o; })();
  function stAbbr(m) {
    var s = String(m.state || "").trim();
    if (!s) return "";
    if (s.length === 2 && STATE_NAMES[s.toUpperCase()]) return s.toUpperCase();
    return NAME_TO_ABBR[s.toLowerCase()] || "";
  }
  function mapByState() {
    var by = {};
    mates.forEach(function (m) { if (m.status === "memory") return; var a = stAbbr(m); if (a) (by[a] = by[a] || []).push(m); });
    return by;
  }
  var mapSel = null;
  function mapHeat(n, max) { var t = max ? n / max : 0; return "hsl(43 70% " + (82 - Math.round(t * 48)) + "%)"; }
  function renderMapList() {
    var el = $("#map-state-list"); if (!el) return;
    var by = mapByState();
    var states = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || STATE_NAMES[a].localeCompare(STATE_NAMES[b]); });
    var max = states.length ? by[states[0]].length : 0;
    el.innerHTML = '<h3 class="map-h">By state</h3>' + states.map(function (a) {
      var n = by[a].length, pct = max ? Math.round(n / max * 100) : 0;
      return '<button class="map-strow' + (a === mapSel ? " sel" : "") + '" data-abbr="' + a + '"><span class="map-stname">' + esc(STATE_NAMES[a]) + '</span><span class="map-stbar"><span style="width:' + pct + '%"></span></span><span class="map-stn">' + n + '</span></button>';
    }).join("");
    $$("#map-state-list .map-strow").forEach(function (b) { b.addEventListener("click", function () { showStatePeople(b.dataset.abbr); }); });
  }
  function showStatePeople(a) {
    mapSel = a;
    var by = mapByState(), people = (by[a] || []).slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name)); });
    var el = $("#map-people");
    if (el) {
      el.innerHTML = '<h3 class="map-h">' + esc(STATE_NAMES[a] || a) + ' · ' + people.length + '</h3><div class="map-people-grid">' +
        people.map(function (m) { var idx = mates.indexOf(m); return '<button class="map-person" data-i="' + idx + '">' + avatar(m, "map-av") + '<span>' + esc(m.name) + (loc(m) ? '<br><small class="muted">' + esc(loc(m)) + '</small>' : '') + '</span></button>'; }).join("") + '</div>';
      $$("#map-people .map-person").forEach(function (b) { b.addEventListener("click", function () { openModal(mates[+b.dataset.i]); }); });
    }
    $$("#map-state-list .map-strow").forEach(function (b) { b.classList.toggle("sel", b.dataset.abbr === a); });
    $$("#usmap path[data-abbr]").forEach(function (p) { p.classList.toggle("sel", p.dataset.abbr === a); });
  }
  var mapLoaded = false;
  function loadUsMap() {
    var host = $("#usmap"); if (!host || mapLoaded) return; mapLoaded = true;
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/topojson-client@3";
    s.onload = function () { fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json").then(function (r) { return r.json(); }).then(function (us) { try { drawUsMap(host, us); } catch (e) {} }).catch(function () {}); };
    document.head.appendChild(s);
  }
  function ringPath(coords) { var d = ""; coords.forEach(function (pt, i) { d += (i ? "L" : "M") + pt[0].toFixed(1) + " " + pt[1].toFixed(1); }); return d + "Z"; }
  function geomPath(g) { if (!g) return ""; var polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates; var d = ""; polys.forEach(function (poly) { poly.forEach(function (r) { d += ringPath(r); }); }); return d; }
  function drawUsMap(host, us) {
    if (!window.topojson || !us.objects || !us.objects.states) return;
    var feats = topojson.feature(us, us.objects.states).features;
    var by = mapByState(), fToA = {}; Object.keys(STATE_FIPS).forEach(function (a) { fToA[STATE_FIPS[a]] = a; });
    var max = 0; Object.keys(by).forEach(function (a) { if (by[a].length > max) max = by[a].length; });
    var paths = feats.map(function (f) {
      var fid = String(f.id); if (fid.length < 2) fid = "0" + fid;
      var a = fToA[fid], n = (a && by[a]) ? by[a].length : 0;
      return '<path d="' + geomPath(f.geometry) + '" fill="' + (n ? mapHeat(n, max) : "var(--surface-2)") + '" stroke="var(--bg)" stroke-width="1" data-abbr="' + (a || "") + '"><title>' + (a ? STATE_NAMES[a] : "") + (n ? ": " + n : "") + '</title></path>';
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 975 610" class="us-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Where classmates live">' + paths + '</svg>';
    $$("#usmap path[data-abbr]").forEach(function (p) { if (!p.dataset.abbr) return; p.style.cursor = "pointer"; p.addEventListener("click", function () { showStatePeople(p.dataset.abbr); }); });
  }
  window.ClassSite.renderMapView = function () { renderMapList(); loadUsMap(); };

  /* ---- In Memory ---- */
  var mem = $("#memory-grid");
  function renderMemorial() {
    if (!mem) return;
    var list = byStatus("memory").sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    if (!list.length) { mem.innerHTML = '<div class="empty">No memorial entries.</div>'; return; }
    mem.innerHTML = list.map(function (m, i) {
      var extra = (m.memGallery && m.memGallery.length) ? m.memGallery.length + 1 : 0;
      return '<div class="mem-card" data-i="' + i + '" tabindex="0" role="button">' + avatar(m, "", "then", true) +
        (extra ? '<span class="mem-more" title="' + extra + ' photos on file">📷 ' + extra + '</span>' : "") +
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
  function renderYearbook() {
    var wall = $("#yearbook-wall");
    if (!wall) return;
    var ybPeople = mates.filter(function (m) { return m.photoThen; })
      .sort(function (a, b) { return String(a.name.split(" ").slice(-1)).localeCompare(String(b.name.split(" ").slice(-1))); });
    setText("#yb-count", ybPeople.length);
    wall.innerHTML = ybPeople.map(function (m, i) {
      var mem = m.status === "memory";
      return '<figure class="yb' + (mem ? " yb-mem" : "") + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(m.name) + (mem ? " — In Memory" : "") + '">' +
        '<img loading="lazy" alt="' + esc(m.name) + '" src="' + esc(m.photoThen) + '">' +
        '<figcaption class="cap">' + esc(m.name) + '</figcaption></figure>';
    }).join("");
    $$("#yearbook-wall .yb").forEach(function (c) {
      var open = function () { openModal(ybPeople[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }
  renderYearbook();

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
  function eduLevel(c) {
    var s = String(c || "").toLowerCase().trim();
    if (!s) return "";
    if (/ph\.?\s?d|doctor|dphil|ed\.?\s?d|\bj\.?\s?d\.?\b|juris|\bm\.?\s?d\.?\b|d\.?d\.?s|pharm\.?\s?d|\bd\.?o\.?\b/.test(s)) return "Doctorate / Professional";
    if (/master|\bmba\b|\bm\.?\s?s\.?\b|\bm\.?\s?a\.?\b|\bm\.?ed\b/.test(s)) return "Master's";
    if (/bachelor|\bb\.?\s?s\.?\b|\bb\.?\s?a\.?\b|\bb\.?\s?f\.?a\.?\b/.test(s)) return "Bachelor's";
    if (/associate/.test(s)) return "Associate's";
    if (/certificate|certif|trade|technical|vocational|cosmetolog|licens/.test(s)) return "Certificate / Trade";
    if (/^no\b|didn|none|high ?school|\bhs\b|\bged\b/.test(s)) return "High school";
    return "Other";
  }

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

  function renderStats() {
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
    barChart("#chart-college", topCounts(living.map(function (m) { return m.college ? eduLevel(m.college) : ""; }), 8), false);
    barChart("#chart-jobs", topCounts(living.map(function (m) { return m.occupation ? jobCategory(m.occupation) : ""; }), 8), true);
  }
  renderStats();

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
    refresh: function () { updateHeroCounts(); renderStats(); renderDirectory(); renderMemorial(); renderYearbook(); renderThenNow(); renderBusinesses(); renderBirthdays(); }
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
    if (view === "game" && window.ClassSite && window.ClassSite.startGame) window.ClassSite.startGame();
    if (view === "map" && window.ClassSite && window.ClassSite.renderMapView) window.ClassSite.renderMapView();
    bindReveals();
  }
  $$(".tabs button, [data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.view || b.dataset.goto); });
  });

  window.ClassSite.showView = show;
  // Re-attach these AFTER the ClassSite object above is (re)created, or they'd be wiped.
  window.ClassSite.startGame = function () { if (!gw.queue.length || gw.done) gwStart(); };
  window.ClassSite.renderMapView = function () { renderMapList(); loadUsMap(); };

  /* ---- Yearbook flip-through book ---- */
  (function initFlipbook() {
    var pages = window.YEARBOOK_PAGES || [];
    var fb = $("#flipbook"), btn = $("#open-flipbook");
    if (!fb || !pages.length) return;
    if (btn) btn.style.display = "";
    var imgL = $("#flip-img-l"), imgR = $("#flip-img-r"), wrap = $("#flip-page-wrap"), stage = $("#flip-stage");
    var counter = $("#flip-count"), thumbs = $("#flip-thumbs");
    var idx = 0, zoomed = false, thumbsBuilt = false, savedScroll = 0;
    var spread = false;                                   // two pages side by side (wide screens)
    function calcSpread() { return window.innerWidth >= 900; }
    // Book pagination: page 1 (the cover) shows ALONE; then facing pairs 2-3, 4-5…
    function nextIdx() { return spread ? (idx === 0 ? 1 : idx + 2) : idx + 1; }
    function prevIdx() { return spread ? (idx <= 1 ? 0 : idx - 2) : idx - 1; }
    function preload(i) { if (pages[i]) { var im = new Image(); im.src = pages[i].src; } }
    function setZoom(on) { zoomed = on; wrap.classList.toggle("zoomed", on); $("#flip-zoom").classList.toggle("on", on); if (!on) wrap.scrollTo(0, 0); }
    function clampIdx(i) { i = Math.max(0, Math.min(pages.length - 1, i)); if (spread && i > 0 && i % 2 === 0) i -= 1; return i; }  // land on odd-left of a facing pair
    function render() {
      var R = (spread && idx !== 0) ? pages[idx + 1] : null;   // cover (page 1) alone
      wrap.classList.toggle("spread", !!R);
      imgL.src = pages[idx].src; imgL.alt = "Yearbook page " + (idx + 1);
      if (R) { imgR.src = R.src; imgR.alt = "Yearbook page " + (idx + 2); imgR.style.display = ""; }
      else { imgR.removeAttribute("src"); imgR.style.display = "none"; }
      counter.textContent = R ? (idx + 1) + "–" + (idx + 2) + " / " + pages.length : (idx + 1) + " / " + pages.length;
      $("#flip-prev").disabled = idx <= 0;
      $("#flip-next").disabled = nextIdx() > pages.length - 1;
      setZoom(false);
      preload(nextIdx()); preload(nextIdx() + 1); preload(prevIdx());
      if (thumbsBuilt) {
        $$(".flip-thumb.active", thumbs).forEach(function (a) { a.classList.remove("active"); });
        [idx, R ? idx + 1 : -1].forEach(function (k) { var t = thumbs.children[k]; if (t) t.classList.add("active"); });
        var t0 = thumbs.children[idx]; if (t0) t0.scrollIntoView({ block: "nearest" });
      }
    }
    function go(n) { idx = clampIdx(n); render(); }
    function relayout() { var s = calcSpread(); if (s !== spread) { spread = s; go(idx); } }
    function buildThumbsOnce() {
      if (thumbsBuilt) return; thumbsBuilt = true;
      thumbs.innerHTML = pages.map(function (p, i) { return '<button class="flip-thumb" data-i="' + i + '"><img loading="lazy" src="' + esc(p.src) + '" alt="Page ' + (i + 1) + '"><span>' + (i + 1) + '</span></button>'; }).join("");
      $$(".flip-thumb", thumbs).forEach(function (b) { b.addEventListener("click", function () { go(+b.dataset.i); }); });
    }
    function open(start) {
      spread = calcSpread(); buildThumbsOnce(); go(start || 0);
      savedScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
      fb.classList.add("open"); fb.setAttribute("aria-hidden", "false");
      document.body.classList.add("flip-lock"); document.body.style.top = (-savedScroll) + "px";   // freeze the page behind (iOS)
    }
    function close() {
      fb.classList.remove("open"); fb.setAttribute("aria-hidden", "true");
      document.body.classList.remove("flip-lock"); document.body.style.top = ""; document.body.style.overflow = "";
      window.scrollTo(0, savedScroll); setZoom(false);
    }
    if (btn) btn.addEventListener("click", function () { open(0); });
    window.ClassSite.openYearbook = function (i) { open(Math.max(0, Math.min(pages.length - 1, i | 0))); };
    $("#flip-prev").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); go(prevIdx()); });
    $("#flip-next").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); go(nextIdx()); });
    $("#flip-close").addEventListener("click", close);
    $("#flip-zoom").addEventListener("click", function () { setZoom(!zoomed); });
    $("#flip-thumbs-toggle").addEventListener("click", function () { thumbs.hidden = !thumbs.hidden; });
    imgL.addEventListener("click", function () { setZoom(!zoomed); });
    imgR.addEventListener("click", function () { setZoom(!zoomed); });
    window.addEventListener("resize", relayout);
    document.addEventListener("keydown", function (e) {
      if (!fb.classList.contains("open")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(nextIdx()); }
      else if (e.key === "ArrowLeft") go(prevIdx());
      else if (e.key === "Escape") close();
    });
    var sx = 0, sy = 0, tracking = false;
    stage.addEventListener("touchstart", function (e) { if (zoomed) return; var t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
    // Block the page/overlay from scrolling or rubber-banding while swiping a page (unless zoomed).
    stage.addEventListener("touchmove", function (e) { if (!zoomed && e.cancelable) e.preventDefault(); }, { passive: false });
    stage.addEventListener("touchend", function (e) {
      if (!tracking || zoomed) return; tracking = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? nextIdx() : prevIdx()); }
    }, { passive: true });
  })();

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
