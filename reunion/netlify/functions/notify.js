// Emails the admin when a classmate submits something needing approval.
// Configure in Netlify env vars: RESEND_API_KEY and NOTIFY_EMAIL.
// Uses Resend's onboarding sender, which delivers to the account owner's own
// address with no domain verification required.
exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: "POST only" };

  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return { statusCode: 200, headers: cors, body: JSON.stringify({ skipped: "not configured" }) };

  let d = {};
  try { d = JSON.parse(event.body || "{}"); } catch (e) {}
  const esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  const type = esc((d.type || "submission")).slice(0, 40);
  const name = esc((d.name || "Someone")).slice(0, 120);
  const admin = "https://soddydaisyclassof1993.com/#admin";
  const subject = "Class of 1993 — a " + type + " needs your approval";
  const html =
    '<div style="font-family:Arial,sans-serif;color:#16202e">' +
    '<h2 style="color:#0b2340">Soddy-Daisy Class of 1993</h2>' +
    "<p><strong>" + name + "</strong> just submitted a new <strong>" + type + "</strong> on the class site.</p>" +
    '<p><a href="' + admin + '" style="display:inline-block;background:#c9a24a;color:#10233f;font-weight:bold;padding:12px 22px;border-radius:10px;text-decoration:none">Review &amp; approve &rarr;</a></p>' +
    '<p style="color:#5b6472;font-size:13px">You get this because you\'re the site admin. Open the Admin tab to approve, reject, or delete.</p>' +
    "</div>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Class of 1993 <onboarding@resend.dev>", to: [to], subject: subject, html: html }),
    });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: res.ok }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false }) };
  }
};
