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
  // IPC: Clear Session (cleans both userData and project account sessions)
  ipcMain.handle('session:clear', async () => {
    try {
      const targetDirs = [
        path.join(app.getPath('userData'), 'chrome_session'),
        path.join(app.getPath('userData'), 'chrome_sessions'),
        path.join(app.getPath('userData'), 'cache'),
        path.join(app.getAppPath(), 'chrome_session'),
        path.join(app.getAppPath(), 'chrome_sessions')
      ];
      let cleared = false;

      for (const dir of targetDirs) {
        if (fs.existsSync(dir)) {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
            cleared = true;
          } catch (_) {}
        }
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
    const checkDirs = [
      path.join(app.getPath('userData'), 'chrome_session'),
      path.join(app.getPath('userData'), 'chrome_sessions'),
      path.join(app.getAppPath(), 'chrome_session'),
      path.join(app.getAppPath(), 'chrome_sessions')
    ];
    let hasSession = false;
    for (const dir of checkDirs) {
      if (fs.existsSync(dir)) {
        try {
          if (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0) {
            hasSession = true;
            break;
          }
        } catch (_) {}
      }
    }
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
          MAPSSHIELD_USER_DATA: app.getPath('userData')
        },
        silent: true
      });

      // High-speed native IPC transfer to bypass Windows OS env block size limits & prevent memory dumping
      activeAgentProcess.send({ type: 'init_payload', payload: options });

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
          } else if (msg.type === 'account_backup_codes_updated') {
            // Child already persisted remaining codes — notify UI only
            mainWindow.webContents.send('account:update', {
              email: msg.email,
              backupCode: msg.remainingBackupCodes
            });
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
