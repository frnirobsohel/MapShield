/**
 * src/renderer/js/utils/helpers.js
 * Frontend UI Helpers & Formatters
 */

window.UIHelpers = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  showToast(elem, msg, isSuccess = true) {
    if (!elem) return;
    elem.textContent = msg;
    elem.style.display = 'block';
    elem.className = isSuccess ? 'toast-success' : 'toast-error';
    clearTimeout(elem._toastTimer);
    elem._toastTimer = setTimeout(() => {
      elem.style.display = 'none';
    }, 4000);
  },

  formatTime(val = new Date()) {
    if (!val) return '—';
    const d = val instanceof Date ? val : new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return String(val);
  }
};
