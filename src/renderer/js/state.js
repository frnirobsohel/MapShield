/**
 * src/renderer/js/state.js
 * Centralized Application State & Event Dispatcher
 */

window.AppState = {
  // Core Entities
  loadedAccounts: [],
  loadedProxies: [],
  loadedLinks: [],
  installedBrowsers: [],
  appSettings: {
    browserPath: '',
    reportMode: 'standard',
    reportReason: 'spam',
    proxyMode: 'off',
    aiEnabled: false,
    aiApiKey: '',
    aiModel: 'gemini-1.5-flash'
  },

  // Execution & UI Flags
  isAgentRunning: false,
  currentActiveTab: 'tab-dashboard',
  accountsTableDirty: true,
  proxiesTableDirty: true,
  linksTableDirty: true,
  aboutTabDirty: true,

  // Event callbacks registry for cross-component reactive updates
  _listeners: {},
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  },
  emit(event, data) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error('AppState event error:', e); }
      });
    }
  }
};
