const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Wrap ipcRenderer.invoke so unregistered-handler errors are caught and
// logged instead of throwing an uncaught promise rejection in every caller.
function safeInvoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch(err => {
    if (err && err.message && err.message.includes('No handler registered')) {
      console.error(`[IPC] No handler registered for '${channel}'. Ensure all handlers loaded.`);
      return { success: false, error: `No handler registered for '${channel}'` };
    }
    throw err;
  });
}

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('api', {
  // Vault operations
  vault: {
    exists: () => safeInvoke('vault:exists'),
    setup: (passphrase) => safeInvoke('vault:setup', passphrase),
    unlock: (passphrase) => safeInvoke('vault:unlock', passphrase),
    lock: () => safeInvoke('vault:lock'),
    isUnlocked: () => safeInvoke('vault:isUnlocked')
  },

  // Kill switch
  burn: {
    execute: (scope) => safeInvoke('burn:execute', scope),
    verify: () => safeInvoke('burn:verify')
  },

  // Case operations
  cases: {
    list: () => safeInvoke('cases:list'),
    create: (name) => safeInvoke('cases:create', name),
    open: (caseId) => safeInvoke('cases:open', caseId),
    current: () => safeInvoke('cases:current'),
    rename: (caseId, newName) => safeInvoke('cases:rename', caseId, newName)
  },

  // Document operations
  documents: {
    ingest: (filePaths) => safeInvoke('documents:ingest', filePaths),
    list: () => safeInvoke('documents:list'),
    get: (docId) => safeInvoke('documents:get', docId),
    updateContext: (docId, context) => safeInvoke('documents:updateContext', docId, context),
    updateDate: (docId, date, confidence) => safeInvoke('documents:updateDate', docId, date, confidence),
    updateType: (docId, evidenceType) => safeInvoke('documents:updateType', docId, evidenceType),
    rename: (docId, newFilename) => safeInvoke('documents:rename', docId, newFilename),
    getContent: (docId) => safeInvoke('documents:getContent', docId),
    reclassify: () => safeInvoke('documents:reclassify'),
    // Date entries (multi-date timeline)
    addDateEntry: (docId, date, label, confidence) => safeInvoke('documents:addDateEntry', docId, date, label, confidence),
    removeDateEntry: (entryId) => safeInvoke('documents:removeDateEntry', entryId),
    getDateEntries: (docId) => safeInvoke('documents:getDateEntries', docId),
    // Group linking
    setGroup: (docId, groupId) => safeInvoke('documents:setGroup', docId, groupId),
    removeGroup: (docId) => safeInvoke('documents:removeGroup', docId),
    // Recap status
    updateRecapStatus: (docId, isRecap, responseReceived) => safeInvoke('documents:updateRecapStatus', docId, isRecap, responseReceived),
    updateDocumentSubtype: (docId, subtype) => safeInvoke('documents:updateDocumentSubtype', docId, subtype),
    delete: (docId) => safeInvoke('documents:delete', docId),
    copy: (docId) => safeInvoke('documents:copy', docId),
    open: (docId) => safeInvoke('documents:open', docId)
  },

  // Group operations (document linking)
  groups: {
    create: (name, description, color) => safeInvoke('groups:create', name, description, color),
    list: () => safeInvoke('groups:list'),
    delete: (groupId) => safeInvoke('groups:delete', groupId),
    getMembers: (groupId) => safeInvoke('groups:getMembers', groupId)
  },

  // Jurisdiction
  jurisdiction: {
    get: () => safeInvoke('jurisdiction:get'),
    set: (value) => safeInvoke('jurisdiction:set', value)
  },

  // Incident operations
  incidents: {
    list: () => safeInvoke('incidents:list'),
    create: (data) => safeInvoke('incidents:create', data),
    update: (id, updates) => safeInvoke('incidents:update', id, updates),
    delete: (id) => safeInvoke('incidents:delete', id),
    suggest: () => safeInvoke('incidents:suggest'),
    reclassify: () => safeInvoke('incidents:reclassify')
  },

  // Actor operations
  actors: {
    list: () => safeInvoke('actors:list'),
    create: (data) => safeInvoke('actors:create', data),
    update: (id, updates) => safeInvoke('actors:update', id, updates),
    delete: (id) => safeInvoke('actors:delete', id),
    merge: (keepId, mergeId) => safeInvoke('actors:merge', keepId, mergeId),
    getAppearances: (id) => safeInvoke('actors:getAppearances', id),
    setSelf: (id) => safeInvoke('actors:setSelf', id),
    checkDuplicates: () => safeInvoke('actors:checkDuplicates'),
    rescan: () => safeInvoke('actors:rescan'),
    getForDocument: (docId) => safeInvoke('actors:getForDocument', docId),
    addToDocument: (actorId, docId, role) => safeInvoke('actors:addToDocument', actorId, docId, role),
    removeFromDocument: (actorId, docId) => safeInvoke('actors:removeFromDocument', actorId, docId),
    // Actor registry methods
    getRelationshipTypes: () => safeInvoke('actors:getRelationshipTypes'),
    resolveFromText: (text, confirmedIds) => safeInvoke('actors:resolveFromText', text, confirmedIds),
    findInText: (text) => safeInvoke('actors:findInText', text),
    getChain: () => safeInvoke('actors:getChain'),
    getSummary: () => safeInvoke('actors:getSummary')
  },

  // Pay record operations
  payRecords: {
    list: () => safeInvoke('payRecords:list'),
    create: (data) => safeInvoke('payRecords:create', data),
    update: (id, updates) => safeInvoke('payRecords:update', id, updates),
    delete: (id) => safeInvoke('payRecords:delete', id),
    getForActor: (actorId) => safeInvoke('payRecords:getForActor', actorId)
  },

  // Timeline operations
  timeline: {
    get: () => safeInvoke('timeline:get'),
    getConnections: () => safeInvoke('timeline:getConnections')
  },

  // Precedent analysis
  precedents: {
    analyze: (jurisdiction) => safeInvoke('precedents:analyze', jurisdiction),
    getDocumentBadges: (docId) => safeInvoke('precedents:getDocumentBadges', docId)
  },

  // Events
  events: {
    list: (caseId) => safeInvoke('events:list', caseId),
    generate: (caseId) => safeInvoke('events:generate', caseId),
    create: (caseId, data) => safeInvoke('events:create', caseId, data),
    update: (caseId, id, updates) => safeInvoke('events:update', caseId, id, updates),
    delete: (caseId, id) => safeInvoke('events:delete', caseId, id),
    linkEvidence: (caseId, eventId, docId) => safeInvoke('events:linkEvidence', caseId, eventId, docId),
    unlinkEvidence: (caseId, eventId, docId) => safeInvoke('events:unlinkEvidence', caseId, eventId, docId),
    getRelatedEvidence: (caseId, eventId) => safeInvoke('events:getRelatedEvidence', caseId, eventId),
    clone: (caseId, eventId) => safeInvoke('events:clone', caseId, eventId),
    reorder: (caseId, orderedIds) => safeInvoke('events:reorder', caseId, orderedIds),
    linkPrecedent: (caseId, eventId, precedentId, note) => safeInvoke('events:linkPrecedent', caseId, eventId, precedentId, note),
    unlinkPrecedent: (caseId, eventId, precedentId) => safeInvoke('events:unlinkPrecedent', caseId, eventId, precedentId),
    getPrecedents: (caseId, eventId) => safeInvoke('events:getPrecedents', caseId, eventId),
    breakApart: (caseId, eventId) => safeInvoke('events:breakApart', caseId, eventId),
    linkIncident: (caseId, eventId, incidentId, eventRole) => safeInvoke('events:linkIncident', caseId, eventId, incidentId, eventRole),
    unlinkIncident: (caseId, eventId, incidentId) => safeInvoke('events:unlinkIncident', caseId, eventId, incidentId),
    linkActor: (caseId, eventId, actorId, role) => safeInvoke('events:linkActor', caseId, eventId, actorId, role),
    unlinkActor: (caseId, eventId, actorId) => safeInvoke('events:unlinkActor', caseId, eventId, actorId),
    suggestLinks: (caseId, documentId) => safeInvoke('events:suggestLinks', caseId, documentId),
    linkDocumentV2: (caseId, eventId, docId, relevanceV2) => safeInvoke('events:linkDocumentV2', caseId, eventId, docId, relevanceV2),
    setDocumentWeight: (caseId, eventId, docId, weight) => safeInvoke('events:setDocumentWeight', caseId, eventId, docId, weight),
    get: (caseId, eventId) => safeInvoke('events:get', caseId, eventId),
    getTags: (caseId, eventId) => safeInvoke('events:getTags', caseId, eventId),
    updateTags: (caseId, eventId, tags) => safeInvoke('events:updateTags', caseId, eventId, tags),
    getLinkedDocuments: (caseId, eventId) => safeInvoke('events:getLinkedDocuments', caseId, eventId),
    getForDocument: (caseId, docId) => safeInvoke('events:getForDocument', caseId, docId),
    updateContextStatus: (caseId, eventId, isContext, scope) =>
      safeInvoke('events:updateContextStatus', caseId, eventId, isContext, scope)
  },

  // Comparators (SESSION-9C)
  comparators: {
    list: () => safeInvoke('comparators:list'),
    create: (data) => safeInvoke('comparators:create', data),
    update: (id, data) => safeInvoke('comparators:update', id, data),
    delete: (id) => safeInvoke('comparators:delete', id)
  },

  // Connections (SESSION-9D)
  connections: {
    list: (caseId) => safeInvoke('connections:list', caseId),
    autoDetect: (caseId) => safeInvoke('connections:autoDetect', caseId),
    create: (caseId, data) => safeInvoke('connections:create', caseId, data),
    update: (caseId, id, data) => safeInvoke('connections:update', caseId, id, data),
    delete: (caseId, id) => safeInvoke('connections:delete', caseId, id)
  },

  // Encrypted export (SESSION-9C)
  export: {
    generateHTML: (passcode, expiryDays) => safeInvoke('export:generateHTML', passcode, expiryDays)
  },

  // Event Tags
  eventTags: {
    set: (eventId, tags) => safeInvoke('eventTags:set', eventId, tags),
    listAll: () => safeInvoke('eventTags:listAll'),
    suggest: (eventId) => safeInvoke('eventTags:suggest', eventId)
  },

  // Event Links (Causality)
  eventLinks: {
    list: () => safeInvoke('eventLinks:list'),
    create: (data) => safeInvoke('eventLinks:create', data),
    delete: (linkId) => safeInvoke('eventLinks:delete', linkId),
    suggest: () => safeInvoke('eventLinks:suggest')
  },

  // Incident Events
  incidentEvents: {
    list: (incidentId) => safeInvoke('incidentEvents:list', incidentId),
    link: (incidentId, eventId, eventRole) => safeInvoke('incidentEvents:link', incidentId, eventId, eventRole),
    unlink: (incidentId, eventId) => safeInvoke('incidentEvents:unlink', incidentId, eventId)
  },

  // Damages
  damages: {
    list: () => safeInvoke('damages:list'),
    create: (data) => safeInvoke('damages:create', data),
    update: (id, updates) => safeInvoke('damages:update', id, updates),
    delete: (id) => safeInvoke('damages:delete', id)
  },

  // Case context
  context: {
    get: (caseId) => safeInvoke('context:get', caseId),
    update: (caseId, updates) => safeInvoke('context:update', caseId, updates)
  },

  // File dialog
  dialog: {
    openFiles: () => safeInvoke('dialog:openFiles')
  },

  // File utilities (Electron 22+ requires webUtils for drag-and-drop file paths)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Categorizer (incident chain analysis)
  categorizer: {
    categorize: (text, isPrimary) => safeInvoke('categorizer:categorize', text, isPrimary),
    buildChain: (entries) => safeInvoke('categorizer:buildChain', entries),
    analyzeDocuments: () => safeInvoke('categorizer:analyzeDocuments')
  },

  // Settings (secure backend storage)
  settings: {
    get: (key) => safeInvoke('settings:get', key),
    set: (key, value) => safeInvoke('settings:set', key, value)
  },

  // Context Documents (policy library)
  contextDocs: {
    list: () => safeInvoke('contextDocs:list'),
    ingest: (data) => safeInvoke('contextDocs:ingest', data),
    ingestFile: (data) => safeInvoke('contextDocs:ingestFile', data),
    delete: (docId) => safeInvoke('contextDocs:delete', docId),
    toggleActive: (docId, isActive) => safeInvoke('contextDocs:toggleActive', docId, isActive),
    get: (docId) => safeInvoke('contextDocs:get', docId),
    search: (query) => safeInvoke('contextDocs:search', query),
    signalsSummary: () => safeInvoke('contextDocs:signalsSummary'),
    types: () => safeInvoke('contextDocs:types')
  },

  // Assessor (document assessment engine)
  assessor: {
    assess: (data) => safeInvoke('assessor:assess', data),
    expandFlag: (data) => safeInvoke('assessor:expandFlag', data),
    deepAnalysis: (data) => safeInvoke('assessor:deepAnalysis', data),
    inputTypes: () => safeInvoke('assessor:inputTypes')
  },

  // Lawyer Briefs (SESSION-9E)
  brief: {
    generate:       ()          => safeInvoke('brief:generate'),
    latest:         ()          => safeInvoke('brief:latest'),
    markStale:      ()          => safeInvoke('brief:markStale'),
    versions:       ()          => safeInvoke('brief:versions'),
    exportMarkdown: (brief)     => safeInvoke('brief:exportMarkdown', brief),
    exportHTML:     (brief)     => safeInvoke('brief:exportHTML', brief)
  },

  // Debug
  debug: {
    testIngest: () => safeInvoke('debug:testIngest')
  },

  // Event bridge (SESSION-9B: case-change listener)
  on: (channel, callback) => {
    const allowed = ['case-changed'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (event, data) => callback(data));
    }
  },
  off: (channel, callback) => {
    const allowed = ['case-changed'];
    if (allowed.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  }
});
