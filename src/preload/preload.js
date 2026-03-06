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
    getContent: (docId) => ipcRenderer.invoke('documents:getContent', docId)
  },

  // Timeline operations
  timeline: {
    get: () => ipcRenderer.invoke('timeline:get'),
    getConnections: () => ipcRenderer.invoke('timeline:getConnections')
  },

  // File dialog
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles')
  },

  // File utilities (Electron 22+ requires webUtils for drag-and-drop file paths)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Debug
  debug: {
    testIngest: () => ipcRenderer.invoke('debug:testIngest')
  }
});
