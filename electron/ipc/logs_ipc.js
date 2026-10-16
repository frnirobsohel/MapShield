/**
 * electron/ipc/logs_ipc.js
 * IPC Controller for Diagnostic Report Logs, Screenshots, HTML Dumps & AI Exports
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const {
  getAllReportLogs,
  clearReportLogs,
  getReportHtmlContent,
  exportDiagnosticBundle,
  REPORT_LOGS_DIR
} = require(path.join(__dirname, '../../modules/helpers/screenshot_paths'));

const os = require('os');
const {
  PROJECT_REPORT_LOGS_DIR
} = require(path.join(__dirname, '../../modules/helpers/screenshot_paths'));

/**
 * Validates that requested file path stays strictly within allowed report logs roots
 */
function isSafeReportPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const resolved = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(__dirname, '../../', targetPath);

  const normResolved = resolved.toLowerCase();
  const allowedRoots = [
    REPORT_LOGS_DIR,
    PROJECT_REPORT_LOGS_DIR,
    os.tmpdir()
  ].filter(Boolean).map(r => path.resolve(r).toLowerCase());

  return allowedRoots.some(root => normResolved.startsWith(root));
}

function registerLogsIpc({ mainWindow }) {
  // 1. Fetch all report logs and summary statistics
  ipcMain.handle('logs:getAll', async () => {
    try {
      const data = getAllReportLogs();
      return { success: true, ...data };
    } catch (err) {
      return { success: false, error: err.message, logs: [], summary: { total: 0, errors: 0, proofs: 0, totalSizeBytes: 0, formattedTotalSize: '0 B' } };
    }
  });

  // 2. Clear logs (all, errors only, or proofs only)
  ipcMain.handle('logs:clear', async (_event, type = 'all') => {
    try {
      const result = clearReportLogs(type);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 3. Export diagnostic package bundle for AI debugging
  ipcMain.handle('logs:export', async () => {
    try {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultFilename = `MapsShield_AI_Diagnostics_${dateStr}.zip`;

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export AI Diagnostic Package (ZIP)',
        defaultPath: defaultFilename,
        filters: [{ name: 'ZIP Archive (*.zip)', extensions: ['zip'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory']
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      const exportRes = await exportDiagnosticBundle(result.filePath);
      return { success: true, filePath: exportRes.path };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 4. Open specific file or folder in system viewer (reveals file directly in Explorer)
  ipcMain.handle('logs:openItem', async (_event, targetPath) => {
    try {
      if (!targetPath) {
        await shell.openPath(REPORT_LOGS_DIR);
        return { success: true };
      }

      if (!isSafeReportPath(targetPath)) {
        return { success: false, error: 'Access denied: path is outside report directory' };
      }

      const resolved = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(__dirname, '../../', targetPath);

      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isFile()) {
          shell.showItemInFolder(resolved);
        } else {
          await shell.openPath(resolved);
        }
      } else {
        // Fallback to parent dir or root report_logs
        const parentDir = path.dirname(resolved);
        if (fs.existsSync(parentDir) && isSafeReportPath(parentDir)) {
          await shell.openPath(parentDir);
        } else {
          await shell.openPath(REPORT_LOGS_DIR);
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 5. Read HTML snapshot content for inline inspection
  ipcMain.handle('logs:getHtml', async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'Path is required' };
      if (!isSafeReportPath(targetPath)) {
        return { success: false, error: 'Access denied: path is outside report directory' };
      }

      const resolved = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(__dirname, '../../', targetPath);

      if (path.extname(resolved).toLowerCase() !== '.html') {
        return { success: false, error: 'Access denied: only .html files may be inspected' };
      }

      return getReportHtmlContent(resolved);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 6. Read image as Base64 Data-URL for 100% reliable lightbox viewing (bypasses Electron file: restrictions)
  ipcMain.handle('logs:getImageBase64', async (_event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: 'Path is required' };
      if (!isSafeReportPath(targetPath)) {
        return { success: false, error: 'Access denied: path is outside report directory' };
      }

      const resolved = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(__dirname, '../../', targetPath);

      const ext = path.extname(resolved).toLowerCase().replace('.', '');
      const allowedExts = ['png', 'jpg', 'jpeg', 'webp'];
      if (!allowedExts.includes(ext)) {
        return { success: false, error: 'Access denied: invalid image format' };
      }

      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'Screenshot file does not exist' };
      }

      const buffer = fs.readFileSync(resolved);
      const mime = ext === 'webp' ? 'image/webp' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png');
      return {
        success: true,
        base64: `data:${mime};base64,${buffer.toString('base64')}`
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerLogsIpc
};

