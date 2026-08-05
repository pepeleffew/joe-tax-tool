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
  // Implicit flow puts the token in the redirect link itself, so sign-in works
  // even when the email link opens in a different browser than the one that
  // requested it (very common — Mail's in-app viewer, phone default browser).
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  var user = null;
  var myId = null;                       // the classmate id this user owns (if any)
  var EDITABLE = ["city", "state", "occupation", "spouse", "children", "college", "homepage", "maidenName", "story", "comments",
    "birthMonth", "birthDay", "bizList", "bizName", "bizWhat", "bizUrl", "bizPhone", "bizDesc"];
  var amAdmin = false;                     // resolved from the server (public.admins)
  var isAdmin = function () { return amAdmin; };
  // Classmates defined as In Memory in the base data are PERMANENT memorials.
  // Snapshot them now (before any override mutates status) so a stray/erroneous
  // "active" override can never silently drop a real memorial off the page.
  var BASE_MEMORY = {};
  try { (window.CLASS_DATA && window.CLASS_DATA.classmates || []).forEach(function (c) { if (c.status === "memory") BASE_MEMORY[c.id] = true; }); } catch (e) {}
  // Determine admin from the DB (public.is_admin RPC), with a client-side
  // fallback list so the primary admin is never locked out of the UI.
  async function refreshAdmin() {
    if (!user || !user.email) { amAdmin = false; return; }
    var email = user.email.toLowerCase();
    var list = (cfg.adminEmails || (cfg.adminEmail ? [cfg.adminEmail] : [])).map(function (e) { return String(e).toLowerCase(); });
    if (list.indexOf(email) > -1) { amAdmin = true; return; }
    try { var r = await sb.rpc("is_admin"); amAdmin = (r.data === true); }
    catch (e) { amAdmin = false; }
  }
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
      var r = await Promise.all([q("photos"), q("guestbook"), q("profile_claims"), q("tributes")]);
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
      var row = { album: "thennow", classmate_id: m.id, caption: "Now — " + m.name, storage_path: path, uploader_id: user.id, uploader_email: user.email, uploader_name: displayName(), status: "pending" };
      if (isAdmin()) {   // admin: publish immediately (admins may read back the pending row)
        var ins = await sb.from("photos").insert(row).select("id").single();
        if (ins.error) { toast(ins.error.message, false); return; }
        await sb.from("photos").update({ status: "approved" }).eq("id", ins.data.id);
        await loadThenNow();
        toast(m.name + "'s current photo added ✓", true);
        if (window.__openModal) window.__openModal(m);
      } else {   // classmate: plain insert (no read-back, which RLS forbids for pending rows)
        var insr = await sb.from("photos").insert(row);
        if (insr.error) { toast(insr.error.message, false); return; }
        toast("Thanks! " + m.name + "'s current photo is pending approval.", true); notifyAdmin("current photo", m.name);
      }
    };
    inp.click();
  }

  // ----- Yearbook photo: admin fills in a missing 1993 portrait -----
  async function loadYearbookPhotos() {
    if (!window.ClassSite || !window.ClassSite.mates) return;
    var r = await sb.from("photos").select("*").eq("album", "yearbook").eq("status", "approved").order("created_at", { ascending: false });
    if (r.error || !r.data) return;
    var byId = {};
    r.data.forEach(function (p) { if (p.classmate_id && !byId[p.classmate_id]) byId[p.classmate_id] = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl; });
    window.ClassSite.mates.forEach(function (m) {
      if (m._ybBase === undefined) m._ybBase = m.photoThen || "";   // original class-data portrait
      if (byId[m.id]) { m.photoThen = byId[m.id]; m._ybUpload = true; }
      else { m.photoThen = m._ybBase; m._ybUpload = false; }
    });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }
  // Admin: remove uploaded photo(s) for a classmate (reverts to their original,
  // or to no photo). Only affects uploads — baked-in class photos are untouched.
  async function removeClassmatePhoto(m) {
    if (!isAdmin()) return;
    if (!confirm("Remove the uploaded photo(s) for " + m.name + "? This can't be undone.")) return;
    var r = await sb.from("photos").select("id, storage_path").in("album", ["yearbook", "memorial"]).eq("classmate_id", m.id);
    if (r.error) { toast(r.error.message, false); return; }
    var rows = r.data || [];
    if (rows.length) {
      var paths = rows.map(function (x) { return x.storage_path; }).filter(Boolean);
      if (paths.length) await sb.storage.from("photos").remove(paths);
      await sb.from("photos").delete().in("id", rows.map(function (x) { return x.id; }));
    }
    await sb.from("classmate_overrides").update({ mem_photo: null }).eq("classmate_id", m.id);
    await loadYearbookPhotos(); await loadMemorialPhotos();
    toast("Photo removed ✓", true);
    if (window.__openModal) window.__openModal(m);
  }
  function uploadYearbookPhoto(m) {
    if (!isAdmin()) { toast("Admins only.", false); return; }
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      toast("Uploading…", true);
      var safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = "yearbook/" + m.id + "/" + Date.now() + "-" + safe;
      var up = await sb.storage.from("photos").upload(path, f);
      if (up.error) { toast(up.error.message, false); return; }
      var ins = await sb.from("photos").insert({ album: "yearbook", classmate_id: m.id, caption: m.name, storage_path: path, uploader_id: user.id, uploader_email: user.email, uploader_name: displayName(), status: "pending" }).select("id").single();
      if (ins.error) { toast(ins.error.message, false); return; }
      await sb.from("photos").update({ status: "approved" }).eq("id", ins.data.id);   // admin uploads publish immediately
      await loadYearbookPhotos();
      toast("Photo added for " + m.name + " ✓", true);
      if (window.__openModal) window.__openModal(m);
    };
    inp.click();
  }

  // ----- Memorial photos: admin-added photos on an In Memory page -----
  // Builds the full photo pool (original data + uploads) and picks the profile
  // photo: an admin's chosen one (classmate_overrides.mem_photo), else the
  // original portrait, else the first upload. The rest form a small gallery.
  async function loadMemorialPhotos() {
    if (!window.ClassSite || !window.ClassSite.mates) return;
    var pr = await sb.from("photos").select("*").eq("album", "memorial").eq("status", "approved").order("created_at", { ascending: true });
    var ov = await sb.from("classmate_overrides").select("classmate_id, mem_photo");
    var uploads = {}, primary = {};
    if (!pr.error && pr.data) pr.data.forEach(function (p) {
      if (!p.classmate_id) return;
      var url = sb.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl;
      (uploads[p.classmate_id] = uploads[p.classmate_id] || []).push(url);
    });
    if (!ov.error && ov.data) ov.data.forEach(function (o) { if (o.mem_photo) primary[o.classmate_id] = o.mem_photo; });
    window.ClassSite.mates.forEach(function (m) {
      if (m._memPhotoMem === undefined) m._memPhotoMem = m.photoMem || "";   // original class-data portrait
      if (m._memBase === undefined) m._memBase = m.memGallery ? m.memGallery.slice() : [];
      var ups = uploads[m.id] || [];
      m._memUpload = ups.length > 0;
      if (!ups.length && !m._memPhotoMem && !m._memBase.length) return;
      var pool = [];
      if (m._memPhotoMem) pool.push(m._memPhotoMem);
      m._memBase.forEach(function (u) { if (pool.indexOf(u) < 0) pool.push(u); });
      ups.forEach(function (u) { if (pool.indexOf(u) < 0) pool.push(u); });
      if (!pool.length) return;
      var chosen = (primary[m.id] && pool.indexOf(primary[m.id]) >= 0) ? primary[m.id] : (m._memPhotoMem || pool[0]);
      m.photoMem = chosen;
      m.memGallery = pool.filter(function (u) { return u !== chosen; });
    });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }
  // Admin: set which photo is a memorial classmate's profile picture.
  async function setPrimaryMemPhoto(m, url) {
    if (!isAdmin()) return;
    var r = await sb.from("classmate_overrides").upsert({ classmate_id: m.id, mem_photo: url, updated_at: new Date().toISOString(), updated_by: user.email }, { onConflict: "classmate_id" });
    if (r.error) { toast(r.error.message, false); return; }
    await loadMemorialPhotos();
    toast("Profile photo updated ✓", true);
    if (window.__openModal) window.__openModal(m);
  }
  // Admin: delete ONE specific photo from a memorial page (a duplicate/extra).
  // Only uploaded photos live in the DB; class-data originals can't be removed here.
  async function deleteMemPhoto(m, url) {
    if (!isAdmin()) return;
    if (!confirm("Remove this one photo from " + m.name + "'s page? This can't be undone.")) return;
    var r = await sb.from("photos").select("id, storage_path").in("album", ["memorial", "yearbook"]).eq("classmate_id", m.id);
    if (r.error) { toast(r.error.message, false); return; }
    var match = (r.data || []).filter(function (x) {
      return sb.storage.from("photos").getPublicUrl(x.storage_path).data.publicUrl === url;
    });
    if (!match.length) { toast("That photo is part of the original class data and can't be removed here.", false); return; }
    if (match[0].storage_path) await sb.storage.from("photos").remove(match.map(function (x) { return x.storage_path; }));
    await sb.from("photos").delete().in("id", match.map(function (x) { return x.id; }));
    await sb.from("classmate_overrides").update({ mem_photo: null }).eq("classmate_id", m.id).eq("mem_photo", url);
    await loadMemorialPhotos();
    toast("Photo removed ✓", true);
    if (window.__openModal) window.__openModal(m);
  }
  function renderMemPhotoPicker(m, body) {
    var pool = [m.photoMem].concat(m.memGallery || []).filter(Boolean);
    if (pool.length < 2) return;
    var box = document.createElement("div");
    box.className = "fld mem-pick";
    box.innerHTML = '<span>Profile photo <span class="muted" style="font-weight:400">(admin — pick which shows first, or ✕ to remove a duplicate)</span></span><div class="mem-pick-row">' +
      pool.map(function (u) {
        var cur = (u === m.photoMem);
        return '<div class="mem-pick-item' + (cur ? " current" : "") + '"><img src="' + esc(u) + '" alt="">' +
          '<button class="mem-pick-del" data-url="' + esc(u) + '" title="Remove this photo" aria-label="Remove this photo">✕</button>' +
          (cur ? '<div class="mem-pick-tag">Current</div>' : '<button class="chip mem-pick-set" data-url="' + esc(u) + '">Use this</button>') + '</div>';
      }).join("") + '</div>';
    body.appendChild(box);
    $$(".mem-pick-set", box).forEach(function (b) {
      b.addEventListener("click", function () { setPrimaryMemPhoto(m, b.dataset.url); });
    });
    $$(".mem-pick-del", box).forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); deleteMemPhoto(m, b.dataset.url); });
    });
  }
  function uploadMemorialPhoto(m) {
    if (!isAdmin()) { toast("Admins only.", false); return; }
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      toast("Uploading…", true);
      var safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = "memorial/" + m.id + "/" + Date.now() + "-" + safe;
      var up = await sb.storage.from("photos").upload(path, f);
      if (up.error) { toast(up.error.message, false); return; }
      var ins = await sb.from("photos").insert({ album: "memorial", classmate_id: m.id, caption: m.name, storage_path: path, uploader_id: user.id, uploader_email: user.email, uploader_name: displayName(), status: "pending" }).select("id").single();
      if (ins.error) { toast(ins.error.message, false); return; }
      await sb.from("photos").update({ status: "approved" }).eq("id", ins.data.id);   // admin uploads publish immediately
      await loadMemorialPhotos();
      toast("Photo added to " + m.name + "'s page ✓", true);
      if (window.__openModal) window.__openModal(m);   // reopen so it shows right away
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
    await loadConnectedAccounts();
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
    var tr = await sb.from("tributes").select("*").eq("status", "pending").order("created_at", { ascending: true });
    var tel = $("#admin-tributes");
    if (tel) {
      var trows = tr.data || [];
      var tnameById = {}; (window.ClassSite && window.ClassSite.mates || []).forEach(function (m) { tnameById[m.id] = m.name; });
      tel.innerHTML = trows.length ? trows.map(function (t) {
        return '<div class="admin-item" data-id="' + t.id + '" data-kind="tribute"><div class="ai-meta">For <b>' + esc(tnameById[t.classmate_id] || t.classmate_id) + '</b><br>“' + esc(t.message) + '”<br><span class="muted">— ' + esc(t.author_name) + '</span></div><div class="ai-actions"><button class="btn approve">Approve</button><button class="chip reject">Reject</button></div></div>';
      }).join("") : '<div class="empty">No remembrances waiting.</div>';
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
    // Published remembrances — with a Delete button.
    var pt = await sb.from("tributes").select("*").eq("status", "approved").order("created_at", { ascending: false });
    var ptel = $("#admin-pub-tributes");
    if (ptel) {
      var ptrows = pt.data || [];
      var tnameById2 = {}; (window.ClassSite && window.ClassSite.mates || []).forEach(function (m) { tnameById2[m.id] = m.name; });
      ptel.innerHTML = ptrows.length ? ptrows.map(function (t) {
        return '<div class="admin-item" data-id="' + t.id + '" data-kind="tribute"><div class="ai-meta">For <b>' + esc(tnameById2[t.classmate_id] || t.classmate_id) + '</b><br>“' + esc(t.message) + '”<br><span class="muted">— ' + esc(t.author_name) + '</span></div><div class="ai-actions"><button class="chip reject del">Delete</button></div></div>';
      }).join("") : '<div class="empty">No published remembrances yet.</div>';
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
      var id = item.dataset.id, table = item.dataset.kind === "photo" ? "photos" : item.dataset.kind === "claim" ? "profile_claims" : item.dataset.kind === "tribute" ? "tributes" : "guestbook";
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
      // Never let an override demote a permanent (base-data) memorial to the directory.
      if (o.status && !(o.status !== "memory" && BASE_MEMORY[m.id])) m.status = o.status;
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
      if (BASE_MEMORY[m.id]) { toast(m.name + " is a permanent memorial and can't be moved to the directory.", false); return; }
      if (!confirm("⚠️ This REMOVES " + m.name + " from the In Memory page and moves them back into the living classmate directory.\n\nOnly do this if they were placed In Memory by mistake. Continue?")) return;
      if (!confirm("Are you sure? Move " + m.name + " OUT of In Memory?")) return;
      if (!(await saveOverride(m.id, { status: "active", passed_year: null, note: null }))) return;
      applyLocal(m, { status: "active", passedYear: undefined, memNote: undefined });
      toast(m.name + " moved back to the directory", true);
    } else if (act === "markactive") {
      if (!(await saveOverride(m.id, { status: "active", passed_year: null, note: null }))) return;
      applyLocal(m, { status: "active" });
      toast(m.name + " marked as reconnected ✓", true);
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
    // Instantly connect this account to the profile (and remember the email for
    // next time), so signing in with a new address is smooth.
    var r = await sb.rpc("claim_profile", { cid: m.id });
    if (r.error) { toast(r.error.message, false); return; }
    if (r.data === m.id) {
      myId = r.data;
      toast("You're connected to your profile — edit away! ✓", true);
      notifyAdmin("profile claim", m.name);
      if (window.ClassSite.refresh) window.ClassSite.refresh();
      if (window.__openModal) window.__openModal(m);
    } else if (r.data) {
      myId = r.data;
      toast("Your account already has a profile claimed. Contact the admin to change it.", false);
    } else {
      toast("That profile is already claimed by someone else. If that's a mistake, contact the admin.", false);
    }
  }
  function editProfile(m) {
    var defs = [["city", "City", 0], ["state", "State", 0], ["maidenName", "Maiden / other name", 0],
      ["occupation", "Occupation", 0], ["spouse", "Spouse / Partner", 0], ["children", "Children", 0],
      ["college", "Education", 0], ["homepage", "Website", 0],
      ["story", "School story (back in 1993)", 1], ["comments", "Life since graduation", 1]];
    var html = '<h3 style="font-family:var(--display);text-transform:uppercase;margin:0 0 4px">Edit my profile</h3>' +
      '<p class="muted" style="margin:0 0 14px">Only you can edit this. Changes go live right away.</p>';
    var US_STATES = [["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]];
    var stFull = {}; US_STATES.forEach(function (s) { stFull[s[1].toLowerCase()] = s[0]; });
    var curState = String(m.state || "").trim();
    if (curState.length !== 2) curState = stFull[curState.toLowerCase()] || curState;
    curState = curState.toUpperCase();
    defs.forEach(function (f) {
      var v = esc(m[f[0]] || "");
      if (f[0] === "state") {
        html += '<label class="up-label">State</label><select class="up-input" data-f="state"><option value="">—</option>' +
          US_STATES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === curState ? " selected" : "") + '>' + s[1] + '</option>'; }).join("") + '</select>';
      } else {
        html += '<label class="up-label">' + f[1] + '</label>' +
          (f[2] ? '<textarea class="up-input" data-f="' + f[0] + '" rows="4">' + v + '</textarea>'
                : '<input class="up-input" data-f="' + f[0] + '" value="' + v + '">');
      }
    });
    var BMON = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var curM = +m.birthMonth || 0, curD = +m.birthDay || 0;
    html += '<label class="up-label">Birthday</label><div style="display:flex;gap:8px">' +
      '<select class="up-input" data-fb="birthMonth" style="flex:2">' +
      BMON.map(function (n, i) { return '<option value="' + (i || "") + '"' + (i === curM ? " selected" : "") + '>' + (i ? n : "Month") + '</option>'; }).join("") +
      '</select>' +
      '<input class="up-input" data-fb="birthDay" type="number" min="1" max="31" placeholder="Day" style="flex:1" value="' + (curD || "") + '"></div>';
    var bizDefs = [["bizName", "Business / company name", 0], ["bizWhat", "What you do (e.g. Realtor, Wedding Planner)", 0],
      ["bizUrl", "Business website", 0], ["bizPhone", "Business phone", 0], ["bizDesc", "Short description (optional)", 1]];
    html += '<div class="biz-fieldset"><h4 class="up-subhead">💼 Class Business Directory</h4>' +
      '<label class="up-check"><input type="checkbox" data-fc="bizList"' + (m.bizList === "yes" ? " checked" : "") + '> List my business / service in the “Support Our Own” directory</label>';
    bizDefs.forEach(function (f) {
      var v = esc(m[f[0]] || "");
      html += '<label class="up-label">' + f[1] + '</label>' +
        (f[2] ? '<textarea class="up-input" data-f="' + f[0] + '" rows="3">' + v + '</textarea>'
              : '<input class="up-input" data-f="' + f[0] + '" value="' + v + '">');
    });
    html += '</div>';
    html += '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn" data-editact="save">Save changes</button><button class="chip" data-editact="cancel">Cancel</button></div>';
    var body = $("#modal-body"); if (!body) return;
    body.innerHTML = html;
    $$("[data-editact]", body).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.editact === "cancel") { if (window.__openModal) window.__openModal(m); return; }
        var fields = {};
        $$("[data-f]", body).forEach(function (inp) { fields[inp.dataset.f] = inp.value.trim(); });   // store all — "" means clear
        $$("[data-fb]", body).forEach(function (inp) { fields[inp.dataset.fb] = (inp.value || "").trim(); });
        var chk = body.querySelector('[data-fc="bizList"]');
        fields.bizList = (chk && chk.checked) ? "yes" : "no";
        saveEdits(m, fields);
      });
    });
  }
  async function saveEdits(m, fields) {
    var r = await sb.from("profile_edits").upsert({ classmate_id: m.id, fields: fields, updated_at: new Date().toISOString() }, { onConflict: "classmate_id" });
    if (r.error) { toast(r.error.message, false); return; }
    EDITABLE.forEach(function (k) { if (fields[k] == null) return; if (fields[k] === "") delete m[k]; else m[k] = fields[k]; });
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
      EDITABLE.forEach(function (k) { if (f[k] == null) return; if (f[k] === "") delete m[k]; else m[k] = f[k]; });
    });
    if (window.ClassSite.refresh) window.ClassSite.refresh();
  }

  window.ClassSite = window.ClassSite || {};
  /* ---------- TRIBUTES (In Memory remembrances) ---------- */
  function tributeHtml(t) {
    return '<div class="tribute"><p class="tr-msg">' + esc(t.message) + '</p><div class="tr-by">— ' + esc(t.author_name) + ' · ' + fmtDate(t.created_at) + '</div></div>';
  }
  async function postTribute(m, msg, nameVal, ta, list) {
    if (!user) { openAuth(); return; }
    if (!msg) { toast("Write a memory first.", false); return; }
    var name = (nameVal || "").trim() || displayName();
    var r = await sb.from("tributes").insert({ classmate_id: m.id, author_id: user.id, author_name: name, author_email: user.email, message: msg, status: "pending" });
    if (r.error) { toast(r.error.message, false); return; }
    if (ta) ta.value = "";
    toast("Thank you 💛 Your remembrance is pending approval.", true);
    notifyAdmin("remembrance", m.name);
    updatePendingBadge();
  }
  async function renderTributes(m, body) {
    var sec = document.createElement("div");
    sec.className = "fld tributes";
    var fn = esc(String(m.name || "").split(" ")[0] || "them");
    sec.innerHTML = '<span>Remembrances</span><div class="tr-list"><p class="muted" style="margin:.2em 0 0">Loading…</p></div>';
    body.appendChild(sec);
    var list = sec.querySelector(".tr-list");
    var r = await sb.from("tributes").select("*").eq("classmate_id", m.id).eq("status", "approved").order("created_at", { ascending: true });
    var items = (r.error || !r.data) ? [] : r.data;
    var listHtml = items.length ? items.map(tributeHtml).join("")
      : '<p class="muted" style="margin:.2em 0 .6em">Be the first to share a memory of ' + fn + '.</p>';
    var formHtml;
    if (user) {
      var defName = displayName(); if (defName.indexOf("@") > -1) defName = defName.split("@")[0];
      formHtml = '<div class="tr-form">' +
        '<input class="tr-name" type="text" placeholder="Your name" value="' + esc(defName) + '">' +
        '<textarea class="tr-input" rows="3" maxlength="2000" placeholder="Share a memory of ' + fn + '…"></textarea>' +
        '<button class="btn tr-post">Post remembrance</button>' +
        '<div class="muted tr-hint">Reviewed before it appears.</div></div>';
    } else {
      formHtml = '<button class="chip tr-signin">Sign in to leave a remembrance</button>';
    }
    list.innerHTML = listHtml + formHtml;
    var pb = list.querySelector(".tr-post");
    if (pb) pb.addEventListener("click", function () {
      var ta = list.querySelector(".tr-input"), nm = list.querySelector(".tr-name");
      postTribute(m, (ta.value || "").trim(), nm ? nm.value : "", ta, list);
    });
    var si = list.querySelector(".tr-signin");
    if (si) si.addEventListener("click", openAuth);
  }

  window.ClassSite.onModalOpen = function (m, body) {
    if (m.status === "memory") renderTributes(m, body);   // remembrances — visible to all
    if (!user) return;                       // must be signed in to do anything else
    var parts = [];
    if (myId && m.id === myId) parts.push('<button class="btn amt-edit" data-act="editme">✏️ Edit my profile</button>');
    else if (isAdmin()) parts.push('<button class="btn amt-edit" data-act="editme">✏️ Edit profile</button>');
    if (m.status !== "memory") parts.push('<button class="btn amt-now" data-act="addnow">📷 Add a current photo</button>');
    if (!myId && m.status !== "memory") parts.push('<button class="chip" data-act="claim">✋ This is me</button>');
    if (isAdmin()) {
      parts.push('<span class="amt-label">Admin</span>');
      if (m.status === "memory") {
        parts.push('<button class="btn amt-now" data-act="addmem">📷 ' + (m.photoThen || m.photoMem ? "Add a photo" : "Add profile photo") + '</button>');
        if (m._memUpload) parts.push('<button class="chip" data-act="rmphoto">🗑 Remove photo</button>');
        parts.push('<button class="chip" data-act="edityear">Edit year</button>');
        // "Return to directory" only makes sense for someone mistakenly added to In Memory.
        // Permanent (base-data) memorials can't be moved out from here.
        if (!BASE_MEMORY[m.id]) parts.push('<button class="chip chip-danger" data-act="restore">Return to directory</button>');
      } else {
        if (m.status === "missing") parts.push('<button class="btn amt-mem" data-act="markactive">✓ Mark as reconnected</button>');
        parts.push('<button class="btn amt-now" data-act="addthen">🎓 ' + (m.photoThen ? "Replace yearbook photo" : "Add yearbook photo") + '</button>');
        if (m._ybUpload) parts.push('<button class="chip" data-act="rmphoto">🗑 Remove photo</button>');
        parts.push('<button class="btn amt-mem" data-act="tomem">🕊 Move to In Memory</button>');
      }
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
        else if (a === "addthen") uploadYearbookPhoto(m);
        else if (a === "addmem") uploadMemorialPhoto(m);
        else if (a === "rmphoto") removeClassmatePhoto(m);
        else if (a === "editme") editProfile(m);
        else if (a === "claim") manualClaim(m);
        else adminAct(a, m);
      });
    });
    if (isAdmin() && m.status === "memory") renderMemPhotoPicker(m, body);
    if (isAdmin()) showClaimAdmin(m, body);
  };
  // Admin: if an account has claimed this profile, show who — and let the admin
  // release it (e.g. someone claimed it by mistake, blocking the real classmate).
  async function showClaimAdmin(m, body) {
    var r = await sb.from("profile_claims").select("email").eq("classmate_id", m.id).eq("status", "approved").limit(1);
    if (r.error || !r.data || !r.data.length) return;
    var who = r.data[0].email || "an unknown account";
    var box = document.createElement("div");
    box.className = "fld";
    box.innerHTML = '<span>Profile claim <span class="muted" style="font-weight:400">(admin)</span></span>' +
      '<div class="claimadmin">Claimed by <b>' + esc(who) + '</b> · ' +
      '<button class="chip chip-danger claim-release">Release claim</button></div>';
    body.appendChild(box);
    box.querySelector(".claim-release").addEventListener("click", function () { releaseClaim(m, who); });
  }
  async function releaseClaim(m, who) {
    if (!isAdmin()) return;
    if (!confirm("Release the claim on " + m.name + "'s profile?\n\nCurrently held by " + who + ". They'll be disconnected and " + m.name + " can claim it herself.")) return;
    var r = await sb.rpc("release_claim", { cid: m.id });
    if (r.error) {
      // Fallback if the release_claim function isn't installed yet: at least
      // remove the claim rows (the email match is cleared by the DB function).
      var d = await sb.from("profile_claims").delete().eq("classmate_id", m.id);
      if (d.error) { toast(d.error.message, false); return; }
    }
    if (myId === m.id) myId = null;
    toast("Claim released ✓ — " + m.name + " can now claim this profile.", true);
    if (window.ClassSite.refresh) window.ClassSite.refresh();
    if (window.__openModal) window.__openModal(m);
  }
  // Admin panel: every account currently linked to a profile, with Release.
  async function loadConnectedAccounts() {
    var el = $("#admin-connected"); if (!el) return;
    var r = await sb.from("profile_claims").select("classmate_id,email").eq("status", "approved").order("created_at", { ascending: true });
    if (r.error) { el.innerHTML = '<div class="empty">Could not load connected accounts.</div>'; return; }
    var nameById = {}; (window.ClassSite && window.ClassSite.mates || []).forEach(function (m) { nameById[m.id] = m.name; });
    var rows = (r.data || []).map(function (c) { return { cid: c.classmate_id, name: nameById[c.classmate_id] || c.classmate_id, email: c.email || "(unknown email)" }; });
    rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var render = function (f) {
      f = (f || "").toLowerCase();
      var list = rows.filter(function (x) { return !f || x.name.toLowerCase().indexOf(f) > -1 || x.email.toLowerCase().indexOf(f) > -1; });
      el.innerHTML = list.length ? list.map(function (x) {
        return '<div class="admin-item"><div class="ai-meta"><b>' + esc(x.name) + '</b><br><span class="muted">' + esc(x.email) + '</span></div><div class="ai-actions"><button class="chip chip-danger conn-release" data-cid="' + esc(x.cid) + '" data-name="' + esc(x.name) + '" data-email="' + esc(x.email) + '">Release</button></div></div>';
      }).join("") : '<div class="empty">' + (rows.length ? "No matches." : "No connected accounts yet.") + "</div>";
      $$(".conn-release", el).forEach(function (b) {
        b.addEventListener("click", function () { releaseClaimById(b.dataset.cid, b.dataset.name, b.dataset.email); });
      });
    };
    var fi = $("#admin-connected-filter");
    render(fi ? fi.value : "");
    if (fi && !fi._wired) { fi._wired = true; fi.addEventListener("input", function () { render(fi.value); }); }
  }
  async function releaseClaimById(cid, name, who) {
    if (!isAdmin()) return;
    if (!confirm("Release the claim on " + name + "'s profile?\n\nCurrently held by " + who + ". They'll be disconnected and can then claim the correct profile.")) return;
    var r = await sb.rpc("release_claim", { cid: cid });
    if (r.error) {
      var d = await sb.from("profile_claims").delete().eq("classmate_id", cid);
      if (d.error) { toast(d.error.message, false); return; }
    }
    if (myId === cid) myId = null;
    toast("Claim released ✓", true);
    await loadConnectedAccounts();
    if (window.ClassSite && window.ClassSite.refresh) window.ClassSite.refresh();
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
    await refreshAdmin();
    renderAuth();
    await loadMyOwnership();
    sb.auth.onAuthStateChange(async function (_e, sess) {
      user = sess ? sess.user : null; await refreshAdmin(); renderAuth(); await loadMyOwnership();
      loadApprovedPhotos(); loadThenNow(); updatePendingBadge(); if (isAdmin()) loadAdmin();
    });
    loadGuestbook(); loadApprovedPhotos(); loadThenNow(); loadMemorialPhotos(); loadYearbookPhotos(); loadOverrides(); loadEdits(); updatePendingBadge();
    if (isAdmin()) loadAdmin();
  }
  init();
})();
