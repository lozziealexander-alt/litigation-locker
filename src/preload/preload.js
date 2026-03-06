const { contextBridge, ipcRenderer } = require('electron');

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
    open: (caseId) => ipcRenderer.invoke('cases:open', caseId)
  },

  // Document operations (will be expanded in Session 1)
  documents: {
    ingest: (filePaths, caseId) => ipcRenderer.invoke('documents:ingest', filePaths, caseId),
    list: (caseId) => ipcRenderer.invoke('documents:list', caseId),
    get: (docId, caseId) => ipcRenderer.invoke('documents:get', docId, caseId)
  },

  // Timeline operations (will be expanded in Session 2)
  timeline: {
    get: (caseId) => ipcRenderer.invoke('timeline:get', caseId),
    getConnections: (caseId) => ipcRenderer.invoke('timeline:getConnections', caseId)
  }
});
