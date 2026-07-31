/* Soddy-Daisy Class of 1993 — live layer (Supabase).
 * Auth (magic link), photo uploads w/ moderation, guestbook, RSVP, admin.
 * Degrades gracefully: if Supabase isn't configured/loaded, the static site
 * is unaffected and live controls hide themselves. */
(function () {
  "use strict";
  var cfg = window.SUPA_CONFIG;
  var $ = function (s, e) { return (e || document).querySelector(s); };
  var $$ = function (s, e) { return Array.prototype.slice.call((e || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase || !window.supabase.createClient) {
    document.body.classList.add("nolive");
    return;
  }
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var user = null;
  var myId = null;                       // the classmate id this user owns (if any)
  var EDITABLE = ["city", "state", "occupation", "spouse", "children", "college", "homepage", "maidenName", "story", "comments"];
  var isAdmin = function () { return !!(user && user.email && cfg.adminEmail && user.email.toLowerCase() === cfg.adminEmail.toLowerCase()); };
  var displayName = function () { return (user && user.user_metadata && user.user_metadata.name) || (user && user.email) || "Classmate"; };
  var fmtDate = function (s) { try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return ""; } };

  function toast(msg, ok) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = ok === false ? "show err" : "show";
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = ""; }, 4500);
  }
  // Fire-and-forget email alert to the admin (no-op until Netlify env is set).
  function notifyAdmin(type, name) {
    try { fetch("/.netlify/functions/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: type, name: name }) }); } catch (e) {}
  }
  // Show a count badge on the Admin tab + browser tab when items await approval.
  function setBadge(n) {
    var btn = document.querySelector('.tabs button[data-view="admin"]');
    if (btn) {
      var b = btn.querySelector(".nav-badge");
      if (n > 0) { if (!b) { b = document.createElement("span"); b.className = "nav-badge"; btn.appendChild(b); } b.textContent = n; }
      else if (b) { b.remove(); }
    }
    document.title = (n > 0 ? "(" + n + ") " : "") + "Soddy-Daisy High School — Class of 1993";
  }
  async function updatePendingBadge() {
    if (!isAdmin()) { setBadge(0); return; }
    try {
      var q = function (tbl) { return sb.from(tbl).select("id", { count: "exact", head: true }).eq("status", "pending"); };
      var r = await Promise.all([q("photos"), q("guestbook"), q("profile_claims")]);
      setBadge(r.reduce(function (s, x) { return s + (x.count || 0); }, 0));
    } catch (e) {}
  }

  /* ---------- AUTH ---------- */
  function renderAuth() {
    var slot = $("#auth-slot");
    if (slot) {
      if (user) {
        slot.innerHTML = '<span class="who-mini" title="' + esc(user.email) + '">' + esc(user.email.split("@")[0]) + '</span><button class="chip" id="signout-btn">Sign out</button>';
        $("#signout-btn").addEventListener("click", function () { sb.auth.signOut(); });
      } else {
        slot.innerHTML = '<button class="chip" id="signin-btn">Sign in</button>';
        $("#signin-btn").addEventListener("click", openAuth);
      }
    }
    document.body.classList.toggle("is-admin", isAdmin());
    document.body.classList.toggle("is-authed", !!user);
    $$(".admin-only").forEach(function (el) { el.style.display = isAdmin() ? "" : "none"; });
  }
  function openAuth() { var m = $("#auth-modal"); if (m) m.classList.add("open"); }
  function closeAuth() { var m = $("#auth-modal"); if (m) m.classList.remove("open"); }
  async function sendMagicLink(email) {
    if (!email || email.indexOf("@") < 0) { toast("Enter a valid email.", false); return; }
    var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (r.error) toast(r.error.message, false);
    else { toast("Check your email for a sign-in link ✉️", true); closeAuth(); }
  }

  /* ---------- GUESTBOOK ---------- */
  async function loadGuestbook() {
    var list = $("#gb-list"); if (!list) return;
    var r = await sb.from("guestbook").select("*").eq("status", "approved").order("created_at", { ascending: false }).limit(300);
    if (r.error) { list.innerHTML = '<div class="empty">Couldn’t load the guestbook.</div>'; return; }
    if (!r.data.length) { list.innerHTML = '<div class="empty">Be the first to sign the guestbook! 💙💛</div>'; return; }
    list.innerHTML = r.data.map(function (g) {
      return '<div class="gb-entry"><div class="gb-msg">' + esc(g.message) + '</div><div class="gb-by">— ' + esc(g.author_name) + ' · ' + fmtDate(g.created_at) + '</div></div>';
    }).join("");
  }
  async function postGuestbook() {
    if (!user) { openAuth(); return; }
    var ta = $("#gb-message"); var msg = (ta.value || "").trim();
    if (!msg) { toast("Write a message first.", false); return; }
    var name = ($("#gb-name") && $("#gb-name").value.trim()) || displayName();
    var r = await sb.from("guestbook").insert({ author_id: user.id, author_name: name, author_email: user.email, message: msg, status: "pending" });
    if (r.error) { toast(r.error.message, false); return; }
    ta.value = ""; toast("Thanks! Your note is pending approval.", true); notifyAdmin("guestbook note", name);
  }

  /* ---------- PHOTO UPLOAD ---------- */
  function openUpload() { if (!user) { openAuth(); return; } var m = $("#upload-modal"); if (m) m.classList.add("open"); }
  function closeUpload() { var m = $("#upload-modal"); if (m) m.classList.remove("open"); }
  async function doUpload() {
    if (!user) { openAuth(); return; }
    var files = $("#upload-file").files, album = $("#upload-album").value, caption = ($("#upload-caption").value || "").trim();
    if (!files || !files.length) { toast("Choose at least one photo.", false); return; }
    $("#upload-submit").disabled = true; toast("Uploading…", true);
    var ok = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i], safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = album + "/" + user.id + "/" + Date.now() + "-" + i + "-" + safe;
      var up = await sb.storage.from("photos").upload(path, f, { upsert: false });
      if (up.error) { toast(up.error.message, false); continue; }
      var ins = await sb.from("photos").insert({ album: album, caption: caption, storage_path: path, uploader_id: user.id, uploader_email: user.email, uploader_name: displayName(), status: "pending" });
      if (!ins.error) ok++;
    }
    $("#upload-submit").disabled = false; $("#upload-file").value = ""; $("#upload-caption").value = "";
    closeUpload();
    toast(ok + " photo" + (ok === 1 ? "" : "s") + " submitted — pending your approval. Thank you!", true);
    if (ok) notifyAdmin("photo", displayName());
  }
  async function loadApprovedPhotos() {
    if (!window.ClassSite || !window.ClassSite.albums) return;
    // Snapshot the built-in photos once so repeated loads don't duplicate.
    window.ClassSite.albums.forEach(function (a) { if (a._base === undefined) a._base = a.photos.slice(); });
    var r = await sb.from("photos").select("*").eq("status", "approved").order("created_at", { ascending: false });
    if (r.error || !r.data) return;
    var grouped = {};
    r.data.forEach(function (p) {
      var url = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl;
      (grouped[p.album] = grouped[p.album] || []).push({ src: url, who: p.caption || p.uploader_name || "", id: p.id, path: p.storage_path });
    });
    window.ClassSite.albums.forEach(function (a) { a.photos = (grouped[a.key] || []).concat(a._base); });
    window.ClassSite.canDelete = isAdmin();
    if (window.ClassSite.renderPhotos) window.ClassSite.renderPhotos();
  }
  // ----- Then & Now: current photos tied to a specific classmate -----
  async function loadThenNow() {
    if (!window.ClassSite || !window.ClassSite.mates) return;
    var r = await sb.from("photos").select("*").eq("album", "thennow").eq("status", "approved").order("created_at", { ascending: false });
    if (r.error || !r.data) return;
    var byId = {};
    r.data.forEach(function (p) { if (p.classmate_id && !byId[p.classmate_id]) byId[p.classmate_id] = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl; });
    window.ClassSite.mates.forEach(function (m) { if (byId[m.id]) m.photoNow = byId[m.id]; });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }
  function uploadNowPhoto(m) {
    if (!user) { openAuth(); return; }
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      toast("Uploading…", true);
      var safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = "thennow/" + m.id + "/" + Date.now() + "-" + safe;
      var up = await sb.storage.from("photos").upload(path, f);
      if (up.error) { toast(up.error.message, false); return; }
      var ins = await sb.from("photos").insert({ album: "thennow", classmate_id: m.id, caption: "Now — " + m.name, storage_path: path, uploader_id: user.id, uploader_email: user.email, uploader_name: displayName(), status: "pending" });
      if (ins.error) { toast(ins.error.message, false); return; }
      toast("Thanks! " + m.name + "'s current photo is pending approval.", true); notifyAdmin("current photo", m.name);
    };
    inp.click();
  }

  // Delete an uploaded photo straight from the album (admin only).
  window.ClassSite = window.ClassSite || {};
  window.ClassSite.deletePhoto = async function (id, path) {
    if (!isAdmin()) return;
    if (!confirm("Delete this photo permanently? It will be removed from the site.")) return;
    if (path) await sb.storage.from("photos").remove([path]);
    var r = await sb.from("photos").delete().eq("id", id);
    if (r.error) { toast(r.error.message, false); return; }
    toast("Photo deleted", true); loadApprovedPhotos(); loadThenNow(); loadAdmin();
  };

  /* ---------- RSVP ---------- */
  async function submitRSVP() {
    if (!user) { openAuth(); return; }
    var name = ($("#rsvp-name") && $("#rsvp-name").value.trim()) || displayName();
    var guests = parseInt(($("#rsvp-guests") && $("#rsvp-guests").value) || "1", 10) || 1;
    var attending = !($("#rsvp-no") && $("#rsvp-no").checked);
    var note = ($("#rsvp-note") && $("#rsvp-note").value.trim()) || null;
    var r = await sb.from("rsvps").insert({ user_id: user.id, name: name, email: user.email, guests: guests, attending: attending, note: note });
    if (r.error) { toast(r.error.message, false); return; }
    var box = $("#rsvp-box");
    if (box) box.innerHTML = '<div class="rsvp-thanks">🎉 You’re on the list, ' + esc(name) + '! We’ll be in touch with details.</div>';
  }

  /* ---------- ADMIN ---------- */
  async function loadAdmin() {
    if (!isAdmin()) return;
    // Pending profile claims (people asking to own/edit a profile).
    var cl = await sb.from("profile_claims").select("*").eq("status", "pending").order("created_at", { ascending: true });
    var cel = $("#admin-claims");
    if (cel) {
      var crows = cl.data || [];
      var nameById = {}; (window.ClassSite && window.ClassSite.mates || []).forEach(function (m) { nameById[m.id] = m.name; });
      cel.innerHTML = crows.length ? crows.map(function (c) {
        return '<div class="admin-item" data-id="' + c.id + '" data-kind="claim"><div class="ai-meta"><b>' + esc(nameById[c.classmate_id] || c.classmate_id) + '</b><br><span class="muted">' + esc(c.email || "") + '</span></div><div class="ai-actions"><button class="btn approve">Approve</button><button class="chip reject">Reject</button></div></div>';
      }).join("") : '<div class="empty">No profile claims waiting.</div>';
    }
    var ph = await sb.from("photos").select("*").eq("status", "pending").order("created_at", { ascending: true });
    var pel = $("#admin-photos");
    if (pel) {
      var rows = ph.data || [];
      pel.innerHTML = rows.length ? rows.map(function (p) {
        var url = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl;
        return '<div class="admin-item" data-id="' + p.id + '" data-kind="photo"><img src="' + esc(url) + '" alt=""><div class="ai-meta"><b>' + esc(p.album) + '</b> · ' + esc(p.uploader_name || p.uploader_email || "") + (p.caption ? '<br>' + esc(p.caption) : "") + '</div><div class="ai-actions"><button class="btn approve">Approve</button><button class="chip reject">Reject</button></div></div>';
      }).join("") : '<div class="empty">No photos waiting. 🎉</div>';
    }
    var gb = await sb.from("guestbook").select("*").eq("status", "pending").order("created_at", { ascending: true });
    var gel = $("#admin-guestbook");
    if (gel) {
      var grows = gb.data || [];
      gel.innerHTML = grows.length ? grows.map(function (g) {
        return '<div class="admin-item" data-id="' + g.id + '" data-kind="gb"><div class="ai-meta">“' + esc(g.message) + '”<br><span class="muted">— ' + esc(g.author_name) + '</span></div><div class="ai-actions"><button class="btn approve">Approve</button><button class="chip reject">Reject</button></div></div>';
      }).join("") : '<div class="empty">No notes waiting.</div>';
    }
    // Published (approved) photos — with a Delete button.
    var pp = await sb.from("photos").select("*").eq("status", "approved").order("created_at", { ascending: false });
    var ppel = $("#admin-pub-photos");
    if (ppel) {
      var pprows = pp.data || [];
      ppel.innerHTML = pprows.length ? pprows.map(function (p) {
        var url = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl;
        return '<div class="admin-item" data-id="' + p.id + '" data-kind="photo" data-path="' + esc(p.storage_path) + '"><img src="' + esc(url) + '" alt=""><div class="ai-meta"><b>' + esc(p.album) + '</b> · ' + esc(p.uploader_name || p.uploader_email || "") + (p.caption ? '<br>' + esc(p.caption) : "") + '</div><div class="ai-actions"><button class="chip reject del">Delete</button></div></div>';
      }).join("") : '<div class="empty">No published photos yet.</div>';
    }
    // Published guestbook notes — with a Delete button.
    var pg = await sb.from("guestbook").select("*").eq("status", "approved").order("created_at", { ascending: false });
    var pgel = $("#admin-pub-gb");
    if (pgel) {
      var pgrows = pg.data || [];
      pgel.innerHTML = pgrows.length ? pgrows.map(function (g) {
        return '<div class="admin-item" data-id="' + g.id + '" data-kind="gb"><div class="ai-meta">“' + esc(g.message) + '”<br><span class="muted">— ' + esc(g.author_name) + '</span></div><div class="ai-actions"><button class="chip reject del">Delete</button></div></div>';
      }).join("") : '<div class="empty">No published notes yet.</div>';
    }

    $$("#view-admin .admin-item").forEach(function (item) {
      var id = item.dataset.id, table = item.dataset.kind === "photo" ? "photos" : item.dataset.kind === "claim" ? "profile_claims" : "guestbook";
      var appr = item.querySelector(".approve"), rej = item.querySelector(".reject:not(.del)"), del = item.querySelector(".del");
      if (appr) appr.addEventListener("click", async function () {
        var r = await sb.from(table).update({ status: "approved" }).eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        toast("Approved ✓", true); loadApprovedPhotos(); loadThenNow(); loadGuestbook(); loadAdmin(); updatePendingBadge();
      });
      if (rej) rej.addEventListener("click", async function () {
        var r = await sb.from(table).update({ status: "rejected" }).eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        item.remove(); toast("Rejected", true); updatePendingBadge();
      });
      if (del) del.addEventListener("click", async function () {
        if (!confirm("Delete this permanently? It will be removed from the site.")) return;
        if (item.dataset.path) await sb.storage.from("photos").remove([item.dataset.path]);
        var r = await sb.from(table).delete().eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        item.remove(); toast("Deleted", true); loadApprovedPhotos(); loadThenNow(); loadGuestbook();
      });
    });
  }

  /* ---------- Classmate overrides (move to In Memory, fix year, restore) ---------- */
  async function loadOverrides() {
    if (!window.ClassSite || !window.ClassSite.mates) return;
    var r = await sb.from("classmate_overrides").select("*");
    if (r.error || !r.data) return;
    var byId = {}; r.data.forEach(function (o) { byId[o.classmate_id] = o; });
    window.ClassSite.mates.forEach(function (m) {
      var o = byId[m.id]; if (!o) return;
      if (o.status) m.status = o.status;
      if (o.passed_year) m.passedYear = o.passed_year; else if (o.status && o.status !== "memory") delete m.passedYear;
      if (o.note) m.memNote = o.note; else delete m.memNote;
    });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }
  function applyLocal(m, ch) { Object.keys(ch).forEach(function (k) { if (ch[k] === undefined) delete m[k]; else m[k] = ch[k]; }); }
  async function saveOverride(id, fields) {
    var row = { classmate_id: id, status: fields.status, passed_year: fields.passed_year, note: fields.note, updated_by: user ? user.email : null };
    var r = await sb.from("classmate_overrides").upsert(row, { onConflict: "classmate_id" });
    if (r.error) { toast(r.error.message, false); return false; }
    return true;
  }
  async function adminAct(act, m) {
    if (act === "tomem") {
      var yr = prompt("Year " + m.name + " passed away (optional — you can add it later):", "");
      if (yr === null) return;
      var note = prompt("A short remembrance note (optional):", "") || "";
      if (!(await saveOverride(m.id, { status: "memory", passed_year: yr.trim() || null, note: note.trim() || null }))) return;
      applyLocal(m, { status: "memory", passedYear: yr.trim() || undefined, memNote: note.trim() || undefined });
      toast(m.name + " moved to In Memory 🕊", true);
    } else if (act === "restore") {
      if (!confirm("Move " + m.name + " back to the directory?")) return;
      if (!(await saveOverride(m.id, { status: "active", passed_year: null, note: null }))) return;
      applyLocal(m, { status: "active", passedYear: undefined, memNote: undefined });
      toast(m.name + " moved back to the directory", true);
    } else if (act === "edityear") {
      var y2 = prompt("Passing year for " + m.name + ":", m.passedYear || "");
      if (y2 === null) return;
      if (!(await saveOverride(m.id, { status: "memory", passed_year: y2.trim() || null, note: m.memNote || null }))) return;
      applyLocal(m, { passedYear: y2.trim() || undefined });
      toast("Updated ✓", true);
    }
    if (window.ClassSite.refresh) window.ClassSite.refresh();
    if (window.__openModal) window.__openModal(m);   // re-render the profile with new state
  }
  // Who do I own? Auto-verify by email, else any admin-approved claim.
  async function loadMyOwnership() {
    myId = null;
    if (!user) return;
    try { var rc = await sb.rpc("claim_my_profile"); if (rc && rc.data) myId = rc.data; } catch (e) {}
    var r = await sb.from("profile_claims").select("classmate_id").eq("user_id", user.id).eq("status", "approved").limit(1);
    if (!r.error && r.data && r.data.length) myId = r.data[0].classmate_id;
  }
  async function manualClaim(m) {
    if (!user) { openAuth(); return; }
    var r = await sb.from("profile_claims").insert({ classmate_id: m.id, user_id: user.id, email: user.email, status: "pending" });
    if (r.error) { toast(r.error.message, false); return; }
    toast("Claim sent — the admin will confirm it's you, then you can edit.", true); notifyAdmin("profile claim", m.name);
  }
  function editProfile(m) {
    var defs = [["city", "City", 0], ["state", "State", 0], ["maidenName", "Maiden / other name", 0],
      ["occupation", "Occupation", 0], ["spouse", "Spouse / Partner", 0], ["children", "Children", 0],
      ["college", "Education", 0], ["homepage", "Website", 0],
      ["story", "School story (back in 1993)", 1], ["comments", "Life since graduation", 1]];
    var html = '<h3 style="font-family:var(--display);text-transform:uppercase;margin:0 0 4px">Edit my profile</h3>' +
      '<p class="muted" style="margin:0 0 14px">Only you can edit this. Changes go live right away.</p>';
    defs.forEach(function (f) {
      var v = esc(m[f[0]] || "");
      html += '<label class="up-label">' + f[1] + '</label>' +
        (f[2] ? '<textarea class="up-input" data-f="' + f[0] + '" rows="4">' + v + '</textarea>'
              : '<input class="up-input" data-f="' + f[0] + '" value="' + v + '">');
    });
    html += '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn" data-editact="save">Save changes</button><button class="chip" data-editact="cancel">Cancel</button></div>';
    var body = $("#modal-body"); if (!body) return;
    body.innerHTML = html;
    $$("[data-editact]", body).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.editact === "cancel") { if (window.__openModal) window.__openModal(m); return; }
        var fields = {};
        $$("[data-f]", body).forEach(function (inp) { var v = inp.value.trim(); if (v) fields[inp.dataset.f] = v; });
        saveEdits(m, fields);
      });
    });
  }
  async function saveEdits(m, fields) {
    var r = await sb.from("profile_edits").upsert({ classmate_id: m.id, fields: fields, updated_at: new Date().toISOString() }, { onConflict: "classmate_id" });
    if (r.error) { toast(r.error.message, false); return; }
    EDITABLE.forEach(function (k) { if (fields[k] != null && fields[k] !== "") m[k] = fields[k]; });
    toast("Profile saved ✓", true);
    if (window.ClassSite.refresh) window.ClassSite.refresh();
    if (window.__openModal) window.__openModal(m);
  }
  async function loadEdits() {
    if (!window.ClassSite || !window.ClassSite.mates) return;
    var r = await sb.from("profile_edits").select("*");
    if (r.error || !r.data) return;
    var byId = {}; r.data.forEach(function (e) { byId[e.classmate_id] = e.fields || {}; });
    window.ClassSite.mates.forEach(function (m) {
      var f = byId[m.id]; if (!f) return;
      EDITABLE.forEach(function (k) { if (f[k] != null && f[k] !== "") m[k] = f[k]; });
    });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }

  window.ClassSite = window.ClassSite || {};
  window.ClassSite.onModalOpen = function (m, body) {
    if (!user) return;                       // must be signed in to do anything
    var parts = [];
    if (myId && m.id === myId) parts.push('<button class="btn amt-edit" data-act="editme">✏️ Edit my profile</button>');
    if (m.status !== "memory" && m.photoThen) parts.push('<button class="btn amt-now" data-act="addnow">📷 Add a current photo</button>');
    if (!myId && m.status !== "memory") parts.push('<button class="chip" data-act="claim">✋ This is me</button>');
    if (isAdmin()) {
      parts.push('<span class="amt-label">Admin</span>');
      parts.push(m.status === "memory"
        ? '<button class="chip" data-act="edityear">Edit year</button><button class="chip" data-act="restore">Return to directory</button>'
        : '<button class="btn amt-mem" data-act="tomem">🕊 Move to In Memory</button>');
    }
    if (!parts.length) return;
    var box = document.createElement("div");
    box.className = "admin-modal-tools";
    box.innerHTML = parts.join("");
    body.appendChild(box);
    $$("[data-act]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.act;
        if (a === "addnow") uploadNowPhoto(m);
        else if (a === "editme") editProfile(m);
        else if (a === "claim") manualClaim(m);
        else adminAct(a, m);
      });
    });
  };

  /* ---------- wire + init ---------- */
  function wire() {
    if ($("#gb-post-btn")) $("#gb-post-btn").addEventListener("click", postGuestbook);
    if ($("#add-photos-btn")) $("#add-photos-btn").addEventListener("click", openUpload);
    if ($("#upload-submit")) $("#upload-submit").addEventListener("click", doUpload);
    $$("[data-upload-close]").forEach(function (b) { b.addEventListener("click", closeUpload); });
    if ($("#rsvp-btn")) $("#rsvp-btn").addEventListener("click", submitRSVP);
    if ($("#auth-send")) $("#auth-send").addEventListener("click", function () { sendMagicLink(($("#auth-email").value || "").trim()); });
    if ($("#auth-email")) $("#auth-email").addEventListener("keydown", function (e) { if (e.key === "Enter") sendMagicLink(($("#auth-email").value || "").trim()); });
    $$("[data-auth-close]").forEach(function (b) { b.addEventListener("click", closeAuth); });
    document.addEventListener("click", function (e) {
      if (e.target.closest('[data-view="admin"]')) setTimeout(loadAdmin, 40);
      if (e.target.closest('[data-view="guestbook"]')) setTimeout(loadGuestbook, 40);
    });
  }
  async function init() {
    wire();
    var s = await sb.auth.getSession(); user = s.data.session ? s.data.session.user : null;
    renderAuth();
    await loadMyOwnership();
    sb.auth.onAuthStateChange(async function (_e, sess) {
      user = sess ? sess.user : null; renderAuth(); await loadMyOwnership();
      loadApprovedPhotos(); loadThenNow(); updatePendingBadge(); if (isAdmin()) loadAdmin();
    });
    loadGuestbook(); loadApprovedPhotos(); loadThenNow(); loadOverrides(); loadEdits(); updatePendingBadge();
    if (isAdmin()) loadAdmin();
  }
  init();
})();
