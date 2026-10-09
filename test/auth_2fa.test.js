const test = require('node:test');
const assert = require('node:assert');
const {
  generateTOTP,
  isValidSecret,
  isActualBackupCodePage,
  isActualTotpPage,
  ensureGoogleLoggedIn,
  detectCurrentPageStatus
} = require('../modules/auth');

test('totp: validates base32 secrets correctly', () => {
  assert.strictEqual(isValidSecret('JBSWY3DPEHPK3PXP'), true);
  assert.strictEqual(isValidSecret('jbswy3dpehpk3pxp'), true);
  assert.strictEqual(isValidSecret(''), false);
  assert.strictEqual(isValidSecret(null), false);
  assert.strictEqual(isValidSecret('1234'), false);
});

test('totp: generates 6-digit TOTP code accurately', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const code = generateTOTP(secret);
  assert.ok(typeof code === 'string');
  assert.strictEqual(code.length, 6);
  assert.ok(/^\d{6}$/.test(code));
});

test('auth: ensureGoogleLoggedIn is exported as an async function', () => {
  assert.strictEqual(typeof ensureGoogleLoggedIn, 'function');
});

test('auth: detectCurrentPageStatus identifies recovery SETUP interstitial (Cancel, not fill)', async () => {
  const mockPage = {
    url: () => 'https://accounts.google.com/v3/signin/recoveryoptions',
    evaluate: async (fn, ...args) => {
      const mockDocument = {
        querySelector: () => null,
        querySelectorAll: (sel) => {
          if (String(sel).includes('button')) {
            return [
              { innerText: 'Cancel', textContent: 'Cancel', getAttribute: () => '', scrollIntoView: () => {}, click: () => {} },
              { innerText: 'Save', textContent: 'Save', getAttribute: () => '', scrollIntoView: () => {}, click: () => {} }
            ];
          }
          return [];
        },
        body: {
          innerText: 'Make sure that you can always sign in\nYour recovery info is used to reach you\nYour recovery phone\nAdd a recovery email\nCancel\nSave'
        }
      };
      const mockWindow = { location: { href: 'https://accounts.google.com/v3/signin/recoveryoptions' } };
      const prevDoc = global.document;
      const prevWin = global.window;
      global.document = mockDocument;
      global.window = mockWindow;
      try {
        return await fn(...args);
      } finally {
        global.document = prevDoc;
        global.window = prevWin;
      }
    }
  };

  const status = await detectCurrentPageStatus(mockPage, 'fgbggrt@gmail.com');
  assert.strictEqual(status.type, 'RECOVERY_SETUP_PROMPT');
});

test('auth: recovery SETUP must not be classified as RECOVERY_EMAIL_CHALLENGE', async () => {
  // Page has "Add a recovery email" text input but Cancel — must be setup skip, not 2FA confirm
  const mockPage = {
    url: () => 'https://accounts.google.com/v3/signin/recoveryoptions',
    evaluate: async (fn, ...args) => {
      const mockDocument = {
        querySelector: (sel) => {
          // No knowledgePreregisteredEmailResponse (2FA confirm field)
          if (String(sel).includes('knowledgePreregisteredEmailResponse')) return null;
          if (String(sel).includes('input[type="text"]') || String(sel).includes('type="email"')) return {};
          return null;
        },
        querySelectorAll: (sel) => {
          if (String(sel).includes('button')) {
            return [
              { innerText: 'Cancel', textContent: 'Cancel', getAttribute: () => '' },
              { innerText: 'Save', textContent: 'Save', getAttribute: () => '' }
            ];
          }
          return [];
        },
        body: {
          innerText: 'Make sure that you can always sign in Add a recovery email Your recovery phone Cancel Save'
        }
      };
      const mockWindow = { location: { href: mockPage.url() } };
      const prevDoc = global.document;
      const prevWin = global.window;
      global.document = mockDocument;
      global.window = mockWindow;
      try {
        return await fn(...args);
      } finally {
        global.document = prevDoc;
        global.window = prevWin;
      }
    }
  };

  const status = await detectCurrentPageStatus(mockPage, 'user@gmail.com');
  assert.strictEqual(status.type, 'RECOVERY_SETUP_PROMPT');
  assert.notStrictEqual(status.type, 'RECOVERY_EMAIL_CHALLENGE');
});
