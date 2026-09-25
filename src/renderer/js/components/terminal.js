/**
 * src/renderer/js/components/terminal.js
 * Terminal Logger Component & Lightbox Viewer
 */

(function() {
  const MAX_TERMINAL_LINES = 600;

  class TerminalComponent {
    constructor() {
      this.dashConsoleOutput = document.getElementById('dashConsoleOutput');
      this.controlConsoleOutput = document.getElementById('controlConsoleOutput');
      this.dashAutoScroll = document.getElementById('dashAutoScroll');
      this.controlAutoScroll = document.getElementById('controlAutoScroll');
      this.btnClearDashConsole = document.getElementById('btnClearDashConsole');
      this.btnClearControlConsole = document.getElementById('btnClearControlConsole');
      this.proofModal = document.getElementById('proofModal');
      this.modalImg = document.getElementById('modalImg');
      this.modalClose = document.getElementById('modalClose');
      this.dashProofChip = document.getElementById('dashProofChip');
      this.dashProofStatus = document.getElementById('dashProofStatus');
      this.btnOpenProofs = document.getElementById('btnOpenProofsFolder');
      this.btnOpenErrors = document.getElementById('btnOpenErrorsFolder');
      this.latestProofBase64 = null;

      this.initEvents();
    }

    initEvents() {
      this.btnClearDashConsole?.addEventListener('click', () => {
        if (this.dashConsoleOutput) this.dashConsoleOutput.innerHTML = '<div class="log-line log-system">Console cleared.</div>';
      });

      this.btnClearControlConsole?.addEventListener('click', () => {
        if (this.controlConsoleOutput) this.controlConsoleOutput.innerHTML = '<div class="log-line log-system">Console cleared.</div>';
      });

      this.modalClose?.addEventListener('click', () => {
        this.proofModal?.classList.remove('open');
      });

      this.proofModal?.addEventListener('click', (e) => {
        if (e.target === this.proofModal) this.proofModal.classList.remove('open');
      });

      this.dashProofChip?.addEventListener('click', () => {
        if (this.latestProofBase64) {
          this.openProofModal(this.latestProofBase64);
        }
      });

      this.btnOpenProofs?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.desktopAPI?.openReportsFolder?.('proofs');
      });

      this.btnOpenErrors?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.desktopAPI?.openReportsFolder?.('errors');
      });
    }

    setLatestProof(base64Src, timestamp) {
      this.latestProofBase64 = base64Src;
      if (this.dashProofStatus && timestamp) {
        this.dashProofStatus.textContent = `Captured at ${timestamp} (Click to view)`;
      }
    }

    openProofModal(base64Src) {
      if (this.proofModal && this.modalImg) {
        this.modalImg.src = base64Src;
        this.proofModal.classList.add('open');
      }
    }

    appendLog(text, isErr = false) {
      if (text === undefined || text === null) return;
      const lines = String(text).split('\n');

      lines.forEach(line => {
        if (!line && lines.length > 1) return;

        const lower = line.toLowerCase();
        let colorClass = '';
        if (isErr || lower.includes('❌') || lower.includes('error')) {
          colorClass = 'log-error';
        } else if (lower.includes('✅') || lower.includes('success') || lower.includes('completed') || lower.includes('🏆') || lower.includes('🎉') || lower.includes('solved') || lower.includes('bypassed')) {
          colorClass = 'log-success';
        } else if (lower.includes('⚠️') || lower.includes('warning')) {
          colorClass = 'log-warning';
        } else if (lower.includes('👉') || lower.includes('🔍') || lower.includes('🌐') || lower.includes('step') || lower.includes('🎯') || lower.includes('⚖️') || lower.includes('🧩') || lower.includes('captcha')) {
          colorClass = 'log-info';
        }

        // Add to Dashboard Terminal
        if (this.dashConsoleOutput) {
          const dDiv = document.createElement('div');
          dDiv.className = 'log-line ' + colorClass;
          dDiv.textContent = line;
          this.dashConsoleOutput.appendChild(dDiv);
          while (this.dashConsoleOutput.childNodes.length > MAX_TERMINAL_LINES) {
            this.dashConsoleOutput.removeChild(this.dashConsoleOutput.firstChild);
          }
        }

        // Add to Control Terminal
        if (this.controlConsoleOutput) {
          const cDiv = document.createElement('div');
          cDiv.className = 'log-line ' + colorClass;
          cDiv.textContent = line;
          this.controlConsoleOutput.appendChild(cDiv);
          while (this.controlConsoleOutput.childNodes.length > MAX_TERMINAL_LINES) {
            this.controlConsoleOutput.removeChild(this.controlConsoleOutput.firstChild);
          }
        }
      });

      if (this.dashAutoScroll?.checked && this.dashConsoleOutput) {
        this.dashConsoleOutput.scrollTop = this.dashConsoleOutput.scrollHeight;
      }
      if (this.controlAutoScroll?.checked && this.controlConsoleOutput) {
        this.controlConsoleOutput.scrollTop = this.controlConsoleOutput.scrollHeight;
      }
    }
  }

  window.TerminalComponent = TerminalComponent;
})();
