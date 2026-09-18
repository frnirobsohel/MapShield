const path = require('path');
const fs = require('fs');

/**
 * SessionManager
 * Manages browser persistent session storage directories and cleanup.
 */
class SessionManager {
  constructor(defaultBaseDir = null) {
    this.defaultBaseDir = defaultBaseDir || path.resolve(__dirname, '../..');
  }

  /**
   * Resolves the full path of a session folder.
   * @param {string} [sessionName='chrome_session']
   * @param {string} [baseDir]
   * @returns {string} Absolute path
   */
  get_session_path(sessionName = 'chrome_session', baseDir = null) {
    const root = baseDir || this.defaultBaseDir;
    return path.join(root, sessionName);
  }

  /**
   * Checks whether a session directory currently exists.
   * @param {string} [sessionName='chrome_session']
   * @param {string} [baseDir]
   * @returns {boolean}
   */
  has_session(sessionName = 'chrome_session', baseDir = null) {
    const sessionPath = this.get_session_path(sessionName, baseDir);
    return fs.existsSync(sessionPath);
  }

  /**
   * Creates or initializes a persistent session directory.
   * @param {string} [sessionName='chrome_session'] Name or subpath of session directory
   * @param {string} [baseDir] Optional root directory
   * @returns {{ sessionPath: string, isNew: boolean, exists: boolean }}
   */
  create_session(sessionName = 'chrome_session', baseDir = null) {
    const sessionPath = this.get_session_path(sessionName, baseDir);
    const exists = fs.existsSync(sessionPath);

    if (!exists) {
      fs.mkdirSync(sessionPath, { recursive: true });
      return { sessionPath, isNew: true, exists: true };
    }

    return { sessionPath, isNew: false, exists: true };
  }

  /**
   * Destroys / deletes a persistent session directory.
   * @param {string} [sessionName='chrome_session'] Name of session directory
   * @param {string} [baseDir] Optional root directory
   * @returns {Promise<{ success: boolean, sessionPath: string, error?: string }>}
   */
  async destroy_session(sessionName = 'chrome_session', baseDir = null) {
    const sessionPath = this.get_session_path(sessionName, baseDir);

    if (!fs.existsSync(sessionPath)) {
      return { success: true, sessionPath, message: 'Session did not exist' };
    }

    // Windows sometimes holds file handles for a brief moment; retry if needed
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        return { success: true, sessionPath };
      } catch (err) {
        lastError = err;
        attempts++;
        await new Promise(r => setTimeout(r, 250));
      }
    }

    return {
      success: false,
      sessionPath,
      error: lastError ? lastError.message : 'Failed to delete session directory'
    };
  }
}

module.exports = SessionManager;
