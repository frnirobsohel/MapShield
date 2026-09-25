/**
 * src/renderer/js/components/captcha.js
 * CAPTCHA Auto-Solver UI Component (2Captcha, Anti-Captcha, CapMonster)
 */

(function() {
  class CaptchaComponent {
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
      // Toggle Password Visibility
      this.btnToggleCaptchaKey?.addEventListener('click', () => {
        if (!this.inputCaptchaKey) return;
        const isPass = this.inputCaptchaKey.type === 'password';
        this.inputCaptchaKey.type = isPass ? 'text' : 'password';
      });

      // Provider Switcher
      this.selectCaptchaProvider?.addEventListener('change', () => {
        this.updateLabelsForProvider(this.selectCaptchaProvider.value);
      });

      // Save Config Button
      this.btnSaveCaptcha?.addEventListener('click', async () => {
        const config = this.getConfig();
        if (window.desktopAPI?.saveConfig) {
          await window.desktopAPI.saveConfig({
            captchaApiKey: config.apiKey,
            captchaProvider: config.provider,
            captchaAutoSolve: config.autoSolve
          });
        }
        if (window.AppState?.appSettings) {
          window.AppState.appSettings.captchaApiKey = config.apiKey;
          window.AppState.appSettings.captchaProvider = config.provider;
          window.AppState.appSettings.captchaAutoSolve = config.autoSolve;
        }

        this.showToast('CAPTCHA solver settings saved successfully!', true);
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
