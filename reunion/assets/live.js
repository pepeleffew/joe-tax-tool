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
  var isAdmin = function () { return !!(user && user.email && cfg.adminEmail && user.email.toLowerCase() === cfg.adminEmail.toLowerCase()); };
  var displayName = function () { return (user && user.user_metadata && user.user_metadata.name) || (user && user.email) || "Classmate"; };
  var fmtDate = function (s) { try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return ""; } };

  function toast(msg, ok) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = ok === false ? "show err" : "show";
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = ""; }, 4500);
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
    ta.value = ""; toast("Thanks! Your note is pending approval.", true);
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
  // Delete an uploaded photo straight from the album (admin only).
  window.ClassSite = window.ClassSite || {};
  window.ClassSite.deletePhoto = async function (id, path) {
    if (!isAdmin()) return;
    if (!confirm("Delete this photo permanently? It will be removed from the site.")) return;
    if (path) await sb.storage.from("photos").remove([path]);
    var r = await sb.from("photos").delete().eq("id", id);
    if (r.error) { toast(r.error.message, false); return; }
    toast("Photo deleted", true); loadApprovedPhotos(); loadAdmin();
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
      var id = item.dataset.id, table = item.dataset.kind === "photo" ? "photos" : "guestbook";
      var appr = item.querySelector(".approve"), rej = item.querySelector(".reject:not(.del)"), del = item.querySelector(".del");
      if (appr) appr.addEventListener("click", async function () {
        var r = await sb.from(table).update({ status: "approved" }).eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        toast("Approved ✓", true); loadApprovedPhotos(); loadGuestbook(); loadAdmin();
      });
      if (rej) rej.addEventListener("click", async function () {
        var r = await sb.from(table).update({ status: "rejected" }).eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        item.remove(); toast("Rejected", true);
      });
      if (del) del.addEventListener("click", async function () {
        if (!confirm("Delete this permanently? It will be removed from the site.")) return;
        if (item.dataset.path) await sb.storage.from("photos").remove([item.dataset.path]);
        var r = await sb.from(table).delete().eq("id", id);
        if (r.error) { toast(r.error.message, false); return; }
        item.remove(); toast("Deleted", true); loadApprovedPhotos(); loadGuestbook();
      });
    });
  }

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
    sb.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; renderAuth(); loadApprovedPhotos(); if (isAdmin()) loadAdmin(); });
    loadGuestbook(); loadApprovedPhotos();
    if (isAdmin()) loadAdmin();
  }
  init();
})();
