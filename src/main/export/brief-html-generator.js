'use strict';

const crypto = require('crypto');

/**
 * Generates a full-featured, self-contained, AES-256-CBC encrypted HTML case viewer.
 * All case data (events with docs, connections, people, threads, brief) is encrypted inline;
 * decrypted client-side via Web Crypto API after passcode entry.
 *
 * @param {object} caseData - { caseContext, events, actors, connections, incidents, brief }
 * @param {string} passcode - encryption passcode
 * @param {number} expiryDays - days until file expires
 */
function generateCaseHTML(caseData, passcode, expiryDays, docFiles) {
  const ms        = (parseInt(expiryDays) || 30) * 86400000;
  const expiresAt = Date.now() + ms;

  const payload   = JSON.stringify({ ...caseData, expiresAt });
  const salt      = crypto.randomBytes(16);
  const iv        = crypto.randomBytes(16);
  const key       = crypto.pbkdf2Sync(passcode, salt, 100000, 32, 'sha256');
  const cipher    = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);

  // Encrypt each document file with the same key (same salt) but a unique IV
  const docBlobs = {};
  if (docFiles && typeof docFiles === 'object') {
    for (const [docId, { buffer, mime }] of Object.entries(docFiles)) {
      try {
        const docIv      = crypto.randomBytes(16);
        const docCipher  = crypto.createCipheriv('aes-256-cbc', key, docIv);
        const docCt      = Buffer.concat([docCipher.update(buffer), docCipher.final()]);
        const safeId     = String(docId).replace(/[^a-zA-Z0-9_-]/g, '_');
        docBlobs[safeId] = { iv: docIv.toString('base64'), ct: docCt.toString('base64'), mime: mime || 'application/octet-stream' };
      } catch (_) {}
    }
  }

  return buildHTML(
    salt.toString('base64'),
    iv.toString('base64'),
    encrypted.toString('base64'),
    expiresAt,
    new Date(expiresAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }),
    JSON.stringify(docBlobs)
  );
}

/** Backward-compat wrapper */
function generateBriefHTML(briefData, passcode, expiryDays) {
  return generateCaseHTML({ brief: briefData }, passcode, expiryDays);
}

// ─────────────────────────────────────────────────────────────────────────────

function buildHTML(saltB64, ivB64, cipherB64, expiresAt, expiresFormatted, docBlobsJson) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Litigation Locker — Case File</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0F172A;color:#E2E8F0;min-height:100vh}

