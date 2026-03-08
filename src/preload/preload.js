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
    current: () => ipcRenderer.invoke('cases:current'),
    rename: (caseId, newName) => ipcRenderer.invoke('cases:rename', caseId, newName)
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
    updateDocumentSubtype: (docId, subtype) => ipcRenderer.invoke('documents:updateDocumentSubtype', docId, subtype),
    delete: (docId) => ipcRenderer.invoke('documents:delete', docId),
    copy: (docId) => ipcRenderer.invoke('documents:copy', docId)
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
    delete: (id) => ipcRenderer.invoke('incidents:delete', id),
    suggest: () => ipcRenderer.invoke('incidents:suggest'),
    reclassify: () => ipcRenderer.invoke('incidents:reclassify')
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
    removeFromDocument: (actorId, docId) => ipcRenderer.invoke('actors:removeFromDocument', actorId, docId),
    // Actor registry methods
    getRelationshipTypes: () => ipcRenderer.invoke('actors:getRelationshipTypes'),
    resolveFromText: (text, confirmedIds) => ipcRenderer.invoke('actors:resolveFromText', text, confirmedIds),
    findInText: (text) => ipcRenderer.invoke('actors:findInText', text),
    getChain: () => ipcRenderer.invoke('actors:getChain'),
    getSummary: () => ipcRenderer.invoke('actors:getSummary')
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

  // Events
  events: {
    list: (caseId) => ipcRenderer.invoke('events:list', caseId),
    generate: (caseId) => ipcRenderer.invoke('events:generate', caseId),
    create: (caseId, data) => ipcRenderer.invoke('events:create', caseId, data),
    update: (caseId, id, updates) => ipcRenderer.invoke('events:update', caseId, id, updates),
    delete: (caseId, id) => ipcRenderer.invoke('events:delete', caseId, id),
    linkEvidence: (caseId, eventId, docId) => ipcRenderer.invoke('events:linkEvidence', caseId, eventId, docId),
    unlinkEvidence: (caseId, eventId, docId) => ipcRenderer.invoke('events:unlinkEvidence', caseId, eventId, docId),
    getRelatedEvidence: (caseId, eventId) => ipcRenderer.invoke('events:getRelatedEvidence', caseId, eventId),
    clone: (caseId, eventId) => ipcRenderer.invoke('events:clone', caseId, eventId),
    reorder: (caseId, orderedIds) => ipcRenderer.invoke('events:reorder', caseId, orderedIds),
    linkPrecedent: (caseId, eventId, precedentId, note) => ipcRenderer.invoke('events:linkPrecedent', caseId, eventId, precedentId, note),
    unlinkPrecedent: (caseId, eventId, precedentId) => ipcRenderer.invoke('events:unlinkPrecedent', caseId, eventId, precedentId),
    getPrecedents: (caseId, eventId) => ipcRenderer.invoke('events:getPrecedents', caseId, eventId),
    breakApart: (caseId, eventId) => ipcRenderer.invoke('events:breakApart', caseId, eventId),
    linkIncident: (caseId, eventId, incidentId, eventRole) => ipcRenderer.invoke('events:linkIncident', caseId, eventId, incidentId, eventRole),
    unlinkIncident: (caseId, eventId, incidentId) => ipcRenderer.invoke('events:unlinkIncident', caseId, eventId, incidentId),
    linkActor: (caseId, eventId, actorId, role) => ipcRenderer.invoke('events:linkActor', caseId, eventId, actorId, role),
    unlinkActor: (caseId, eventId, actorId) => ipcRenderer.invoke('events:unlinkActor', caseId, eventId, actorId),
    linkDocumentV2: (caseId, eventId, docId, relevanceV2) => ipcRenderer.invoke('events:linkDocumentV2', caseId, eventId, docId, relevanceV2),
    setDocumentWeight: (caseId, eventId, docId, weight) => ipcRenderer.invoke('events:setDocumentWeight', caseId, eventId, docId, weight)
  },

  // Event Tags
  eventTags: {
    set: (eventId, tags) => ipcRenderer.invoke('eventTags:set', eventId, tags),
    listAll: () => ipcRenderer.invoke('eventTags:listAll'),
    suggest: (eventId) => ipcRenderer.invoke('eventTags:suggest', eventId)
  },

  // Event Links (Causality)
  eventLinks: {
    list: () => ipcRenderer.invoke('eventLinks:list'),
    create: (data) => ipcRenderer.invoke('eventLinks:create', data),
    delete: (linkId) => ipcRenderer.invoke('eventLinks:delete', linkId),
    suggest: () => ipcRenderer.invoke('eventLinks:suggest')
  },

  // Incident Events
  incidentEvents: {
    list: (incidentId) => ipcRenderer.invoke('incidentEvents:list', incidentId),
    link: (incidentId, eventId, eventRole) => ipcRenderer.invoke('incidentEvents:link', incidentId, eventId, eventRole),
    unlink: (incidentId, eventId) => ipcRenderer.invoke('incidentEvents:unlink', incidentId, eventId)
  },

  // Damages
  damages: {
    list: () => ipcRenderer.invoke('damages:list'),
    create: (data) => ipcRenderer.invoke('damages:create', data),
    update: (id, updates) => ipcRenderer.invoke('damages:update', id, updates),
    delete: (id) => ipcRenderer.invoke('damages:delete', id)
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

  // Settings (secure backend storage)
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },

  // Context Documents (policy library)
  contextDocs: {
    list: () => ipcRenderer.invoke('contextDocs:list'),
    ingest: (data) => ipcRenderer.invoke('contextDocs:ingest', data),
    ingestFile: (data) => ipcRenderer.invoke('contextDocs:ingestFile', data),
    delete: (docId) => ipcRenderer.invoke('contextDocs:delete', docId),
    toggleActive: (docId, isActive) => ipcRenderer.invoke('contextDocs:toggleActive', docId, isActive),
    get: (docId) => ipcRenderer.invoke('contextDocs:get', docId),
    search: (query) => ipcRenderer.invoke('contextDocs:search', query),
    signalsSummary: () => ipcRenderer.invoke('contextDocs:signalsSummary'),
    types: () => ipcRenderer.invoke('contextDocs:types')
  },

  // Assessor (document assessment engine)
  assessor: {
    assess: (data) => ipcRenderer.invoke('assessor:assess', data),
    expandFlag: (data) => ipcRenderer.invoke('assessor:expandFlag', data),
    deepAnalysis: (data) => ipcRenderer.invoke('assessor:deepAnalysis', data),
    inputTypes: () => ipcRenderer.invoke('assessor:inputTypes')
  },

  // Debug
  debug: {
    testIngest: () => ipcRenderer.invoke('debug:testIngest')
  }
});
