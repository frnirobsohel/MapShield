/**
 * electron/ipc/agent_ipc.js
 * IPC Controller for Agent Runner Child Process, Sessions & Audit Logs
 */

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let activeAgentProcess = null;

function killActiveAgentProcess() {
  if (activeAgentProcess) {
    try {
      if (activeAgentProcess.connected) {
        activeAgentProcess.send({ type: 'stop' });
      }
    } catch (e) {}
    const proc = activeAgentProcess;
    activeAgentProcess = null;
    setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch (e) {}
    }, 1200);
  }
}

function registerAgentIpc({ mainWindow, app, getDatabase }) {
  // IPC: Clear Session (cleans both legacy and isolated account sessions)
  ipcMain.handle('session:clear', async () => {
    try {
      const sessionDir = path.join(app.getAppPath(), 'chrome_session');
      const multiSessionsDir = path.join(app.getAppPath(), 'chrome_sessions');
      let cleared = false;

      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        cleared = true;
      }
      if (fs.existsSync(multiSessionsDir)) {
        fs.rmSync(multiSessionsDir, { recursive: true, force: true });
        cleared = true;
      }

      if (cleared) {
        return { success: true, message: 'All Chrome account sessions cleared successfully.' };
      }
      return { success: true, message: 'No existing session found to clear.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Check Session Status
  ipcMain.handle('session:status', async () => {
    const sessionDir = path.join(app.getAppPath(), 'chrome_session');
    const multiSessionsDir = path.join(app.getAppPath(), 'chrome_sessions');
    const hasSession = fs.existsSync(sessionDir) || (fs.existsSync(multiSessionsDir) && fs.readdirSync(multiSessionsDir).length > 0);
    return { hasSession };
  });

  // IPC: Start Agent Runner
  ipcMain.handle('agent:start', async (event, options) => {
    if (activeAgentProcess) {
      return { success: false, error: 'An agent task is already actively running.' };
    }

    const runnerScript = path.join(app.getAppPath(), 'agent_runner.js');

    try {
      activeAgentProcess = fork(runnerScript, [], {
        cwd: app.getAppPath(),
        env: {
          ...process.env,
          AGENT_PAYLOAD: JSON.stringify(options)
        },
        silent: true
      });

      activeAgentProcess.stdout.on('data', (data) => {
        const text = data.toString();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:log', text, false);
        }
      });

      activeAgentProcess.stderr.on('data', (data) => {
        const text = data.toString();
        if (/cache_util_win\.cc|disk_cache\.cc|gpu_disk_cache\.cc|device_event_log|gl_surface|metrics_service|ExperimentalWarning|trace-warnings/i.test(text)) {
          return;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:log', text, true);
        }
      });

      activeAgentProcess.on('message', (msg) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (msg.type === 'progress') {
            mainWindow.webContents.send('agent:progress', msg.data);
          } else if (msg.type === 'screenshot') {
            mainWindow.webContents.send('agent:screenshot', msg.data);
          } else if (msg.type === 'status') {
            mainWindow.webContents.send('agent:status', msg.data);
          } else if (msg.type === 'account_update') {
            try {
              const db = getDatabase();
              db.updateAccountStatus(msg.data.email, msg.data);
            } catch (e) {
              console.warn('[SQLite] account_update error:', e.message);
            }
            mainWindow.webContents.send('account:update', msg.data);
          } else if (msg.type === 'link_update') {
            try {
              const db = getDatabase();
              db.updateLinkProgress(msg.data.url, msg.data);
            } catch (e) {
              console.warn('[SQLite] link_update error:', e.message);
            }
            mainWindow.webContents.send('link:update', msg.data);
          }
        }
      });

      activeAgentProcess.on('exit', (code) => {
        activeAgentProcess = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:finished', { code });
        }
      });

      return { success: true };
    } catch (err) {
      activeAgentProcess = null;
      return { success: false, error: err.message };
    }
  });

  // IPC: Stop Agent Runner
  ipcMain.handle('agent:stop', async () => {
    if (activeAgentProcess) {
      try {
        if (activeAgentProcess.connected) {
          activeAgentProcess.send({ type: 'stop' });
        }
        const proc = activeAgentProcess;
        activeAgentProcess = null;
        setTimeout(() => {
          try { proc.kill('SIGTERM'); } catch (e) {}
        }, 1200);
        return { success: true, message: 'Agent stopping command sent.' };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: true, message: 'No active agent to stop.' };
  });

  // IPC: Get Report Audit History from SQLite
  ipcMain.handle('audit:get', async (event, limit = 100) => {
    try {
      const db = getDatabase();
      const logs = db.getAuditLogs(limit);
      return { success: true, logs };
    } catch (err) {
      return { success: false, error: err.message, logs: [] };
    }
  });
}

module.exports = {
  registerAgentIpc,
  killActiveAgentProcess
};
