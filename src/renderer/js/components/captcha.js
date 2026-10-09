/**
 * src/renderer/js/components/captcha.js
 * CAPTCHA Auto-Solver UI Component (2Captcha, Anti-Captcha, CapMonster)
 */

(function() {
  class CaptchaComponent {
    static ICON_EYE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    static ICON_EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    constructor() {
      this.selectCaptchaProvider = document.getElementById('selectCaptchaProvider');
      this.inputCaptchaKey = document.getElementById('inputCaptchaKey');
      this.checkCaptchaAutoSolve = document.getElementById('checkCaptchaAutoSolve');
      this.btnSaveCaptcha = document.getElementById('btnSaveCaptcha');
      this.btnToggleCaptchaKey = document.getElementById('btnToggleCaptchaKey');
      this.toastCaptcha = document.getElementById('captchaToast');
      this.labelCaptchaKey = document.getElementById('labelCaptchaKey');
      this.captchaBadge = document.getElementById('captchaBadge');

      this.initEvents();
    }

    initEvents() {
      // Toggle Password Visibility (+ sync eye icon)
      this.btnToggleCaptchaKey?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.inputCaptchaKey) return;
        const isPass = this.inputCaptchaKey.type === 'password';
        this.inputCaptchaKey.type = isPass ? 'text' : 'password';
        this.btnToggleCaptchaKey.innerHTML = this.inputCaptchaKey.type === 'password'
          ? CaptchaComponent.ICON_EYE
          : CaptchaComponent.ICON_EYE_OFF;
        this.btnToggleCaptchaKey.title = this.inputCaptchaKey.type === 'password'
          ? 'Show API key'
          : 'Hide API key';
      });

      // Provider Switcher
      this.selectCaptchaProvider?.addEventListener('change', () => {
        this.updateLabelsForProvider(this.selectCaptchaProvider.value);
      });

      // Save Config Button
      this.btnSaveCaptcha?.addEventListener('click', async () => {
        const config = this.getConfig();
        if (!window.desktopAPI?.saveConfig) {
          this.showToast('Desktop API unavailable — could not save CAPTCHA settings.', false);
          return;
        }
        try {
          const res = await window.desktopAPI.saveConfig({
            captchaApiKey: config.apiKey,
            captchaProvider: config.provider,
            captchaAutoSolve: config.autoSolve
          });
          if (!res || res.success === false) {
            this.showToast('Error: ' + (res?.error || 'Failed to save CAPTCHA settings'), false);
            return;
          }
          if (window.AppState?.appSettings) {
            window.AppState.appSettings.captchaApiKey = config.apiKey;
            window.AppState.appSettings.captchaProvider = config.provider;
            window.AppState.appSettings.captchaAutoSolve = config.autoSolve;
          }
          this.showToast('CAPTCHA solver settings saved successfully!', true);
        } catch (err) {
          this.showToast('Error: ' + (err.message || 'Failed to save CAPTCHA settings'), false);
        }
      });
    }

    updateLabelsForProvider(provider) {
      if (provider === '2captcha') {
        if (this.labelCaptchaKey) this.labelCaptchaKey.textContent = '2Captcha API Key';
        if (this.captchaBadge) {
          this.captchaBadge.textContent = '2Captcha Ready';
          this.captchaBadge.className = 'badge badge-cyan';
        }
      } else if (provider === 'anticaptcha') {
        if (this.labelCaptchaKey) this.labelCaptchaKey.textContent = 'Anti-Captcha API Key';
        if (this.captchaBadge) {
          this.captchaBadge.textContent = 'Anti-Captcha Ready';
          this.captchaBadge.className = 'badge badge-amber';
        }
      } else if (provider === 'capmonster') {
        if (this.labelCaptchaKey) this.labelCaptchaKey.textContent = 'CapMonster API Key';
        if (this.captchaBadge) {
          this.captchaBadge.textContent = 'CapMonster Ready';
          this.captchaBadge.className = 'badge badge-purple';
        }
      }
    }

    applyConfig(config = {}) {
      if (this.selectCaptchaProvider && config.captchaProvider) {
        this.selectCaptchaProvider.value = config.captchaProvider;
        this.updateLabelsForProvider(config.captchaProvider);
      }
      if (this.inputCaptchaKey && config.captchaApiKey) {
        this.inputCaptchaKey.value = config.captchaApiKey;
      }
      if (this.checkCaptchaAutoSolve) {
        this.checkCaptchaAutoSolve.checked = config.captchaAutoSolve !== false;
      }
    }

    getConfig() {
      return {
        apiKey: this.inputCaptchaKey?.value.trim() || '',
        provider: this.selectCaptchaProvider?.value || '2captcha',
        autoSolve: !!this.checkCaptchaAutoSolve?.checked
      };
    }

    showToast(msg, isSuccess = true) {
      if (!this.toastCaptcha) return;
      this.toastCaptcha.textContent = msg;
      this.toastCaptcha.className = 'toast-msg ' + (isSuccess ? 'success' : 'error');
      setTimeout(() => {
        if (this.toastCaptcha) this.toastCaptcha.textContent = '';
      }, 4500);
    }
  }

  window.CaptchaComponent = CaptchaComponent;
})();
