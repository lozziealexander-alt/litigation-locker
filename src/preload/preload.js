const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('api', {
  // Vault operations
  vault: {
    exists: () => ipcRenderer.invoke('vault:exists'),
    setup: (passphrase) => ipcRenderer.invoke('vault:setup', passphrase),
    unlock: (passphrase) => ipcRenderer.invoke('vault:unlock', passphrase),
    lock: () => ipcRenderer.invoke('vault:lock'),
    isUnlocked: () => ipcRenderer.invoke('vault:isUnlocked')
  },

  // Kill switch
  burn: {
    execute: (scope) => ipcRenderer.invoke('burn:execute', scope),
    verify: () => ipcRenderer.invoke('burn:verify')
  },

  // Case operations
  cases: {
    list: () => ipcRenderer.invoke('cases:list'),
    create: (name) => ipcRenderer.invoke('cases:create', name),
    open: (caseId) => ipcRenderer.invoke('cases:open', caseId),
    current: () => ipcRenderer.invoke('cases:current')
  },

  // Document operations
  documents: {
    ingest: (filePaths) => ipcRenderer.invoke('documents:ingest', filePaths),
    list: () => ipcRenderer.invoke('documents:list'),
    get: (docId) => ipcRenderer.invoke('documents:get', docId),
    updateContext: (docId, context) => ipcRenderer.invoke('documents:updateContext', docId, context),
    updateDate: (docId, date, confidence) => ipcRenderer.invoke('documents:updateDate', docId, date, confidence),
    updateType: (docId, evidenceType) => ipcRenderer.invoke('documents:updateType', docId, evidenceType),
    rename: (docId, newFilename) => ipcRenderer.invoke('documents:rename', docId, newFilename),
    getContent: (docId) => ipcRenderer.invoke('documents:getContent', docId),
    reclassify: () => ipcRenderer.invoke('documents:reclassify'),
    // Date entries (multi-date timeline)
    addDateEntry: (docId, date, label, confidence) => ipcRenderer.invoke('documents:addDateEntry', docId, date, label, confidence),
    removeDateEntry: (entryId) => ipcRenderer.invoke('documents:removeDateEntry', entryId),
    getDateEntries: (docId) => ipcRenderer.invoke('documents:getDateEntries', docId),
    // Group linking
    setGroup: (docId, groupId) => ipcRenderer.invoke('documents:setGroup', docId, groupId),
    removeGroup: (docId) => ipcRenderer.invoke('documents:removeGroup', docId),
    // Recap status
    updateRecapStatus: (docId, isRecap, responseReceived) => ipcRenderer.invoke('documents:updateRecapStatus', docId, isRecap, responseReceived),
    delete: (docId) => ipcRenderer.invoke('documents:delete', docId)
  },

  // Group operations (document linking)
  groups: {
    create: (name, description, color) => ipcRenderer.invoke('groups:create', name, description, color),
    list: () => ipcRenderer.invoke('groups:list'),
    delete: (groupId) => ipcRenderer.invoke('groups:delete', groupId),
    getMembers: (groupId) => ipcRenderer.invoke('groups:getMembers', groupId)
  },

  // Jurisdiction
  jurisdiction: {
    get: () => ipcRenderer.invoke('jurisdiction:get'),
    set: (value) => ipcRenderer.invoke('jurisdiction:set', value)
  },

  // Incident operations
  incidents: {
    list: () => ipcRenderer.invoke('incidents:list'),
    create: (data) => ipcRenderer.invoke('incidents:create', data),
    update: (id, updates) => ipcRenderer.invoke('incidents:update', id, updates),
    delete: (id) => ipcRenderer.invoke('incidents:delete', id)
  },

  // Actor operations
  actors: {
    list: () => ipcRenderer.invoke('actors:list'),
    create: (data) => ipcRenderer.invoke('actors:create', data),
    update: (id, updates) => ipcRenderer.invoke('actors:update', id, updates),
    delete: (id) => ipcRenderer.invoke('actors:delete', id),
    merge: (keepId, mergeId) => ipcRenderer.invoke('actors:merge', keepId, mergeId),
    getAppearances: (id) => ipcRenderer.invoke('actors:getAppearances', id),
    setSelf: (id) => ipcRenderer.invoke('actors:setSelf', id),
    checkDuplicates: () => ipcRenderer.invoke('actors:checkDuplicates'),
    rescan: () => ipcRenderer.invoke('actors:rescan'),
    getForDocument: (docId) => ipcRenderer.invoke('actors:getForDocument', docId),
    addToDocument: (actorId, docId, role) => ipcRenderer.invoke('actors:addToDocument', actorId, docId, role),
    removeFromDocument: (actorId, docId) => ipcRenderer.invoke('actors:removeFromDocument', actorId, docId)
  },

  // Pay record operations
  payRecords: {
    list: () => ipcRenderer.invoke('payRecords:list'),
    create: (data) => ipcRenderer.invoke('payRecords:create', data),
    update: (id, updates) => ipcRenderer.invoke('payRecords:update', id, updates),
    delete: (id) => ipcRenderer.invoke('payRecords:delete', id),
    getForActor: (actorId) => ipcRenderer.invoke('payRecords:getForActor', actorId)
  },

  // Timeline operations
  timeline: {
    get: () => ipcRenderer.invoke('timeline:get'),
    getConnections: () => ipcRenderer.invoke('timeline:getConnections')
  },

  // Precedent analysis
  precedents: {
    analyze: (jurisdiction) => ipcRenderer.invoke('precedents:analyze', jurisdiction),
    getDocumentBadges: (docId) => ipcRenderer.invoke('precedents:getDocumentBadges', docId)
  },

  // Anchors
  anchors: {
    list: (caseId) => ipcRenderer.invoke('anchors:list', caseId),
    generate: (caseId) => ipcRenderer.invoke('anchors:generate', caseId),
    create: (caseId, data) => ipcRenderer.invoke('anchors:create', caseId, data),
    update: (caseId, id, updates) => ipcRenderer.invoke('anchors:update', caseId, id, updates),
    delete: (caseId, id) => ipcRenderer.invoke('anchors:delete', caseId, id),
    linkEvidence: (caseId, anchorId, docId) => ipcRenderer.invoke('anchors:linkEvidence', caseId, anchorId, docId),
    unlinkEvidence: (caseId, anchorId, docId) => ipcRenderer.invoke('anchors:unlinkEvidence', caseId, anchorId, docId),
    getRelatedEvidence: (caseId, anchorId) => ipcRenderer.invoke('anchors:getRelatedEvidence', caseId, anchorId),
    clone: (caseId, anchorId) => ipcRenderer.invoke('anchors:clone', caseId, anchorId),
    reorder: (caseId, orderedIds) => ipcRenderer.invoke('anchors:reorder', caseId, orderedIds),
    linkPrecedent: (caseId, anchorId, precedentId, note) => ipcRenderer.invoke('anchors:linkPrecedent', caseId, anchorId, precedentId, note),
    unlinkPrecedent: (caseId, anchorId, precedentId) => ipcRenderer.invoke('anchors:unlinkPrecedent', caseId, anchorId, precedentId),
    getPrecedents: (caseId, anchorId) => ipcRenderer.invoke('anchors:getPrecedents', caseId, anchorId),
    breakApart: (caseId, anchorId) => ipcRenderer.invoke('anchors:breakApart', caseId, anchorId),
    linkIncident: (caseId, anchorId, incidentId) => ipcRenderer.invoke('anchors:linkIncident', caseId, anchorId, incidentId),
    unlinkIncident: (caseId, anchorId, incidentId) => ipcRenderer.invoke('anchors:unlinkIncident', caseId, anchorId, incidentId),
    linkActor: (caseId, anchorId, actorId, role) => ipcRenderer.invoke('anchors:linkActor', caseId, anchorId, actorId, role),
    unlinkActor: (caseId, anchorId, actorId) => ipcRenderer.invoke('anchors:unlinkActor', caseId, anchorId, actorId)
  },

  // Case context
  context: {
    get: (caseId) => ipcRenderer.invoke('context:get', caseId),
    update: (caseId, updates) => ipcRenderer.invoke('context:update', caseId, updates)
  },

  // File dialog
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles')
  },

  // File utilities (Electron 22+ requires webUtils for drag-and-drop file paths)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Categorizer (incident chain analysis)
  categorizer: {
    categorize: (text, isPrimary) => ipcRenderer.invoke('categorizer:categorize', text, isPrimary),
    buildChain: (entries) => ipcRenderer.invoke('categorizer:buildChain', entries),
    analyzeDocuments: () => ipcRenderer.invoke('categorizer:analyzeDocuments')
  },

  // Debug
  debug: {
    testIngest: () => ipcRenderer.invoke('debug:testIngest')
  }
});
