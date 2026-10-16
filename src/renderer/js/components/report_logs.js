/**
 * src/renderer/js/components/report_logs.js
 * Component for Report Logs, Screenshots, HTML Dumps & AI Diagnostic Export
 * Features: High-density minimalist design, zero-CDP stealth preservation,
 * CSP-compliant event delegation, and base64 lightbox preview.
 */

(function() {
  class ReportLogsComponent {
    constructor() {
      this.logs = [];
      this.summary = { total: 0, errors: 0, proofs: 0, totalSizeBytes: 0, formattedTotalSize: '0 B' };
      this.currentFilter = 'all'; // 'all', 'error', 'proof'
      this.searchKeyword = '';

      // Pagination State
      this.currentPage = 1;
      this.pageSize = 10;

      // Elements
      this.container = document.getElementById('logsListContainer');
      this.statTotal = document.getElementById('statTotalLogs');
      this.statErrors = document.getElementById('statErrorLogs');
      this.statProofs = document.getElementById('statProofLogs');
      this.statStorage = document.getElementById('statStorageUsed');

      this.countAllPill = document.getElementById('countAllPill');
      this.countErrorsPill = document.getElementById('countErrorsPill');
      this.countProofsPill = document.getElementById('countProofsPill');

      this.searchInput = document.getElementById('logsSearchInput');
      this.btnClearSearch = document.getElementById('btnClearLogsSearch');

      this.btnExport = document.getElementById('btnExportAiPackage');
      this.btnClear = document.getElementById('btnTriggerClearLogs');
      this.btnOpenFolder = document.getElementById('btnOpenLogsFolderDirect');
      this.btnRefresh = document.getElementById('btnRefreshLogsList');

      // Pagination Elements
      this.paginationBar = document.getElementById('logsPaginationBar');
      this.paginationInfo = document.getElementById('logsPaginationInfo');
      this.selectPageSize = document.getElementById('selectLogsPageSize');
      this.btnPageFirst = document.getElementById('btnLogsPageFirst');
      this.btnPagePrev = document.getElementById('btnLogsPagePrev');
      this.btnPageNext = document.getElementById('btnLogsPageNext');
      this.btnPageLast = document.getElementById('btnLogsPageLast');
      this.pageNumbersWrap = document.getElementById('logsPageNumbersWrap');
      this.inputPageJump = document.getElementById('inputLogsPageJump');

      // Lightbox Proof Modal
      this.proofModal = document.getElementById('proofModal');
      this.modalImg = document.getElementById('modalImg');

      // HTML Viewer Modal
      this.htmlModal = document.getElementById('logsHtmlModal');
      this.htmlViewerContent = document.getElementById('logsHtmlViewerContent');
      this.htmlModalTitle = document.getElementById('logsHtmlModalTitle');
      this.btnCloseHtmlModal = document.getElementById('btnCloseLogsHtmlModal');
      this.btnCopyRawHtml = document.getElementById('btnCopyRawHtml');

      // AI Prompt Modal
      this.aiModal = document.getElementById('logsAiPromptModal');
      this.aiPromptTextarea = document.getElementById('aiPromptTextarea');
      this.btnCloseAiModal = document.getElementById('btnCloseAiPromptModal');
      this.btnCancelAiModal = document.getElementById('btnCancelAiPrompt');
      this.btnCopyAiPrompt = document.getElementById('btnCopyAiPromptText');
      this.btnCopyAiPromptLabel = document.getElementById('btnCopyAiPromptTextLabel');

      // Clear Logs Modal
      this.clearModal = document.getElementById('logsClearConfirmModal');
      this.btnCloseClearModal = document.getElementById('btnCloseClearModal');
      this.btnCancelClearModal = document.getElementById('btnCancelClearLogs');
      this.btnConfirmClear = document.getElementById('btnConfirmExecuteClear');

      this.isLoaded = false;
      this.isLoading = false;

      this.initEvents();

      // 1. Instant Cache Restoration: loads cached reports instantly into DOM on app boot
      try {
        const raw = localStorage.getItem('mapsshield_reports_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.logs) && parsed.logs.length > 0) {
            this.logs = parsed.logs;
            this.summary = parsed.summary || this.summary;
            this.updateStats();
            this.render();
          }
        }
      } catch (_) {}

      // 2. Pre-warm data asynchronously at app startup so it's fresh and ready before user clicks
      setTimeout(() => {
        this.loadLogs(true);
      }, 50);
    }

    initEvents() {
      // 1. Filter pills in toolbar
      const filterPills = document.querySelectorAll('.logs-filter-pill');
      filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
          filterPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentFilter = pill.dataset.filter || 'all';
          this.currentPage = 1;
          this.render();
        });
      });

      // 2. Quick KPI Stat Card Filters
      const cardErrors = document.getElementById('cardFilterErrorLogs');
      if (cardErrors) {
        cardErrors.addEventListener('click', () => this.setFilter('error'));
      }
      const cardProofs = document.getElementById('cardFilterProofLogs');
      if (cardProofs) {
        cardProofs.addEventListener('click', () => this.setFilter('proof'));
      }
      const cardAll = document.getElementById('cardFilterAllLogs');
      if (cardAll) {
        cardAll.addEventListener('click', () => this.setFilter('all'));
      }

      // 3. Search Input
      if (this.searchInput) {
        this.searchInput.addEventListener('input', (e) => {
          this.searchKeyword = (e.target.value || '').trim().toLowerCase();
          this.currentPage = 1;
          if (this.btnClearSearch) {
            this.btnClearSearch.style.display = this.searchKeyword ? 'block' : 'none';
          }
          this.render();
        });
      }

      if (this.btnClearSearch) {
        this.btnClearSearch.addEventListener('click', () => {
          if (this.searchInput) this.searchInput.value = '';
          this.searchKeyword = '';
          this.currentPage = 1;
          this.btnClearSearch.style.display = 'none';
          this.render();
        });
      }

      // 4. Pagination Controls
      if (this.selectPageSize) {
        this.selectPageSize.addEventListener('change', (e) => {
          this.pageSize = parseInt(e.target.value, 10) || 10;
          this.currentPage = 1;
          this.render();
        });
      }

      if (this.btnPageFirst) {
        this.btnPageFirst.addEventListener('click', () => {
          if (this.currentPage > 1) {
            this.currentPage = 1;
            this.render();
            this.scrollToTop();
          }
        });
      }

      if (this.btnPagePrev) {
        this.btnPagePrev.addEventListener('click', () => {
          if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
            this.scrollToTop();
          }
        });
      }

      if (this.btnPageNext) {
        this.btnPageNext.addEventListener('click', () => {
          const filtered = this.getFilteredLogs();
          const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
          if (this.currentPage < totalPages) {
            this.currentPage++;
            this.render();
            this.scrollToTop();
          }
        });
      }

      if (this.btnPageLast) {
        this.btnPageLast.addEventListener('click', () => {
          const filtered = this.getFilteredLogs();
          const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
          if (this.currentPage < totalPages) {
            this.currentPage = totalPages;
            this.render();
            this.scrollToTop();
          }
        });
      }

      if (this.inputPageJump) {
        this.inputPageJump.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = parseInt(this.inputPageJump.value, 10);
            const filtered = this.getFilteredLogs();
            const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
            if (!isNaN(val) && val >= 1 && val <= totalPages) {
              this.currentPage = val;
              this.render();
              this.scrollToTop();
            } else {
              this.inputPageJump.value = this.currentPage;
            }
          }
        });
      }

      // 5. Refresh Toolbar Button
      if (this.btnRefresh) {
        this.btnRefresh.addEventListener('click', () => {
          this.btnRefresh.classList.add('rotating');
          this.loadLogs().finally(() => {
            setTimeout(() => this.btnRefresh.classList.remove('rotating'), 600);
          });
        });
      }

      // 6. Open Logs Folder in Explorer
      if (this.btnOpenFolder) {
        this.btnOpenFolder.addEventListener('click', async () => {
          if (window.desktopAPI && window.desktopAPI.openReportLogItem) {
            await window.desktopAPI.openReportLogItem('');
          } else if (window.desktopAPI && window.desktopAPI.openReportsFolder) {
            await window.desktopAPI.openReportsFolder('');
          }
        });
      }

      // 7. Export AI Diagnostic ZIP Package
      if (this.btnExport) {
        this.btnExport.addEventListener('click', async () => {
          await this.handleExportZip();
        });
      }

      // 8. Clear Logs Modal
      if (this.btnClear) {
        this.btnClear.addEventListener('click', () => this.openClearModal());
      }
      if (this.btnCloseClearModal) {
        this.btnCloseClearModal.addEventListener('click', () => this.closeClearModal());
      }
      if (this.btnCancelClearModal) {
        this.btnCancelClearModal.addEventListener('click', () => this.closeClearModal());
      }
      if (this.btnConfirmClear) {
        this.btnConfirmClear.addEventListener('click', async () => {
          await this.handleExecuteClear();
        });
      }

      // 9. HTML Viewer Modal
      if (this.btnCloseHtmlModal) {
        this.btnCloseHtmlModal.addEventListener('click', () => this.closeHtmlModal());
      }
      if (this.btnCopyRawHtml) {
        this.btnCopyRawHtml.addEventListener('click', () => {
          if (this.htmlViewerContent) {
            navigator.clipboard.writeText(this.htmlViewerContent.textContent || '').catch(() => {});
            const prev = this.btnCopyRawHtml.textContent;
            this.btnCopyRawHtml.textContent = '✅ Copied!';
            setTimeout(() => { this.btnCopyRawHtml.textContent = prev; }, 2000);
          }
        });
      }

      // 10. AI Prompt Modal
      if (this.btnCloseAiModal) {
        this.btnCloseAiModal.addEventListener('click', () => this.closeAiModal());
      }
      if (this.btnCancelAiModal) {
        this.btnCancelAiModal.addEventListener('click', () => this.closeAiModal());
      }
      if (this.btnCopyAiPrompt) {
        this.btnCopyAiPrompt.addEventListener('click', () => {
          if (this.aiPromptTextarea) {
            navigator.clipboard.writeText(this.aiPromptTextarea.value || '').catch(() => {});
            if (this.btnCopyAiPromptLabel) {
              this.btnCopyAiPromptLabel.textContent = '✅ Copied to Clipboard!';
              setTimeout(() => {
                this.btnCopyAiPromptLabel.textContent = 'Copy Prompt to Clipboard';
              }, 2500);
            }
          }
        });
      }

      // 10b. Proof Modal Close Button and Backdrop Clicks
      const btnCloseProof = document.getElementById('btnCloseProofModal');
      if (btnCloseProof) {
        btnCloseProof.addEventListener('click', () => {
          if (this.proofModal) this.proofModal.classList.remove('open');
        });
      }

      [this.htmlModal, this.aiModal, this.clearModal, this.proofModal].forEach(modalEl => {
        if (modalEl) {
          modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
              if (modalEl === this.proofModal) modalEl.classList.remove('open');
              else modalEl.style.display = 'none';
            }
          });
        }
      });

      // 11. Global Keyboard Escape to close open modals
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.proofModal && this.proofModal.classList.contains('open')) {
            this.proofModal.classList.remove('open');
          }
          this.closeHtmlModal();
          this.closeAiModal();
          this.closeClearModal();
        }
      });

      // 12. CONTAINER EVENT DELEGATION (CSP-compliant, zero inline onclicks)
      if (this.container) {
        this.container.addEventListener('click', async (e) => {
          // A. View Screenshot Action (triggers on preview button, thumbnail, or row button)
          const viewTarget = e.target.closest('[data-action="view-screenshot"]');
          if (viewTarget) {
            e.preventDefault();
            e.stopPropagation();
            const filePath = viewTarget.getAttribute('data-path');
            await this.viewScreenshot(filePath);
            return;
          }

          // B. Copy AI Prompt Action
          const aiTarget = e.target.closest('[data-action="copy-ai-prompt"]');
          if (aiTarget) {
            e.preventDefault();
            e.stopPropagation();
            const logId = aiTarget.getAttribute('data-id');
            await this.handleCopyAiPrompt(logId, aiTarget);
            return;
          }

          // C. Open Folder / Reveal in Explorer Action
          const folderTarget = e.target.closest('[data-action="open-folder"]');
          if (folderTarget) {
            e.preventDefault();
            e.stopPropagation();
            const filePath = folderTarget.getAttribute('data-path');
            await this.openFile(filePath);
            return;
          }

          // D. Inspect DOM HTML Action
          const htmlTarget = e.target.closest('[data-action="inspect-html"]');
          if (htmlTarget) {
            e.preventDefault();
            e.stopPropagation();
            const filePath = htmlTarget.getAttribute('data-path');
            const filename = htmlTarget.getAttribute('data-filename');
            await this.inspectHtml(filePath, filename);
            return;
          }

          // E. Open URL Action
          const urlTarget = e.target.closest('[data-action="open-url"]');
          if (urlTarget) {
            e.preventDefault();
            e.stopPropagation();
            const url = urlTarget.getAttribute('data-url');
            if (url && url !== '—') {
              await this.openUrl(url);
            }
            return;
          }

          // F. Copy Target URL Action
          const copyUrlTarget = e.target.closest('[data-action="copy-url"]');
          if (copyUrlTarget) {
            e.preventDefault();
            e.stopPropagation();
            const text = copyUrlTarget.getAttribute('data-text');
            if (text) {
              navigator.clipboard.writeText(text).catch(() => {});
              const originalSvg = copyUrlTarget.innerHTML;
              copyUrlTarget.innerHTML = '<span style="font-size:10px; color:#10b981; font-weight:700;">✓</span>';
              setTimeout(() => { copyUrlTarget.innerHTML = originalSvg; }, 1800);
            }
            return;
          }
        });
      }

      // 13. Auto refresh when new screenshot is generated by agent
      if (window.desktopAPI && window.desktopAPI.onScreenshot) {
        window.desktopAPI.onScreenshot(() => {
          clearTimeout(this._refreshDebounce);
          this._refreshDebounce = setTimeout(() => {
            this.loadLogs();
          }, 800);
        });
      }
    }

    setFilter(filterName) {
      this.currentFilter = filterName;
      this.currentPage = 1;
      const filterPills = document.querySelectorAll('.logs-filter-pill');
      filterPills.forEach(p => {
        if (p.dataset.filter === filterName) p.classList.add('active');
        else p.classList.remove('active');
      });
      this.render();
    }

    async loadLogs(isSilent = false) {
      if (!window.desktopAPI || !window.desktopAPI.getReportLogs) return;
      if (this.isLoading) return;
      this.isLoading = true;
      try {
        const res = await window.desktopAPI.getReportLogs();
        if (res && res.success) {
          this.logs = res.logs || [];
          this.summary = res.summary || { total: 0, errors: 0, proofs: 0, totalSizeBytes: 0, formattedTotalSize: '0 B' };
          this.isLoaded = true;
          this.updateStats();
          this.render();
          try {
            // Keep recent 50 logs in persistent cache for 0ms initial paint on next launch
            localStorage.setItem('mapsshield_reports_cache', JSON.stringify({
              logs: this.logs.slice(0, 50),
              summary: this.summary
            }));
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Failed to load report logs:', err);
      } finally {
        this.isLoading = false;
      }
    }

    updateStats() {
      if (this.statTotal) this.statTotal.textContent = this.summary.total || 0;
      if (this.statErrors) this.statErrors.textContent = this.summary.errors || 0;
      if (this.statProofs) this.statProofs.textContent = this.summary.proofs || 0;
      if (this.statStorage) this.statStorage.textContent = this.summary.formattedTotalSize || '0 B';

      if (this.countAllPill) this.countAllPill.textContent = this.summary.total || 0;
      if (this.countErrorsPill) this.countErrorsPill.textContent = this.summary.errors || 0;
      if (this.countProofsPill) this.countProofsPill.textContent = this.summary.proofs || 0;
    }

    getFilteredLogs() {
      return this.logs.filter(item => {
        // Category filter
        if (this.currentFilter === 'error' && item.category !== 'error') return false;
        if (this.currentFilter === 'proof' && item.category !== 'proof') return false;

        // Search keyword filter
        if (this.searchKeyword) {
          const matchUrl = item.url && item.url.toLowerCase().includes(this.searchKeyword);
          const matchEmail = item.email && item.email.toLowerCase().includes(this.searchKeyword);
          const matchStep = item.step && item.step.toLowerCase().includes(this.searchKeyword);
          const matchFile = item.filename && item.filename.toLowerCase().includes(this.searchKeyword);
          const matchError = item.errorMessage && item.errorMessage.toLowerCase().includes(this.searchKeyword);
          const matchSelector = item.selector && item.selector.toLowerCase().includes(this.searchKeyword);
          return matchUrl || matchEmail || matchStep || matchFile || matchError || matchSelector;
        }

        return true;
      });
    }

    render() {
      if (!this.container) return;
      const filtered = this.getFilteredLogs();
      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));

      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;

      if (totalItems === 0) {
        if (this.paginationBar) this.paginationBar.style.display = 'none';
        this.container.innerHTML = `
          <div class="logs-empty-state">
            <div class="empty-icon-pulse">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3>${this.logs.length === 0 ? 'No Reports Found' : 'No Matching Reports Found'}</h3>
            <p>${this.logs.length === 0
              ? 'When tasks run, success proof screenshots and error diagnostics (screenshots + HTML dumps) are cataloged here automatically.'
              : 'Try clearing your search query or switching to "All Reports" filter.'}</p>
          </div>
        `;
        return;
      }

      if (this.paginationBar) this.paginationBar.style.display = 'flex';

      const startIndex = (this.currentPage - 1) * this.pageSize;
      const endIndex = Math.min(startIndex + this.pageSize, totalItems);
      const pageItems = filtered.slice(startIndex, endIndex);

      let html = '';
      pageItems.forEach(item => {
        const isError = item.category === 'error';
        const timeStr = new Date(item.timestamp).toLocaleString([], {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const safeUrl = item.url && item.url !== '—' && item.url !== 'N/A' ? item.url : '';
        const safeEmail = item.email && item.email !== '—' && item.email !== 'N/A' ? item.email : '';

        html += `
          <div class="log-item-row ${isError ? 'row-error' : 'row-proof'}" data-id="${item.id}">
            <!-- 1. Status Column -->
            <div class="log-col-status">
              <span class="status-dot ${isError ? 'dot-error' : 'dot-proof'}"></span>
              <span class="status-badge ${isError ? 'badge-error' : 'badge-proof'}">
                ${isError ? 'FAILED' : 'SUCCESS'}
              </span>
            </div>

            <!-- 2. Preview Thumbnail Action -->
            <div class="log-col-thumb">
              <button class="thumb-trigger-btn" data-action="view-screenshot" data-path="${this.escapeHtml(item.pngPath)}" title="Click to view full screenshot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>View</span>
              </button>
            </div>

            <!-- 3. Information Details -->
            <div class="log-col-info">
              <div class="log-info-meta">
                <span class="log-step-tag">${this.escapeHtml(item.step || 'action')}</span>
                <span class="log-timestamp">${timeStr}</span>
                <span class="log-size-chip">${item.formattedSize || ''}</span>
                ${item.hasHtml ? '<span class="log-chip-html" title="DOM HTML dump captured">HTML Dump</span>' : ''}
              </div>

              <!-- Target URL & Email Line -->
              <div class="log-info-fields">
                <div class="log-field-item log-field-url">
                  <span class="field-label">Target URL:</span>
                  ${safeUrl ? `
                    <button type="button" class="url-link url-link-btn" data-action="open-url" data-url="${this.escapeHtml(safeUrl)}" title="${this.escapeHtml(safeUrl)}">${this.escapeHtml(safeUrl)}</button>
                    <button class="btn-copy-chip" data-action="copy-url" data-text="${this.escapeHtml(safeUrl)}" title="Copy Target URL">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 11px; height: 11px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  ` : '<span class="field-empty">—</span>'}
                </div>

                <div class="log-field-item log-field-email">
                  <span class="field-label">Email:</span>
                  ${safeEmail ? `
                    <span class="email-badge">${this.escapeHtml(safeEmail)}</span>
                    <button class="btn-copy-chip" data-action="copy-url" data-text="${this.escapeHtml(safeEmail)}" title="Copy Account Email">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 11px; height: 11px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  ` : '<span class="field-empty">—</span>'}
                </div>
              </div>

              ${item.errorMessage ? `
                <div class="log-info-error" title="${this.escapeHtml(item.errorMessage)}">
                  <span class="error-badge-icon">⚠️</span>
                  <span class="error-text">${this.escapeHtml(item.errorMessage)}</span>
                </div>
              ` : ''}
            </div>

            <!-- 4. Quick Action Buttons (AI Prompt & HTML Dump) -->
            <div class="log-col-actions">
              ${isError ? `
                <button class="log-btn log-btn-ai" data-action="copy-ai-prompt" data-id="${item.id}" title="Copy AI diagnostic prompt to clipboard">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px;">
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.5 7.5"/><path d="M12 12v10"/>
                  </svg>
                  <span>Copy AI Prompt</span>
                </button>
              ` : ''}

              ${item.hasHtml ? `
                <button class="log-btn log-btn-html" data-action="inspect-html" data-path="${this.escapeHtml(item.htmlPath)}" data-filename="${this.escapeHtml(item.htmlFilename)}" title="Inspect HTML DOM Snapshot">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px;">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  <span>Inspect HTML</span>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      });

      this.container.innerHTML = html;
      this.updatePagination(totalItems, totalPages, startIndex, endIndex);
    }

    updatePagination(totalItems, totalPages, startIndex, endIndex) {
      if (this.paginationInfo) {
        this.paginationInfo.textContent = `Showing ${(startIndex + 1).toLocaleString()} to ${endIndex.toLocaleString()} of ${totalItems.toLocaleString()} logs`;
      }

      if (this.btnPageFirst) this.btnPageFirst.disabled = this.currentPage <= 1;
      if (this.btnPagePrev) this.btnPagePrev.disabled = this.currentPage <= 1;
      if (this.btnPageNext) this.btnPageNext.disabled = this.currentPage >= totalPages;
      if (this.btnPageLast) this.btnPageLast.disabled = this.currentPage >= totalPages;

      if (this.inputPageJump) {
        this.inputPageJump.value = this.currentPage;
        this.inputPageJump.max = totalPages;
      }

      this.renderPageNumbers(totalPages);
    }

    renderPageNumbers(totalPages) {
      if (!this.pageNumbersWrap) return;
      this.pageNumbersWrap.innerHTML = '';

      if (totalPages <= 1) return;

      const createPageBtn = (num) => {
        const btn = document.createElement('button');
        btn.className = `page-num-btn ${num === this.currentPage ? 'active' : ''}`;
        btn.textContent = num;
        btn.addEventListener('click', () => {
          this.currentPage = num;
          this.render();
          this.scrollToTop();
        });
        return btn;
      };

      const createEllipsis = () => {
        const span = document.createElement('span');
        span.className = 'page-ellipsis';
        span.textContent = '…';
        span.style.color = 'var(--text-dim)';
        span.style.padding = '0 3px';
        span.style.fontSize = '11px';
        return span;
      };

      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
          this.pageNumbersWrap.appendChild(createPageBtn(i));
        }
      } else {
        this.pageNumbersWrap.appendChild(createPageBtn(1));

        let start = Math.max(2, this.currentPage - 1);
        let end = Math.min(totalPages - 1, this.currentPage + 1);

        if (this.currentPage <= 3) {
          start = 2;
          end = 4;
        } else if (this.currentPage >= totalPages - 2) {
          start = totalPages - 3;
          end = totalPages - 1;
        }

        if (start > 2) {
          this.pageNumbersWrap.appendChild(createEllipsis());
        }

        for (let i = start; i <= end; i++) {
          this.pageNumbersWrap.appendChild(createPageBtn(i));
        }

        if (end < totalPages - 1) {
          this.pageNumbersWrap.appendChild(createEllipsis());
        }

        this.pageNumbersWrap.appendChild(createPageBtn(totalPages));
      }
    }

    scrollToTop() {
      if (this.container) {
        this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    async viewScreenshot(filePath) {
      if (!filePath) return;
      const modal = document.getElementById('proofModal');
      const modalImg = document.getElementById('modalImg');
      if (!modal || !modalImg) return;

      modalImg.style.opacity = '0.3';
      modal.classList.add('open');

      try {
        if (window.desktopAPI && window.desktopAPI.getLogImageBase64) {
          const res = await window.desktopAPI.getLogImageBase64(filePath);
          if (res && res.success && res.base64) {
            modalImg.src = res.base64;
            modalImg.style.opacity = '1';
            return;
          }
        }
        modalImg.src = `file:///${filePath.replace(/\\/g, '/')}`;
        modalImg.style.opacity = '1';
      } catch (err) {
        modalImg.src = `file:///${filePath.replace(/\\/g, '/')}`;
        modalImg.style.opacity = '1';
      }
    }

    async inspectHtml(filePath, filename) {
      if (!filePath || !window.desktopAPI || !window.desktopAPI.getReportHtmlContent) return;
      try {
        const res = await window.desktopAPI.getReportHtmlContent(filePath);
        if (res && res.success) {
          if (this.htmlModalTitle) this.htmlModalTitle.textContent = `HTML Snapshot: ${filename || 'DOM Source'}`;
          if (this.htmlViewerContent) this.htmlViewerContent.textContent = res.html || '<!-- Empty DOM Content -->';
          if (this.htmlModal) this.htmlModal.style.display = 'flex';
        } else {
          alert('Could not read HTML snapshot: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error reading HTML: ' + err.message);
      }
    }

    closeHtmlModal() {
      if (this.htmlModal) this.htmlModal.style.display = 'none';
    }

    buildAiPromptText(item) {
      return `### 🐞 MapsShield Pro - Automation Failure Diagnostic Report

I encountered an automation error in MapsShield Pro while processing a Google Maps task.

**Context & Failure Details:**
- **Target URL**: ${item.url && item.url !== '—' && item.url !== 'N/A' ? item.url : 'N/A'}
- **Google Account Email**: ${item.email && item.email !== '—' && item.email !== 'N/A' ? item.email : 'N/A'}
- **Failing Step**: ${item.step || 'Unknown'}
- **Active Selector**: ${item.selector || 'N/A'}
- **Error Message**: ${item.errorMessage || 'Execution timeout or element not actionable'}
- **Screenshot File**: ${item.filename}
${item.hasHtml ? `- **HTML Dump File**: ${item.htmlFilename} (Attached in the diagnostic ZIP package)` : ''}

**Node.js Stack Trace:**
\`\`\`
${item.errorStack || item.errorMessage || 'No stack trace available'}
\`\`\`

**Goal / Request for AI:**
1. Analyze the attached screenshot and HTML snapshot.
2. Determine why the element or step failed (e.g. did Google obfuscate or change their CSS class, was an account verification / captcha triggered, or was the button disabled/hidden in the viewport?).
3. Provide the exact updated CSS selector or code adjustment needed for \`agent.js\` / \`maps_reporter.js\` to make the automation robust and bypass this issue.`;
    }

    async handleCopyAiPrompt(logId, triggerBtn) {
      const item = this.logs.find(l => String(l.id) === String(logId));
      if (!item) return;

      const prompt = this.buildAiPromptText(item);

      // Copy directly to clipboard
      try {
        await navigator.clipboard.writeText(prompt);
      } catch (err) {
        console.warn('Clipboard writeText failed:', err);
      }

      // Visual feedback on the clicked button
      if (triggerBtn) {
        const originalContent = triggerBtn.innerHTML;
        triggerBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; color: #10b981;">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span style="color: #10b981; font-weight: 600;">Copied!</span>
        `;
        setTimeout(() => {
          triggerBtn.innerHTML = originalContent;
        }, 2200);
      }

      // Also open the AI prompt modal so user can view/inspect the text
      if (this.aiPromptTextarea) this.aiPromptTextarea.value = prompt;
      if (this.aiModal) this.aiModal.style.display = 'flex';
    }

    closeAiModal() {
      if (this.aiModal) this.aiModal.style.display = 'none';
    }

    openClearModal() {
      if (this.clearModal) this.clearModal.style.display = 'flex';
    }

    closeClearModal() {
      if (this.clearModal) this.clearModal.style.display = 'none';
    }

    async handleExecuteClear() {
      const selectedRadio = document.querySelector('input[name="clearScope"]:checked');
      const scope = selectedRadio ? selectedRadio.value : 'errors';

      if (!window.desktopAPI || !window.desktopAPI.clearReportLogs) return;

      try {
        if (this.btnConfirmClear) this.btnConfirmClear.textContent = 'Deleting...';
        const res = await window.desktopAPI.clearReportLogs(scope);
        if (res && res.success) {
          this.closeClearModal();
          await this.loadLogs();
        } else {
          alert('Failed to clear logs: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Clear error: ' + err.message);
      } finally {
        if (this.btnConfirmClear) this.btnConfirmClear.textContent = 'Confirm Delete';
      }
    }

    async handleExportZip() {
      if (!window.desktopAPI || !window.desktopAPI.exportReportLogs) return;

      try {
        if (this.btnExport) {
          this.btnExport.disabled = true;
          this.btnExport.innerHTML = `<span>Packaging ZIP...</span>`;
        }

        const res = await window.desktopAPI.exportReportLogs();
        if (res && res.success) {
          alert(`🎉 AI Diagnostic Package exported successfully!\n\nSaved at:\n${res.filePath}\n\nYou can now upload this ZIP or attach files to Google Gemini, Claude, or ChatGPT alongside the generated prompt!`);
        } else if (!res.canceled) {
          alert('Export error: ' + (res.error || 'Could not create ZIP package'));
        }
      } catch (err) {
        alert('Export error: ' + err.message);
      } finally {
        if (this.btnExport) {
          this.btnExport.disabled = false;
          this.btnExport.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download for AI</span>
          `;
        }
      }
    }

    async openUrl(url) {
      if (window.desktopAPI && window.desktopAPI.openExternalUrl) {
        await window.desktopAPI.openExternalUrl(url);
      }
    }

    async openFile(filePath) {
      if (window.desktopAPI && window.desktopAPI.openReportLogItem) {
        await window.desktopAPI.openReportLogItem(filePath);
      } else if (window.desktopAPI && window.desktopAPI.openReportsFolder) {
        await window.desktopAPI.openReportsFolder('');
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.reportLogsComponent = new ReportLogsComponent();
  });
})();
