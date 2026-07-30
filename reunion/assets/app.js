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
  $("#hero-kicker").textContent = (site.town || "") + (site.mascot ? " · " + site.mascot : "");
  $("#hero-title").textContent = fullTitle;
  $("#hero-lead").textContent = site.tagline || "";

  var active = byStatus("active"), memory = byStatus("memory");
  var living = mates.filter(function (m) { return m.status !== "memory"; });
  $("#stat-total").textContent = living.length;
  $("#stat-active").textContent = active.length;
  $("#stat-memory").textContent = memory.length;

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
    if (m.gallery && m.gallery.length > 1) {
      html += '<div class="fld"><span>Photos</span><div class="thumbs">' +
        m.gallery.map(function (g) { return '<img src="' + esc(g) + '" loading="lazy" alt="">'; }).join("") + '</div></div>';
    }
    modalBody.innerHTML = html;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
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
    if (dirState.filter === "all") return living;
    return byStatus(dirState.filter);
  }
  function renderDirectory() {
    var list = pool().filter(function (m) { return matchQ(m, dirState.q); });
    var el = $("#directory-grid");
    $("#dir-count").textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty">No classmates match “' + esc(dirState.q) + '”.</div>'; return; }
    el.innerHTML = list.map(function (m, i) {
      var badge = m.status === "active" ? '<span class="pill">Reconnected</span>' : "";
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
  var pairs = mates.filter(function (m) { return m.photoThen && m.photoNow && m.status !== "memory"; });
  var tn = $("#thennow-grid");
  if (pairs.length) {
    tn.innerHTML = pairs.map(function (m, i) {
      return '<div class="tn" data-i="' + i + '"><div class="pair">' +
        '<figure><img loading="lazy" alt="then" src="' + esc(m.photoThen) + '"><figcaption>1993</figcaption></figure>' +
        '<figure><img loading="lazy" alt="now" src="' + esc(m.photoNow) + '"><figcaption>Now</figcaption></figure>' +
        '</div><div class="cap">' + esc(m.name) + '</div></div>';
    }).join("");
    $$("#thennow-grid .tn").forEach(function (c) { c.addEventListener("click", function () { openModal(pairs[+c.dataset.i]); }); });
  } else {
    tn.innerHTML = '<div class="empty">No Then &amp; Now pairs yet.</div>';
  }

  /* ---- In Memory ---- */
  var mem = $("#memory-grid");
  if (memory.length) {
    memory.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    mem.innerHTML = memory.map(function (m, i) {
      return '<div class="mem-card" data-i="' + i + '" tabindex="0" role="button">' + avatar(m, "", "then", true) +
        '<div class="name">' + esc(m.name) + '</div>' +
        (m.passedYear ? '<div class="muted">' + esc(m.passedYear) + '</div>' : "") +
        '</div>';
    }).join("");
    $$("#memory-grid .mem-card").forEach(function (c) {
      var open = function () { openModal(memory[+c.dataset.i]); };
      c.addEventListener("click", open);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  } else { mem.innerHTML = '<div class="empty">No memorial entries.</div>'; }

  /* ---- Reunion ---- */
  var R = D.reunion || {};
  $("#reunion-title").textContent = R.title || "Class Reunion";
  $("#reunion-location").textContent = R.location || "";
  $("#reunion-blurb").textContent = R.blurb || "";
  var rsvp = $("#reunion-rsvp");
  if (R.rsvpUrl) { rsvp.href = R.rsvpUrl; rsvp.style.display = "inline-block"; } else { rsvp.style.display = "none"; }
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

  /* ---- Tabs ---- */
  function show(view) {
    $$("section.view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + view); });
    $$(".tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (history.replaceState) history.replaceState(null, "", "#" + view);
  }
  $$(".tabs button, [data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.view || b.dataset.goto); });
  });

  renderDirectory();
  show((location.hash || "#home").slice(1) || "home");
})();
