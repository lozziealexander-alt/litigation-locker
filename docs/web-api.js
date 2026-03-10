/**
 * Web API — browser-compatible read-only API layer for the GitHub Pages viewer.
 *
 * Replaces the Electron preload `window.api` with an implementation backed by
 * decrypted vault JSON.  The vault data is loaded from an external file
 * (vault.enc.json) and decrypted client-side using the Web Crypto API.
 *
 * This script must be loaded BEFORE bundle.js.
 */

/* global VAULT_DATA */

// ── Decryption helpers ──────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100000;

async function deriveKey(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptVault(encryptedB64, saltB64, ivB64, password) {
  const key = await deriveKey(password, saltB64);
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ── State ───────────────────────────────────────────────────────────────────

let _vault = null;  // Decrypted vault data

// Helper: build lookup maps once after decryption
let _tagsByEvent = {};
let _docsByEvent = {};
let _actorsByEvent = {};
let _precedentsByEvent = {};
let _docsByIncident = {};
let _eventsByIncident = {};
let _notifByKey = {};
let _appearancesByDoc = {};
let _appearancesByActor = {};

function buildLookups() {
  const v = _vault;

  // Event tags → { eventId: [tag, ...] }
  _tagsByEvent = {};
  (v.eventTags || []).forEach(t => {
    (_tagsByEvent[t.event_id] = _tagsByEvent[t.event_id] || []).push(t.tag);
  });

  // Event-document links
  _docsByEvent = {};
  (v.eventDocuments || []).forEach(ed => {
    const doc = (v.documents || []).find(d => d.id === ed.document_id);
    if (doc) {
      (_docsByEvent[ed.event_id] = _docsByEvent[ed.event_id] || []).push({
        id: doc.id, filename: doc.filename, evidence_type: doc.evidence_type,
        group_id: doc.group_id, is_recap: doc.is_recap, document_date: doc.document_date,
        relevance: ed.relevance
      });
    }
  });

  // Event-actor links
  _actorsByEvent = {};
  (v.eventActors || []).forEach(ea => {
    const actor = (v.actors || []).find(a => a.id === ea.actor_id);
    if (actor) {
      (_actorsByEvent[ea.event_id] = _actorsByEvent[ea.event_id] || []).push({
        id: actor.id, name: actor.name, classification: actor.classification, role: ea.role
      });
    }
  });

  // Event-precedent links
  _precedentsByEvent = {};
  (v.eventPrecedents || []).forEach(ep => {
    (_precedentsByEvent[ep.event_id] = _precedentsByEvent[ep.event_id] || []).push({
      precedent_id: ep.precedent_id, relevance_note: ep.relevance_note
    });
  });

  // Incident-document links
  _docsByIncident = {};
  (v.incidentDocuments || []).forEach(id_ => {
    const doc = (v.documents || []).find(d => d.id === id_.document_id);
    if (doc) {
      (_docsByIncident[id_.incident_id] = _docsByIncident[id_.incident_id] || []).push({
        id: doc.id, filename: doc.filename, evidence_type: doc.evidence_type
      });
    }
  });

  // Incident-event links
  _eventsByIncident = {};
  (v.incidentEvents || []).forEach(ie => {
    (_eventsByIncident[ie.incident_id] = _eventsByIncident[ie.incident_id] || []).push({
      event_id: ie.event_id, event_role: ie.event_role
    });
  });

  // Notifications → { "type:id": [actorInfo, ...] }
  _notifByKey = {};
  (v.notifications || []).forEach(n => {
    const key = `${n.target_type}:${n.target_id}`;
    const actor = (v.actors || []).find(a => a.id === n.actor_id);
    (_notifByKey[key] = _notifByKey[key] || []).push(
      actor ? { actor_id: n.actor_id, name: actor.name, role: actor.role,
                classification: actor.classification, relationship_to_self: actor.relationship_to_self }
            : { actor_id: n.actor_id, name: 'Unknown' }
    );
  });

  // Actor appearances
  _appearancesByDoc = {};
  _appearancesByActor = {};
  (v.actorAppearances || []).forEach(aa => {
    (_appearancesByDoc[aa.document_id] = _appearancesByDoc[aa.document_id] || []).push(aa);
    (_appearancesByActor[aa.actor_id] = _appearancesByActor[aa.actor_id] || []).push(aa);
  });

  // Compute appearance_count on actors
  (v.actors || []).forEach(a => {
    a.appearance_count = (_appearancesByActor[a.id] || []).length;
  });
}

// ── Enriched event builder (matches mock-api shape) ─────────────────────────

function enrichEvent(evt) {
  return {
    ...evt,
    tags: _tagsByEvent[evt.id] || [],
    documents: _docsByEvent[evt.id] || [],
    incidents: [],
    actors: _actorsByEvent[evt.id] || [],
    precedents: _precedentsByEvent[evt.id] || []
  };
}

function enrichIncident(inc) {
  return {
    ...inc,
    events: _eventsByIncident[inc.id] || [],
    documents: _docsByIncident[inc.id] || []
  };
}

// ── Build the read-only window.api ──────────────────────────────────────────

function buildApi() {
  const v = _vault;

  // Compute timeline (split dated / undated)
  const dated = (v.documents || [])
    .filter(d => d.document_date)
    .sort((a, b) => (a.document_date || '').localeCompare(b.document_date || ''));
  const undated = (v.documents || []).filter(d => !d.document_date);

  // Timeline connections with enriched info
  const connections = (v.timelineConnections || []).map(c => ({
    sourceId: c.source_id, targetId: c.target_id,
    connectionType: c.connection_type, daysBetween: c.days_between,
    strength: c.strength > 0.7 ? 'strong' : c.strength > 0.4 ? 'moderate' : 'weak',
    description: c.description
  }));

  // Detect escalation from connections
  const retaliationLinks = connections.filter(c => c.connectionType === 'retaliation_chain');
  const escalation = {
    hasEscalation: retaliationLinks.length > 0,
    escalations: retaliationLinks.length,
    deescalations: 0,
    trend: retaliationLinks.length > 0 ? 'escalating' : 'stable'
  };

  // Event links with titles
  const eventLinksEnriched = (v.eventLinks || []).map(l => {
    const src = (v.events || []).find(e => e.id === l.source_event_id);
    const tgt = (v.events || []).find(e => e.id === l.target_event_id);
    return {
      ...l,
      source_title: src ? src.title : '',
      source_date: src ? src.date : null,
      target_title: tgt ? tgt.title : '',
      target_date: tgt ? tgt.date : null
    };
  });

  // Read-only noop for all write operations
  const noop = () => Promise.resolve({ success: true });
  const noopFalse = () => Promise.resolve({ success: false, error: 'Read-only vault' });

  window.api = {
    vault: {
      exists: () => Promise.resolve(true),
      setup: noopFalse,
      unlock: () => Promise.resolve({ success: true }),
      lock: noop,
      isUnlocked: () => Promise.resolve(true),
      isReadOnly: () => Promise.resolve(true)
    },
    burn: {
      execute: noopFalse,
      verify: noopFalse
    },
    cases: {
      list: () => Promise.resolve({ success: true, cases: [
        { id: v.caseId, name: v.caseName, created_at: '' }
      ]}),
      create: noopFalse,
      open: () => Promise.resolve({ success: true }),
      current: () => Promise.resolve({ caseId: v.caseId }),
      rename: noopFalse
    },
    documents: {
      ingest: noopFalse,
      list: () => Promise.resolve({ success: true, documents: v.documents || [] }),
      get: (id) => {
        const doc = (v.documents || []).find(d => d.id === id);
        return Promise.resolve(doc ? { success: true, document: doc } : { success: false });
      },
      updateContext: noopFalse,
      updateDate: noopFalse,
      updateType: noopFalse,
      rename: noopFalse,
      getContent: (docId) => {
        const doc = (v.documents || []).find(d => d.id === docId);
        const text = doc ? (doc.extracted_text || 'No text available.') : 'Document not found.';
        return Promise.resolve({ success: true, data: text, mimeType: 'text/plain' });
      },
      reclassify: noopFalse,
      addDateEntry: noopFalse,
      removeDateEntry: noopFalse,
      getDateEntries: (docId) => Promise.resolve({ success: true, entries: [] }),
      setGroup: noopFalse,
      removeGroup: noopFalse,
      updateRecapStatus: noopFalse,
      updateDocumentSubtype: noopFalse,
      delete: noopFalse,
      copy: noopFalse
    },
    timeline: {
      get: () => Promise.resolve({ success: true, dated, undated }),
      getConnections: () => Promise.resolve({ success: true, connections, escalation })
    },
    incidents: {
      list: () => Promise.resolve({ success: true, incidents: (v.incidents || []).map(enrichIncident) }),
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse,
      suggest: () => Promise.resolve({ success: true, suggestions: [] })
    },
    actors: {
      list: () => Promise.resolve({ success: true, actors: (v.actors || []).map(a => ({ ...a })) }),
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse,
      merge: noopFalse,
      getAppearances: (actorId) => {
        const apps = (_appearancesByActor[actorId] || []).map(aa => {
          const doc = (v.documents || []).find(d => d.id === aa.document_id);
          return doc ? { document_id: doc.id, filename: doc.filename, role_in_document: aa.role_in_document } : null;
        }).filter(Boolean);
        return Promise.resolve({ success: true, appearances: apps });
      },
      setSelf: noopFalse,
      checkDuplicates: () => Promise.resolve({ success: true, duplicates: [] }),
      rescan: noopFalse,
      getForDocument: (docId) => {
        const actorIds = (_appearancesByDoc[docId] || []).map(aa => aa.actor_id);
        const actors = (v.actors || []).filter(a => actorIds.includes(a.id));
        return Promise.resolve({ success: true, actors });
      },
      addToDocument: noopFalse,
      removeFromDocument: noopFalse,
      getRelationshipTypes: () => Promise.resolve({ success: true, types: {
        direct_supervisor: 'Direct Supervisor (your boss)', skip_level: "Skip-Level (boss's boss)",
        senior_leadership: 'Senior Leadership', hr: 'HR / People Ops',
        hr_investigator: 'HR Investigator', peer: 'Peer / Colleague',
        subordinate: 'Subordinate (reports to you)', union_rep: 'Union Representative',
        legal: 'Legal / Employment Counsel', witness: 'Witness', other: 'Other'
      }}),
      resolveFromText: () => Promise.resolve({ success: true, role: null, inChain: false, actor: null, pending: [] }),
      findInText: () => Promise.resolve({ success: true, matches: [] }),
      getChain: () => {
        const chain = (v.actors || []).filter(a => !!a.in_reporting_chain)
          .map(a => ({ id: a.id, name: a.name, relationship: a.relationship_to_self }));
        return Promise.resolve({ success: true, actors: chain });
      },
      getSummary: () => {
        const lines = (v.actors || []).map(a =>
          '  ' + a.name + ' (' + (a.role || 'no title') + ') -- ' +
          a.relationship_to_self + (a.in_reporting_chain ? ' [IN REPORTING CHAIN]' : '')
        );
        return Promise.resolve({ success: true, summary: lines.join('\n') });
      }
    },
    events: {
      list: () => Promise.resolve({ success: true, events: (v.events || []).map(enrichEvent) }),
      generate: noopFalse,
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse,
      linkEvidence: noopFalse,
      unlinkEvidence: noopFalse,
      getRelatedEvidence: (caseId, eventId) => {
        const evt = (v.events || []).find(e => e.id === eventId);
        if (!evt) return Promise.resolve({ success: false });
        return Promise.resolve({
          success: true,
          event: { ...evt, tags: _tagsByEvent[evt.id] || [] },
          linked: {
            documents: _docsByEvent[evt.id] || [],
            incidents: [],
            actors: _actorsByEvent[evt.id] || [],
            precedents: _precedentsByEvent[evt.id] || []
          },
          causalityLinks: (v.eventLinks || [])
            .filter(l => l.source_event_id === eventId)
            .map(l => ({ ...l, target_event_id: l.target_event_id })),
          nearby: { documents: [] }
        });
      },
      clone: noopFalse,
      reorder: noopFalse,
      linkPrecedent: noopFalse,
      unlinkPrecedent: noopFalse,
      getPrecedents: (caseId, eventId) => Promise.resolve({
        success: true, precedents: _precedentsByEvent[eventId] || []
      }),
      breakApart: noopFalse,
      linkIncident: noopFalse,
      unlinkIncident: noopFalse,
      linkActor: noopFalse,
      unlinkActor: noopFalse,
      linkDocumentV2: noopFalse,
      get: (caseId, eventId) => {
        const evt = (v.events || []).find(e => e.id === eventId);
        return Promise.resolve(evt ? { success: true, event: evt } : { success: false });
      },
      getTags: (caseId, eventId) => Promise.resolve({ success: true, tags: _tagsByEvent[eventId] || [] }),
      updateTags: noopFalse,
      updateContextStatus: noopFalse,
      getLinkedDocuments: (caseId, eventId) => Promise.resolve({
        success: true, documents: _docsByEvent[eventId] || []
      })
    },
    eventTags: {
      set: noopFalse,
      listAll: () => {
        const allTags = new Set();
        Object.values(_tagsByEvent).forEach(tags => tags.forEach(t => allTags.add(t)));
        return Promise.resolve({ success: true, tags: Array.from(allTags) });
      },
      suggest: () => Promise.resolve({ success: true, tags: [] })
    },
    eventLinks: {
      list: () => Promise.resolve({ success: true, links: eventLinksEnriched }),
      create: noopFalse,
      delete: noopFalse,
      suggest: () => Promise.resolve({ success: true, suggestions: [] })
    },
    incidentEvents: {
      list: (incidentId) => Promise.resolve({
        success: true, events: _eventsByIncident[incidentId] || []
      }),
      link: noopFalse,
      unlink: noopFalse
    },
    precedents: {
      analyze: () => Promise.resolve({ success: true, analysis: { caseStrength: 0, precedents: {} } }),
      getDocumentBadges: () => Promise.resolve({ success: true, badges: [] })
    },
    jurisdiction: {
      get: () => Promise.resolve({ success: true, jurisdiction: (v.context || {}).jurisdiction || 'both' }),
      set: noopFalse
    },
    payRecords: {
      list: () => Promise.resolve({ success: true, records: v.payRecords || [] }),
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse,
      getForActor: (actorId) => Promise.resolve({
        success: true, records: (v.payRecords || []).filter(r => r.actor_id === actorId)
      })
    },
    damages: {
      list: () => Promise.resolve({ success: true, damages: v.damages || [] }),
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse
    },
    context: {
      get: () => Promise.resolve({ success: true, context: v.context || {} }),
      update: noopFalse
    },
    groups: {
      create: noopFalse,
      list: () => Promise.resolve({ success: true, groups: v.groups || [] }),
      delete: noopFalse,
      getMembers: (groupId) => {
        const members = (v.documents || []).filter(d => d.group_id === groupId);
        return Promise.resolve({ success: true, members });
      }
    },
    categorizer: {
      categorize: () => Promise.resolve({ success: true, result: {} }),
      buildChain: () => Promise.resolve({ success: true, summary: {} }),
      analyzeDocuments: () => Promise.resolve({ success: true, summary: {} })
    },
    settings: {
      get: () => Promise.resolve({ success: true, value: null }),
      set: noopFalse
    },
    contextDocs: {
      list: () => {
        const docs = (v.contextDocs || []).map(d => {
          let signals = {}, signalSummary = [];
          try {
            signals = d.signals_json ? JSON.parse(d.signals_json) : {};
            signalSummary = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);
          } catch (e) { /* ignore */ }
          return { ...d, signals, signalSummary };
        });
        return Promise.resolve({ success: true, documents: docs });
      },
      ingest: noopFalse,
      ingestFile: noopFalse,
      delete: noopFalse,
      toggleActive: noopFalse,
      get: (docId) => {
        const doc = (v.contextDocs || []).find(d => d.doc_id === docId);
        if (!doc) return Promise.resolve({ success: false });
        let signals = {}, signalSummary = [];
        try {
          signals = doc.signals_json ? JSON.parse(doc.signals_json) : {};
          signalSummary = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);
        } catch (e) { /* ignore */ }
        return Promise.resolve({ success: true, document: { ...doc, signals, signalSummary } });
      },
      search: () => Promise.resolve({ success: true, results: [] }),
      signalsSummary: () => Promise.resolve({ success: true, summary: {} }),
      types: () => Promise.resolve({ success: true, types: {} })
    },
    assessor: {
      assess: () => Promise.resolve({ success: true, result: { flags: [], claimsVsEvidence: [], summary: '', legalExposure: '' } }),
      expandFlag: () => Promise.resolve({ success: true, result: {} }),
      deepAnalysis: () => Promise.resolve({ success: true, result: { memo: '' } }),
      inputTypes: () => Promise.resolve({ success: true, types: {} })
    },
    brief: {
      generate: noopFalse,
      getCurrent: () => {
        if (!v.brief) return Promise.resolve({ success: false });
        return Promise.resolve({ success: true, ...v.brief });
      },
      // `latest` is what LawyerBrief.jsx actually calls (alias for getCurrent)
      latest: () => {
        if (!v.brief) return Promise.resolve({ success: false });
        return Promise.resolve({ success: true, ...v.brief });
      },
      getVersions: () => Promise.resolve({ success: true, versions: [] }),
      // `versions` is what LawyerBrief.jsx actually calls (alias for getVersions)
      versions: () => Promise.resolve({ success: true, versions: [] }),
      markStale: noop,
      isStale: () => Promise.resolve({ success: true, isStale: false }),
      exportHTML: noopFalse,
      exportMarkdown: noopFalse
    },
    dialog: {
      openFiles: () => Promise.resolve({ canceled: true, filePaths: [] })
    },
    notifications: {
      getForTarget: function(targetType, targetId) {
        const key = `${targetType}:${targetId}`;
        return Promise.resolve({ success: true, notifications: _notifByKey[key] || [] });
      },
      setForTarget: noopFalse,
      batchDocumentMeta: function() {
        const eventCounts = {};
        const notifMap = {};
        (v.documents || []).forEach(d => {
          const evtDocs = (v.eventDocuments || []).filter(ed => ed.document_id === d.id);
          eventCounts[d.id] = evtDocs.length;
          const key = `document:${d.id}`;
          if (_notifByKey[key]) {
            notifMap[d.id] = _notifByKey[key].map(a => ({
              id: a.actor_id, name: a.name, role: a.role, classification: a.classification
            }));
          }
        });
        return Promise.resolve({ success: true, eventCounts, notifMap });
      }
    },
    export: {
      generateHTML: noopFalse
    },
    comparators: {
      list: () => Promise.resolve({ success: true, comparators: [] }),
      create: noopFalse,
      update: noopFalse,
      delete: noopFalse
    },
    // Anchors page uses window.api.anchors.* — backed by vault events data
    anchors: {
      list: () => Promise.resolve({ success: true, anchors: (v.events || []).map(enrichEvent) }),
      generate: noopFalse,
      getRelatedEvidence: (caseId, anchorId) => {
        const evt = (v.events || []).find(e => e.id === anchorId);
        if (!evt) return Promise.resolve({ success: false });
        return Promise.resolve({
          success: true,
          event: { ...evt, tags: _tagsByEvent[evt.id] || [] },
          linked: {
            documents: _docsByEvent[evt.id] || [],
            incidents: [],
            actors: _actorsByEvent[evt.id] || [],
            precedents: _precedentsByEvent[evt.id] || []
          },
          causalityLinks: [],
          nearby: { documents: [] }
        });
      },
      update: noopFalse,
      create: noopFalse,
      clone: noopFalse,
      breakApart: noopFalse,
      delete: noopFalse,
      linkEvidence: noopFalse,
      unlinkEvidence: noopFalse,
      linkIncident: noopFalse,
      linkPrecedent: noopFalse,
      unlinkPrecedent: noopFalse,
      linkActor: noopFalse,
      unlinkActor: noopFalse,
      reorder: noopFalse
    },
    connections: {
      detect: () => Promise.resolve({ success: true, connections: [] }),
      // connections.list — return vault's timeline_connections enriched with event titles
      list: () => {
        const conns = (v.timelineConnections || []).map(tc => {
          const srcEvt = (v.events || []).find(e => e.id === tc.source_id);
          const tgtEvt = (v.events || []).find(e => e.id === tc.target_id);
          return {
            ...tc,
            source_title: srcEvt ? srcEvt.title : '',
            source_date:  srcEvt ? srcEvt.date  : null,
            target_title: tgtEvt ? tgtEvt.title : '',
            target_date:  tgtEvt ? tgtEvt.date  : null
          };
        }).filter(c => c.source_id !== c.target_id);
        return Promise.resolve({ success: true, connections: conns });
      },
      // listSuggested — return vault's suggested_connections enriched with event titles
      listSuggested: () => {
        const suggs = (v.suggestedConnections || []).map(sc => {
          const srcEvt = (v.events || []).find(e => e.id === sc.source_id);
          const tgtEvt = (v.events || []).find(e => e.id === sc.target_id);
          return {
            ...sc,
            source_title: srcEvt ? srcEvt.title : '',
            source_date:  srcEvt ? srcEvt.date  : null,
            target_title: tgtEvt ? tgtEvt.title : '',
            target_date:  tgtEvt ? tgtEvt.date  : null
          };
        }).filter(s => s.source_id !== s.target_id && s.status === 'pending');
        return Promise.resolve({ success: true, suggestions: suggs });
      },
      autoDetect: noopFalse,
      approveSuggestion: noopFalse,
      dismissSuggestion: noop,
      bulkApprove: noop,
      suggestFromPrecedents: () => Promise.resolve({ success: true, suggestions: [] }),
      delete: noopFalse,
      update: noopFalse
    },

    // Electron webUtils mock for drag-and-drop
    getPathForFile: (file) => file.name || 'unknown-file'
  };
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
// The viewer HTML sets window.__VAULT_BUNDLE__ before loading this script,
// or we fetch vault.enc.json at runtime.

window.__webViewerReady = (async function init() {
  // If vault data is already in-memory (embedded by build script), use it
  if (typeof VAULT_DATA !== 'undefined' && VAULT_DATA) {
    _vault = VAULT_DATA;
    buildLookups();
    buildApi();
    return;
  }

  // Set up window.api synchronously so bundle.js can call it immediately on
  // mount — the fetch completes in the background and populates vaultBundle
  // before the user ever submits a password.
  let vaultBundle = null;

  window.api = {
    vault: {
      exists: () => Promise.resolve(true),
      setup: () => Promise.resolve({ success: false, error: 'Read-only vault' }),
      unlock: async (password) => {
        if (!vaultBundle) return { success: false, error: 'No vault data found' };
        try {
          _vault = await decryptVault(
            vaultBundle.encrypted, vaultBundle.salt, vaultBundle.iv, password
          );
          buildLookups();
          buildApi();
          return { success: true };
        } catch (e) {
          return { success: false, error: 'Wrong password' };
        }
      },
      lock: () => Promise.resolve({ success: true }),
      isUnlocked: () => Promise.resolve(false),
      isReadOnly: () => Promise.resolve(true)
    },
    burn: { execute: () => Promise.resolve({ success: false }), verify: () => Promise.resolve({ success: false }) },
    cases: { list: () => Promise.resolve({ success: true, cases: [] }) },
    dialog: { openFiles: () => Promise.resolve({ canceled: true, filePaths: [] }) }
  };

  // Fetch the vault bundle in the background
  try {
    const res = await fetch('./vault.enc.json');
    if (res.ok) vaultBundle = await res.json();
  } catch (e) { /* will show error on unlock */ }
})();
