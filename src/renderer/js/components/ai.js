/**
 * src/renderer/js/components/ai.js
 * Multi-Provider AI (Gemini, ChatGPT, Claude, DeepSeek) Tab Component
 */

(function() {
  class AIComponent {
    constructor() {
      this.inputAiKey = document.getElementById('inputAiKey');
      this.selectAiModel = document.getElementById('selectAiModel');
      this.selectAiProvider = document.getElementById('selectAiProvider');
      this.chkAiInspection = document.getElementById('checkAiInspection') || document.getElementById('chkAiInspection');
      this.btnSaveAi = document.getElementById('btnSaveAi') || document.getElementById('btnSaveAiConfig');
      this.toastAi = document.getElementById('aiToast') || document.getElementById('toastAi');
      this.labelAiKey = document.getElementById('labelAiKey');
      this.aiBadge = document.getElementById('aiBadge');
      this.btnToggleAiKey = document.getElementById('btnToggleAiKey');
      // Eye toggle / provider / save listeners live in app.js only —
      // duplicate handlers previously cancelled API key reveal on one click.
    }

    updateModelsForProvider(provider) {
      if (!this.selectAiModel) return;
      this.selectAiModel.innerHTML = '';
      let models = [];

      if (provider === 'gemini') {
        if (this.labelAiKey) this.labelAiKey.textContent = 'Google Gemini API Key';
        if (this.aiBadge) { this.aiBadge.textContent = 'Gemini Powered'; this.aiBadge.className = 'badge badge-purple'; }
        models = [
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fastest & Recommended)' },
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
        ];
      } else if (provider === 'openai') {
        if (this.labelAiKey) this.labelAiKey.textContent = 'OpenAI API Key';
        if (this.aiBadge) { this.aiBadge.textContent = 'ChatGPT Powered'; this.aiBadge.className = 'badge badge-emerald'; }
        models = [
          { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fastest)' }
        ];
      } else if (provider === 'anthropic') {
        if (this.labelAiKey) this.labelAiKey.textContent = 'Anthropic API Key';
        if (this.aiBadge) { this.aiBadge.textContent = 'Claude Powered'; this.aiBadge.className = 'badge badge-amber'; }
        models = [
          { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Recommended)' },
          { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
        ];
      } else if (provider === 'deepseek') {
        if (this.labelAiKey) this.labelAiKey.textContent = 'DeepSeek API Key';
        if (this.aiBadge) { this.aiBadge.textContent = 'DeepSeek Powered'; this.aiBadge.className = 'badge badge-blue'; }
        models = [
          { value: 'deepseek-chat', label: 'DeepSeek Chat (Recommended)' },
          { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
        ];
      }

      models.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        if (idx === 0) opt.selected = true;
        this.selectAiModel.appendChild(opt);
      });
    }

    applyConfig(config = {}) {
      if (this.selectAiProvider && config.aiProvider) {
        this.selectAiProvider.value = config.aiProvider;
        this.updateModelsForProvider(config.aiProvider);
      }
      if (this.inputAiKey && config.aiApiKey) this.inputAiKey.value = config.aiApiKey;
      if (this.selectAiModel && config.aiModel) this.selectAiModel.value = config.aiModel;
      if (this.chkAiInspection) this.chkAiInspection.checked = !!config.aiInspection;
    }

    getConfig() {
      return {
        apiKey: this.inputAiKey?.value.trim() || '',
        model: this.selectAiModel?.value || 'gemini-2.0-flash',
        provider: this.selectAiProvider?.value || 'gemini',
        enabled: !!this.chkAiInspection?.checked
      };
    }

    showToast(msg, isSuccess = true) {
      if (!this.toastAi) return;
      this.toastAi.textContent = msg;
      this.toastAi.className = 'toast-msg ' + (isSuccess ? 'success' : 'error');
      setTimeout(() => { if (this.toastAi) this.toastAi.textContent = ''; }, 4500);
    }
  }

  window.AIComponent = AIComponent;
})();
