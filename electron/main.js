const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Ensure production user data directory & packaged state are set before initializing database or submodules
if (!process.env.MAPSSHIELD_USER_DATA) {
  process.env.MAPSSHIELD_USER_DATA = app.getPath('userData');
}
process.env.MAPSSHIELD_PACKAGED = app.isPackaged ? 'true' : 'false';

const { getDatabase } = require(path.join(__dirname, '../database/db'));
const {
  registerAllIpcHandlers,
  prewarmHardwareId,
  detectInstalledBrowsers,
  killActiveAgentProcess
} = require('./ipc');

// Lazy loader for XLSX to eliminate startup delay
let _xlsx = null;
function getXLSX() {
  if (!_xlsx) {
    _xlsx = require('xlsx');
  }
  return _xlsx;
}

// Suppress internal Chromium C++ engine logging from leaking into launcher console
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('disable-logging');
// Performance switches for smooth hardware acceleration & zero-copy rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 870,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    backgroundColor: '#070a10',
    title: 'MapsShield Pro - Google Maps Review Reporter',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Register all modular IPC controllers
  registerAllIpcHandlers({
    mainWindow,
    app,
    getDatabase,
    getXLSX
  });

  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Reveal window smoothly when the initial DOM is painted (zero white flash)
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Safety fallback: guarantee window visibility even on slow/busy machines
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1200);

  mainWindow.on('closed', () => {
    killActiveAgentProcess();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Security Hardening: Enforce Content-Security-Policy on all renderer web requests
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: file:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.deepseek.com;"
        ]
      }
    });
  });

  createWindow();

  // Background non-blocking pre-warming of caches so initial renderer IPCs respond in 0ms
  setTimeout(() => {
    prewarmHardwareId().catch(() => {});
    detectInstalledBrowsers();
  }, 80);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
