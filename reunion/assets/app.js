/* Soddy-Daisy Class of 1993 — app logic */
(function () {
  "use strict";
  var D = window.CLASS_DATA || {};
  var site = D.site || {};
  var mates = Array.isArray(D.classmates) ? D.classmates : [];

  // Apply class colors.
  if (site.colors) {
    var r = document.documentElement.style;
    if (site.colors.primary) r.setProperty("--primary", site.colors.primary);
    if (site.colors.accent) r.setProperty("--accent", site.colors.accent);
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
  var avatar = function (m, cls) {
    if (m.photoNow || m.photoThen) {
      return '<img class="avatar ' + (cls || "") + '" alt="' + esc(m.name) + '" src="' + esc(m.photoNow || m.photoThen) + '">';
    }
    var h = hue(m.name);
    return '<div class="avatar ' + (cls || "") + '" style="background:linear-gradient(135deg,hsl(' + h + ',45%,42%),hsl(' + ((h + 40) % 360) + ',55%,55%))" aria-hidden="true">' + esc(initials(m.name)) + '</div>';
  };
  var byStatus = function (s) { return mates.filter(function (m) { return (m.status || "active") === s; }); };

  /* ---- Hero + brand ---- */
  var fullTitle = (site.school || "Our Class") + " — Class of " + (site.classYear || "");
  document.title = fullTitle;
  $("#brand-year").textContent = (site.classYear || "").toString().slice(-2) || "93";
  $("#brand-name").textContent = site.school || "Class Reunion";
  $("#brand-sub").textContent = site.town || "";
  $("#hero-kicker").textContent = (site.town || "") + (site.mascot ? " · " + site.mascot : "");
  $("#hero-title").textContent = fullTitle;
  $("#hero-lead").textContent = site.tagline || "Reconnecting our class.";

  var active = byStatus("active"), missing = byStatus("missing"), memory = byStatus("memory");
  $("#stat-total").textContent = mates.length;
  $("#stat-active").textContent = active.length;
  $("#stat-memory").textContent = memory.length;

  /* ---- Classmates directory ---- */
  var dirState = { q: "", filter: "active" };
  function matchQ(m, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return [m.name, m.maidenName, m.city, m.state, m.bio].some(function (v) {
      return v && String(v).toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderDirectory() {
    var list = (dirState.filter === "all" ? mates.filter(function (m) { return (m.status || "active") !== "memory"; })
      : byStatus(dirState.filter)).filter(function (m) { return matchQ(m, dirState.q); });
    list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var el = $("#directory-grid");
    if (!list.length) { el.innerHTML = '<div class="empty">No classmates match “' + esc(dirState.q) + '”.</div>'; $("#dir-count").textContent = "0"; return; }
    $("#dir-count").textContent = list.length;
    el.innerHTML = list.map(function (m) {
      var loc = [m.city, m.state].filter(Boolean).join(", ");
      return '<article class="card">' + avatar(m) +
        '<div class="name">' + esc(m.name) + (m.maidenName ? ' <span class="maiden">(' + esc(m.maidenName) + ')</span>' : "") + '</div>' +
        (loc ? '<div class="loc">' + esc(loc) + '</div>' : "") +
        (m.bio ? '<div class="bio">' + esc(m.bio) + '</div>' : "") +
        '</article>';
    }).join("");
  }
  $("#dir-search").addEventListener("input", function (e) { dirState.q = e.target.value; renderDirectory(); });
  $$(".dir-filter").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".dir-filter").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); dirState.filter = b.dataset.filter; renderDirectory();
    });
  });

  /* ---- Then & Now ---- */
  var pairs = mates.filter(function (m) { return m.photoThen && m.photoNow; })
    .map(function (m) { return { name: m.name, then: m.photoThen, now: m.photoNow }; })
    .concat(Array.isArray(D.gallery) ? D.gallery : []);
  var tn = $("#thennow-grid");
  if (pairs.length) {
    tn.innerHTML = pairs.map(function (p) {
      return '<div class="tn"><div class="pair">' +
        '<figure><img alt="then" src="' + esc(p.then) + '"><figcaption>Then</figcaption></figure>' +
        '<figure><img alt="now" src="' + esc(p.now) + '"><figcaption>Now</figcaption></figure>' +
        '</div><div class="cap">' + esc(p.name || "") + '</div></div>';
    }).join("");
  } else {
    tn.innerHTML = '<div class="empty">No Then &amp; Now photos yet. Add <code>photoThen</code> and <code>photoNow</code> to any classmate and they’ll appear here automatically.</div>';
  }

  /* ---- In Memory ---- */
  var mem = $("#memory-grid");
  if (memory.length) {
    memory.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    mem.innerHTML = memory.map(function (m) {
      return '<div class="mem-card">' + avatar(m) +
        '<div class="name">' + esc(m.name) + '</div>' +
        (m.passedYear ? '<div class="muted">' + esc(m.passedYear) + '</div>' : "") +
        (m.quote ? '<div class="quote">“' + esc(m.quote) + '”</div>' : "") +
        '</div>';
    }).join("");
  } else {
    mem.innerHTML = '<div class="empty">No memorial entries yet.</div>';
  }

  /* ---- Reunion ---- */
  var R = D.reunion || {};
  $("#reunion-title").textContent = R.title || "Class Reunion";
  $("#reunion-location").textContent = R.location || "Location TBD";
  $("#reunion-blurb").textContent = R.blurb || "";
  var rsvp = $("#reunion-rsvp");
  if (R.rsvpUrl) { rsvp.href = R.rsvpUrl; rsvp.style.display = "inline-block"; } else { rsvp.style.display = "none"; }
  var tl = $("#reunion-timeline");
  tl.innerHTML = (R.pastReunions || []).map(function (p) {
    return '<li><span class="yr">' + esc(p.year) + '</span><span>' + esc(p.label) +
      (p.photos ? ' · ' + p.photos + ' photos' : '') + '</span></li>';
  }).join("") || '<li class="muted">Past reunions will be listed here.</li>';

  // Countdown
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
