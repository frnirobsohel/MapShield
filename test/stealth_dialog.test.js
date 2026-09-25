const test = require('node:test');
const assert = require('node:assert');
const { attachDialogAutoHandler, applyDeepStealth } = require('../modules/helpers/stealth');

test('stealth: attachDialogAutoHandler is exported as a function', () => {
  assert.strictEqual(typeof attachDialogAutoHandler, 'function');
});

test('stealth: attachDialogAutoHandler auto-accepts native beforeunload dialog ("Leave site?")', async () => {
  let accepted = false;
  let eventHandler = null;

  // Mock page object
  const mockPage = {
    on: (evt, handler) => {
      if (evt === 'dialog') {
        eventHandler = handler;
      }
    }
  };

  attachDialogAutoHandler(mockPage);
  assert.ok(mockPage.__dialogHandlerAttached, 'Flag should be set');
  assert.ok(typeof eventHandler === 'function', 'Dialog handler must be registered');

  // Simulate native "Leave site?" beforeunload dialog
  const mockDialog = {
    type: () => 'beforeunload',
    message: () => 'Changes that you made may not be saved.',
    accept: async () => {
      accepted = true;
    },
    dismiss: async () => {}
  };

  await eventHandler(mockDialog);
  assert.strictEqual(accepted, true, 'dialog.accept() must be called to click "Leave" automatically');
});

test('stealth: applyDeepStealth attaches dialog handler to page', async () => {
  const mockPage = {
    evaluateOnNewDocument: async () => {},
    on: () => {}
  };

  await applyDeepStealth(mockPage);
  assert.strictEqual(mockPage.__dialogHandlerAttached, true);
});