/* ── Lock screen ── */
#lock-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
.lock-icon{font-size:52px;margin-bottom:16px}
.lock-title{font-size:24px;font-weight:700;margin:0 0 6px;color:#F8FAFC}
.lock-sub{color:#94A3B8;font-size:14px;margin:0 0 6px}
.lock-expiry{color:#F59E0B;font-size:12px;margin:0 0 28px}
.input-wrap{width:100%;max-width:360px}
input[type=password]{width:100%;padding:12px 16px;background:#1E293B;border:1px solid #334155;border-radius:8px;color:#F8FAFC;font-size:16px;outline:none;margin-bottom:12px}
input[type=password]:focus{border-color:#7C3AED}
.unlock-btn{width:100%;padding:12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
.unlock-btn:hover{background:#6D28D9}
.lock-error{color:#F87171;font-size:13px;margin-top:10px;display:none}
.lock-badge{display:inline-flex;align-items:center;gap:6px;margin-top:28px;background:#1E293B;border:1px solid #334155;border-radius:999px;padding:4px 12px;font-size:11px;color:#64748B}

/* ── Expired screen ── */
#expired-screen{display:none;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
#expired-screen .exp-icon{font-size:52px;margin-bottom:16px}
#expired-screen h1{color:#F87171;font-size:24px;margin:0 0 8px}
#expired-screen p{color:#64748B}

/* ── Viewer shell ── */
#viewer{display:none;flex-direction:column;height:100vh;overflow:hidden}
.viewer-header{flex-shrink:0;background:#0D1117;border-bottom:1px solid #1E293B;padding:12px 24px;display:flex;align-items:center;gap:12px}
.viewer-logo{font-size:20px;flex-shrink:0}
.viewer-title{font-size:15px;font-weight:700;color:#F8FAFC;margin:0}
.viewer-meta{font-size:11px;color:#64748B;margin:2px 0 0}
.viewer-badge{margin-left:auto;background:#7C3AED22;color:#A78BFA;border:1px solid #7C3AED44;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:0.5px;flex-shrink:0;white-space:nowrap}

/* ── Tab bar ── */
.tab-bar{flex-shrink:0;display:flex;padding:0 16px;background:#0A0F1E;border-bottom:1px solid #1E293B;overflow-x:auto}
.tab-btn{padding:11px 16px;background:none;border:none;color:#64748B;font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:color 0.15s;display:inline-flex;align-items:center;gap:6px}
.tab-btn:hover{color:#CBD5E1}
.tab-btn.active{color:#A78BFA;border-bottom-color:#7C3AED}
.tab-badge{display:inline-flex;align-items:center;justify-content:center;background:#4B5563;color:#fff;font-size:9px;font-weight:700;min-width:17px;height:17px;padding:0 4px;border-radius:999px}
.tab-badge.red{background:#DC2626}

/* ── Tab content ── */
.tab-content{flex:1;overflow-y:auto}
.tab-panel{display:none;padding:24px 28px;max-width:1100px;margin:0 auto}
.tab-panel.active{display:block}

/* ── Shared utilities ── */
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;margin:0 0 12px;font-weight:600}
.empty-state{text-align:center;padding:60px 24px;color:#475569;font-size:15px;line-height:1.7}
.viewer-footer{text-align:center;font-size:11px;color:#334155;padding:20px;border-top:1px solid #1E293B;margin-top:32px}

/* ── Timeline ── */
.tl-month{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#475569;margin:24px 0 10px;padding-bottom:8px;border-bottom:1px solid #1E293B}
.tl-month:first-child{margin-top:0}
.tl-event{background:#1E293B;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:4px solid #334155;cursor:pointer;transition:background 0.1s}
.tl-event:hover{background:#243048}
.tl-event-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.tl-date{font-size:11px;color:#64748B;margin-bottom:4px;font-weight:500}
.tl-title{font-size:14px;font-weight:700;color:#F1F5F9;line-height:1.4}
.tl-expand-hint{font-size:10px;color:#475569;flex-shrink:0;margin-top:2px;transition:transform 0.15s}
.tl-expand-hint.open{transform:rotate(180deg)}
.tl-desc{font-size:12px;color:#94A3B8;line-height:1.5;margin-top:5px}
.tl-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.tl-badge{font-size:10px;font-weight:600;padding:2px 7px;background:#334155;border-radius:4px;color:#94A3B8;text-transform:capitalize}
.tl-tag{font-size:10px;padding:2px 7px;background:#0F172A;border:1px solid #2D3748;border-radius:4px;color:#64748B}
.tl-actor{font-size:10px;padding:2px 7px;background:#7C3AED22;border:1px solid #7C3AED44;border-radius:4px;color:#A78BFA}
.tl-expanded{display:none;margin-top:12px;padding-top:12px;border-top:1px solid #2D3748}
.tl-expanded.open{display:block}
.tl-full-desc{font-size:13px;color:#CBD5E1;line-height:1.7;margin-bottom:12px}
.tl-docs-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#475569;font-weight:600;margin-bottom:6px}
.tl-doc-item{background:#0F172A;border:1px solid #1E293B;border-radius:7px;padding:8px 10px;margin-bottom:6px;cursor:pointer;transition:border-color 0.1s}
.tl-doc-item:hover{border-color:#334155}
.tl-doc-header{display:flex;align-items:center;gap:8px;margin-bottom:0}
.tl-doc-type{font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;background:#7C3AED22;color:#A78BFA;flex-shrink:0}
.tl-doc-name{font-size:12px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.tl-doc-date{font-size:10px;color:#475569;flex-shrink:0}
.tl-doc-preview{font-size:11px;color:#64748B;line-height:1.6;margin-top:6px;display:none;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto}
.tl-doc-preview.open{display:block}
.tl-doc-toggle{font-size:10px;color:#4B5563;margin-top:4px;cursor:pointer}
.tl-doc-chevron{font-size:9px;color:#4B5563;margin-left:auto;transition:transform 0.15s;flex-shrink:0}

/* ── Connections ── */
.chain-card{background:#1E293B;border-radius:12px;padding:16px 18px;margin-bottom:16px}
.chain-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.chain-count{font-size:12px;font-weight:700;color:#A78BFA;background:#7C3AED22;border:1px solid #7C3AED44;padding:3px 10px;border-radius:999px}
.chain-span{font-size:11px;color:#475569}
.chain-step{display:flex;gap:10px}
.step-left{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:26px}
.step-num{width:26px;height:26px;border-radius:999px;background:#334155;color:#CBD5E1;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step-line{width:2px;background:#2D3748;flex:1;min-height:6px;margin:3px 0}
.step-body{flex:1;padding-bottom:10px}
.step-date{font-size:10px;color:#64748B;margin-bottom:2px}
.step-title{font-size:13px;font-weight:600;color:#F1F5F9;line-height:1.4}
.chain-connector{display:flex;align-items:center;gap:8px;margin:1px 0 1px 36px;padding:3px 0}
.conn-type-badge{font-size:10px;font-weight:600;background:#0F172A;border:1px solid #334155;color:#7C3AED;padding:2px 7px;border-radius:4px;text-transform:capitalize}
.conn-days{font-size:10px;color:#475569}
.standalone-conn{background:#1E293B;border-radius:10px;padding:12px 16px;margin-bottom:10px}
.sc-pair{display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap}
.sc-event{font-size:12px;font-weight:600;color:#CBD5E1;background:#0F172A;padding:3px 9px;border-radius:6px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-arrow{color:#475569;font-size:14px;flex-shrink:0}
.sc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sc-desc{font-size:12px;color:#94A3B8;margin-top:6px;line-height:1.5}

/* ── People ── */
.cls-group{margin-bottom:28px}
.cls-heading{font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;font-weight:600}
.actor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.actor-card{background:#1E293B;border-radius:10px;padding:14px}
.actor-name{font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:2px}
.actor-role{font-size:12px;color:#64748B;margin-bottom:8px}
.actor-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;margin-bottom:8px}
.actor-stats{display:flex;gap:12px}
.actor-stat{font-size:11px;color:#64748B}
.actor-stat span{color:#94A3B8;font-weight:600}
.actor-status{font-size:11px;color:#64748B;margin-top:4px}

/* ── Threads ── */
.thread-card{background:#1E293B;border-radius:12px;margin-bottom:16px;border-left:4px solid #334155;overflow:hidden}
.thread-card-header{padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none}
.thread-card-header:hover{background:#243048}
.thread-name{font-size:15px;font-weight:700;color:#F1F5F9;flex:1}
.thread-strength-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px}
.thread-count-badge{font-size:10px;color:#64748B;background:#0F172A;padding:2px 7px;border-radius:4px;border:1px solid #1E293B}
.thread-chevron{font-size:11px;color:#475569;transition:transform 0.15s;flex-shrink:0}
.thread-chevron.open{transform:rotate(180deg)}
.thread-body{display:none;padding:0 16px 16px;border-top:1px solid #1E2A3A}
.thread-body.open{display:block}
.thread-strength-bar-wrap{height:4px;background:#0F172A;border-radius:3px;margin:12px 0}
.thread-strength-bar{height:100%;border-radius:3px}
.thread-events-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#475569;font-weight:600;margin:14px 0 7px}
.thread-event-item{background:#0F172A;border:1px solid #1E293B;border-radius:7px;padding:8px 10px;margin-bottom:6px}
.thread-event-date{font-size:10px;color:#64748B;margin-bottom:2px}
.thread-event-title{font-size:12px;font-weight:600;color:#CBD5E1}
.thread-docs-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#475569;font-weight:600;margin:14px 0 7px}
.thread-doc-item{display:flex;align-items:center;gap:6px;background:#0F172A;border:1px solid #1E293B;border-radius:5px;padding:5px 8px;margin-bottom:5px;font-size:11px;color:#94A3B8;cursor:pointer;transition:border-color 0.1s}
.thread-doc-item:hover{border-color:#334155}
.thread-gap-list{margin:10px 0 0}
.thread-gap-item{font-size:11px;color:#F59E0B;padding:3px 0;display:flex;align-items:center;gap:6px}

/* ── Case Overview (Brief) ── */
.summary-hero{display:flex;gap:24px;align-items:center;margin-bottom:24px;background:#1E293B;border-radius:14px;padding:22px 26px;flex-wrap:wrap}
.ring-wrap{flex-shrink:0;text-align:center}
.ring-label{font-size:10px;color:#64748B;margin-top:5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
.hero-info{flex:1;min-width:180px}
.hero-case-type{font-size:20px;font-weight:700;color:#F8FAFC;margin:0 0 5px;text-transform:capitalize}
.hero-timespan{font-size:13px;color:#94A3B8;margin:0 0 14px}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(75px,1fr));gap:8px}
.stat-cell{background:#0F172A;border-radius:8px;padding:9px;text-align:center}
.stat-num{font-size:20px;font-weight:700;color:#F8FAFC}
.stat-lbl{font-size:10px;color:#64748B;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px}
.brief-thread-card{background:#1E293B;border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid #334155}
.brief-thread-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.brief-thread-name{font-size:14px;font-weight:700;color:#F1F5F9;flex:1;text-transform:capitalize}
.brief-thread-score{font-size:13px;font-weight:600}
.brief-bar-wrap{height:4px;background:#0F172A;border-radius:3px;margin-bottom:12px}
.brief-bar{height:100%;border-radius:3px}
.elements-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:7px;margin-bottom:10px}
.element-item{display:flex;align-items:flex-start;gap:7px;padding:7px 9px;background:#0F172A;border-radius:7px}
.element-icon{font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
.element-text{font-size:11px;color:#94A3B8}
.element-name{font-size:11px;font-weight:600;color:#CBD5E1;display:block;margin-bottom:1px;text-transform:capitalize}
.flag-card{background:#1E293B;border-radius:10px;padding:12px 14px;margin-bottom:9px;border-left:4px solid}
.flag-card.high{border-left-color:#DC2626}
.flag-card.medium{border-left-color:#F59E0B}
.flag-header{display:flex;align-items:center;gap:10px;margin-bottom:5px}
.sev-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px}
.sev-badge.high{background:#DC262622;color:#F87171}
.sev-badge.medium{background:#F59E0B22;color:#FCD34D}
.flag-label{font-size:13px;font-weight:600;color:#F1F5F9}
.flag-detail{font-size:12px;color:#94A3B8;line-height:1.5}
</style>
</head>
<body>

<!-- Expired -->
<div id="expired-screen">
  <div class="exp-icon">⏰</div>
  <h1>File Expired</h1>
  <p>This shared case file has passed its expiry date and is no longer accessible.</p>
</div>

<!-- Lock -->
<div id="lock-screen">
  <div class="lock-icon">🔒</div>
  <h2 class="lock-title">Case File</h2>
  <p class="lock-sub">Encrypted and protected. Enter the passcode to view.</p>
  <p class="lock-expiry">⚠️ Expires ${expiresFormatted}</p>
  <form class="input-wrap" onsubmit="event.preventDefault();runDecrypt()">
    <input type="password" id="passcode" placeholder="Enter passcode" autocomplete="off" />
    <button type="submit" class="unlock-btn">Open Case File</button>
    <div class="lock-error" id="err">Incorrect passcode — please try again.</div>
  </form>
  <div class="lock-badge">
    <span>🔐</span>
    <span>AES-256 Encrypted · Litigation Locker</span>
  </div>
</div>

<!-- Viewer -->
<div id="viewer">
  <div class="viewer-header">
    <div class="viewer-logo">⚖️</div>
    <div style="flex:1;min-width:0">
      <p class="viewer-title" id="v-title">Case File</p>
      <p class="viewer-meta" id="v-meta"></p>
    </div>
    <div class="viewer-badge">🔓 READ-ONLY</div>
  </div>

  <div class="tab-bar">
    <button class="tab-btn active" onclick="switchTab('timeline',this)">
      📅 Timeline<span class="tab-badge" id="badge-timeline" style="display:none">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('threads',this)">
      🧵 Threads<span class="tab-badge" id="badge-threads" style="display:none">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('connections',this)">
      ⚡ Connections<span class="tab-badge" id="badge-connections" style="display:none">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('people',this)">
      👥 People<span class="tab-badge" id="badge-people" style="display:none">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('brief',this)">
      ⚖️ Case Overview<span class="tab-badge red" id="badge-brief" style="display:none">0</span>
    </button>
  </div>

  <div class="tab-content">
    <div id="panel-timeline"    class="tab-panel active"></div>
    <div id="panel-threads"     class="tab-panel"></div>
    <div id="panel-connections" class="tab-panel"></div>
    <div id="panel-people"      class="tab-panel"></div>
    <div id="panel-brief"       class="tab-panel"></div>
  </div>
</div>

<script>
var _SALT      = '${saltB64}';
var _IV        = '${ivB64}';
var _CT        = '${cipherB64}';
var _EXP       = ${expiresAt};
var _DOC_BLOBS = ${docBlobsJson || '{}'};
var _KEY       = null;   // cached AES key after unlock
var _DOC_CACHE = {};     // cache of decoded Blob URLs

// ── Crypto ─────────────────────────────────────────────────────────────────

function b64ToBytes(b64) {
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setHTML(id, html) {
  var el = document.getElementById(id);
  var r  = document.createRange();
  r.selectNode(el);
  el.replaceChildren(r.createContextualFragment(html));
}

function setBadge(id, n) {
  if (!n) return;
  var el = document.getElementById(id);
  if (el) { el.style.display = ''; el.textContent = n; }
}

async function runDecrypt() {
  if (Date.now() > _EXP) { showExpired(); return; }
  var pw = document.getElementById('passcode').value;
  if (!pw) return;
  var data;
  try {
    var enc = new TextEncoder();
    var km  = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name:'PBKDF2', salt:b64ToBytes(_SALT), iterations:100000, hash:'SHA-256' },
      km, { name:'AES-CBC', length:256 }, false, ['decrypt']
    );
    var dec  = await crypto.subtle.decrypt({ name:'AES-CBC', iv:b64ToBytes(_IV) }, key, b64ToBytes(_CT));
    data = JSON.parse(new TextDecoder().decode(dec));
    _KEY = key; // cache for document decryption
  } catch(e) {
    var el = document.getElementById('err');
    el.style.display = 'block';
    el.textContent   = 'Incorrect passcode — please try again.';
    return;
  }
  if (Date.now() > data.expiresAt) { showExpired(); return; }
  renderCase(data);
}

// Enter key handled by form onsubmit

function showExpired() {
  document.getElementById('lock-screen').style.display   = 'none';
  document.getElementById('expired-screen').style.display = 'flex';
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('panel-' + id).classList.add('active');
  document.querySelector('.tab-content').scrollTop = 0;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

var _actorById = {};
var _eventById = {};
var _actorEventCount = {};
var _actorDocCount = {};

function buildLookups(data) {
  _actorById = {};
  _eventById = {};
  _actorEventCount = {};
  _actorDocCount = {};
  var actors = data.actors || [];
  var events = data.events || [];
  for (var i = 0; i < actors.length; i++) _actorById[actors[i].id] = actors[i];
  for (var i = 0; i < events.length; i++) _eventById[events[i].id] = events[i];
  // Compute per-actor event + doc counts from events
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var ids = evt.actorIds || [];
    var docCount = (evt.documents || []).length;
    for (var j = 0; j < ids.length; j++) {
      var aid = ids[j];
      _actorEventCount[aid] = (_actorEventCount[aid] || 0) + 1;
      _actorDocCount[aid]   = (_actorDocCount[aid]   || 0) + docCount;
    }
  }
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
  catch(_) { return s; }
}

function fmtMonth(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-US', { month:'long', year:'numeric' }); }
  catch(_) { return ''; }
}

function strengthColor(s) {
  if (s >= 70) return '#16A34A';
  if (s >= 40) return '#F59E0B';
  return '#DC2626';
}

function strengthColor10(s) {
  if (s >= 7) return '#16A34A';
  if (s >= 4) return '#F59E0B';
  return '#DC2626';
}

function strengthLabel(s) {
  if (s >= 9) return 'Very Strong';
  if (s >= 7) return 'Strong';
  if (s >= 4) return 'Moderate';
  return 'Weak';
}

function ringGauge(score, size) {
  var r = 45, circ = 2 * Math.PI * r;
  var dash = ((score || 0) / 10) * circ;
  var col  = strengthColor10(score || 0);
  return '<svg viewBox="0 0 100 100" width="' + size + '" height="' + size + '">' +
    '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="#1E293B" stroke-width="10"/>' +
    '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="10"' +
      ' stroke-dasharray="' + dash.toFixed(2) + ' ' + circ.toFixed(2) + '"' +
      ' stroke-linecap="round" transform="rotate(-90 50 50)"/>' +
    '<text x="50" y="44" text-anchor="middle" fill="' + col + '"' +
      ' font-size="22" font-weight="700" font-family="sans-serif">' + (score||0).toFixed(1) + '</text>' +
    '<text x="50" y="57" text-anchor="middle" fill="#64748B"' +
      ' font-size="9" font-family="sans-serif">/10</text>' +
    '</svg>';
}

function statCell(n, lbl) {
  return '<div class="stat-cell"><div class="stat-num">' + n + '</div><div class="stat-lbl">' + lbl + '</div></div>';
}

function footer() {
  return '<div class="viewer-footer">Litigation Locker · Case File · AES-256-CBC Encrypted · Read-Only</div>';
}

// ── Header ─────────────────────────────────────────────────────────────────

function updateHeader(data) {
  var ctx    = data.caseContext || {};
  var events = data.events || [];
  var actors = data.actors || [];
  var name   = ctx.case_name || ctx.title || ctx.name || 'Case File';
  var parts  = [];
  if (events.length) parts.push(events.length + ' events');
  if (actors.length) parts.push(actors.length + ' people');
  if (data.brief && data.brief.executive) {
    var str = data.brief.executive.strength || 0;
    parts.push('Case strength: ' + str.toFixed(1) + '/10');
  }
  document.getElementById('v-title').textContent = name;
  document.getElementById('v-meta').textContent  = parts.join(' · ');
}

// ── Timeline ────────────────────────────────────────────────────────────────

var _SEV_COLORS = {
  critical: '#DC2626',
  high:     '#F59E0B',
  medium:   '#6B7280',
  low:      '#475569'
};

// Toggle event card expansion
function toggleEvent(evtId) {
  var el = document.getElementById('tl-exp-' + evtId);
  var hint = document.getElementById('tl-hint-' + evtId);
  if (!el) return;
  var isOpen = el.classList.contains('open');
  el.classList.toggle('open', !isOpen);
  if (hint) hint.classList.toggle('open', !isOpen);
}

// Toggle doc preview — decrypts and renders image/PDF on first open
// itemEl: the clicked .tl-doc-item or .thread-doc-item element
async function toggleDoc(itemEl, docId) {
  // Timeline: preview is a child; Threads: preview is a sibling
  var el   = itemEl.querySelector('.tl-doc-preview') || itemEl.nextElementSibling;
  var chev = itemEl.querySelector('.tl-doc-chevron');
  if (!el) return;

  var safeId = String(docId).replace(/[^a-zA-Z0-9_-]/g, '_');
  var blob   = _DOC_BLOBS[safeId];

  // If already loaded or no blob data, just toggle open/closed
  if (!blob || !_KEY || el.dataset.loaded) {
    el.classList.toggle('open');
    if (chev) chev.style.transform = el.classList.contains('open') ? 'rotate(90deg)' : '';
    return;
  }

  // First open: show loading state, decrypt, render
  while (el.firstChild) el.removeChild(el.firstChild);
  var loadMsg = document.createElement('div');
  loadMsg.style.cssText = 'padding:10px;color:#64748B;font-size:11px';
  loadMsg.textContent = 'Loading\u2026';
  el.appendChild(loadMsg);
  el.classList.add('open');
  if (chev) chev.style.transform = 'rotate(90deg)';

  try {
    var dec     = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: b64ToBytes(blob.iv) },
      _KEY,
      b64ToBytes(blob.ct)
    );
    var blobObj = new Blob([dec], { type: blob.mime });
    var url     = URL.createObjectURL(blobObj);

    while (el.firstChild) el.removeChild(el.firstChild);

    if (blob.mime && blob.mime.startsWith('image/')) {
      var img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'max-width:100%;height:auto;border-radius:4px;display:block;margin-top:6px';
      el.appendChild(img);
    } else if (blob.mime === 'application/pdf') {
      var frame = document.createElement('iframe');
      frame.src = url;
      frame.style.cssText = 'width:100%;height:520px;border:none;border-radius:4px;display:block;margin-top:6px';
      el.appendChild(frame);
    } else {
      var span = document.createElement('span');
      span.style.cssText = 'color:#475569;font-style:italic';
      span.textContent = 'Preview not available for this file type.';
      el.appendChild(span);
    }

    el.dataset.loaded = '1';
  } catch (e) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var errSpan = document.createElement('span');
    errSpan.style.cssText = 'color:#EF4444;font-size:11px';
    errSpan.textContent = 'Failed to load document.';
    el.appendChild(errSpan);
  }
}

function renderTimeline(data) {
  var events = (data.events || []).slice().sort(function(a, b) {
    return new Date(a.date || 0) - new Date(b.date || 0);
  });

  setBadge('badge-timeline', events.length);

  if (!events.length) {
    setHTML('panel-timeline', '<div class="empty-state">No events recorded in this case.</div>');
    return;
  }

  var html      = '';
  var lastMonth = '';

  for (var i = 0; i < events.length; i++) {
    var evt   = events[i];
    var month = fmtMonth(evt.date);

    if (month && month !== lastMonth) {
      html += '<div class="tl-month">' + esc(month) + '</div>';
      lastMonth = month;
    }

    var sev      = (evt.severity || '').toLowerCase();
    var sevColor = _SEV_COLORS[sev] || '#334155';
    var tags     = evt.tags || [];
    var actorIds = evt.actorIds || [];
    var docs     = evt.documents || [];
    var evtId    = String(evt.id).replace(/[^a-zA-Z0-9_-]/g, '_');

    html += '<div class="tl-event" style="border-left-color:' + sevColor + '" data-evtid="' + evtId + '" onclick="toggleEvent(this.dataset.evtid)">';
    html += '<div class="tl-event-header">';
    html += '<div style="flex:1;min-width:0">';
    html += '<div class="tl-date">' + esc(fmtDate(evt.date)) + '</div>';
    html += '<div class="tl-title">' + esc(evt.title || 'Untitled event') + '</div>';
    html += '</div>';
    html += '<div class="tl-expand-hint" id="tl-hint-' + evtId + '">▼</div>';
    html += '</div>';

    // Summary chips always visible
    if (evt.category || (sev && sev !== 'unknown' && sev !== '')) {
      html += '<div class="tl-chips">';
      if (evt.category) html += '<span class="tl-badge">' + esc(evt.category.replace(/_/g,' ')) + '</span>';
      if (sev && sev !== 'unknown' && sev !== '') {
        html += '<span class="tl-badge" style="background:' + sevColor + '22;color:' + sevColor + '">' + esc(sev.toUpperCase()) + '</span>';
      }
      if (docs.length) html += '<span class="tl-badge" style="background:#16A34A22;color:#4ADE80">📎 ' + docs.length + ' doc' + (docs.length !== 1 ? 's' : '') + '</span>';
      html += '</div>';
    }

    if (tags.length) {
      html += '<div class="tl-chips">';
      for (var t = 0; t < tags.length && t < 7; t++) {
        html += '<span class="tl-tag">' + esc(tags[t].replace(/_/g,' ')) + '</span>';
      }
      html += '</div>';
    }

    // Actor pills
    var actorNames = [];
    for (var j = 0; j < actorIds.length && j < 5; j++) {
      var a = _actorById[actorIds[j]];
      if (a && a.name) actorNames.push(a.name);
    }
    if (actorNames.length) {
      html += '<div class="tl-chips">';
      for (var n = 0; n < actorNames.length; n++) {
        html += '<span class="tl-actor">' + esc(actorNames[n]) + '</span>';
      }
      html += '</div>';
    }

    // ── Expanded section ──
    html += '<div class="tl-expanded" id="tl-exp-' + evtId + '">';

    var fullDesc = evt.description || evt.what_happened || '';
    if (fullDesc) {
      html += '<div class="tl-full-desc">' + esc(fullDesc) + '</div>';
    }

    if (docs.length) {
      html += '<div class="tl-docs-label">Linked Documents (' + docs.length + ')</div>';
      for (var d = 0; d < docs.length; d++) {
        var doc    = docs[d];
        var docId  = String(doc.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        var hasText = doc.extracted_text && doc.extracted_text.trim().length > 0;

        html += '<div class="tl-doc-item" data-docid="' + docId + '" onclick="event.stopPropagation();toggleDoc(this,this.dataset.docid)">';
        html += '<div class="tl-doc-header">';
        html += '<span class="tl-doc-type">' + esc((doc.evidence_type || 'DOC').replace(/_/g,' ')) + '</span>';
        html += '<span class="tl-doc-name">' + esc(doc.filename || doc.id || 'Document') + '</span>';
        if (doc.document_date) html += '<span class="tl-doc-date">' + esc(fmtDate(doc.document_date)) + '</span>';
        html += '<span class="tl-doc-chevron" id="chev-' + docId + '">▶</span>';
        html += '</div>';
        html += '<div class="tl-doc-preview" id="doc-preview-' + docId + '">' + (hasText ? esc(doc.extracted_text.trim()) : '<span style="color:#475569;font-style:italic">No text extracted for this document.</span>') + '</div>';
        html += '</div>';
      }
    }

    html += '</div>'; // end tl-expanded
    html += '</div>'; // end tl-event
  }

  html += footer();
  setHTML('panel-timeline', html);
}

// ── Threads (computed from events, same logic as Dashboard.jsx) ─────────────

var THREAD_DEFS = [
  { id: 'sexual_harassment',   name: 'Sexual Harassment',     color: '#8B5CF6',
    tag_signals: ['sexual_harassment'],
    title_keywords: ['sexual','inappropriate touch','inappropriate contact','groped','groping','unwanted advance','proposition','unwanted sexual'] },
  { id: 'gender_harassment',   name: 'Gender Harassment',     color: '#EC4899',
    tag_signals: ['gender_harassment'],
    title_keywords: ['gendered','sexist','stereotype','because she','because he','boys club','gender bias','gender discrimination'] },
  { id: 'retaliation',         name: 'Retaliation',           color: '#F59E0B',
    tag_signals: ['retaliation','protected_activity','adverse_action'], title_keywords: [] },
  { id: 'exclusion',           name: 'Exclusion & Isolation', color: '#10B981',
    tag_signals: ['exclusion','isolation'],
    title_keywords: ['excluded','left out','not invited','removed from','cut out','isolated','sidelined','marginalized','shut out'] },
  { id: 'pay_discrimination',  name: 'Pay Discrimination',    color: '#3B82F6',
    tag_signals: ['pay_discrimination'], title_keywords: [] },
  { id: 'hostile_environment', name: 'Hostile Environment',   color: '#6366F1',
    tag_signals: ['hostile_environment'], title_keywords: [] },
  { id: 'hr_failure',          name: 'HR Failure to Act',     color: '#A855F7',
    tag_signals: ['help_request','hr_failure','ignored_complaint'], title_keywords: [] }
];

var EVT_TYPE_SIGS = {
  'reported':           ['protected_activity'],
  'help':               ['help_request'],
  'harassment':         ['harassment'],
  'adverse_action':     ['adverse_action'],
  'protected_activity': ['protected_activity'],
  'retaliation':        ['retaliation','adverse_action']
};

var DOC_TYPE_SIGS = {
  'ADVERSE_ACTION':     ['adverse_action'],
  'PROTECTED_ACTIVITY': ['protected_activity'],
  'REQUEST_FOR_HELP':   ['help_request'],
  'RESPONSE':           ['help_request'],
  'PAY_RECORD':         ['pay_discrimination'],
  'CLAIM_YOU_MADE':     ['protected_activity'],
  'CLAIM_AGAINST_YOU':  ['retaliation']
};

var SEXUAL_KW = ['sexual','grope','groping','unwanted touch','unwanted advance','inappropriate touch','proposition'];
var GENDER_KW = ['gendered','sexist','stereotype','because she','because he','boys club','gender bias'];

function buildEffectiveSignals(evt) {
  var sigs = {};
  var tags = evt.tags || [];
  for (var i = 0; i < tags.length; i++) sigs[tags[i]] = 1;

  var etSigs = EVT_TYPE_SIGS[evt.event_type] || [];
  for (var i = 0; i < etSigs.length; i++) sigs[etSigs[i]] = 1;

  var docs = evt.documents || [];
  for (var d = 0; d < docs.length; d++) {
    var dSigs = DOC_TYPE_SIGS[docs[d].evidence_type] || [];
    for (var i = 0; i < dSigs.length; i++) sigs[dSigs[i]] = 1;
  }

  var text = ((evt.title || '') + ' ' + (evt.what_happened || '') + ' ' + (evt.description || '')).toLowerCase();
  if (sigs['harassment'] && !sigs['sexual_harassment'] && !sigs['gender_harassment']) {
    var isSexual = false, isGender = false;
    for (var i = 0; i < SEXUAL_KW.length; i++) { if (text.indexOf(SEXUAL_KW[i]) !== -1) { isSexual = true; break; } }
    for (var i = 0; i < GENDER_KW.length; i++) { if (text.indexOf(GENDER_KW[i]) !== -1) { isGender = true; break; } }
    if (isSexual) sigs['sexual_harassment'] = 1;
    else if (isGender) sigs['gender_harassment'] = 1;
    else sigs['hostile_environment'] = 1;
    delete sigs['harassment'];
  }
  return sigs;
}

function computeThreads(events) {
  var assignments = {};
  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    if (evt.is_context_event) continue;
    var sigs    = buildEffectiveSignals(evt);
    var evtText = ((evt.title || '') + ' ' + (evt.what_happened || '') + ' ' + (evt.description || '')).toLowerCase();

    for (var t = 0; t < THREAD_DEFS.length; t++) {
      var thread = THREAD_DEFS[t];
      var matches = false;
      for (var s = 0; s < thread.tag_signals.length; s++) {
        if (sigs[thread.tag_signals[s]]) { matches = true; break; }
      }
      if (!matches && thread.title_keywords) {
        for (var k = 0; k < thread.title_keywords.length; k++) {
          if (evtText.indexOf(thread.title_keywords[k]) !== -1) { matches = true; break; }
        }
      }
      if (matches) {
        if (!assignments[thread.id]) assignments[thread.id] = { thread: thread, events: [], docMap: {} };
        assignments[thread.id].events.push(evt);
        var docs = evt.documents || [];
        for (var d = 0; d < docs.length; d++) assignments[thread.id].docMap[docs[d].id] = docs[d];
      }
    }
  }
  return assignments;
}

function computeStrength(asgn) {
  if (!asgn.events.length) return 0;
  var score = 20;
  score += Math.min(asgn.events.length * 10, 40);
  score += Math.min(Object.keys(asgn.docMap).length * 5, 30);
  var hasPA = false, hasAdv = false;
  for (var i = 0; i < asgn.events.length; i++) {
    var s = buildEffectiveSignals(asgn.events[i]);
    if (s['protected_activity']) hasPA = true;
    if (s['adverse_action'])     hasAdv = true;
  }
  if (hasPA && hasAdv) score += 10;
  return Math.min(score, 100);
}

function getThreadGaps(asgn) {
  var gaps = [];
  if (!asgn.events.length) { gaps.push('No events tagged yet'); return gaps; }
  if (!Object.keys(asgn.docMap).length) gaps.push('No supporting documents linked');
  if (asgn.thread.id === 'retaliation') {
    var hasPA = false, hasAdv = false;
    for (var i = 0; i < asgn.events.length; i++) {
      var s = buildEffectiveSignals(asgn.events[i]);
      if (s['protected_activity']) hasPA = true;
      if (s['adverse_action'])     hasAdv = true;
    }
    if (!hasPA)  gaps.push('Missing: protected activity event');
    if (!hasAdv) gaps.push('Missing: adverse action event');
  }
  if (asgn.events.length < 2) gaps.push('More corroborating events strengthen this thread');
  return gaps;
}

function toggleThread(tid) {
  var body    = document.getElementById('thread-body-' + tid);
  var chevron = document.getElementById('thread-chev-' + tid);
  if (!body) return;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

function renderThreads(data) {
  var events      = data.events || [];
  var assignments = computeThreads(events);
  var threadIds   = Object.keys(assignments);

  // Sort by strength desc
  threadIds.sort(function(a, b) {
    return computeStrength(assignments[b]) - computeStrength(assignments[a]);
  });

  setBadge('badge-threads', threadIds.length);

  if (!threadIds.length) {
    setHTML('panel-threads',
      '<div class="empty-state">No legal threads detected.<br>' +
      '<span style="font-size:13px;display:block;margin-top:8px;color:#475569">' +
      'Add events and tag them with claim types (retaliation, harassment, etc.) to build thread clusters.</span></div>'
    );
    return;
  }

  var html = '<p style="font-size:12px;color:#64748B;margin:0 0 16px">' +
    threadIds.length + ' legal thread' + (threadIds.length !== 1 ? 's' : '') +
    ' detected from your events and documents. Click to expand.</p>';

  for (var i = 0; i < threadIds.length; i++) {
    var tid   = threadIds[i];
    var asgn  = assignments[tid];
    var th    = asgn.thread;
    var str   = computeStrength(asgn);
    var col   = strengthColor(str);
    var docs  = Object.values(asgn.docMap);
    var gaps  = getThreadGaps(asgn);
    var safeTid = tid.replace(/[^a-zA-Z0-9_-]/g, '_');

    html += '<div class="thread-card" style="border-left-color:' + th.color + '">';
    html += '<div class="thread-card-header" data-tid="' + safeTid + '" onclick="toggleThread(this.dataset.tid)">';
    html += '<div class="thread-name">' + esc(th.name) + '</div>';
    html += '<span class="thread-count-badge">' + asgn.events.length + ' event' + (asgn.events.length !== 1 ? 's' : '') + '</span>';
    html += '<span class="thread-strength-badge" style="background:' + col + '22;color:' + col + '">' + str + '%</span>';
    html += '<span class="thread-chevron" id="thread-chev-' + safeTid + '">▼</span>';
    html += '</div>';

    html += '<div class="thread-body" id="thread-body-' + safeTid + '">';

    // Strength bar
    html += '<div class="thread-strength-bar-wrap"><div class="thread-strength-bar" style="width:' + str + '%;background:' + col + '"></div></div>';

    // Events
    html += '<div class="thread-events-label">Events (' + asgn.events.length + ')</div>';
    for (var e = 0; e < asgn.events.length; e++) {
      var evt = asgn.events[e];
      html += '<div class="thread-event-item">';
      html += '<div class="thread-event-date">' + esc(fmtDate(evt.date)) + '</div>';
      html += '<div class="thread-event-title">' + esc(evt.title || 'Untitled') + '</div>';
      html += '</div>';
    }

    // Documents
    if (docs.length) {
      html += '<div class="thread-docs-label">Supporting Documents (' + docs.length + ')</div>';
      for (var d = 0; d < docs.length; d++) {
        var doc    = docs[d];
        var docId  = String(doc.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        var hasText = doc.extracted_text && doc.extracted_text.trim().length > 0;
        html += '<div class="thread-doc-item" data-docid="' + docId + '" onclick="toggleDoc(this,this.dataset.docid)">';
        html += '<span class="tl-doc-type">' + esc((doc.evidence_type || 'DOC').replace(/_/g,' ')) + '</span>';
        html += '<span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(doc.filename || doc.id || 'Document') + '</span>';
        html += '<span class="tl-doc-chevron" id="chev-' + docId + '">▶</span>';
        html += '</div>';
        html += '<div class="tl-doc-preview" id="doc-preview-' + docId + '">' + (hasText ? esc(doc.extracted_text.trim()) : '<span style="color:#475569;font-style:italic">No text extracted for this document.</span>') + '</div>';
      }
    }

    // Gaps
    if (gaps.length) {
      html += '<div class="thread-gap-list">';
      for (var g = 0; g < gaps.length; g++) {
        html += '<div class="thread-gap-item">⚠ ' + esc(gaps[g]) + '</div>';
      }
      html += '</div>';
    }

    html += '</div>'; // thread-body
    html += '</div>'; // thread-card
  }

  html += footer();
  setHTML('panel-threads', html);
}

// ── Connections ─────────────────────────────────────────────────────────────

function buildChains(connections) {
  var chainMap = {};
  for (var i = 0; i < connections.length; i++) {
    var c = connections[i];
    if (!c.chain_id) continue;
    if (!chainMap[c.chain_id]) chainMap[c.chain_id] = { edges: [], eventMap: {} };
    chainMap[c.chain_id].edges.push(c);
    chainMap[c.chain_id].eventMap[c.source_id] = { id:c.source_id, title:c.source_title, date:c.source_date };
    chainMap[c.chain_id].eventMap[c.target_id] = { id:c.target_id, title:c.target_title, date:c.target_date };
  }
  var chains = [], keys = Object.keys(chainMap);
  for (var k = 0; k < keys.length; k++) {
    var chain = chainMap[keys[k]];
    var evts  = Object.values(chain.eventMap).sort(function(a,b){ return new Date(a.date||0)-new Date(b.date||0); });
    chains.push({ chainId:keys[k], events:evts, edges:chain.edges });
  }
  chains.sort(function(a,b){ return b.events.length-a.events.length; });
  return chains;
}

function renderChainCard(chain) {
  var events = chain.events, edges = chain.edges;
  var edgeMap = {};
  for (var e = 0; e < edges.length; e++) {
    var ed = edges[e];
    edgeMap[ed.source_id+'|'+ed.target_id] = ed;
    edgeMap[ed.target_id+'|'+ed.source_id] = ed;
  }
  var firstDate = events.length ? fmtDate(events[0].date) : '';
  var lastDate  = events.length ? fmtDate(events[events.length-1].date) : '';

  var html = '<div class="chain-card"><div class="chain-header"><span class="chain-count">' + events.length + '-event chain</span>';
  if (firstDate && lastDate && firstDate !== lastDate) {
    html += '<span class="chain-span">' + esc(firstDate) + ' → ' + esc(lastDate) + '</span>';
  }
  html += '</div>';

  for (var i = 0; i < events.length; i++) {
    var evt = events[i], hasNext = i < events.length-1;
    html += '<div class="chain-step"><div class="step-left"><div class="step-num">' + (i+1) + '</div>';
    if (hasNext) html += '<div class="step-line"></div>';
    html += '</div><div class="step-body"><div class="step-date">' + esc(fmtDate(evt.date)) + '</div><div class="step-title">' + esc(evt.title||'Untitled') + '</div></div></div>';
    if (hasNext) {
      var nextEvt = events[i+1], edge = edgeMap[evt.id+'|'+nextEvt.id];
      html += '<div class="chain-connector">';
      if (edge) {
        html += '<span class="conn-type-badge">' + esc((edge.connection_type||'').replace(/_/g,' ')) + '</span>';
        if (edge.days_between != null) html += '<span class="conn-days">+' + edge.days_between + 'd</span>';
      } else {
        html += '<span style="color:#2D3748;font-size:12px">↓</span>';
      }
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}

function renderConnections(data) {
  var connections = data.connections || [];
  var chains      = buildChains(connections);
  var standalone  = [];
  for (var i = 0; i < connections.length; i++) {
    if (!connections[i].chain_id) standalone.push(connections[i]);
  }
  setBadge('badge-connections', chains.length);

  if (!chains.length && !standalone.length) {
    setHTML('panel-connections',
      '<div class="empty-state">No connections detected yet.<br>' +
      '<span style="font-size:13px;display:block;margin-top:8px">Open the app and run connection detection to build the causal chain view.</span></div>'
    );
    return;
  }

  var html = '';
  if (chains.length) {
    html += '<p class="section-title">' + chains.length + ' Causal Chain' + (chains.length !== 1 ? 's' : '') + '</p>';
    for (var c = 0; c < chains.length; c++) html += renderChainCard(chains[c]);
  }
  if (standalone.length) {
    html += '<p class="section-title" style="margin-top:28px">' + standalone.length + ' Standalone Connection' + (standalone.length !== 1 ? 's' : '') + '</p>';
    for (var s = 0; s < standalone.length; s++) {
      var conn = standalone[s];
      var sCol = strengthColor10(conn.strength || 0);
      html += '<div class="standalone-conn"><div class="sc-pair">' +
        '<span class="sc-event">' + esc(conn.source_title||'?') + '</span>' +
        '<span class="sc-arrow">→</span>' +
        '<span class="sc-event">' + esc(conn.target_title||'?') + '</span>' +
        '</div><div class="sc-meta">' +
        '<span class="conn-type-badge">' + esc((conn.connection_type||'').replace(/_/g,' ')) + '</span>' +
        (conn.days_between != null ? '<span class="conn-days">' + conn.days_between + ' days apart</span>' : '') +
        '</div>' +
        (conn.description ? '<div class="sc-desc">' + esc(conn.description) + '</div>' : '') +
        '</div>';
    }
  }
  html += footer();
  setHTML('panel-connections', html);
}

// ── People ──────────────────────────────────────────────────────────────────

var _CLS_LABELS = {
  bad_actor:          { label:'Bad Actor',             color:'#DC2626' },
  enabler:            { label:'Enabler',               color:'#F59E0B' },
  witness_hostile:    { label:'Witness (Hostile)',     color:'#B91C1C' },
  witness_supportive: { label:'Witness (Supportive)',  color:'#16A34A' },
  witness_neutral:    { label:'Witness (Neutral)',     color:'#6B7280' },
  corroborator:       { label:'Corroborator',          color:'#2563EB' },
  bystander:          { label:'Bystander',             color:'#9CA3AF' },
  self:               { label:'You',                   color:'#8B5CF6' },
  unknown:            { label:'Unknown',               color:'#9CA3AF' }
};
var _CLS_ORDER = ['bad_actor','enabler','witness_hostile','witness_supportive','witness_neutral','corroborator','bystander','self','unknown'];

function renderPeople(data) {
  var actors = data.actors || [];
  setBadge('badge-people', actors.length);

  if (!actors.length) {
    setHTML('panel-people', '<div class="empty-state">No people identified in this case.</div>');
    return;
  }

  var groups = {};
  for (var i = 0; i < actors.length; i++) {
    var cls = actors[i].classification || 'unknown';
    if (!groups[cls]) groups[cls] = [];
    groups[cls].push(actors[i]);
  }

  var html = '';
  for (var o = 0; o < _CLS_ORDER.length; o++) {
    var cls  = _CLS_ORDER[o];
    var grp  = groups[cls];
    if (!grp || !grp.length) continue;
    var info = _CLS_LABELS[cls] || { label:cls, color:'#9CA3AF' };
    html += '<div class="cls-group"><div class="cls-heading" style="color:' + info.color + '">' + esc(info.label) + ' (' + grp.length + ')</div><div class="actor-grid">';
    for (var a = 0; a < grp.length; a++) {
      var actor = grp[a];
      html += '<div class="actor-card">' +
        '<div class="actor-name">' + esc(actor.name||'Unknown') + '</div>' +
        (actor.role ? '<div class="actor-role">' + esc(actor.role) + '</div>' : '') +
        '<div><span class="actor-badge" style="background:' + info.color + '22;color:' + info.color + '">' + esc(info.label) + '</span></div>' +
        '<div class="actor-stats">' +
          '<span class="actor-stat"><span>' + (_actorEventCount[actor.id]||0) + '</span> events</span>' +
          '<span class="actor-stat"><span>' + (_actorDocCount[actor.id]||0)  + '</span> docs</span>' +
        '</div>' +
        (actor.still_employed === 'yes' ? '<div class="actor-status" style="color:#4ADE80">✓ Still employed</div>' :
         actor.still_employed === 'no'  ? '<div class="actor-status" style="color:#F87171">✗ No longer employed</div>' : '') +
      '</div>';
    }
    html += '</div></div>';
  }
  html += footer();
  setHTML('panel-people', html);
}

// ── Case Overview (Brief) ───────────────────────────────────────────────────

function elementIcon(status) {
  if (status === 'satisfied') return { icon:'✓', color:'#16A34A' };
  if (status === 'partial')   return { icon:'⚠', color:'#F59E0B' };
  return { icon:'✗', color:'#DC2626' };
}

function renderBriefTab(data) {
  var b = data.brief;
  if (!b) {
    setHTML('panel-brief',
      '<div class="empty-state">No case overview generated yet.<br>' +
      '<span style="font-size:13px;display:block;margin-top:8px;color:#475569">' +
      'Open the app and generate an overview from the Case Overview page.</span></div>'
    );
    return;
  }

  var ex  = b.executive || {};
  var str = ex.strength  || 0;
  var cnt = ex.counts    || {};
  var col = strengthColor10(str);

  var html = '<div class="summary-hero">' +
    '<div class="ring-wrap">' + ringGauge(str, 120) +
      '<div class="ring-label" style="color:' + col + '">' + strengthLabel(str) + '</div>' +
    '</div>' +
    '<div class="hero-info">' +
      '<div class="hero-case-type">' + esc((ex.caseType||'Case').replace(/_/g,' ')) + '</div>' +
      '<div class="hero-timespan">' + esc(ex.timeSpan||'') + (ex.timeSpanDays ? ' · ' + ex.timeSpanDays + ' days' : '') + '</div>' +
      '<div class="stats-row">' +
        statCell(cnt.events||0, 'Events') +
        statCell(cnt.documents||0, 'Documents') +
        statCell(cnt.actors||0, 'People') +
        statCell(cnt.activeThreads||0, 'Threads') +
      '</div>' +
    '</div>' +
  '</div>';

  var threads = b.threads || [];
  if (threads.length) {
    html += '<p class="section-title">Legal Analysis (' + threads.length + ')</p>';
    for (var t = 0; t < threads.length; t++) {
      var th   = threads[t];
      var tcol = strengthColor10(th.strength||0);
      html += '<div class="brief-thread-card" style="border-left-color:' + (th.color||'#334155') + '">';
      html += '<div class="brief-thread-header">';
      html += '<div class="brief-thread-name">' + esc((th.name||th.id||'').replace(/_/g,' ')) + '</div>';
      html += '<div class="brief-thread-score" style="color:' + tcol + '">' + (th.strength||0).toFixed(1) + '/10</div>';
      html += '</div>';
      html += '<div class="brief-bar-wrap"><div class="brief-bar" style="width:' + Math.round((th.strength||0)*10) + '%;background:' + tcol + '"></div></div>';
      if (th.elements && th.elements.length) {
        html += '<div class="elements-grid">';
        for (var e = 0; e < th.elements.length; e++) {
          var el = th.elements[e], ic = elementIcon(el.status);
          html += '<div class="element-item"><div class="element-icon" style="color:' + ic.color + '">' + ic.icon + '</div>' +
            '<div class="element-text"><span class="element-name">' + esc((el.label||el.name||'').replace(/_/g,' ')) + '</span>' +
            (el.detail ? esc(el.detail) : '') + '</div></div>';
        }
        html += '</div>';
      }
      html += '<div style="display:flex;gap:14px;margin-top:8px">' +
        '<span style="font-size:11px;color:#64748B"><span style="color:#94A3B8;font-weight:600">' + (th.eventCount||0) + '</span> events</span>' +
        '<span style="font-size:11px;color:#64748B"><span style="color:#94A3B8;font-weight:600">' + (th.docCount||0) + '</span> documents</span>' +
        '</div>';
      html += '</div>';
    }
  }

  var flags = (b.redFlags||[]).slice().sort(function(a,z){
    var sev={high:0,medium:1};
    return (sev[a.severity]!=null?sev[a.severity]:2)-(sev[z.severity]!=null?sev[z.severity]:2);
  });
  setBadge('badge-brief', flags.length);

  if (flags.length) {
    html += '<p class="section-title" style="margin-top:28px">Red Flags (' + flags.length + ')</p>';
    for (var f = 0; f < flags.length; f++) {
      var flag = flags[f], sev = flag.severity === 'high' ? 'high' : 'medium';
      html += '<div class="flag-card ' + sev + '">' +
        '<div class="flag-header"><span class="sev-badge ' + sev + '">' + sev.toUpperCase() + '</span>' +
        '<span class="flag-label">' + esc(flag.label||'') + '</span></div>' +
        (flag.detail ? '<div class="flag-detail">' + esc(flag.detail) + '</div>' : '') +
        '</div>';
    }
  }

  var tl = b.timeline || {};
  if (tl.criticalMoments && tl.criticalMoments.length) {
    html += '<p class="section-title" style="margin-top:28px">Critical Moments</p>';
    var moments = tl.criticalMoments.slice(0,8);
    for (var m = 0; m < moments.length; m++) {
      var moment = moments[m];
      html += '<div style="background:#1E293B;border-radius:8px;padding:10px 12px;margin-bottom:8px">' +
        '<div style="font-size:11px;color:#64748B;margin-bottom:2px">' + esc(fmtDate(moment.date)) + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:#F1F5F9">' + esc(moment.title||'') + '</div>' +
        '</div>';
    }
  }

  html += footer();
  setHTML('panel-brief', html);
}

// ── Main render ─────────────────────────────────────────────────────────────

function renderCase(data) {
  buildLookups(data);
  updateHeader(data);
  renderTimeline(data);
  renderThreads(data);
  renderConnections(data);
  renderPeople(data);
  renderBriefTab(data);

  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('viewer').style.display      = 'flex';
}

// Check expiry on load
if (Date.now() > _EXP) { showExpired(); }
</script>
</body>
</html>`;
}

module.exports = { generateCaseHTML, generateBriefHTML };
