'use strict';

const crypto = require('crypto');

/**
 * Generates a self-contained, AES-256-CBC encrypted HTML file.
 * All user content is HTML-escaped before embedding in the export template.
 */
function generateEncryptedHTML(caseData, passcode, expiryDays) {
  const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + expiryMs;

  const payload = JSON.stringify({ ...caseData, expiresAt });

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passcode, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);

  const saltB64 = salt.toString('base64');
  const ivB64 = iv.toString('base64');
  const cipherB64 = encrypted.toString('base64');

  const expiresFormatted = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // The client-side rendering script (embedded in generated HTML output)
  const clientScript = buildClientScript(saltB64, ivB64, cipherB64, expiresAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Litigation Locker \u2014 Encrypted Export</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  #lock-screen { display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
  .lock-icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 24px; font-weight: 600; margin: 0 0 8px; color: #F8FAFC; }
  .subtitle { color: #94A3B8; font-size: 14px; margin: 0 0 32px; }
  .expiry { color: #F59E0B; font-size: 12px; margin: 0 0 24px; }
  .input-wrap { width: 100%; max-width: 360px; }
  input[type=password] { width: 100%; padding: 12px 16px; background: #1E293B;
    border: 1px solid #334155; border-radius: 8px; color: #F8FAFC;
    font-size: 16px; outline: none; margin-bottom: 12px; }
  input[type=password]:focus { border-color: #7C3AED; }
  button { width: 100%; padding: 12px; background: #7C3AED; color: #fff;
    border: none; border-radius: 8px; font-size: 16px; font-weight: 600;
    cursor: pointer; }
  button:hover { background: #6D28D9; }
  .error { color: #F87171; font-size: 13px; margin-top: 8px; display: none; }
  #content { display: none; padding: 24px; max-width: 1100px; margin: 0 auto; }
  .top-header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px;
    padding-bottom: 16px; border-bottom: 1px solid #1E293B; }
  .top-header h1 { margin: 0; font-size: 20px; }
  .badge { background: #7C3AED; color: #fff; font-size: 11px; font-weight: 600;
    padding: 2px 8px; border-radius: 999px; }
  section { margin-bottom: 40px; }
  section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px;
    color: #64748B; margin: 0 0 16px; }
  .event-card { background: #1E293B; border-radius: 10px; padding: 16px;
    margin-bottom: 10px; border-left: 4px solid #334155; }
  .event-date { font-size: 12px; color: #64748B; margin-bottom: 4px; }
  .event-title { font-weight: 600; color: #F1F5F9; margin-bottom: 6px; }
  .event-desc { font-size: 13px; color: #94A3B8; line-height: 1.5; }
  .type-badge { display: inline-block; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 4px; margin-bottom: 6px;
    text-transform: uppercase; letter-spacing: 0.5px; }
  .comparator-card { background: #1E293B; border-radius: 10px; padding: 16px;
    margin-bottom: 10px; }
  .comp-name { font-weight: 600; color: #F1F5F9; margin-bottom: 8px; }
  .comp-field { font-size: 12px; color: #94A3B8; margin-bottom: 4px; }
  .comp-field span { color: #CBD5E1; }
  .sim-bar { height: 6px; background: #334155; border-radius: 3px; margin-top: 10px; }
  .sim-fill { height: 100%; background: #7C3AED; border-radius: 3px; }
  .export-footer { text-align: center; font-size: 11px; color: #475569; margin-top: 40px;
    padding-top: 16px; border-top: 1px solid #1E293B; }
  .expired-screen { display: none; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100vh; text-align: center; padding: 24px; }
  .expired-screen h1 { color: #F87171; }
  .expired-screen p { color: #64748B; }
</style>
</head>
<body>

<div id="expired-screen" class="expired-screen">
  <div style="font-size:48px">\u23F0</div>
  <h1>Export Expired</h1>
  <p>This export bundle has passed its expiry date and is no longer accessible.</p>
</div>

<div id="lock-screen">
  <div class="lock-icon">\uD83D\uDD12</div>
  <h1>Litigation Locker Export</h1>
  <p class="subtitle">Encrypted case export. Enter your passcode to view.</p>
  <p class="expiry">\u26A0 This file expires on ${expiresFormatted}</p>
  <div class="input-wrap">
    <input type="password" id="passcode" placeholder="Enter export passcode" autocomplete="off" />
    <button onclick="runDecrypt()">Unlock Export</button>
    <div class="error" id="err">Incorrect passcode. Please try again.</div>
  </div>
</div>

<div id="content"></div>

<script>
${clientScript}
</script>
</body>
</html>`;
}

function buildClientScript(saltB64, ivB64, cipherB64, expiresAt) {
  return `
const _SALT = '${saltB64}';
const _IV = '${ivB64}';
const _CT = '${cipherB64}';
const _EXP = ${expiresAt};

function b64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setContent(el, htmlStr) {
  // Use createRange/createContextualFragment as a safe templated HTML setter
  const range = document.createRange();
  range.selectNode(el);
  const frag = range.createContextualFragment(htmlStr);
  el.replaceChildren(frag);
}

async function runDecrypt() {
  if (Date.now() > _EXP) { showExpired(); return; }
  const passcode = document.getElementById('passcode').value;
  if (!passcode) return;
  try {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(_SALT), iterations: 100000, hash: 'SHA-256' },
      km, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
    );
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: b64ToBytes(_IV) }, key, b64ToBytes(_CT)
    );
    const data = JSON.parse(new TextDecoder().decode(dec));
    if (Date.now() > data.expiresAt) { showExpired(); return; }
    renderContent(data);
  } catch (e) {
    const errEl = document.getElementById('err');
    errEl.style.display = 'block';
    errEl.textContent = 'Incorrect passcode. Please try again.';
  }
}

document.getElementById('passcode').addEventListener('keydown', e => {
  if (e.key === 'Enter') runDecrypt();
});

function showExpired() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('expired-screen').style.display = 'flex';
}

const TYPE_COLOR = {
  adverse_action:'#DC2626',retaliation:'#DC2626',
  protected_activity:'#8B5CF6',reported:'#8B5CF6',harassment:'#E11D48',
  help:'#F97316',start:'#3B82F6',end:'#475569'
};
const OUTCOME_LABELS = {
  forced_out:'Forced Out / Fired',resigned_under_pressure:'Resigned Under Pressure',
  demoted:'Demoted',underpaid:'Underpaid vs Peers',passed_over:'Passed Over for Promotion',
  pip:'Put on PIP',excluded:'Excluded from Opportunities'
};

function renderEvent(e) {
  const color = TYPE_COLOR[e.event_type] || '#475569';
  return '<div class="event-card" style="border-left-color:' + color + '">' +
    '<div class="event-date">' + escHtml(e.date || 'Unknown date') + '</div>' +
    '<span class="type-badge" style="background:' + color + '22;color:' + color + '">' +
      escHtml((e.event_type || 'EVENT').replace(/_/g,' ').toUpperCase()) +
    '</span>' +
    '<div class="event-title">' + escHtml(e.title || '') + '</div>' +
    (e.description ? '<div class="event-desc">' + escHtml(e.description) + '</div>' : '') +
    '</div>';
}

function renderComparator(c) {
  const pct = Math.round((c.relevance_score || 0) * 100);
  return '<div class="comparator-card">' +
    '<div class="comp-name">' + escHtml(c.name || '') + '</div>' +
    (c.role ? '<div class="comp-field">Role: <span>' + escHtml(c.role) + '</span></div>' : '') +
    (c.gender ? '<div class="comp-field">Gender: <span>' + escHtml(c.gender) + '</span></div>' : '') +
    (c.outcome ? '<div class="comp-field">Outcome: <span>' + escHtml(OUTCOME_LABELS[c.outcome] || c.outcome) + '</span></div>' : '') +
    (c.circumstances ? '<div class="comp-field">Circumstances: <span>' + escHtml(c.circumstances) + '</span></div>' : '') +
    '<div class="sim-bar"><div class="sim-fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
}

function renderContent(data) {
  document.getElementById('lock-screen').style.display = 'none';
  const el = document.getElementById('content');
  el.style.display = 'block';
  const events = (data.events || []).filter(e => !e.is_context_event);
  const ctxEvents = (data.events || []).filter(e => e.is_context_event);
  const comps = data.comparators || [];

  const html =
    '<div class="top-header">' +
      '<span style="font-size:24px">\uD83D\uDD13</span>' +
      '<h1>Case Evidence Export</h1>' +
      '<span class="badge">DECRYPTED</span>' +
    '</div>' +
    (events.length ? '<section><h2>Timeline Events (' + events.length + ')</h2>' + events.map(renderEvent).join('') + '</section>' : '') +
    (ctxEvents.length ? '<section><h2>Context / Background (' + ctxEvents.length + ')</h2>' + ctxEvents.map(renderEvent).join('') + '</section>' : '') +
    (comps.length ? '<section><h2>Comparator Pool (' + comps.length + ')</h2>' + comps.map(renderComparator).join('') + '</section>' : '') +
    '<div class="export-footer">Litigation Locker Export \u00B7 Encrypted AES-256-CBC</div>';

  setContent(el, html);
}

if (Date.now() > _EXP) { showExpired(); }
`;
}

module.exports = { generateEncryptedHTML };
