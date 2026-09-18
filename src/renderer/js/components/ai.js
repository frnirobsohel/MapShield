/**
 * src/renderer/js/components/ai.js
 * Google Gemini AI Review Inspection Tab Component
 */

(function() {
  class AIComponent {
    constructor() {
      this.inputAiKey = document.getElementById('inputAiKey');
      this.selectAiModel = document.getElementById('selectAiModel');
      this.selectAiProvider = document.getElementById('selectAiProvider');
      this.chkAiInspection = document.getElementById('chkAiInspection');
      this.btnSaveAiConfig = document.getElementById('btnSaveAiConfig');
      this.toastAi = document.getElementById('toastAi');

      this.initEvents();
    }

    initEvents() {
      this.btnSaveAiConfig?.addEventListener('click', async () => {
        const config = this.getConfig();
        if (window.desktopAPI?.saveConfig) {
          await window.desktopAPI.saveConfig({
            aiApiKey: config.apiKey,
            aiModel: config.model,
            aiProvider: config.provider,
            aiInspection: config.enabled
          });
        }
        window.AppState.appSettings.aiApiKey = config.apiKey;
        window.AppState.appSettings.aiModel = config.model;
        window.AppState.appSettings.aiEnabled = config.enabled;

        if (window.UIHelpers && this.toastAi) {
          window.UIHelpers.showToast(this.toastAi, 'AI settings saved successfully!', true);
        }
      });
    }

    applyConfig(config = {}) {
      if (this.inputAiKey && config.aiApiKey) this.inputAiKey.value = config.aiApiKey;
      if (this.selectAiModel && config.aiModel) this.selectAiModel.value = config.aiModel;
      if (this.selectAiProvider && config.aiProvider) this.selectAiProvider.value = config.aiProvider;
      if (this.chkAiInspection) this.chkAiInspection.checked = !!config.aiInspection;
    }

    getConfig() {
      return {
        apiKey: this.inputAiKey?.value.trim() || '',
        model: this.selectAiModel?.value || 'gemini-1.5-flash',
        provider: this.selectAiProvider?.value || 'gemini',
        enabled: !!this.chkAiInspection?.checked
      };
    }
  }

  window.AIComponent = AIComponent;
})();
