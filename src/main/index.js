const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipc-handlers');
const { terminateOcr } = require('./ingest/ocr-engine');

// Prevent EPIPE crashes from console.log when stdout pipe is broken
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  });

  // In development, load from dev server
  if (process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.log('[STARTUP] userData:', app.getPath('userData'));
  console.log('[STARTUP] app name:', app.getName());
  try {
    registerIpcHandlers();
    console.log('[STARTUP] IPC handlers registered successfully');
  } catch (err) {
    console.error('[STARTUP] FATAL: Failed to register IPC handlers:', err);
    dialog.showErrorBox(
      'Startup Error',
      'Failed to register IPC handlers. The app may not work correctly.\n\n' + err.message
    );
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup OCR worker on quit
app.on('will-quit', async () => {
  await terminateOcr();
});

// Security: Prevent navigation to external URLs (allow file: for local loads)
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    // Block all navigations — drops are handled by the renderer's JS, not navigation
    event.preventDefault();
  });

  // Prevent new windows from opening
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
