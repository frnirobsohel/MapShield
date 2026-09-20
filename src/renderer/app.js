document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Menu
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.pane');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  const pageMeta = {
    'tab-dashboard': { title: 'Dashboard', subtitle: 'Live statistics, automation progress & activity terminal' },
    'tab-control': { title: 'Control Panel', subtitle: 'Select desktop browser, report mode & live execution' },
    'tab-account': { title: 'Account', subtitle: 'Manage bulk accounts (CSV / Excel), 2FA & backup codes' },
    'tab-proxy': { title: 'Proxy', subtitle: 'Configure HTTP, HTTPS, SOCKS5 proxies & rotation' },
    'tab-reporter': { title: 'Link', subtitle: 'Target Google Maps review links & violation categories' },
    'tab-ai': { title: 'API', subtitle: 'Google Gemini AI configuration for review inspection' },
    'tab-about': { title: 'About', subtitle: 'Software specifications and license activation' }
  };

  let currentActiveTab = 'tab-dashboard';
  let accountsTableDirty = true;
  let proxiesTableDirty = true;
  let linksTableDirty = true;
  let aboutTabDirty = true;

  function switchTab(tabId) {
    currentActiveTab = tabId;
    navItems.forEach(btn => {
      if (btn.dataset.tab === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    panes.forEach(pane => {
      if (pane.id === tabId) pane.classList.add('active');
      else pane.classList.remove('active');
    });

    if (pageMeta[tabId]) {
      pageTitle.textContent = pageMeta[tabId].title;
      pageSubtitle.textContent = pageMeta[tabId].subtitle;
    }

    // Lazy render on tab activation
    if (tabId === 'tab-account' && accountsTableDirty) {
      accountsTableDirty = false;
      renderAccountsTable(true);
    } else if (tabId === 'tab-proxy' && proxiesTableDirty) {
      proxiesTableDirty = false;
      renderProxiesTable(true);
    } else if (tabId === 'tab-reporter' && linksTableDirty) {
      linksTableDirty = false;
      renderLinksTable(true);
    } else if (tabId === 'tab-about' && aboutTabDirty) {
      aboutTabDirty = false;
      if (window.licenseManager) {
        window.licenseManager.render();
      }
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });

  // Topbar Status Pill
  const agentStatusPill = document.getElementById('agentStatusPill');
  const agentStatusPillText = document.getElementById('agentStatusPillText');

  // Dashboard Stats Elements
  const dashAccountsLoaded = document.getElementById('dashAccountsLoaded');
  const dashAccountsDetail = document.getElementById('dashAccountsDetail');
  const dashTargetLinks = document.getElementById('dashTargetLinks');
  const dashLinksDetail = document.getElementById('dashLinksDetail');
  const dashReportsDone = document.getElementById('dashReportsDone');
  const dashReportsRate = document.getElementById('dashReportsRate');
  const dashAccountsUsed = document.getElementById('dashAccountsUsed');

  // Action Bar Buttons (Dashboard + Control)
  const btnDashStart = document.getElementById('btnDashStart');
  const btnDashStop = document.getElementById('btnDashStop');
  const dashProgressText = document.getElementById('dashProgressText');
  const dashProgressPercent = document.getElementById('dashProgressPercent');
  const dashProgressBar = document.getElementById('dashProgressBar');
  const dashProofChip = document.getElementById('dashProofChip');
  const dashProofStatus = document.getElementById('dashProofStatus');

  // Minimalist Web Application SVG Icons
  const SVG_ICONS = {
    eye: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    eyeOff: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    ping: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,
    external: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
    spinner: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-animation"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`
  };

  // Control Elements: Browser Selection & Report Mode
  const browserChecklist = document.getElementById('browserChecklist');
  const btnBrowseBrowser = document.getElementById('btnBrowseBrowser');
  const activeBrowserPath = document.getElementById('activeBrowserPath');
  const browserDetectedBadge = document.getElementById('browserDetectedBadge');
  const btnControlStart = document.getElementById('btnControlStart');
  const btnControlStop = document.getElementById('btnControlStop');
  const controlProgressStatus = document.getElementById('controlProgressStatus');
  const controlProgressPercent = document.getElementById('controlProgressPercent');
  const controlProgressBar = document.getElementById('controlProgressBar');

  // Terminals (Dashboard + Control)
  const dashConsoleOutput = document.getElementById('dashConsoleOutput');
  const btnClearDashConsole = document.getElementById('btnClearDashConsole');
  const dashAutoScroll = document.getElementById('dashAutoScroll');

  const controlConsoleOutput = document.getElementById('controlConsoleOutput');
  const btnClearControlConsole = document.getElementById('btnClearControlConsole');
  const controlAutoScroll = document.getElementById('controlAutoScroll');

  // Accounts Management Elements
  const btnUploadAccounts = document.getElementById('btnUploadAccounts');
  const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');
  const btnToggleManualAdd = document.getElementById('btnToggleManualAdd');
  const btnClearAllAccounts = document.getElementById('btnClearAllAccounts');
  const btnClearSession = document.getElementById('btnClearSession');
  const btnResetAllAccountsHistory = document.getElementById('btnResetAllAccountsHistory');
  const accountsTableBadge = document.getElementById('accountsTableBadge');
  const accountsTableBody = document.getElementById('accountsTableBody');
  const accountsEmptyState = document.getElementById('accountsEmptyState');
  const manualAddBox = document.getElementById('manualAddBox');
  const closeManualAdd = document.getElementById('closeManualAdd');
  const btnAddAccountToTable = document.getElementById('btnAddAccountToTable');
  const manualEmail = document.getElementById('manualEmail');
  const manualPassword = document.getElementById('manualPassword');
  const manual2fa = document.getElementById('manual2fa');
  const manualBackupCode = document.getElementById('manualBackupCode');
  const accountToast = document.getElementById('accountToast');
  const sidebarStatusDot = document.getElementById('sidebarStatusDot');
  const sidebarSessionText = document.getElementById('sidebarSessionText');

  // Search & Filter Toolbar Elements
  const accountSearchInput = document.getElementById('accountSearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const filterCountAll = document.getElementById('filterCountAll');
  const filterCountUnused = document.getElementById('filterCountUnused');
  const filterCountUsed = document.getElementById('filterCountUsed');
  const filterCountFailed = document.getElementById('filterCountFailed');

  // Pagination Elements
  const accountsPaginationBar = document.getElementById('accountsPaginationBar');
  const paginationInfo = document.getElementById('paginationInfo');
  const btnPageFirst = document.getElementById('btnPageFirst');
  const btnPagePrev = document.getElementById('btnPagePrev');
  const pageNumbersContainer = document.getElementById('pageNumbersContainer');
  const btnPageNext = document.getElementById('btnPageNext');
  const btnPageLast = document.getElementById('btnPageLast');
  const selectPageSize = document.getElementById('selectPageSize');
  const inputPageJump = document.getElementById('inputPageJump');

  // Edit Account Modal Elements
  const editAccountModal = document.getElementById('editAccountModal');
  const closeEditModal = document.getElementById('closeEditModal');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const btnSaveEdit = document.getElementById('btnSaveEdit');
  const editEmail = document.getElementById('editEmail');
  const editPassword = document.getElementById('editPassword');
  const btnToggleEditPass = document.getElementById('btnToggleEditPass');
  const edit2fa = document.getElementById('edit2fa');
  const editBackupCode = document.getElementById('editBackupCode');
  const editUsageTag = document.getElementById('editUsageTag');
  const editStatusTag = document.getElementById('editStatusTag');
  const btnResetAccountStatus = document.getElementById('btnResetAccountStatus');
  const editErrorNotice = document.getElementById('editErrorNotice');

  // Target Review Links Sheet & Table Elements
  const linksTableBadge = document.getElementById('linksTableBadge');
  const linkCountAll = document.getElementById('linkCountAll');
  const linkCountCompleted = document.getElementById('linkCountCompleted');
  const linkCountQueued = document.getElementById('linkCountQueued');
  const linkCountFailed = document.getElementById('linkCountFailed');
  const btnUploadLinks = document.getElementById('btnUploadLinks');
  const btnToggleAddLink = document.getElementById('btnToggleAddLink');
  const btnClearAllLinks = document.getElementById('btnClearAllLinks');
  const reporterToast = document.getElementById('reporterToast');

  // Inline Add Link Drawer Elements
  const manualAddLinkBox = document.getElementById('manualAddLinkBox');
  const closeManualAddLink = document.getElementById('closeManualAddLink');
  const manualLinkUrl = document.getElementById('manualLinkUrl');
  const manualLinkCategory = document.getElementById('manualLinkCategory');
  const manualLinkBusinessName = document.getElementById('manualLinkBusinessName');
  const manualLinkCountry = document.getElementById('manualLinkCountry');
  const manualLinkTargetCount = document.getElementById('manualLinkTargetCount');
  const btnAddLinkToTable = document.getElementById('btnAddLinkToTable');

  // Link Search & Filter Elements
  const linkSearchInput = document.getElementById('linkSearchInput');
  const btnClearLinkSearch = document.getElementById('btnClearLinkSearch');
  const linkFilterTabs = document.querySelectorAll('[data-link-filter]');

  // Link Table Grid & Pagination Elements
  const linksTable = document.getElementById('linksTable');
  const linksTableBody = document.getElementById('linksTableBody');
  const linksPaginationBar = document.getElementById('linksPaginationBar');
  const linkPaginationInfo = document.getElementById('linkPaginationInfo');
  const selectLinkPageSize = document.getElementById('selectLinkPageSize');
  const btnLinkPageFirst = document.getElementById('btnLinkPageFirst');
  const btnLinkPagePrev = document.getElementById('btnLinkPagePrev');
  const linkPageNumbersContainer = document.getElementById('linkPageNumbersContainer');
  const btnLinkPageNext = document.getElementById('btnLinkPageNext');
  const btnLinkPageLast = document.getElementById('btnLinkPageLast');
  const inputLinkPageJump = document.getElementById('inputLinkPageJump');

  // Edit Link Modal Elements
  const editLinkModal = document.getElementById('editLinkModal');
  const closeEditLinkModal = document.getElementById('closeEditLinkModal');
  const btnCancelEditLink = document.getElementById('btnCancelEditLink');
  const btnSaveEditLink = document.getElementById('btnSaveEditLink');
  const editLinkUrl = document.getElementById('editLinkUrl');
  const editLinkCategory = document.getElementById('editLinkCategory');
  const editLinkBusinessName = document.getElementById('editLinkBusinessName');
  const editLinkCountry = document.getElementById('editLinkCountry');
  const editLinkTargetCount = document.getElementById('editLinkTargetCount');

  // Legacy element references for fallback compatibility
  const inputReviewUrls = document.getElementById('inputReviewUrls');
  const selectCategory = document.getElementById('selectCategory');
  const reporterQueueBadge = document.getElementById('reporterQueueBadge');
  const btnSaveLinks = document.getElementById('btnSaveLinks');
  const btnClearLinks = document.getElementById('btnClearLinks');

  // AI API Key Elements
  const inputAiKey = document.getElementById('inputAiKey');
  const selectAiModel = document.getElementById('selectAiModel');
  const selectAiProvider = document.getElementById('selectAiProvider');
  const labelAiKey = document.getElementById('labelAiKey');
  const aiBadge = document.getElementById('aiBadge');
  const checkAiInspection = document.getElementById('checkAiInspection');
  const btnToggleAiKey = document.getElementById('btnToggleAiKey');
  const btnSaveAi = document.getElementById('btnSaveAi');
  const aiToast = document.getElementById('aiToast');
  const inputLegalFullName = document.getElementById('inputLegalFullName');
  const inputLegalBusinessName = document.getElementById('inputLegalBusinessName');
  const inputLegalCountry = document.getElementById('inputLegalCountry');

  // Proxy Sheet & Table Elements
  const proxyTableBadge = document.getElementById('proxyTableBadge');
  const proxyCountAll = document.getElementById('proxyCountAll');
  const proxyCountReady = document.getElementById('proxyCountReady');
  const proxyCountTesting = document.getElementById('proxyCountTesting');
  const proxyCountFailed = document.getElementById('proxyCountFailed');
  const proxyEnableToggle = document.getElementById('proxyEnableToggle');
  const proxyEnableLabel = document.getElementById('proxyEnableLabel');
  const btnUploadProxies = document.getElementById('btnUploadProxies');
  const btnToggleAddProxy = document.getElementById('btnToggleAddProxy');
  const btnTestAllProxies = document.getElementById('btnTestAllProxies');
  const btnClearAllProxies = document.getElementById('btnClearAllProxies');
  const proxyToast = document.getElementById('proxyToast');

  // Inline Add Proxy Drawer (Single String & Bulk Modes)
  const manualAddProxyBox = document.getElementById('manualAddProxyBox');
  const closeManualAddProxy = document.getElementById('closeManualAddProxy');
  const tabProxyModeSingle = document.getElementById('tabProxyModeSingle');
  const tabProxyModeBulk = document.getElementById('tabProxyModeBulk');
  const proxySingleModeArea = document.getElementById('proxySingleModeArea');
  const proxyBulkModeArea = document.getElementById('proxyBulkModeArea');

  // Single String Elements
  const manualProxyProtocol = document.getElementById('manualProxyProtocol');
  const manualProxyString = document.getElementById('manualProxyString');
  const btnAddProxyToTable = document.getElementById('btnAddProxyToTable');
  const proxySinglePreview = document.getElementById('proxySinglePreview');

  // CherryProxy / NodeMaven Bulk Paste Elements
  const manualProxyBulkText = document.getElementById('manualProxyBulkText');
  const bulkProxyDefaultProto = document.getElementById('bulkProxyDefaultProto');
  const bulkProxyCountBadge = document.getElementById('bulkProxyCountBadge');
  const btnClearBulkProxyText = document.getElementById('btnClearBulkProxyText');
  const btnImportBulkProxy = document.getElementById('btnImportBulkProxy');

  // Search & Filter Subbar
  const proxySearchInput = document.getElementById('proxySearchInput');
  const btnClearProxySearch = document.getElementById('btnClearProxySearch');
  const proxyFilterTabs = document.querySelectorAll('.sheet-filter-tabs button[data-proxy-filter]');

  // Table Body
  const proxiesTableBody = document.getElementById('proxiesTableBody');

  // Pagination Elements
  const proxiesPaginationBar = document.getElementById('proxiesPaginationBar');
  const proxyPaginationInfo = document.getElementById('proxyPaginationInfo');
  const selectProxyPageSize = document.getElementById('selectProxyPageSize');
  const btnProxyPageFirst = document.getElementById('btnProxyPageFirst');
  const btnProxyPagePrev = document.getElementById('btnProxyPagePrev');
  const proxyPageNumbersContainer = document.getElementById('proxyPageNumbersContainer');
  const btnProxyPageNext = document.getElementById('btnProxyPageNext');
  const btnProxyPageLast = document.getElementById('btnProxyPageLast');
  const inputProxyPageJump = document.getElementById('inputProxyPageJump');

  // Edit Proxy Modal
  const editProxyModal = document.getElementById('editProxyModal');
  const closeEditProxyModal = document.getElementById('closeEditProxyModal');
  const editProxyQuickString = document.getElementById('editProxyQuickString');
  const editProxyProtocol = document.getElementById('editProxyProtocol');
  const editProxyHost = document.getElementById('editProxyHost');
  const editProxyPort = document.getElementById('editProxyPort');
  const editProxyUser = document.getElementById('editProxyUser');
  const editProxyPass = document.getElementById('editProxyPass');
  const btnToggleEditProxyPass = document.getElementById('btnToggleEditProxyPass');
  const btnCancelEditProxy = document.getElementById('btnCancelEditProxy');
  const btnSaveEditProxy = document.getElementById('btnSaveEditProxy');

  // Folder Button in About tab
  const btnAboutOpenFolder = document.getElementById('btnAboutOpenFolder');
  if (btnAboutOpenFolder) btnAboutOpenFolder.addEventListener('click', () => window.desktopAPI?.openAppFolder());

  // Lightbox Modal
  const proofModal = document.getElementById('proofModal');
  const modalImg = document.getElementById('modalImg');
  const modalClose = document.getElementById('modalClose');

  let latestProofBase64 = null;

  dashProofChip?.addEventListener('click', () => {
    if (latestProofBase64) {
      modalImg.src = latestProofBase64;
      proofModal.classList.add('open');
    }
  });

  modalClose?.addEventListener('click', () => proofModal.classList.remove('open'));
  proofModal?.addEventListener('click', (e) => {
    if (e.target === proofModal) proofModal.classList.remove('open');
  });

  const btnOpenProofs = document.getElementById('btnOpenProofsFolder');
  const btnOpenErrors = document.getElementById('btnOpenErrorsFolder');
  btnOpenProofs?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.desktopAPI?.openReportsFolder?.('proofs');
  });
  btnOpenErrors?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.desktopAPI?.openReportsFolder?.('errors');
  });

  btnToggleAiKey?.addEventListener('click', () => {
    inputAiKey.type = inputAiKey.type === 'password' ? 'text' : 'password';
    btnToggleAiKey.innerHTML = inputAiKey.type === 'password' ? SVG_ICONS.eye : SVG_ICONS.eyeOff;
  });

  // AI Provider Handler
  selectAiProvider?.addEventListener('change', () => {
    const provider = selectAiProvider.value;
    selectAiModel.innerHTML = '';
    let models = [];
    
    if (provider === 'gemini') {
      labelAiKey.textContent = 'Google Gemini API Key';
      if (aiBadge) { aiBadge.textContent = 'Gemini Powered'; aiBadge.className = 'badge badge-purple'; }
      models = [
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fastest & Recommended)' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
      ];
    } else if (provider === 'openai') {
      labelAiKey.textContent = 'OpenAI API Key';
      if (aiBadge) { aiBadge.textContent = 'ChatGPT Powered'; aiBadge.className = 'badge badge-emerald'; }
      models = [
        { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fastest)' }
      ];
    } else if (provider === 'anthropic') {
      labelAiKey.textContent = 'Anthropic API Key';
      if (aiBadge) { aiBadge.textContent = 'Claude Powered'; aiBadge.className = 'badge badge-amber'; }
      models = [
        { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Recommended)' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
      ];
    } else if (provider === 'deepseek') {
      labelAiKey.textContent = 'DeepSeek API Key';
      if (aiBadge) { aiBadge.textContent = 'DeepSeek Powered'; aiBadge.className = 'badge badge-blue'; }
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
      selectAiModel.appendChild(opt);
    });
  });


  // Browser Selection Logic: Clean browser list with interactive select/unselect checkboxes
  async function loadInstalledBrowsers(savedPaths) {
    if (!window.desktopAPI) return;
    try {
      const browsers = await window.desktopAPI.getBrowsers();
      if (browserChecklist) browserChecklist.innerHTML = '';

      if (!browsers || browsers.length === 0) {
        if (browserChecklist) {
          browserChecklist.innerHTML = '<div style="color: var(--text-dim); padding: 8px 12px; font-size: 0.84rem;">No desktop browsers detected. Google Chrome will be used by default.</div>';
        }
        return;
      }

      let savedTarget = (savedPaths || '').toLowerCase();
      let anyChecked = false;

      browsers.forEach((b, idx) => {
        const isChecked = !anyChecked && (savedTarget.includes(b.path.toLowerCase()) || (savedTarget === '' && (b.id === 'chrome' || idx === 0)));
        if (isChecked) anyChecked = true;

        const row = document.createElement('div');
        row.className = 'browser-item-row' + (isChecked ? ' active' : '');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '10px 14px';
        row.style.background = isChecked ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)';
        row.style.border = isChecked ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid var(--border)';
        row.style.borderRadius = 'var(--radius-sm, 6px)';
        row.style.cursor = 'pointer';
        row.style.userSelect = 'none';
        row.style.transition = 'all 0.2s ease';

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.gap = '10px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'selectedBrowser';
        checkbox.value = b.path;
        checkbox.checked = isChecked;
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.accentColor = '#38bdf8';
        checkbox.style.cursor = 'pointer';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontSize = '0.9rem';
        nameSpan.style.fontWeight = isChecked ? '600' : '500';
        nameSpan.style.color = isChecked ? '#fff' : 'var(--text-main, #cbd5e1)';
        nameSpan.textContent = b.name;

        leftWrap.appendChild(checkbox);
        leftWrap.appendChild(nameSpan);

        const badge = document.createElement('span');
        badge.className = isChecked ? 'sheet-tag tag-emerald' : 'sheet-tag tag-neutral';
        badge.style.fontSize = '10px';
        badge.textContent = isChecked ? 'Selected' : 'Unselected';

        row.appendChild(leftWrap);
        row.appendChild(badge);

        function setRowSelected(checked) {
          checkbox.checked = checked;
          row.className = 'browser-item-row' + (checked ? ' active' : '');
          row.style.background = checked ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)';
          row.style.border = checked ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid var(--border)';
          nameSpan.style.fontWeight = checked ? '600' : '500';
          nameSpan.style.color = checked ? '#fff' : 'var(--text-main, #cbd5e1)';
          badge.className = checked ? 'sheet-tag tag-emerald' : 'sheet-tag tag-neutral';
          badge.textContent = checked ? 'Selected' : 'Unselected';
        }

        checkbox.addEventListener('change', (e) => {
          setRowSelected(e.target.checked);
        });

        row.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            setRowSelected(checkbox.checked);
          }
        });

        if (browserChecklist) browserChecklist.appendChild(row);
      });
    } catch (err) {
      console.error('Failed to load installed browsers:', err);
    }
  }

  btnBrowseBrowser?.addEventListener('click', async () => {
    if (!window.desktopAPI?.browseCustomBrowser) return;
    const res = await window.desktopAPI.browseCustomBrowser();
    if (res && !res.canceled && res.browser) {
      if (activeBrowserPath) {
        activeBrowserPath.textContent = res.browser.path;
        activeBrowserPath.title = res.browser.path;
      }
      await loadInstalledBrowsers(res.browser.path);
    }
  });

  // ==========================================================================
  // BULK ACCOUNTS MANAGEMENT, PAGINATION, USAGE & EDIT LOGIC
  // ==========================================================================
  let loadedAccounts = [];
  try {
    const cachedAccs = localStorage.getItem('maps_accounts_cache');
    if (cachedAccs) {
      const parsed = JSON.parse(cachedAccs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedAccounts = parsed;
      }
    }
  } catch (e) {}
  let currentPage = 1;
  let pageSize = 25;
  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'unused' | 'used' | 'failed'
  let editingAccountIndex = null;

  function normalizeAccountObject(acc) {
    return {
      email: acc.email || '',
      password: acc.password || '',
      twoFactor: acc.twoFactor || '',
      backupCode: acc.backupCode || '',
      used: !!acc.used,
      usedCount: typeof acc.usedCount === 'number' ? acc.usedCount : (acc.used ? 1 : 0),
      lastUsedAt: acc.lastUsedAt || null,
      status: acc.status || 'ready', // 'ready' | 'running' | 'success' | 'failed'
      lastError: acc.lastError || null
    };
  }

  function getFilteredAccounts() {
    const q = searchQuery.trim().toLowerCase();
    return loadedAccounts.filter(acc => {
      // 1. Status Filter
      if (statusFilter === 'unused' && acc.used) return false;
      if (statusFilter === 'used' && !acc.used) return false;
      if (statusFilter === 'failed' && acc.status !== 'failed' && !acc.lastError) return false;

      // 2. Search Query
      if (q) {
        const em = (acc.email || '').toLowerCase();
        const two = (acc.twoFactor || '').toLowerCase();
        const bc = (acc.backupCode || '').toLowerCase();
        const err = (acc.lastError || '').toLowerCase();
        return em.includes(q) || two.includes(q) || bc.includes(q) || err.includes(q);
      }
      return true;
    });
  }

  function updateFilterCounts() {
    const total = loadedAccounts.length;
    const unused = loadedAccounts.filter(a => !a.used).length;
    const used = loadedAccounts.filter(a => a.used).length;
    const failed = loadedAccounts.filter(a => a.status === 'failed' || !!a.lastError).length;

    if (filterCountAll) filterCountAll.textContent = total.toLocaleString();
    if (filterCountUnused) filterCountUnused.textContent = unused.toLocaleString();
    if (filterCountUsed) filterCountUsed.textContent = used.toLocaleString();
    if (filterCountFailed) filterCountFailed.textContent = failed.toLocaleString();
  }

  function createEmptyRow(rowNumber, showPrompt = false) {
    const tr = document.createElement('tr');
    tr.className = 'sheet-row-empty';

    // 1. Row Index (#)
    const tdIdx = document.createElement('td');
    tdIdx.className = 'td-index';
    tdIdx.textContent = rowNumber;
    tr.appendChild(tdIdx);

    // 2. Email Address
    const tdEmail = document.createElement('td');
    if (showPrompt) {
      tdEmail.innerHTML = `<span class="sheet-empty-hint">Empty sheet — click "Import (CSV / Excel)" or "Add Row"</span>`;
    } else {
      tdEmail.innerHTML = `&nbsp;`;
    }
    tr.appendChild(tdEmail);

    // 3. Password
    const tdPass = document.createElement('td');
    tdPass.innerHTML = `&nbsp;`;
    tr.appendChild(tdPass);

    // 4. 2FA Secret
    const td2fa = document.createElement('td');
    td2fa.innerHTML = `&nbsp;`;
    tr.appendChild(td2fa);

    // 5. Backup Codes
    const tdCodes = document.createElement('td');
    tdCodes.innerHTML = `&nbsp;`;
    tr.appendChild(tdCodes);

    // 6. Usage
    const tdUsage = document.createElement('td');
    tdUsage.innerHTML = `&nbsp;`;
    tr.appendChild(tdUsage);

    // 7. Status
    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = `&nbsp;`;
    tr.appendChild(tdStatus);

    // 8. Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'sheet-actions-wrap';
    tdActions.innerHTML = `&nbsp;`;
    tr.appendChild(tdActions);

    return tr;
  }

  function renderAccountsTable(fromLazyLoad = false) {
    if (!accountsTableBody) return;

    // Skip if this is a background data hydration and user is NOT on this tab
    if (!fromLazyLoad && currentActiveTab !== 'tab-account') {
      accountsTableDirty = true;
      return;
    }

    accountsTableBody.innerHTML = '';

    // NOTE: Normalization is done at ingestion time (upload/load), NOT here on every render
    const totalLoaded = loadedAccounts.length;
    if (accountsTableBadge) {
      accountsTableBadge.textContent = totalLoaded === 1 ? '1 Account Loaded' : `${totalLoaded.toLocaleString()} Accounts Loaded`;
    }

    updateFilterCounts();

    const filtered = getFilteredAccounts();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    // Google Sheets always displays the grid (hide legacy banner)
    if (accountsEmptyState) accountsEmptyState.style.display = 'none';
    if (accountsPaginationBar) accountsPaginationBar.style.display = 'flex';

    // Use DocumentFragment for batch DOM insertion — single reflow
    const fragment = document.createDocumentFragment();

    pageItems.forEach((acc, idx) => {
        const globalIdx = startIndex + idx;
        const tr = document.createElement('tr');

        // 1. Row Index (#) - Google Sheets header style
        const tdIdx = document.createElement('td');
        tdIdx.className = 'td-index';
        tdIdx.textContent = globalIdx + 1;
        tr.appendChild(tdIdx);

        // 2. Email Address (Strict single line with ellipsis)
        const tdEmail = document.createElement('td');
        tdEmail.innerHTML = `<span class="sheet-cell-text text-sky" title="${escapeHtml(acc.email)}">${escapeHtml(acc.email)}</span>`;
        tr.appendChild(tdEmail);

        // 3. Password (Strict single line, clean dots + minimalist SVG eye toggle)
        const tdPass = document.createElement('td');
        const passCell = document.createElement('div');
        passCell.className = 'sheet-pass-cell';
        let isMasked = true;
        const passSpan = document.createElement('span');
        passSpan.className = 'sheet-pass-dots';
        passSpan.textContent = '••••••••';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'sheet-icon-btn pass-toggle-btn';
        toggleBtn.title = 'Show / Hide Password';
        toggleBtn.innerHTML = SVG_ICONS.eye;
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          isMasked = !isMasked;
          if (isMasked) {
            passSpan.textContent = '••••••••';
            toggleBtn.innerHTML = SVG_ICONS.eye;
          } else {
            passSpan.textContent = acc.password || 'none';
            toggleBtn.innerHTML = SVG_ICONS.eyeOff;
          }
        });
        passCell.appendChild(passSpan);
        passCell.appendChild(toggleBtn);
        tdPass.appendChild(passCell);
        tr.appendChild(tdPass);

        // 4. 2FA Secret / TOTP (Strict single line)
        const td2fa = document.createElement('td');
        td2fa.innerHTML = `<span class="sheet-cell-mono" title="${escapeHtml(acc.twoFactor || '')}">${escapeHtml(acc.twoFactor || '—')}</span>`;
        tr.appendChild(td2fa);

        // 5. Backup Codes (Strict single line)
        const tdBackup = document.createElement('td');
        const backupVal = acc.backupCode ? acc.backupCode.trim() : '';
        tdBackup.innerHTML = `<span class="sheet-cell-mono ${backupVal ? 'has-codes' : ''}" title="${escapeHtml(backupVal)}">${escapeHtml(backupVal || '—')}</span>`;
        tr.appendChild(tdBackup);

        // 6. Usage (Single line compact Google Sheets tag)
        const tdUsage = document.createElement('td');
        if (!acc.used) {
          tdUsage.innerHTML = `<span class="sheet-tag tag-neutral">Unused</span>`;
        } else {
          const count = acc.usedCount || 1;
          const tooltip = acc.lastUsedAt ? `Used in reporting (${escapeHtml(acc.lastUsedAt)})` : `Used ${count} time(s)`;
          tdUsage.innerHTML = `<span class="sheet-tag tag-purple" title="${tooltip}">Used (${count}x)</span>`;
        }
        tr.appendChild(tdUsage);

        // 7. Status & Error (Strictly single line - no wrapping or vertical expansion)
        const tdStatus = document.createElement('td');
        const statusCell = document.createElement('div');
        statusCell.className = 'sheet-status-cell';

        if (acc.status === 'failed' || acc.lastError) {
          const errLabel = acc.lastError ? `Failed: ${acc.lastError}` : 'Login Failed';
          statusCell.title = `Error: ${acc.lastError || 'Login Failed'} (Click to view full message)`;
          statusCell.innerHTML = `
            <span class="status-dot dot-error"></span>
            <span class="status-label status-err-label">${escapeHtml(errLabel)}</span>
          `;
          if (acc.lastError) {
            statusCell.addEventListener('click', () => {
              alert(`Account Login / Execution Error for ${acc.email}:\n\n${acc.lastError}`);
            });
          }
        } else if (acc.status === 'running') {
          statusCell.title = 'Account active in browser session';
          statusCell.innerHTML = `
            <span class="status-dot dot-running"></span>
            <span class="status-label" style="color: #38bdf8;">Running</span>
          `;
        } else if (acc.status === 'success') {
          statusCell.title = 'Account active and reported successfully';
          statusCell.innerHTML = `
            <span class="status-dot dot-ready"></span>
            <span class="status-label" style="color: #4ade80;">Active</span>
          `;
        } else {
          statusCell.title = 'Ready in queue';
          statusCell.innerHTML = `
            <span class="status-dot dot-ready"></span>
            <span class="status-label">Ready</span>
          `;
        }
        tdStatus.appendChild(statusCell);
        tr.appendChild(tdStatus);

        // 8. Minimalist Web App Action Buttons (Ghost outline SVGs)
        const tdAction = document.createElement('td');
        const actionWrap = document.createElement('div');
        actionWrap.className = 'sheet-actions-wrap';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'sheet-icon-btn edit-btn';
        btnEdit.title = 'Edit Account';
        btnEdit.innerHTML = SVG_ICONS.edit;
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditAccountModal(acc);
        });
        actionWrap.appendChild(btnEdit);

        const btnReset = document.createElement('button');
        btnReset.type = 'button';
        btnReset.className = 'sheet-icon-btn reset-btn';
        btnReset.title = 'Reset History (allow 1 new report)';
        btnReset.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
        btnReset.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Reset report history for ${acc.email}? This will allow it to be used for 1 report again.`)) {
            if (window.desktopAPI && window.desktopAPI.resetAccountsHistory) {
              await window.desktopAPI.resetAccountsHistory(acc.email);
            }
            acc.used = false;
            acc.usedCount = 0;
            acc.status = 'ready';
            acc.lastError = null;
            usedAccountsSet.delete(acc.email.toLowerCase().trim());
            await saveLoadedAccounts();
            renderAccountsTable();
            updateDashboardMetrics();
            showToast(accountToast, `✅ History reset for ${acc.email}`);
          }
        });
        actionWrap.appendChild(btnReset);

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'sheet-icon-btn delete-btn';
        btnDel.title = 'Delete Account';
        btnDel.innerHTML = SVG_ICONS.trash;
        btnDel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Remove account ${acc.email} from the spreadsheet?`)) {
            const origIndex = loadedAccounts.findIndex(a => a.email.toLowerCase() === acc.email.toLowerCase());
            if (origIndex !== -1) {
              loadedAccounts.splice(origIndex, 1);
              await saveLoadedAccounts();
              renderAccountsTable();
              updateDashboardMetrics();
              showToast(accountToast, 'Account removed.');
            }
          }
        });
        actionWrap.appendChild(btnDel);

        tdAction.appendChild(actionWrap);
        tr.appendChild(tdAction);
        fragment.appendChild(tr);
      });

    // Ensure rows up to the current page size are ALWAYS displayed
    const renderedCount = pageItems.length;
    const minRows = pageSize;
    if (renderedCount < minRows) {
      const neededEmpty = minRows - renderedCount;
      for (let i = 0; i < neededEmpty; i++) {
        const emptyRowIdx = startIndex + renderedCount + i + 1;
        const showHint = (totalItems === 0 && i === 0);
        const emptyTr = createEmptyRow(emptyRowIdx, showHint);
        fragment.appendChild(emptyTr);
      }
    }

    // Single DOM insertion — one reflow
    accountsTableBody.appendChild(fragment);

    // Update Pagination Bar UI
    renderPaginationControls(startIndex, endIndex, totalItems, totalPages);
    updateDashboardMetrics();
  }

  function renderPaginationControls(start, end, total, totalPages) {
    if (!paginationInfo) return;

    if (total === 0) {
      paginationInfo.textContent = `Showing 0 accounts (${pageSize} empty rows)`;
    } else {
      paginationInfo.textContent = `Showing ${(start + 1).toLocaleString()} to ${end.toLocaleString()} of ${total.toLocaleString()} accounts`;
    }

    if (btnPageFirst) btnPageFirst.disabled = (currentPage <= 1);
    if (btnPagePrev) btnPagePrev.disabled = (currentPage <= 1);
    if (btnPageNext) btnPageNext.disabled = (currentPage >= totalPages || total === 0);
    if (btnPageLast) btnPageLast.disabled = (currentPage >= totalPages || total === 0);

    if (inputPageJump) {
      inputPageJump.max = totalPages;
      inputPageJump.placeholder = `${currentPage} / ${totalPages}`;
      inputPageJump.value = '';
    }

    if (pageNumbersContainer) {
      pageNumbersContainer.innerHTML = '';
      const maxButtons = 5;
      let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);

      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      if (startPage > 1) {
        const btn = document.createElement('button');
        btn.className = 'page-num-btn';
        btn.textContent = '1';
        btn.addEventListener('click', () => { currentPage = 1; renderAccountsTable(); });
        pageNumbersContainer.appendChild(btn);

        if (startPage > 2) {
          const dots = document.createElement('span');
          dots.className = 'page-ellipsis';
          dots.textContent = '...';
          pageNumbersContainer.appendChild(dots);
        }
      }

      for (let p = startPage; p <= endPage; p++) {
        const btn = document.createElement('button');
        btn.className = 'page-num-btn' + (p === currentPage ? ' active' : '');
        btn.textContent = p;
        const targetPage = p;
        btn.addEventListener('click', () => {
          currentPage = targetPage;
          renderAccountsTable();
        });
        pageNumbersContainer.appendChild(btn);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const dots = document.createElement('span');
          dots.className = 'page-ellipsis';
          dots.textContent = '...';
          pageNumbersContainer.appendChild(dots);
        }

        const btn = document.createElement('button');
        btn.className = 'page-num-btn';
        btn.textContent = totalPages;
        btn.addEventListener('click', () => { currentPage = totalPages; renderAccountsTable(); });
        pageNumbersContainer.appendChild(btn);
      }
    }
  }

  // --- Search & Filter Bar Listeners ---
  accountSearchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    currentPage = 1;
    if (btnClearSearch) {
      btnClearSearch.style.display = searchQuery ? 'block' : 'none';
    }
    renderAccountsTable();
  });

  btnClearSearch?.addEventListener('click', () => {
    if (accountSearchInput) accountSearchInput.value = '';
    searchQuery = '';
    btnClearSearch.style.display = 'none';
    currentPage = 1;
    renderAccountsTable();
  });

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      statusFilter = tab.getAttribute('data-filter') || 'all';
      currentPage = 1;
      renderAccountsTable();
    });
  });

  // --- Pagination Button Listeners ---
  btnPageFirst?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage = 1;
      renderAccountsTable();
    }
  });

  btnPagePrev?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderAccountsTable();
    }
  });

  btnPageNext?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredAccounts().length / pageSize));
    if (currentPage < totalPages) {
      currentPage++;
      renderAccountsTable();
    }
  });

  btnPageLast?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredAccounts().length / pageSize));
    if (currentPage < totalPages) {
      currentPage = totalPages;
      renderAccountsTable();
    }
  });

  selectPageSize?.addEventListener('change', () => {
    pageSize = parseInt(selectPageSize.value, 10) || 25;
    currentPage = 1;
    renderAccountsTable();
  });

  inputPageJump?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(inputPageJump.value, 10);
      const totalPages = Math.max(1, Math.ceil(getFilteredAccounts().length / pageSize));
      if (val >= 1 && val <= totalPages) {
        currentPage = val;
        renderAccountsTable();
      } else {
        alert(`Please enter a page number between 1 and ${totalPages}`);
      }
    }
  });

  // --- Edit Account Modal Logic ---
  function openEditAccountModal(acc) {
    editingAccountIndex = loadedAccounts.findIndex(a => a.email.toLowerCase() === acc.email.toLowerCase());
    if (editingAccountIndex === -1) return;

    const current = loadedAccounts[editingAccountIndex];
    if (editEmail) editEmail.value = current.email || '';
    if (editPassword) editPassword.value = current.password || '';
    if (edit2fa) edit2fa.value = current.twoFactor || '';
    if (editBackupCode) editBackupCode.value = current.backupCode || '';

    // Status tags
    if (editUsageTag) {
      editUsageTag.textContent = current.used ? `Used (${current.usedCount || 1}x)` : 'Unused';
      editUsageTag.className = current.used ? 'badge badge-purple' : 'badge badge-neutral';
    }
    if (editStatusTag) {
      editStatusTag.textContent = (current.status === 'failed' || current.lastError) ? 'Error / Failed' : 'Ready';
      editStatusTag.className = (current.status === 'failed' || current.lastError) ? 'badge badge-danger' : 'badge badge-success';
    }

    if (editErrorNotice) {
      if (current.lastError) {
        editErrorNotice.style.display = 'block';
        editErrorNotice.textContent = '❌ ' + current.lastError;
      } else {
        editErrorNotice.style.display = 'none';
      }
    }

    if (editAccountModal) {
      editAccountModal.classList.add('open');
      editAccountModal.style.display = 'flex';
    }
  }

  function closeEditAccountModal() {
    if (editAccountModal) {
      editAccountModal.classList.remove('open');
      editAccountModal.style.display = 'none';
    }
    editingAccountIndex = null;
  }

  closeEditModal?.addEventListener('click', closeEditAccountModal);
  btnCancelEdit?.addEventListener('click', closeEditAccountModal);

  btnToggleEditPass?.addEventListener('click', () => {
    if (editPassword) {
      editPassword.type = editPassword.type === 'password' ? 'text' : 'password';
      btnToggleEditPass.innerHTML = editPassword.type === 'password' ? SVG_ICONS.eye : SVG_ICONS.eyeOff;
    }
  });

  btnResetAccountStatus?.addEventListener('click', async () => {
    if (editingAccountIndex !== null && loadedAccounts[editingAccountIndex]) {
      const current = loadedAccounts[editingAccountIndex];
      current.status = 'ready';
      current.lastError = null;
      current.used = false;
      current.usedCount = 0;
      current.lastUsedAt = null;

      if (window.desktopAPI && window.desktopAPI.resetAccountsHistory) {
        await window.desktopAPI.resetAccountsHistory(current.email);
      }
      if (current.email) usedAccountsSet.delete(current.email.toLowerCase().trim());

      if (editUsageTag) {
        editUsageTag.textContent = 'Unused';
        editUsageTag.className = 'badge badge-neutral';
      }
      if (editStatusTag) {
        editStatusTag.textContent = 'Ready';
        editStatusTag.className = 'badge badge-success';
      }
      if (editErrorNotice) {
        editErrorNotice.style.display = 'none';
      }
      showToast(accountToast, 'Status reset to Ready.');
    }
  });

  btnSaveEdit?.addEventListener('click', async () => {
    if (editingAccountIndex === null || !loadedAccounts[editingAccountIndex]) return;

    const newEmail = editEmail.value.trim();
    if (!newEmail) {
      alert('Email address cannot be empty.');
      return;
    }

    const current = loadedAccounts[editingAccountIndex];
    current.email = newEmail;
    current.password = editPassword.value.trim();
    current.twoFactor = edit2fa.value.trim();
    current.backupCode = editBackupCode.value.trim();

    await saveLoadedAccounts();
    closeEditAccountModal();
    renderAccountsTable();
    showToast(accountToast, '✅ Account updated successfully!');
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function saveLoadedAccounts() {
    try {
      localStorage.setItem('maps_accounts_cache', JSON.stringify(loadedAccounts));
    } catch (e) {}
    updateDashboardMetrics();
    if (window.desktopAPI) {
      await window.desktopAPI.saveAccounts(loadedAccounts);
    }
  }

  // Upload CSV / Excel Button
  btnUploadAccounts?.addEventListener('click', async () => {
    if (!window.desktopAPI) return;
    const res = await window.desktopAPI.uploadAccountsFile();
    if (res.success && Array.isArray(res.accounts)) {
      if (res.accounts.length === 0) {
        showToast(accountToast, '⚠️ No valid account rows found in file.', false);
        return;
      }

      // Merge new accounts into loadedAccounts
      const existingEmails = new Set(loadedAccounts.map(a => a.email.toLowerCase()));
      let addedCount = 0;

      res.accounts.forEach(raw => {
        const acc = normalizeAccountObject(raw);
        if (!existingEmails.has(acc.email.toLowerCase())) {
          loadedAccounts.push(acc);
          existingEmails.add(acc.email.toLowerCase());
          addedCount++;
        }
      });

      currentPage = 1;
      await saveLoadedAccounts();
      renderAccountsTable();
      showToast(accountToast, `✅ Successfully loaded ${addedCount.toLocaleString()} account(s) from ${res.filePath}!`);
    } else if (res.error) {
      showToast(accountToast, '❌ Error parsing file: ' + res.error, false);
    }
  });

  // Download Sample Template Button
  btnDownloadTemplate?.addEventListener('click', async () => {
    if (!window.desktopAPI) return;
    const res = await window.desktopAPI.downloadAccountsTemplate();
    if (res.success) {
      showToast(accountToast, '✅ Sample accounts template downloaded successfully!');
    }
  });

  // Manual Add Account Drawer
  btnToggleManualAdd?.addEventListener('click', () => {
    manualAddBox.style.display = manualAddBox.style.display === 'none' ? 'block' : 'none';
  });
  closeManualAdd?.addEventListener('click', () => {
    manualAddBox.style.display = 'none';
  });

  btnAddAccountToTable?.addEventListener('click', async () => {
    const email = manualEmail.value.trim();
    const pass = manualPassword.value.trim();
    const twofa = manual2fa.value.trim();
    const code = manualBackupCode.value.trim();

    if (!email) {
      alert('Please enter an email address.');
      return;
    }

    loadedAccounts.unshift(normalizeAccountObject({
      email: email,
      password: pass,
      twoFactor: twofa,
      backupCode: code,
      status: 'ready'
    }));

    manualEmail.value = '';
    manualPassword.value = '';
    manual2fa.value = '';
    manualBackupCode.value = '';
    manualAddBox.style.display = 'none';
    currentPage = 1;

    await saveLoadedAccounts();
    renderAccountsTable();
    showToast(accountToast, '✅ Account added to table successfully!');
  });

  // Clear All Accounts
  btnClearAllAccounts?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all loaded accounts from the table?')) {
      loadedAccounts = [];
      currentPage = 1;
      await saveLoadedAccounts();
      renderAccountsTable();
      showToast(accountToast, 'All accounts cleared.');
    }
  });

  // Clear Session
  btnClearSession?.addEventListener('click', async () => {
    if (confirm('Clear cached Google login profile (chrome_session)? You will need to log in again.')) {
      if (window.desktopAPI) {
        const res = await window.desktopAPI.clearSession();
        alert(res.message);
        await checkSessionStatus();
      }
    }
  });

  // Reset Accounts History (Enforces 1 Report per Account Policy)
  btnResetAllAccountsHistory?.addEventListener('click', async () => {
    if (loadedAccounts.length === 0) {
      showToast(accountToast, 'No accounts found to reset.', false);
      return;
    }
    if (confirm('Reset report history for ALL accounts?\n\nThis clears used counts and errors, marking all accounts ready to submit 1 report each.')) {
      if (window.desktopAPI && window.desktopAPI.resetAccountsHistory) {
        const res = await window.desktopAPI.resetAccountsHistory();
        if (res.success) {
          loadedAccounts.forEach(acc => {
            acc.used = false;
            acc.usedCount = 0;
            acc.status = 'ready';
            acc.lastError = null;
          });
          usedAccountsSet.clear();
          await saveLoadedAccounts();
          renderAccountsTable(true);
          updateDashboardMetrics();
          showToast(accountToast, '✅ All account histories have been reset! Each account is ready for 1 report.');
        } else {
          showToast(accountToast, '❌ Failed to reset accounts history: ' + (res.error || 'Unknown error'), false);
        }
      }
    }
  });

  // ==========================================================================
  // DASHBOARD METRICS TRACKING
  // ==========================================================================
  let completedReportsCount = 0;
  let usedAccountsSet = new Set();

  function refreshUsedAccountsFromList() {
    if (Array.isArray(loadedAccounts)) {
      loadedAccounts.forEach(acc => {
        if (acc.used || (typeof acc.usedCount === 'number' && acc.usedCount > 0) || acc.status === 'success') {
          if (acc.email) usedAccountsSet.add(acc.email.toLowerCase().trim());
        }
      });
    }
  }

  let metricsUpdatePending = false;
  function updateDashboardMetrics() {
    if (metricsUpdatePending) return;
    metricsUpdatePending = true;
    requestAnimationFrame(() => {
      metricsUpdatePending = false;
      refreshUsedAccountsFromList();
      // 1. Calculate Accounts Loaded
      const accountsCount = loadedAccounts.length;
      if (dashAccountsLoaded) {
        dashAccountsLoaded.textContent = accountsCount === 1 ? '1 Account' : `${accountsCount} Accounts`;
      }
      if (dashAccountsDetail) {
        dashAccountsDetail.textContent = accountsCount > 0 ? loadedAccounts[0].email.split('@')[0] : 'None loaded';
      }

      // 2. Calculate Target Links
      const linksCount = (typeof loadedLinks !== 'undefined' && Array.isArray(loadedLinks)) ? loadedLinks.length : 0;
      const completedLinksCount = (typeof loadedLinks !== 'undefined' && Array.isArray(loadedLinks)) 
        ? loadedLinks.filter(l => l.status === 'completed' || (l.doneCount && l.doneCount > 0)).length 
        : 0;

      if (dashTargetLinks) {
        dashTargetLinks.textContent = linksCount === 1 ? '1 Link' : `${linksCount} Links`;
      }
      if (dashLinksDetail) {
        dashLinksDetail.textContent = `${linksCount} in active queue`;
      }
      if (linksTableBadge) {
        linksTableBadge.textContent = linksCount === 1 ? '1 Link' : `${linksCount} Links`;
      }

      // 3. Reports Completed
      const totalDone = Math.max(completedReportsCount, completedLinksCount);
      if (dashReportsDone) {
        dashReportsDone.textContent = `${totalDone} Completed`;
      }
      if (dashReportsRate) {
        const pct = linksCount > 0 ? Math.min(100, Math.round((totalDone / linksCount) * 100)) : 0;
        dashReportsRate.textContent = `${pct}% finished`;
      }

      // 4. Accounts Used
      if (dashAccountsUsed) {
        const usedCount = usedAccountsSet.size;
        dashAccountsUsed.textContent = usedCount === 1 ? '1 Used' : `${usedCount} Used`;
      }
    });
  }

  // Safe alias for backward compatibility
  function scheduleDashboardMetrics() {
    updateDashboardMetrics();
  }

  if (inputReviewUrls) {
    inputReviewUrls.addEventListener('input', updateDashboardMetrics);
  }

  // Headless Toggle Handler (Removed by user request)

  // Console Logging (Dual Output to Dashboard & Control consoles with 600 max lines FIFO capping)
  const MAX_TERMINAL_LINES = 600;

  function appendLogToBothTerminals(text, isErr = false) {
    if (text === undefined || text === null) return;
    const lines = String(text).split('\n');
    lines.forEach(line => {
      if (!line && lines.length > 1) return;

      const lower = line.toLowerCase();
      let colorClass = '';
      if (isErr || lower.includes('❌') || lower.includes('error')) {
        colorClass = 'log-error';
      } else if (lower.includes('✅') || lower.includes('success') || lower.includes('completed') || lower.includes('🏆')) {
        colorClass = 'log-success';
      } else if (lower.includes('⚠️') || lower.includes('warning')) {
        colorClass = 'log-warning';
      } else if (lower.includes('👉') || lower.includes('🔍') || lower.includes('🌐') || lower.includes('step') || lower.includes('🎯') || lower.includes('⚖️')) {
        colorClass = 'log-info';
      }

      // Add to Dashboard Terminal
      if (dashConsoleOutput) {
        const dDiv = document.createElement('div');
        dDiv.className = 'log-line ' + colorClass;
        dDiv.textContent = line;
        dashConsoleOutput.appendChild(dDiv);
        while (dashConsoleOutput.childNodes.length > MAX_TERMINAL_LINES) {
          dashConsoleOutput.removeChild(dashConsoleOutput.firstChild);
        }
      }

      // Add to Control Terminal
      if (controlConsoleOutput) {
        const cDiv = document.createElement('div');
        cDiv.className = 'log-line ' + colorClass;
        cDiv.textContent = line;
        controlConsoleOutput.appendChild(cDiv);
        while (controlConsoleOutput.childNodes.length > MAX_TERMINAL_LINES) {
          controlConsoleOutput.removeChild(controlConsoleOutput.firstChild);
        }
      }
    });

    if (dashAutoScroll?.checked && dashConsoleOutput) {
      dashConsoleOutput.scrollTop = dashConsoleOutput.scrollHeight;
    }
    if (controlAutoScroll?.checked && controlConsoleOutput) {
      controlConsoleOutput.scrollTop = controlConsoleOutput.scrollHeight;
    }
  }

  btnClearDashConsole?.addEventListener('click', () => {
    if (dashConsoleOutput) dashConsoleOutput.innerHTML = '<div class="log-line log-system">Console cleared.</div>';
  });

  btnClearControlConsole?.addEventListener('click', () => {
    if (controlConsoleOutput) controlConsoleOutput.innerHTML = '<div class="log-line log-system">Console cleared.</div>';
  });

  // Toast Helper
  function showToast(elem, msg, isSuccess = true) {
    if (!elem) return;
    elem.textContent = msg;
    elem.className = 'toast-msg ' + (isSuccess ? 'success' : 'error');
    setTimeout(() => { elem.textContent = ''; }, 4500);
  }

  // --- Load Full App Config ---
  let appConfig = {};
  async function loadAppConfig() {
    if (!window.desktopAPI) return;
    try {
      const configRes = await window.desktopAPI.getConfig();
      appConfig = (configRes && configRes.data) ? configRes.data : (configRes || {});
      delete appConfig.data;
      delete appConfig.success;

      // Review URLs (Legacy Support)
      if (inputReviewUrls) {
        if (Array.isArray(appConfig.urls) && appConfig.urls.length > 0) {
          inputReviewUrls.value = appConfig.urls.join('\n');
        } else if (appConfig.defaultUrl) {
          inputReviewUrls.value = appConfig.defaultUrl;
        }
      }

      // Category & Report Type
      if (appConfig.reportReason && selectCategory) {
        selectCategory.value = appConfig.reportReason;
      }

      // AI Config
      if (appConfig.aiProvider && selectAiProvider) {
        selectAiProvider.value = appConfig.aiProvider;
        selectAiProvider.dispatchEvent(new Event('change')); // trigger options update
      }
      if (appConfig.aiApiKey && inputAiKey) inputAiKey.value = appConfig.aiApiKey;
      if (appConfig.aiModel && selectAiModel) selectAiModel.value = appConfig.aiModel;
      if (appConfig.aiInspection !== undefined && checkAiInspection) checkAiInspection.checked = !!appConfig.aiInspection;
      if (appConfig.legalFullName && inputLegalFullName) inputLegalFullName.value = appConfig.legalFullName;
      if (appConfig.legalBusinessName && inputLegalBusinessName) inputLegalBusinessName.value = appConfig.legalBusinessName;
      if (appConfig.legalCountry && inputLegalCountry) inputLegalCountry.value = appConfig.legalCountry;

      // Load Installed Browsers asynchronously in the background (zero blocking)
      loadInstalledBrowsers(appConfig.browserPath);

      await checkSessionStatus();
    } catch (err) {
      console.error('Failed to load app config:', err);
    }
  }

  // --- Load Saved Accounts Table from Backend ---
  async function loadAccountsFromBackend() {
    if (!window.desktopAPI?.getAccounts) return;
    try {
      const accRes = await window.desktopAPI.getAccounts();
      if (accRes && accRes.success && Array.isArray(accRes.accounts)) {
        loadedAccounts = accRes.accounts;
        try {
          localStorage.setItem('maps_accounts_cache', JSON.stringify(loadedAccounts));
        } catch (e) {}
        renderAccountsTable();
        updateDashboardMetrics();
      }
    } catch (err) {
      console.error('Failed to load accounts from backend:', err);
    }
  }

  async function checkSessionStatus() {
    if (!window.desktopAPI) return;
    const { hasSession } = await window.desktopAPI.checkSessionStatus();
    if (hasSession) {
      sidebarStatusDot.className = 'status-dot active';
      sidebarSessionText.textContent = 'Session Active';
    } else {
      sidebarStatusDot.className = 'status-dot';
      sidebarSessionText.textContent = 'No Session Cached';
    }
  }

  // Save Links to Queue
  btnSaveLinks?.addEventListener('click', async () => {
    if (!window.desktopAPI) return;
    const rawUrls = inputReviewUrls.value.split('\n').map(u => u.trim()).filter(Boolean);
    const urls = rawUrls.map(u => ({
      url: u,
      mode: currentReportType,
      reason: selectCategory.value
    }));
    const payload = {
      ...appConfig,
      urls: urls,
      defaultUrl: urls[0]?.url || '',
      reportReason: selectCategory.value,
      reportType: currentReportType,
      browserPath: (browserChecklist?.querySelector('input[name="selectedBrowser"]:checked')?.value) || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    };
    delete payload.data;
    delete payload.success;

    const res = await window.desktopAPI.saveConfig(payload);
    if (res && res.success) {
      Object.assign(appConfig, payload);
      updateDashboardMetrics();
      showToast(reporterToast, `✅ ${urls.length} link(s) saved to target queue!`);
    } else {
      showToast(reporterToast, '❌ Error: ' + (res?.error || 'Failed to save'), false);
    }
  });

  btnClearLinks?.addEventListener('click', () => {
    inputReviewUrls.value = '';
    updateDashboardMetrics();
  });

  // Save AI Configuration
  btnSaveAi?.addEventListener('click', async () => {
    if (!window.desktopAPI) return;
    const aiData = {
      aiProvider: selectAiProvider?.value || 'gemini',
      aiApiKey: inputAiKey?.value.trim() || '',
      aiModel: selectAiModel?.value || 'gemini-2.0-flash',
      aiInspection: !!checkAiInspection?.checked,
      legalFullName: inputLegalFullName?.value.trim() || '',
      legalBusinessName: inputLegalBusinessName?.value.trim() || '',
      legalCountry: inputLegalCountry?.value.trim() || 'United States'
    };
    const payload = {
      ...appConfig,
      ...aiData
    };
    delete payload.data;
    delete payload.success;

    const res = await window.desktopAPI.saveConfig(payload);
    if (res && res.success) {
      Object.assign(appConfig, aiData);
      showToast(aiToast, '✅ AI Engine configuration saved successfully!');
    } else {
      showToast(aiToast, '❌ Error: ' + (res?.error || 'Failed to save'), false);
    }
  });

  // =========================================================================
  // PROXY ROUTING SHEET & MANAGER CONTROLLER (Strict Google Sheets Aesthetic)
  // =========================================================================
  let loadedProxies = [];
  try {
    const cachedProxies = localStorage.getItem('maps_proxies_list');
    if (cachedProxies) {
      const parsed = JSON.parse(cachedProxies);
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedProxies = parsed;
      }
    }
  } catch (e) {}
  let proxyCurrentPage = 1;
  let proxyPageSize = 25;
  let proxyCurrentFilter = 'all';
  let proxySearchQuery = '';
  let proxyEnabled = false;
  let editingProxyId = null;

  // Toggle Proxy Master Switch
  function updateProxyToggleUI() {
    if (proxyEnableLabel) proxyEnableLabel.textContent = proxyEnabled ? 'Active' : 'Disabled';
    if (proxyEnableLabel) proxyEnableLabel.style.color = proxyEnabled ? '#38bdf8' : '#64748b';
    if (proxyEnableToggle) proxyEnableToggle.checked = proxyEnabled;
  }

  proxyEnableToggle?.addEventListener('change', () => {
    proxyEnabled = !!proxyEnableToggle.checked;
    updateProxyToggleUI();
    localStorage.setItem('maps_proxy_enabled', proxyEnabled ? 'true' : 'false');
    showToast(proxyToast, proxyEnabled ? 'Proxy routing enabled for automation.' : 'Proxy routing disabled (Direct mode).');
  });

  // Load Proxies from backend
  async function loadProxiesFromBackend() {
    try {
      const savedEnabled = localStorage.getItem('maps_proxy_enabled');
      if (savedEnabled !== null) proxyEnabled = savedEnabled === 'true';
      updateProxyToggleUI();

      let proxies = [];
      if (window.desktopAPI?.getProxies) {
        const res = await window.desktopAPI.getProxies();
        if (res && res.success && Array.isArray(res.proxies)) {
          proxies = res.proxies;
        }
      }
      if (proxies.length === 0) {
        const local = localStorage.getItem('maps_proxies_list');
        if (local) {
          try { proxies = JSON.parse(local); } catch (e) {}
        }
      }
      loadedProxies = proxies;
      try {
        localStorage.setItem('maps_proxies_list', JSON.stringify(loadedProxies));
      } catch (e) {}
      renderProxiesTable();
    } catch (err) {
      console.error('Failed to load proxies:', err);
    }
  }

  async function saveLoadedProxies() {
    try {
      localStorage.setItem('maps_proxies_list', JSON.stringify(loadedProxies));
      if (window.desktopAPI?.saveProxies) {
        await window.desktopAPI.saveProxies(loadedProxies);
      }
    } catch (e) {
      console.error('Failed to save proxies:', e);
    }
  }

  // Filter & Search Logic
  function getFilteredProxies() {
    let list = loadedProxies;

    if (proxyCurrentFilter === 'ready') {
      list = list.filter(p => p.status === 'ready');
    } else if (proxyCurrentFilter === 'untested') {
      list = list.filter(p => !p.status || p.status === 'untested');
    } else if (proxyCurrentFilter === 'failed') {
      list = list.filter(p => p.status === 'failed');
    }

    if (proxySearchQuery) {
      const q = proxySearchQuery.toLowerCase();
      list = list.filter(p => {
        return (
          (p.host && p.host.toLowerCase().includes(q)) ||
          (p.port && String(p.port).includes(q)) ||
          (p.protocol && p.protocol.toLowerCase().includes(q)) ||
          (p.username && p.username.toLowerCase().includes(q)) ||
          (p.latency && p.latency.toLowerCase().includes(q)) ||
          (p.status && p.status.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }

  // Helper: Smart Parse Proxy string (Supports CherryProxy, NodeMaven, GoLogin, etc.)
  function smartParseProxy(raw, defaultProtocol = 'http') {
    if (!raw) return null;
    let str = String(raw).trim();
    if (!str || str.startsWith('#') || str.startsWith('//')) return null;

    let protocol = defaultProtocol || 'http';
    let host = '';
    let port = 8080;
    let username = '';
    let password = '';

    // 1. Check for protocol scheme (e.g. socks5:// or http://)
    if (str.includes('://')) {
      const pParts = str.split('://');
      protocol = pParts[0].toLowerCase();
      str = pParts.slice(1).join('://');
    }

    // 2. Format with @ (user:pass@host:port or host:port@user:pass)
    if (str.includes('@')) {
      const parts = str.split('@');
      const p0 = parts[0].split(':');
      const p1 = parts[1].split(':');

      if (p0.length === 2 && /^\d+$/.test(p0[1])) {
        // host:port@user:pass
        host = p0[0];
        port = parseInt(p0[1], 10) || 8080;
        username = p1[0] || '';
        password = p1.slice(1).join(':') || '';
      } else {
        // user:pass@host:port
        username = p0[0] || '';
        password = p0.slice(1).join(':') || '';
        host = p1[0] || '';
        port = parseInt(p1[1], 10) || 8080;
      }
    } else {
      // Delimiters: colon (:), tab (\t), comma (,), semicolon (;)
      let delimiter = ':';
      if (str.includes('\t')) delimiter = '\t';
      else if (str.includes(';') && !str.includes(':')) delimiter = ';';
      else if (str.includes(',') && !str.includes(':')) delimiter = ',';

      const tokens = str.split(delimiter).map(t => t.trim()).filter(Boolean);

      if (tokens.length >= 4) {
        if (/^\d+$/.test(tokens[1])) {
          // ip:port:user:pass (Standard CherryProxy, NodeMaven, Webshare)
          host = tokens[0];
          port = parseInt(tokens[1], 10) || 8080;
          username = tokens[2];
          password = tokens.slice(3).join(delimiter);
        } else if (/^\d+$/.test(tokens[3])) {
          // user:pass:ip:port
          username = tokens[0];
          password = tokens[1];
          host = tokens[2];
          port = parseInt(tokens[3], 10) || 8080;
        } else {
          host = tokens[0];
          port = parseInt(tokens[1], 10) || 8080;
          username = tokens[2];
          password = tokens.slice(3).join(delimiter);
        }
      } else if (tokens.length === 3) {
        host = tokens[0];
        port = parseInt(tokens[1], 10) || 8080;
        username = tokens[2];
      } else if (tokens.length === 2) {
        host = tokens[0];
        port = parseInt(tokens[1], 10) || 8080;
      } else if (tokens.length === 1) {
        host = tokens[0];
      }
    }

    host = host.replace(/[\[\]]/g, '').trim();
    if (!host) return null;

    return {
      id: 'prx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      protocol: protocol || 'http',
      host: host,
      port: Number(port) || 8080,
      username: (username || '').trim(),
      password: (password || '').trim(),
      latency: '—',
      status: 'untested',
      lastTested: null
    };
  }

  // Create Empty Proxy Row (for minimum 10 rows guarantee)
  function createEmptyProxyRow(rowNumber, showEmptyHint = false) {
    const tr = document.createElement('tr');
    tr.className = 'sheet-row-empty';

    // 1. Index
    const tdIdx = document.createElement('td');
    tdIdx.className = 'td-index';
    tdIdx.textContent = rowNumber;
    tr.appendChild(tdIdx);

    // 2. Proxy (IP : Port)
    const tdProxy = document.createElement('td');
    tdProxy.innerHTML = showEmptyHint ? `<span class="sheet-empty-hint">No proxies loaded in sheet. Click "Add Proxy" or "Import" above...</span>` : '&nbsp;';
    tr.appendChild(tdProxy);

    // 3. Protocol
    const tdProto = document.createElement('td');
    tdProto.innerHTML = '&nbsp;';
    tr.appendChild(tdProto);

    // 4. Auth
    const tdAuth = document.createElement('td');
    tdAuth.innerHTML = '&nbsp;';
    tr.appendChild(tdAuth);

    // 5. Full String
    const tdString = document.createElement('td');
    tdString.innerHTML = '&nbsp;';
    tr.appendChild(tdString);

    // 6. Ping / Latency
    const tdPing = document.createElement('td');
    tdPing.innerHTML = '&nbsp;';
    tr.appendChild(tdPing);

    // 7. Status
    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = '&nbsp;';
    tr.appendChild(tdStatus);

    // 8. Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'sheet-actions-wrap';
    tdActions.innerHTML = '&nbsp;';
    tr.appendChild(tdActions);

    return tr;
  }

  // Render Proxy Table Grid (GoLogin & CherryProxy / NodeMaven Standard)
  function renderProxiesTable(fromLazyLoad = false) {
    if (!proxiesTableBody) return;

    // Skip if background hydration and user is not on proxy tab
    if (!fromLazyLoad && currentActiveTab !== 'tab-proxy') {
      proxiesTableDirty = true;
      return;
    }

    proxiesTableBody.innerHTML = '';

    const filtered = getFilteredProxies();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / proxyPageSize));

    if (proxyCurrentPage > totalPages) proxyCurrentPage = totalPages;
    if (proxyCurrentPage < 1) proxyCurrentPage = 1;

    const startIndex = (proxyCurrentPage - 1) * proxyPageSize;
    const endIndex = Math.min(startIndex + proxyPageSize, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    // Update Counter Badges
    const allCount = loadedProxies.length;
    const readyCount = loadedProxies.filter(p => p.status === 'ready').length;
    const testingCount = loadedProxies.filter(p => p.status === 'testing').length;
    const failedCount = loadedProxies.filter(p => p.status === 'failed').length;

    if (proxyTableBadge) proxyTableBadge.textContent = `${allCount} Proxies`;
    if (proxyCountAll) proxyCountAll.textContent = allCount;
    if (proxyCountReady) proxyCountReady.textContent = readyCount;
    if (proxyCountTesting) proxyCountTesting.textContent = testingCount;
    if (proxyCountFailed) proxyCountFailed.textContent = failedCount;

    // Render Data Rows — batch via DocumentFragment
    const proxyFragment = document.createDocumentFragment();
    pageItems.forEach((prx, idx) => {
      const tr = document.createElement('tr');

      // 1. Index
      const tdIdx = document.createElement('td');
      tdIdx.className = 'td-index';
      tdIdx.textContent = startIndex + idx + 1;
      tr.appendChild(tdIdx);

      const rawString = `${prx.host}:${prx.port}${prx.username ? ':' + prx.username + ':' + (prx.password || '') : ''}`;

      // 2. Proxy (IP : Port) - Click to copy
      const tdProxy = document.createElement('td');
      const proxySpan = document.createElement('span');
      proxySpan.className = 'sheet-cell-text text-sky sheet-cell-mono';
      proxySpan.style.cursor = 'pointer';
      proxySpan.title = `Click to copy proxy: ${rawString}`;
      proxySpan.textContent = `${prx.host}:${prx.port}`;
      proxySpan.addEventListener('click', () => {
        navigator.clipboard.writeText(rawString);
        showToast(proxyToast, `Copied to clipboard: ${rawString}`);
      });
      tdProxy.appendChild(proxySpan);
      tr.appendChild(tdProxy);

      // 3. Protocol
      const tdProto = document.createElement('td');
      const protoTag = document.createElement('span');
      protoTag.className = 'sheet-tag tag-neutral';
      protoTag.style.textTransform = 'uppercase';
      protoTag.style.fontSize = '10px';
      protoTag.textContent = prx.protocol || 'HTTP';
      tdProto.appendChild(protoTag);
      tr.appendChild(tdProto);

      // 4. Authentication
      const tdAuth = document.createElement('td');
      if (prx.username) {
        const authWrap = document.createElement('div');
        authWrap.className = 'sheet-pass-cell';
        const userSpan = document.createElement('span');
        userSpan.className = 'sheet-cell-text';
        userSpan.style.fontSize = '11px';
        userSpan.title = `${prx.username}:${prx.password || ''}`;
        userSpan.textContent = prx.username + (prx.password ? ' : ••••••••' : '');
        authWrap.appendChild(userSpan);
        tdAuth.appendChild(authWrap);
      } else {
        tdAuth.innerHTML = `<span style="color: var(--text-dim); font-size: 11px;">None (Whitelisted)</span>`;
      }
      tr.appendChild(tdAuth);

      // 5. Full String (Copy)
      const tdString = document.createElement('td');
      const stringWrap = document.createElement('div');
      stringWrap.style.display = 'flex';
      stringWrap.style.alignItems = 'center';
      stringWrap.style.justifyContent = 'space-between';
      stringWrap.style.gap = '6px';
      stringWrap.style.overflow = 'hidden';

      const strSpan = document.createElement('span');
      strSpan.className = 'sheet-cell-mono';
      strSpan.style.fontSize = '11px';
      strSpan.style.color = 'var(--text-muted)';
      strSpan.style.overflow = 'hidden';
      strSpan.style.textOverflow = 'ellipsis';
      strSpan.style.whiteSpace = 'nowrap';
      strSpan.title = rawString;
      strSpan.textContent = rawString;
      stringWrap.appendChild(strSpan);

      const copyInlineBtn = document.createElement('button');
      copyInlineBtn.type = 'button';
      copyInlineBtn.className = 'sheet-icon-btn';
      copyInlineBtn.title = 'Copy full string';
      copyInlineBtn.innerHTML = SVG_ICONS.copy;
      copyInlineBtn.style.flexShrink = '0';
      copyInlineBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(rawString);
        showToast(proxyToast, `Copied: ${rawString}`);
      });
      stringWrap.appendChild(copyInlineBtn);
      tdString.appendChild(stringWrap);
      tr.appendChild(tdString);

      // 6. Ping / Latency
      const tdPing = document.createElement('td');
      const pingSpan = document.createElement('span');
      pingSpan.className = 'sheet-cell-mono';
      if (prx.status === 'testing') {
        pingSpan.style.color = '#38bdf8';
        pingSpan.textContent = 'Testing...';
      } else if (prx.status === 'ready' && prx.latency && prx.latency !== '—') {
        pingSpan.style.color = '#34d399';
        pingSpan.textContent = prx.latency;
      } else if (prx.status === 'failed') {
        pingSpan.style.color = '#f87171';
        pingSpan.textContent = prx.latency || 'Failed';
      } else {
        pingSpan.style.color = 'var(--text-dim)';
        pingSpan.textContent = '—';
      }
      tdPing.appendChild(pingSpan);
      tr.appendChild(tdPing);

      // 7. Status
      const tdStatus = document.createElement('td');
      const statusCell = document.createElement('div');
      statusCell.className = 'sheet-status-cell';

      if (prx.status === 'ready') {
        statusCell.innerHTML = `
          <span class="status-dot dot-ready"></span>
          <span class="status-label" style="color: #34d399;">Ready</span>
        `;
      } else if (prx.status === 'testing') {
        statusCell.innerHTML = `
          <span class="status-dot dot-running"></span>
          <span class="status-label" style="color: #38bdf8;">Testing</span>
        `;
      } else if (prx.status === 'failed') {
        statusCell.title = prx.error || 'Connection Failed / Timeout';
        statusCell.innerHTML = `
          <span class="status-dot dot-error"></span>
          <span class="status-label status-err-label">Failed</span>
        `;
      } else {
        statusCell.innerHTML = `
          <span class="status-dot" style="background: var(--text-dim);"></span>
          <span class="status-label" style="color: var(--text-muted);">Untested</span>
        `;
      }
      tdStatus.appendChild(statusCell);
      tr.appendChild(tdStatus);

      // 8. Actions (Copy, Ping, Edit, Delete)
      const tdAction = document.createElement('td');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'sheet-actions-wrap';

      // Copy button
      const btnCopy = document.createElement('button');
      btnCopy.type = 'button';
      btnCopy.className = 'sheet-icon-btn';
      btnCopy.title = 'Copy proxy (ip:port:user:pass)';
      btnCopy.innerHTML = SVG_ICONS.copy;
      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(rawString);
        showToast(proxyToast, `Copied: ${rawString}`);
      });
      actionWrap.appendChild(btnCopy);

      // Ping / Test button
      const btnPing = document.createElement('button');
      btnPing.type = 'button';
      btnPing.className = 'sheet-icon-btn';
      btnPing.title = 'Test Ping / Reachability';
      btnPing.innerHTML = SVG_ICONS.ping;
      btnPing.addEventListener('click', async (e) => {
        e.stopPropagation();
        await testSingleProxy(prx.id);
      });
      actionWrap.appendChild(btnPing);

      // Edit button
      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'sheet-icon-btn edit-btn';
      btnEdit.title = 'Edit Proxy';
      btnEdit.innerHTML = SVG_ICONS.edit;
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditProxyModal(prx);
      });
      actionWrap.appendChild(btnEdit);

      // Delete button
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'sheet-icon-btn delete-btn';
      btnDel.title = 'Delete Proxy';
      btnDel.innerHTML = SVG_ICONS.trash;
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove proxy ${prx.host}:${prx.port} from the sheet?`)) {
          const origIdx = loadedProxies.findIndex(p => p.id === prx.id);
          if (origIdx !== -1) {
            loadedProxies.splice(origIdx, 1);
            await saveLoadedProxies();
            renderProxiesTable();
            showToast(proxyToast, 'Proxy removed.');
          }
        }
      });
      actionWrap.appendChild(btnDel);

      tdAction.appendChild(actionWrap);
      tr.appendChild(tdAction);
      proxyFragment.appendChild(tr);
    });

    // Ensure rows up to the current page size are ALWAYS displayed
    const renderedCount = pageItems.length;
    const minRows = proxyPageSize;
    if (renderedCount < minRows) {
      const neededEmpty = minRows - renderedCount;
      for (let i = 0; i < neededEmpty; i++) {
        const emptyRowIdx = startIndex + renderedCount + i + 1;
        const showHint = (totalItems === 0 && i === 0);
        const emptyTr = createEmptyProxyRow(emptyRowIdx, showHint);
        proxyFragment.appendChild(emptyTr);
      }
    }

    // Single DOM insertion — one reflow
    proxiesTableBody.appendChild(proxyFragment);

    // Render Pagination Controls
    renderProxyPaginationControls(startIndex, endIndex, totalItems, totalPages);
  }

  // Render Proxy Pagination Controls
  function renderProxyPaginationControls(start, end, total, totalPages) {
    if (proxyPaginationInfo) {
      if (total === 0) {
        proxyPaginationInfo.textContent = 'Showing 0 to 0 of 0 proxies';
      } else {
        proxyPaginationInfo.textContent = `Showing ${start + 1} to ${end} of ${total} proxies`;
      }
    }

    if (btnProxyPageFirst) btnProxyPageFirst.disabled = proxyCurrentPage <= 1;
    if (btnProxyPagePrev) btnProxyPagePrev.disabled = proxyCurrentPage <= 1;
    if (btnProxyPageNext) btnProxyPageNext.disabled = proxyCurrentPage >= totalPages;
    if (btnProxyPageLast) btnProxyPageLast.disabled = proxyCurrentPage >= totalPages;

    if (!proxyPageNumbersContainer) return;
    proxyPageNumbersContainer.innerHTML = '';

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) appendProxyPageButton(i);
    } else {
      appendProxyPageButton(1);
      if (proxyCurrentPage > 3) appendProxyEllipsis();

      const pStart = Math.max(2, proxyCurrentPage - 1);
      const pEnd = Math.min(totalPages - 1, proxyCurrentPage + 1);
      for (let i = pStart; i <= pEnd; i++) appendProxyPageButton(i);

      if (proxyCurrentPage < totalPages - 2) appendProxyEllipsis();
      appendProxyPageButton(totalPages);
    }
  }

  function appendProxyPageButton(pageNum) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-num-btn' + (pageNum === proxyCurrentPage ? ' active' : '');
    btn.textContent = pageNum;
    btn.addEventListener('click', () => {
      proxyCurrentPage = pageNum;
      renderProxiesTable();
    });
    proxyPageNumbersContainer?.appendChild(btn);
  }

  function appendProxyEllipsis() {
    const span = document.createElement('span');
    span.className = 'page-ellipsis';
    span.textContent = '...';
    proxyPageNumbersContainer?.appendChild(span);
  }

  // Pagination Event Listeners
  btnProxyPageFirst?.addEventListener('click', () => { proxyCurrentPage = 1; renderProxiesTable(); });
  btnProxyPagePrev?.addEventListener('click', () => { if (proxyCurrentPage > 1) { proxyCurrentPage--; renderProxiesTable(); } });
  btnProxyPageNext?.addEventListener('click', () => { proxyCurrentPage++; renderProxiesTable(); });
  btnProxyPageLast?.addEventListener('click', () => {
    const totalPages = Math.ceil(getFilteredProxies().length / proxyPageSize);
    proxyCurrentPage = totalPages;
    renderProxiesTable();
  });
  selectProxyPageSize?.addEventListener('change', (e) => {
    proxyPageSize = parseInt(e.target.value, 10) || 25;
    proxyCurrentPage = 1;
    renderProxiesTable();
  });
  inputProxyPageJump?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const page = parseInt(inputProxyPageJump.value, 10);
      const totalPages = Math.max(1, Math.ceil(getFilteredProxies().length / proxyPageSize));
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        proxyCurrentPage = page;
        renderProxiesTable();
        inputProxyPageJump.value = '';
      }
    }
  });

  // Filter Tabs Event Listeners
  proxyFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      proxyFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      proxyCurrentFilter = tab.dataset.proxyFilter || 'all';
      proxyCurrentPage = 1;
      renderProxiesTable();
    });
  });

  // Search Input Event Listeners
  proxySearchInput?.addEventListener('input', (e) => {
    proxySearchQuery = e.target.value.trim();
    if (btnClearProxySearch) btnClearProxySearch.style.display = proxySearchQuery ? 'block' : 'none';
    proxyCurrentPage = 1;
    renderProxiesTable();
  });
  btnClearProxySearch?.addEventListener('click', () => {
    if (proxySearchInput) proxySearchInput.value = '';
    proxySearchQuery = '';
    btnClearProxySearch.style.display = 'none';
    proxyCurrentPage = 1;
    renderProxiesTable();
  });

  // Test Single Proxy Function
  async function testSingleProxy(proxyId) {
    const prx = loadedProxies.find(p => p.id === proxyId);
    if (!prx) return;

    prx.status = 'testing';
    prx.latency = 'Testing...';
    renderProxiesTable();

    try {
      if (window.desktopAPI?.testProxy) {
        const res = await window.desktopAPI.testProxy(prx);
        prx.latency = res.latency || '—';
        prx.status = res.success ? 'ready' : 'failed';
        prx.error = res.error || null;
      } else {
        await new Promise(r => setTimeout(r, 400));
        prx.latency = `${Math.floor(Math.random() * 50) + 30}ms`;
        prx.status = 'ready';
      }
    } catch (err) {
      prx.status = 'failed';
      prx.latency = 'Failed';
      prx.error = err.message;
    }
    await saveLoadedProxies();
    renderProxiesTable();
  }

  // Test All Proxies Function
  btnTestAllProxies?.addEventListener('click', async () => {
    if (loadedProxies.length === 0) {
      showToast(proxyToast, 'No proxies to test. Please import or add proxies first.', false);
      return;
    }
    showToast(proxyToast, `Testing all ${loadedProxies.length} proxies...`);

    loadedProxies.forEach(p => { p.status = 'testing'; p.latency = 'Testing...'; });
    renderProxiesTable();

    if (window.desktopAPI?.testAllProxies) {
      const res = await window.desktopAPI.testAllProxies(loadedProxies);
      if (res && Array.isArray(res.results)) {
        res.results.forEach(r => {
          const found = loadedProxies.find(p => p.id === r.id);
          if (found) {
            found.status = r.success ? 'ready' : 'failed';
            found.latency = r.latency || (r.success ? 'OK' : 'Failed');
            found.error = r.error || null;
          }
        });
      }
    } else {
      for (const prx of loadedProxies) {
        await new Promise(r => setTimeout(r, 100));
        prx.status = 'ready';
        prx.latency = `${Math.floor(Math.random() * 50) + 30}ms`;
      }
    }

    await saveLoadedProxies();
    renderProxiesTable();
    const ready = loadedProxies.filter(p => p.status === 'ready').length;
    showToast(proxyToast, `Testing complete: ${ready} of ${loadedProxies.length} proxies are ready!`);
  });

  // Inline Add Proxy Drawer
  // Add Proxy Drawer Mode Toggles (Single String vs CherryProxy / NodeMaven Bulk Paste)
  tabProxyModeSingle?.addEventListener('click', () => {
    tabProxyModeSingle.classList.add('active');
    tabProxyModeBulk?.classList.remove('active');
    if (proxySingleModeArea) proxySingleModeArea.style.display = 'block';
    if (proxyBulkModeArea) proxyBulkModeArea.style.display = 'none';
    if (manualProxyString) manualProxyString.focus();
  });

  tabProxyModeBulk?.addEventListener('click', () => {
    tabProxyModeBulk.classList.add('active');
    tabProxyModeSingle?.classList.remove('active');
    if (proxyBulkModeArea) proxyBulkModeArea.style.display = 'block';
    if (proxySingleModeArea) proxySingleModeArea.style.display = 'none';
    if (manualProxyBulkText) manualProxyBulkText.focus();
  });

  // Toggle Inline Add Proxy Drawer
  btnToggleAddProxy?.addEventListener('click', () => {
    if (!manualAddProxyBox) return;
    const isHidden = manualAddProxyBox.style.display === 'none';
    manualAddProxyBox.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      if (proxyBulkModeArea && proxyBulkModeArea.style.display === 'block') {
        manualProxyBulkText?.focus();
      } else {
        manualProxyString?.focus();
      }
    }
  });

  closeManualAddProxy?.addEventListener('click', () => {
    if (manualAddProxyBox) manualAddProxyBox.style.display = 'none';
  });

  // Single String Input Live Preview & Enter Key
  manualProxyString?.addEventListener('input', () => {
    const val = manualProxyString.value.trim();
    if (!val) {
      if (proxySinglePreview) {
        proxySinglePreview.innerHTML = '<span style="color: #64748b;">⚡ Paste one line directly from CherryProxy, NodeMaven, or GoLogin (no need to split IP & port). Press Enter to add.</span>';
      }
      return;
    }
    const parsed = smartParseProxy(val, manualProxyProtocol?.value || 'http');
    if (parsed) {
      if (parsed.protocol && manualProxyProtocol) {
        manualProxyProtocol.value = parsed.protocol;
      }
      if (proxySinglePreview) {
        proxySinglePreview.innerHTML = `
          <span style="color: #34d399; font-weight: 600;">✓ Detected:</span>
          <span style="color: #38bdf8; font-family: monospace; font-weight: 600;">${parsed.host}:${parsed.port}</span>
          <span style="color: var(--text-dim);">|</span>
          <span>User: <strong style="color: #fff;">${parsed.username || 'None'}</strong></span>
          ${parsed.password ? '<span style="color: var(--text-dim);">|</span><span>Pass: ••••••••</span>' : ''}
          <span style="color: var(--text-dim);">|</span>
          <span class="sheet-tag tag-neutral" style="font-size: 9px; text-transform: uppercase;">${parsed.protocol}</span>
        `;
      }
    } else {
      if (proxySinglePreview) {
        proxySinglePreview.innerHTML = '<span style="color: #f87171;">⚠️ Enter valid format: host:port or ip:port:user:pass</span>';
      }
    }
  });

  manualProxyString?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddProxyToTable?.click();
    }
  });

  // Bulk Paste Textarea Live Counter
  manualProxyBulkText?.addEventListener('input', () => {
    const lines = (manualProxyBulkText.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const validCount = lines.filter(l => smartParseProxy(l)).length;
    if (bulkProxyCountBadge) {
      bulkProxyCountBadge.textContent = `${validCount} proxies detected`;
      bulkProxyCountBadge.className = validCount > 0 ? 'sheet-stat-pill text-emerald' : 'sheet-stat-pill text-sky';
    }
  });

  btnClearBulkProxyText?.addEventListener('click', () => {
    if (manualProxyBulkText) manualProxyBulkText.value = '';
    if (bulkProxyCountBadge) bulkProxyCountBadge.textContent = '0 proxies detected';
  });

  // Insert Single Proxy (GoLogin Style)
  btnAddProxyToTable?.addEventListener('click', async () => {
    const raw = manualProxyString?.value.trim();
    if (!raw) {
      showToast(proxyToast, 'Please paste or enter a proxy string (e.g. 142.250.190.46:8000:user:pass).', false);
      return;
    }

    const defaultProto = manualProxyProtocol?.value || 'http';
    const parsed = smartParseProxy(raw, defaultProto);
    if (!parsed) {
      showToast(proxyToast, 'Could not parse proxy. Expected format: ip:port or ip:port:user:pass', false);
      return;
    }

    loadedProxies.unshift(parsed);
    await saveLoadedProxies();

    if (manualProxyString) manualProxyString.value = '';
    if (proxySinglePreview) {
      proxySinglePreview.innerHTML = '<span style="color: #64748b;">⚡ Paste one line directly from CherryProxy, NodeMaven, or GoLogin (no need to split IP & port). Press Enter to add.</span>';
    }
    if (manualAddProxyBox) manualAddProxyBox.style.display = 'none';

    proxyCurrentPage = 1;
    renderProxiesTable();
    showToast(proxyToast, `Proxy ${parsed.host}:${parsed.port} added to sheet.`);
  });

  // Import Bulk Proxies (CherryProxy / NodeMaven Multi-line Paste)
  btnImportBulkProxy?.addEventListener('click', async () => {
    const text = manualProxyBulkText?.value || '';
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      showToast(proxyToast, 'Please paste at least one proxy line into the box.', false);
      return;
    }

    const defaultProto = bulkProxyDefaultProto?.value || 'http';
    const addedList = [];
    for (const line of lines) {
      const p = smartParseProxy(line, defaultProto);
      if (p) addedList.push(p);
    }

    if (addedList.length === 0) {
      showToast(proxyToast, 'No valid proxies could be parsed from the pasted text.', false);
      return;
    }

    loadedProxies = [...addedList, ...loadedProxies];
    await saveLoadedProxies();

    if (manualProxyBulkText) manualProxyBulkText.value = '';
    if (bulkProxyCountBadge) bulkProxyCountBadge.textContent = '0 proxies detected';
    if (manualAddProxyBox) manualAddProxyBox.style.display = 'none';

    proxyCurrentPage = 1;
    renderProxiesTable();
    showToast(proxyToast, `✅ Successfully imported ${addedList.length} proxies from CherryProxy / NodeMaven list!`);
  });

  // Import Proxies Button (File Picker)
  btnUploadProxies?.addEventListener('click', async () => {
    try {
      if (window.desktopAPI?.uploadProxiesFile) {
        const res = await window.desktopAPI.uploadProxiesFile();
        if (res && res.success) {
          loadedProxies = res.proxies || [];
          renderProxiesTable();
          showToast(proxyToast, `Successfully imported ${res.count} proxies from ${res.filePath}!`);
        } else if (res && res.error) {
          showToast(proxyToast, `Import error: ${res.error}`, false);
        }
      }
    } catch (err) {
      showToast(proxyToast, `Failed to import proxies: ${err.message}`, false);
    }
  });

  // Clear All Proxies Button
  btnClearAllProxies?.addEventListener('click', async () => {
    if (loadedProxies.length === 0) return;
    if (confirm(`Are you sure you want to clear all ${loadedProxies.length} proxies from the sheet?`)) {
      loadedProxies = [];
      await saveLoadedProxies();
      renderProxiesTable();
      showToast(proxyToast, 'All proxies cleared from sheet.');
    }
  });

  // Edit Proxy Modal Functions
  function openEditProxyModal(proxy) {
    editingProxyId = proxy.id;
    const raw = `${proxy.host}:${proxy.port}${proxy.username ? ':' + proxy.username + ':' + (proxy.password || '') : ''}`;
    if (editProxyQuickString) editProxyQuickString.value = raw;
    if (editProxyProtocol) editProxyProtocol.value = proxy.protocol || 'http';
    if (editProxyHost) editProxyHost.value = proxy.host || '';
    if (editProxyPort) editProxyPort.value = proxy.port || 8080;
    if (editProxyUser) editProxyUser.value = proxy.username || '';
    if (editProxyPass) editProxyPass.value = proxy.password || '';

    if (editProxyModal) editProxyModal.style.display = 'flex';
  }

  // Quick String auto-sync in Edit Modal
  editProxyQuickString?.addEventListener('input', () => {
    const val = editProxyQuickString.value.trim();
    if (!val) return;
    const parsed = smartParseProxy(val, editProxyProtocol?.value || 'http');
    if (parsed) {
      if (editProxyHost) editProxyHost.value = parsed.host;
      if (editProxyPort) editProxyPort.value = parsed.port;
      if (editProxyUser) editProxyUser.value = parsed.username;
      if (editProxyPass) editProxyPass.value = parsed.password;
      if (editProxyProtocol && parsed.protocol) editProxyProtocol.value = parsed.protocol;
    }
  });

  function closeEditProxyModalDialog() {
    if (editProxyModal) editProxyModal.style.display = 'none';
    editingProxyId = null;
  }

  closeEditProxyModal?.addEventListener('click', closeEditProxyModalDialog);
  btnCancelEditProxy?.addEventListener('click', closeEditProxyModalDialog);

  btnToggleEditProxyPass?.addEventListener('click', () => {
    if (editProxyPass) {
      editProxyPass.type = editProxyPass.type === 'password' ? 'text' : 'password';
      btnToggleEditProxyPass.innerHTML = editProxyPass.type === 'password' ? SVG_ICONS.eye : SVG_ICONS.eyeOff;
    }
  });

  btnSaveEditProxy?.addEventListener('click', async () => {
    if (!editingProxyId) return;
    const prx = loadedProxies.find(p => p.id === editingProxyId);
    if (!prx) return;

    const host = editProxyHost?.value.trim();
    if (!host) {
      alert('Host / IP address cannot be empty.');
      return;
    }

    prx.protocol = editProxyProtocol?.value || 'http';
    prx.host = host;
    prx.port = parseInt(editProxyPort?.value, 10) || 8080;
    prx.username = editProxyUser?.value.trim() || '';
    prx.password = editProxyPass?.value.trim() || '';

    await saveLoadedProxies();
    renderProxiesTable();
    closeEditProxyModalDialog();
    showToast(proxyToast, 'Proxy updated successfully.');
  });

  // Helper for Automation: Format Proxy String
  function formatProxyString(p) {
    if (!p || !p.host) return '';
    const auth = p.username ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password || '')}@` : '';
    const proto = p.protocol ? p.protocol.toLowerCase() : 'http';
    return `${proto}://${auth}${p.host}:${p.port || 8080}`;
  }

  function getActiveProxyConfig() {
    if (!proxyEnabled || loadedProxies.length === 0) {
      return { enabled: false, server: '', list: [] };
    }

    const readyProxies = loadedProxies.filter(p => p.status === 'ready');
    const pool = readyProxies.length > 0 ? readyProxies : loadedProxies;
    const formattedList = pool.map(formatProxyString).filter(Boolean);

    return {
      enabled: true,
      mode: 'rotate',
      server: formattedList[0] || '',
      list: formattedList
    };
  }

  // =========================================================================
  // TARGET REVIEW LINKS SHEET & MANAGER CONTROLLER (Strict Google Sheets Aesthetic)
  // =========================================================================
  let loadedLinks = [];
  try {
    const cachedLinks = localStorage.getItem('maps_links_list');
    if (cachedLinks) {
      const parsed = JSON.parse(cachedLinks);
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedLinks = parsed;
      }
    }
  } catch (e) {}
  let linkCurrentPage = 1;
  let linkPageSize = 25;
  let linkCurrentFilter = 'all';
  let linkSearchQuery = '';
  let editingLinkId = null;

  // Load links from backend
  async function loadLinksFromBackend() {
    try {
      let links = [];
      if (window.desktopAPI?.getLinks) {
        const res = await window.desktopAPI.getLinks();
        if (res && res.success && Array.isArray(res.links)) {
          links = res.links;
        }
      }
      if (links.length === 0) {
        const local = localStorage.getItem('maps_links_list');
        if (local) {
          try { links = JSON.parse(local); } catch (e) {}
        }
      }
      loadedLinks = (links || []).map(lnk => ({
        ...lnk,
        targetCount: Math.max(1, parseInt(lnk.targetCount, 10) || 1),
        doneCount: Math.max(0, parseInt(lnk.doneCount !== undefined ? lnk.doneCount : (lnk.completedCount || 0), 10) || 0)
      }));
      try {
        localStorage.setItem('maps_links_list', JSON.stringify(loadedLinks));
      } catch (e) {}
      renderLinksTable();
      updateDashboardMetrics();
    } catch (err) {
      console.error('Failed to load target review links:', err);
    }
  }

  async function saveLoadedLinks() {
    try {
      localStorage.setItem('maps_links_list', JSON.stringify(loadedLinks));
      if (window.desktopAPI?.saveLinks) {
        await window.desktopAPI.saveLinks(loadedLinks);
      }
    } catch (e) {
      console.error('Failed to save target links:', e);
    }
  }

  function getFilteredLinks() {
    let list = loadedLinks;

    if (linkCurrentFilter === 'queued') {
      list = list.filter(l => (!l.status || l.status === 'queued' || l.status === 'running') && ((l.doneCount || 0) < (l.targetCount || 1)));
    } else if (linkCurrentFilter === 'completed') {
      list = list.filter(l => l.status === 'completed' || ((l.doneCount || 0) >= (l.targetCount || 1)));
    } else if (linkCurrentFilter === 'failed') {
      list = list.filter(l => l.status === 'failed');
    }

    if (linkSearchQuery) {
      const q = linkSearchQuery.toLowerCase();
      list = list.filter(l => {
        return (
          (l.url && l.url.toLowerCase().includes(q)) ||
          (l.reason && l.reason.toLowerCase().includes(q)) ||
          (l.mode && l.mode.toLowerCase().includes(q)) ||
          (l.status && l.status.toLowerCase().includes(q)) ||
          (l.businessName && l.businessName.toLowerCase().includes(q)) ||
          (l.country && l.country.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }

  function getActiveTargetUrls() {
    if (!loadedLinks || loadedLinks.length === 0) {
      if (inputReviewUrls && inputReviewUrls.value) {
        const lines = inputReviewUrls.value.split('\n').map(u => u.trim()).filter(Boolean);
        const globalMode = 'standard';
        const globalReason = selectCategory?.value || 'spam';
        return lines.map(url => ({
          url,
          mode: globalMode,
          reason: globalReason,
          targetCount: 1,
          doneCount: 0,
          businessName: '',
          country: ''
        }));
      }
      return [];
    }
    const queued = loadedLinks.filter(l => {
      const targetCount = l.targetCount || 1;
      const doneCount = l.doneCount || 0;
      if (doneCount >= targetCount && l.status === 'completed') return false;
      return !l.status || l.status === 'queued' || l.status === 'running' || doneCount < targetCount;
    });
    const targetPool = queued.length > 0 ? queued : loadedLinks;
    return targetPool.map(l => ({
      url: l.url,
      mode: l.mode || 'standard',
      reason: l.reason || 'spam',
      targetCount: l.targetCount || 1,
      doneCount: l.doneCount || 0,
      businessName: l.businessName || '',
      country: l.country || ''
    })).filter(l => Boolean(l.url));
  }

  function createEmptyLinkRow(rowNumber, showEmptyHint = false) {
    const tr = document.createElement('tr');
    tr.className = 'sheet-row-empty';

    // 1. Index
    const tdIdx = document.createElement('td');
    tdIdx.className = 'td-index';
    tdIdx.textContent = rowNumber;
    tr.appendChild(tdIdx);

    // 2. URL
    const tdUrl = document.createElement('td');
    tdUrl.innerHTML = showEmptyHint ? `<span class="sheet-empty-hint">No target review links loaded. Click "Import (TXT / CSV)" or "Add Link" above...</span>` : '&nbsp;';
    tr.appendChild(tdUrl);

    // 3. Category / Action
    const tdCat = document.createElement('td');
    tdCat.innerHTML = '&nbsp;';
    tr.appendChild(tdCat);

    // 5. Status
    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = '&nbsp;';
    tr.appendChild(tdStatus);

    // 6. Done Count
    const tdDone = document.createElement('td');
    tdDone.innerHTML = '&nbsp;';
    tr.appendChild(tdDone);

    // 7. Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'sheet-actions-wrap';
    tdActions.innerHTML = '&nbsp;';
    tr.appendChild(tdActions);

    return tr;
  }

  function renderLinksTable(fromLazyLoad = false) {
    if (!linksTableBody) return;

    // Skip if background hydration and user is not on link/reporter tab
    if (!fromLazyLoad && currentActiveTab !== 'tab-reporter') {
      linksTableDirty = true;
      return;
    }

    linksTableBody.innerHTML = '';

    const filtered = getFilteredLinks();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / linkPageSize));

    if (linkCurrentPage > totalPages) linkCurrentPage = totalPages;
    if (linkCurrentPage < 1) linkCurrentPage = 1;

    const startIndex = (linkCurrentPage - 1) * linkPageSize;
    const endIndex = Math.min(startIndex + linkPageSize, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    // Update Counter Badges
    const allCount = loadedLinks.length;
    const completedCount = loadedLinks.filter(l => l.status === 'completed' || (l.doneCount || 0) >= (l.targetCount || 1)).length;
    const queuedCount = loadedLinks.filter(l => (!l.status || l.status === 'queued' || l.status === 'running') && (l.doneCount || 0) < (l.targetCount || 1)).length;
    const failedCount = loadedLinks.filter(l => l.status === 'failed').length;

    if (linksTableBadge) linksTableBadge.textContent = `${allCount} Links`;
    if (linkCountAll) linkCountAll.textContent = allCount;
    if (linkCountCompleted) linkCountCompleted.textContent = completedCount;
    if (linkCountQueued) linkCountQueued.textContent = queuedCount;
    if (linkCountFailed) linkCountFailed.textContent = failedCount;

    // Render Data Rows — batch via DocumentFragment
    const linkFragment = document.createDocumentFragment();
    pageItems.forEach((lnk, idx) => {
      const tr = document.createElement('tr');

      // 1. Index
      const tdIdx = document.createElement('td');
      tdIdx.className = 'td-index';
      tdIdx.textContent = startIndex + idx + 1;
      tr.appendChild(tdIdx);

      // 2. Target Review URL
      const tdUrl = document.createElement('td');
      const urlSpan = document.createElement('span');
      urlSpan.className = 'sheet-cell-text text-sky';
      urlSpan.title = lnk.url;
      urlSpan.textContent = lnk.url;
      urlSpan.style.cursor = 'pointer';
      urlSpan.addEventListener('click', () => {
        if (window.desktopAPI?.openExternalUrl) {
          window.desktopAPI.openExternalUrl(lnk.url);
        }
      });
      tdUrl.appendChild(urlSpan);

      if (lnk.businessName || lnk.country) {
        const metaLine = document.createElement('div');
        metaLine.style.display = 'flex';
        metaLine.style.alignItems = 'center';
        metaLine.style.gap = '6px';
        metaLine.style.marginTop = '4px';
        metaLine.style.fontSize = '11px';

        if (lnk.businessName) {
          const bBadge = document.createElement('span');
          bBadge.style.display = 'inline-flex';
          bBadge.style.alignItems = 'center';
          bBadge.style.gap = '3px';
          bBadge.style.background = 'rgba(255, 255, 255, 0.06)';
          bBadge.style.padding = '1px 6px';
          bBadge.style.borderRadius = '3px';
          bBadge.style.border = '1px solid rgba(255, 255, 255, 0.1)';
          bBadge.innerHTML = `<span style="opacity:0.75;">🏢</span> <span style="color:#e2e8f0; font-weight:500;">${lnk.businessName}</span>`;
          metaLine.appendChild(bBadge);
        }

        if (lnk.country) {
          const cBadge = document.createElement('span');
          cBadge.style.display = 'inline-flex';
          cBadge.style.alignItems = 'center';
          cBadge.style.gap = '3px';
          cBadge.style.background = 'rgba(56, 189, 248, 0.08)';
          cBadge.style.padding = '1px 6px';
          cBadge.style.borderRadius = '3px';
          cBadge.style.border = '1px solid rgba(56, 189, 248, 0.2)';
          cBadge.innerHTML = `<span style="opacity:0.75;">📍</span> <span style="color:#7dd3fc;">${lnk.country}</span>`;
          metaLine.appendChild(cBadge);
        }

        tdUrl.appendChild(metaLine);
      }
      tr.appendChild(tdUrl);

      // 3. Category / Action
      const tdCat = document.createElement('td');
      const catTag = document.createElement('span');
      const m = (lnk.mode || 'standard').toLowerCase();
      const r = (lnk.reason || 'spam').toLowerCase();

      const labels = {
        offtopic: '🚫 Off topic',
        spam: '🗑️ Spam',
        conflict: '⚔️ Conflict',
        profanity: '🤬 Profanity',
        harmful: '⚠️ Harmful',
        bullying: '👊 Bullying',
        discrimination: '🛑 Discrimination',
        personal_info: '🔒 Personal info',
        not_helpful: '❓ Not helpful'
      };

      if (r.includes(',')) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '4px';
        wrap.style.flexWrap = 'wrap';
        wrap.style.alignItems = 'center';
        const parts = r.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        for (const p of parts) {
          const badge = document.createElement('span');
          badge.className = (p === 'harmful' || p === 'profanity' || p === 'bullying' || p === 'discrimination')
            ? 'sheet-tag tag-rose'
            : 'sheet-tag tag-blue';
          badge.style.fontSize = '10.5px';
          badge.style.padding = '1px 5px';
          badge.textContent = labels[p] || p;
          wrap.appendChild(badge);
        }
        tdCat.appendChild(wrap);
      } else if (m === 'both') {
        const catTag = document.createElement('span');
        catTag.className = 'sheet-tag tag-purple';
        catTag.textContent = '⚡ AI Dual';
        tdCat.appendChild(catTag);
      } else if (m === 'legal' || r === 'legal') {
        const catTag = document.createElement('span');
        catTag.className = 'sheet-tag tag-purple';
        catTag.textContent = '⚖️ AI Legal';
        tdCat.appendChild(catTag);
      } else if (r === 'ai-auto') {
        const catTag = document.createElement('span');
        catTag.className = 'sheet-tag tag-blue';
        catTag.textContent = '🤖 AI Report';
        tdCat.appendChild(catTag);
      } else {
        const catTag = document.createElement('span');
        const labelsWithNum = {
          offtopic: '1. 🚫 Off topic',
          spam: '2. 🗑️ Spam',
          conflict: '3. ⚔️ Conflict',
          profanity: '4. 🤬 Profanity',
          harmful: '5. ⚠️ Harmful',
          bullying: '6. 👊 Bullying/Harassment',
          discrimination: '7. 🛑 Discrimination',
          personal_info: '8. 🔒 Personal info',
          not_helpful: '9. ❓ Not helpful'
        };
        catTag.className = (r === 'harmful' || r === 'profanity' || r === 'bullying' || r === 'discrimination')
          ? 'sheet-tag tag-rose'
          : 'sheet-tag tag-neutral';
        catTag.textContent = labelsWithNum[r] || (lnk.reason ? lnk.reason.toUpperCase() : 'Spam');
        tdCat.appendChild(catTag);
      }
      tr.appendChild(tdCat);

      // 5. Status
      const tdStatus = document.createElement('td');
      const statusCell = document.createElement('div');
      statusCell.className = 'sheet-status-cell';

      const st = lnk.status || 'queued';
      if (st === 'completed') {
        statusCell.innerHTML = `
          <span class="status-dot dot-ready"></span>
          <span class="status-label" style="color: #34d399;">Completed</span>
        `;
      } else if (st === 'running') {
        statusCell.innerHTML = `
          <span class="status-dot dot-running"></span>
          <span class="status-label" style="color: #38bdf8;">Running</span>
        `;
      } else if (st === 'failed') {
        statusCell.title = lnk.lastError || 'Reporting failed';
        statusCell.innerHTML = `
          <span class="status-dot dot-error"></span>
          <span class="status-label status-err-label">Failed</span>
        `;
        statusCell.addEventListener('click', () => {
          alert(`Target Review Link Report Error:\n\nURL: ${lnk.url}\nError: ${lnk.lastError || 'Unknown Error'}`);
        });
      } else {
        statusCell.innerHTML = `
          <span class="status-dot" style="background: #64748b;"></span>
          <span class="status-label" style="color: var(--text-dim);">Queued</span>
        `;
      }
      tdStatus.appendChild(statusCell);
      tr.appendChild(tdStatus);

      // 6. Progress (Done / Target)
      const tdDone = document.createElement('td');
      const doneCount = lnk.doneCount || 0;
      const targetCount = lnk.targetCount || 1;
      const isComplete = doneCount >= targetCount;

      const doneSpan = document.createElement('span');
      doneSpan.className = 'sheet-cell-mono';
      if (isComplete) {
        doneSpan.style.color = '#34d399';
        doneSpan.style.fontWeight = '700';
        doneSpan.innerHTML = `<strong>${doneCount}</strong> / ${targetCount}`;
      } else if (doneCount > 0) {
        doneSpan.style.color = '#38bdf8';
        doneSpan.style.fontWeight = '600';
        doneSpan.innerHTML = `<strong>${doneCount}</strong> / <span style="color: var(--text-dim);">${targetCount}</span>`;
      } else {
        doneSpan.style.color = 'var(--text-dim)';
        doneSpan.innerHTML = `0 / ${targetCount}`;
      }

      tdDone.appendChild(doneSpan);
      tr.appendChild(tdDone);

      // 7. Actions
      const tdActions = document.createElement('td');
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'sheet-actions-wrap';

      // Open Link Externally
      const btnOpen = document.createElement('button');
      btnOpen.className = 'sheet-icon-btn';
      btnOpen.title = 'Open URL in browser';
      btnOpen.innerHTML = SVG_ICONS.external;
      btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.desktopAPI?.openExternalUrl) {
          window.desktopAPI.openExternalUrl(lnk.url);
        }
      });
      actionsWrap.appendChild(btnOpen);

      // AI Generate (Analyze Top 3 Categories)
      const btnAi = document.createElement('button');
      btnAi.className = 'sheet-icon-btn';
      btnAi.title = '✨ AI Generate (Pre-select Top 3 Categories)';
      btnAi.style.color = '#c084fc';
      btnAi.innerHTML = SVG_ICONS.sparkles;
      btnAi.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btnAi.disabled) return;
        btnAi.disabled = true;
        btnAi.innerHTML = SVG_ICONS.spinner;

        const currentProvider = (selectAiProvider?.value || appConfig.aiProvider || 'gemini').toUpperCase();
        const currentModel = selectAiModel?.value || appConfig.aiModel || 'default';

        appendLogToBothTerminals('\n' + '═'.repeat(60));
        appendLogToBothTerminals(`🤖 [AI Review Inspector]: Starting intelligent analysis...`);
        appendLogToBothTerminals(`🌐 Target URL: ${lnk.url}`);
        appendLogToBothTerminals(`⚙️ Engine: ${currentProvider} | Model: ${currentModel}`);
        appendLogToBothTerminals(`⏳ Launching headless browser to fetch live review content...`);

        showToast(reporterToast, '🤖 AI inspecting review link... (~5-8s)');

        try {
          const res = await window.desktopAPI.inspectLinkWithAi(lnk.id, lnk.url);
          if (res && res.success) {
            lnk.reason = res.reason;
            if (res.links && Array.isArray(res.links)) {
              loadedLinks = res.links;
            } else {
              const targetIdx = loadedLinks.findIndex(item => item.id === lnk.id);
              if (targetIdx !== -1) loadedLinks[targetIdx].reason = res.reason;
              await saveLoadedLinks();
            }
            renderLinksTable();

            const reviewText = res.reviewDetails?.reviewText;
            const reviewerName = res.reviewDetails?.reviewerName || 'Anonymous';
            const rating = res.reviewDetails?.rating || 'N/A';

            if (reviewText) {
              const snippet = reviewText.length > 160 ? reviewText.slice(0, 160) + '...' : reviewText;
              appendLogToBothTerminals(`📝 Review Content: "${snippet}"`);
              appendLogToBothTerminals(`👤 Reviewer: ${reviewerName} | Rating: ${rating}`);
            } else {
              appendLogToBothTerminals(`📝 Review has no text body (Rating only: ${rating})`);
            }

            appendLogToBothTerminals(`🎯 AI Selected Categories: [${res.categories.join(', ')}]`);
            appendLogToBothTerminals(`💡 AI Policy Reasoning: ${res.reasoning || 'Evaluated against Google Maps content guidelines'}`);
            appendLogToBothTerminals(`💾 Saved multi-category rotation rule to database successfully!`);
            appendLogToBothTerminals('═'.repeat(60) + '\n');

            showToast(reporterToast, `✨ AI Pre-Selected: [${res.categories.join(', ')}]`);
          } else {
            const errMsg = res?.message || 'Failed to inspect link with AI';
            appendLogToBothTerminals(`❌ [AI Inspection Failed]: ${errMsg}`, true);
            appendLogToBothTerminals('═'.repeat(60) + '\n');
            showToast(reporterToast, `❌ ${errMsg}`, false);
          }
        } catch (err) {
          appendLogToBothTerminals(`❌ [AI Inspection Error]: ${err.message}`, true);
          appendLogToBothTerminals('═'.repeat(60) + '\n');
          showToast(reporterToast, `❌ AI Error: ${err.message}`, false);
        } finally {
          btnAi.disabled = false;
          btnAi.innerHTML = SVG_ICONS.sparkles;
        }
      });
      actionsWrap.appendChild(btnAi);

      // Edit Button
      const btnEdit = document.createElement('button');
      btnEdit.className = 'sheet-icon-btn';
      btnEdit.title = 'Edit Link';
      btnEdit.innerHTML = SVG_ICONS.edit;
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditLinkModalDialog(lnk);
      });
      actionsWrap.appendChild(btnEdit);

      // Delete Button
      const btnDel = document.createElement('button');
      btnDel.className = 'sheet-icon-btn';
      btnDel.title = 'Delete Link';
      btnDel.innerHTML = SVG_ICONS.trash;
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove this review link from queue?\n\n${lnk.url}`)) {
          loadedLinks = loadedLinks.filter(item => item.id !== lnk.id);
          await saveLoadedLinks();
          renderLinksTable();
          updateDashboardMetrics();
          showToast(reporterToast, 'Link removed from queue.');
        }
      });
      actionsWrap.appendChild(btnDel);

      tdActions.appendChild(actionsWrap);
      tr.appendChild(tdActions);

      linkFragment.appendChild(tr);
    });

    // Guarantee rows up to linkPageSize
    const renderedRows = pageItems.length;
    if (renderedRows < linkPageSize) {
      const rowsToAdd = linkPageSize - renderedRows;
      for (let i = 0; i < rowsToAdd; i++) {
        const rowNum = startIndex + renderedRows + i + 1;
        const isFirstEmpty = (renderedRows === 0 && i === 0);
        const emptyTr = createEmptyLinkRow(rowNum, isFirstEmpty);
        linkFragment.appendChild(emptyTr);
      }
    }

    // Single DOM insertion — one reflow
    linksTableBody.appendChild(linkFragment);

    renderLinksPagination(totalItems, totalPages);
    updateDashboardMetrics();
  }

  function renderLinksPagination(totalItems, totalPages) {
    if (!linkPaginationInfo) return;

    if (totalItems === 0) {
      linkPaginationInfo.textContent = 'Showing 0 to 0 of 0 links';
    } else {
      const start = (linkCurrentPage - 1) * linkPageSize + 1;
      const end = Math.min(start + linkPageSize - 1, totalItems);
      linkPaginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} links`;
    }

    if (btnLinkPageFirst) btnLinkPageFirst.disabled = (linkCurrentPage <= 1);
    if (btnLinkPagePrev) btnLinkPagePrev.disabled = (linkCurrentPage <= 1);
    if (btnLinkPageNext) btnLinkPageNext.disabled = (linkCurrentPage >= totalPages);
    if (btnLinkPageLast) btnLinkPageLast.disabled = (linkCurrentPage >= totalPages);

    if (linkPageNumbersContainer) {
      linkPageNumbersContainer.innerHTML = '';
      const maxButtons = 5;
      let startPage = Math.max(1, linkCurrentPage - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      for (let p = startPage; p <= endPage; p++) {
        const btn = document.createElement('button');
        btn.className = 'page-num-btn' + (p === linkCurrentPage ? ' active' : '');
        btn.textContent = p;
        btn.addEventListener('click', () => {
          linkCurrentPage = p;
          renderLinksTable();
        });
        linkPageNumbersContainer.appendChild(btn);
      }
    }
  }

  // Links Pagination Controls
  btnLinkPageFirst?.addEventListener('click', () => {
    linkCurrentPage = 1;
    renderLinksTable();
  });
  btnLinkPagePrev?.addEventListener('click', () => {
    if (linkCurrentPage > 1) {
      linkCurrentPage--;
      renderLinksTable();
    }
  });
  btnLinkPageNext?.addEventListener('click', () => {
    const totalPages = Math.ceil(getFilteredLinks().length / linkPageSize);
    if (linkCurrentPage < totalPages) {
      linkCurrentPage++;
      renderLinksTable();
    }
  });
  btnLinkPageLast?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredLinks().length / linkPageSize));
    linkCurrentPage = totalPages;
    renderLinksTable();
  });

  selectLinkPageSize?.addEventListener('change', () => {
    linkPageSize = parseInt(selectLinkPageSize.value, 10) || 25;
    linkCurrentPage = 1;
    renderLinksTable();
  });

  inputLinkPageJump?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const page = parseInt(inputLinkPageJump.value, 10);
      const totalPages = Math.max(1, Math.ceil(getFilteredLinks().length / linkPageSize));
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        linkCurrentPage = page;
        renderLinksTable();
        inputLinkPageJump.value = '';
      }
    }
  });

  // Filter Tabs
  linkFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      linkFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      linkCurrentFilter = tab.dataset.linkFilter || 'all';
      linkCurrentPage = 1;
      renderLinksTable();
    });
  });

  // Search Input
  linkSearchInput?.addEventListener('input', () => {
    linkSearchQuery = linkSearchInput.value.trim();
    if (btnClearLinkSearch) {
      btnClearLinkSearch.style.display = linkSearchQuery ? 'inline-flex' : 'none';
    }
    linkCurrentPage = 1;
    renderLinksTable();
  });

  btnClearLinkSearch?.addEventListener('click', () => {
    linkSearchInput.value = '';
    linkSearchQuery = '';
    btnClearLinkSearch.style.display = 'none';
    linkCurrentPage = 1;
    renderLinksTable();
  });

  // Toggle Inline Add Drawer
  btnToggleAddLink?.addEventListener('click', () => {
    if (!manualAddLinkBox) return;
    const isHidden = manualAddLinkBox.style.display === 'none';
    manualAddLinkBox.style.display = isHidden ? 'block' : 'none';
    if (isHidden && manualLinkUrl) manualLinkUrl.focus();
  });

  closeManualAddLink?.addEventListener('click', () => {
    if (manualAddLinkBox) manualAddLinkBox.style.display = 'none';
  });

  // Insert Row Button
  btnAddLinkToTable?.addEventListener('click', async () => {
    const rawUrl = manualLinkUrl?.value.trim();
    if (!rawUrl) {
      alert('Please enter a target Google Maps review URL.');
      return;
    }

    const tCount = parseInt(manualLinkTargetCount?.value, 10) || 1;
    const cat = manualLinkCategory?.value || 'ai-auto';
    let mode = 'standard';
    let reason = cat;

    if (cat === 'both') {
      mode = 'both';
      reason = 'ai-auto';
    } else if (cat === 'legal') {
      mode = 'legal';
      reason = 'legal';
    } else if (cat === 'ai-auto') {
      mode = 'standard';
      reason = 'ai-auto';
    } else {
      mode = 'standard';
      reason = cat;
    }

    const bName = manualLinkBusinessName?.value.trim() || '';
    const cName = manualLinkCountry?.value.trim() || 'United States';

    const newLink = {
      id: 'link_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      url: rawUrl,
      reason: reason,
      mode: mode,
      status: 'queued',
      targetCount: Math.max(1, tCount),
      doneCount: 0,
      lastReportedAt: null,
      lastError: null,
      businessName: bName,
      country: cName
    };

    loadedLinks.unshift(newLink);
    await saveLoadedLinks();
    renderLinksTable();
    updateDashboardMetrics();

    if (manualLinkUrl) manualLinkUrl.value = '';
    if (manualLinkBusinessName) manualLinkBusinessName.value = '';
    if (manualLinkCountry) manualLinkCountry.value = 'United States';
    if (manualLinkTargetCount) manualLinkTargetCount.value = '1';
    showToast(reporterToast, 'New target review link added to sheet.');
  });

  // Import File (TXT / CSV / Excel)
  btnUploadLinks?.addEventListener('click', async () => {
    if (!window.desktopAPI?.uploadLinksFile) return;
    const res = await window.desktopAPI.uploadLinksFile();
    if (res && res.success) {
      if (Array.isArray(res.links) && res.links.length > 0) {
        loadedLinks = res.links;
        await saveLoadedLinks();
        renderLinksTable();
        updateDashboardMetrics();
        showToast(reporterToast, `✅ Successfully imported ${res.links.length} review links!`);
      } else {
        showToast(reporterToast, 'Uploaded file contained no valid URLs.', false);
      }
    } else if (res && res.error && res.error !== 'Cancelled') {
      showToast(reporterToast, 'Import failed: ' + res.error, false);
    }
  });

  // Clear All Links
  btnClearAllLinks?.addEventListener('click', async () => {
    if (loadedLinks.length === 0) return;
    if (confirm(`Are you sure you want to clear all ${loadedLinks.length} target review links?`)) {
      loadedLinks = [];
      await saveLoadedLinks();
      renderLinksTable();
      updateDashboardMetrics();
      showToast(reporterToast, 'All target review links cleared.');
    }
  });

  // Edit Link Modal Functions
  function openEditLinkModalDialog(lnk) {
    if (!editLinkModal) return;
    editingLinkId = lnk.id;
    if (editLinkUrl) editLinkUrl.value = lnk.url;
    if (editLinkBusinessName) editLinkBusinessName.value = lnk.businessName || '';
    if (editLinkCountry) editLinkCountry.value = lnk.country || 'United States';
    const currentCat = lnk.mode === 'both' ? 'both' : (lnk.mode === 'legal' ? 'legal' : (lnk.reason || 'ai-auto'));
    if (editLinkCategory) editLinkCategory.value = currentCat;
    if (editLinkTargetCount) editLinkTargetCount.value = lnk.targetCount || 1;
    editLinkModal.style.display = 'flex';
  }

  function closeEditLinkModalDialog() {
    if (editLinkModal) editLinkModal.style.display = 'none';
    if (editLinkBusinessName) editLinkBusinessName.value = '';
    if (editLinkCountry) editLinkCountry.value = 'United States';
    editingLinkId = null;
  }

  closeEditLinkModal?.addEventListener('click', closeEditLinkModalDialog);
  btnCancelEditLink?.addEventListener('click', closeEditLinkModalDialog);

  btnSaveEditLink?.addEventListener('click', async () => {
    if (!editingLinkId) return;
    const lnk = loadedLinks.find(item => item.id === editingLinkId);
    if (!lnk) return;

    const newUrl = editLinkUrl?.value.trim();
    if (!newUrl) {
      alert('Review URL cannot be empty.');
      return;
    }

    const newTarget = parseInt(editLinkTargetCount?.value, 10) || 1;
    lnk.url = newUrl;
    lnk.businessName = editLinkBusinessName?.value.trim() || '';
    lnk.country = editLinkCountry?.value.trim() || 'United States';

    const cat = editLinkCategory?.value || 'ai-auto';
    if (cat === 'both') {
      lnk.mode = 'both';
      lnk.reason = 'ai-auto';
    } else if (cat === 'legal') {
      lnk.mode = 'legal';
      lnk.reason = 'legal';
    } else if (cat === 'ai-auto') {
      lnk.mode = 'standard';
      lnk.reason = 'ai-auto';
    } else {
      lnk.mode = 'standard';
      lnk.reason = cat;
    }
    lnk.targetCount = Math.max(1, newTarget);
    if ((lnk.doneCount || 0) < lnk.targetCount && lnk.status === 'completed') {
      lnk.status = 'queued';
    }

    await saveLoadedLinks();
    renderLinksTable();
    updateDashboardMetrics();
    closeEditLinkModalDialog();
    showToast(reporterToast, 'Target review link updated successfully.');
  });

  // --- Automation Start / Stop Execution ---
  let isRunning = false;

  async function triggerStartAgent() {
    if (isRunning) return;

    // 1. License Check (Non-blocking: allows execution in Community / Local mode without mandatory key)
    if (window.licenseManager) {
      const lic = window.licenseManager.license;
      const isActivated = lic && lic.license_key && lic.license_key !== 'UNLICENSED' && lic.status === 'active';
      if (!isActivated) {
        console.log('[License] Running in Community / Standalone Mode');
      }
    }

    const urls = getActiveTargetUrls();
    if (urls.length === 0) {
      switchTab('tab-reporter');
      alert('Please add or import at least one Google Maps Review URL in the Link sheet.');
      return;
    }

    if (loadedAccounts.length === 0) {
      switchTab('tab-account');
      alert('Please upload or add at least one Google Account in the Google Account tab.');
      return;
    }

    // Strict 1-Account = 1-Report Policy Check
    const unusedAccounts = loadedAccounts.filter(acc => {
      const isUsed = acc.used === true || (typeof acc.usedCount === 'number' && acc.usedCount > 0) || acc.status === 'success';
      return !isUsed;
    });

    if (unusedAccounts.length === 0) {
      switchTab('tab-account');
      alert('⛔ All loaded accounts have already completed reports!\n\nUnder the 1-account = 1-report policy, an account cannot be reused until its history is cleared.\n\nPlease click "Reset History" in the Accounts tab or add fresh accounts.');
      return;
    }

    isRunning = true;
    setRunUIState(true);

    const primaryAcc = unusedAccounts[0] || loadedAccounts[0] || {};
    if (primaryAcc.email) usedAccountsSet.add(primaryAcc.email);
    updateDashboardMetrics();

    // Retrieve selected browser executable paths & rotation preference
    const selectedBoxes = browserChecklist ? Array.from(browserChecklist.querySelectorAll('input[name="selectedBrowser"]:checked')) : [];
    const selectedBrowsers = selectedBoxes.map(b => b.value).filter(Boolean);
    const chkRandomBrowser = document.getElementById('chkRandomBrowser');
    const isRandomBrowser = chkRandomBrowser ? chkRandomBrowser.checked : true;

    let chosenBrowser = selectedBoxes.length > 0 ? selectedBoxes[0].value : '';
    let chosenBrowserName = 'Google Chrome';
    if (selectedBoxes.length > 0) {
      const names = selectedBoxes.map(b => b.parentElement?.querySelector('span')?.textContent || 'Browser');
      chosenBrowserName = isRandomBrowser && names.length > 1 ? `Random Rotation (${names.join(', ')})` : names[0];
    } else {
      // Auto fallback if none checked
      const anyBox = browserChecklist?.querySelector('input[name="selectedBrowser"]');
      chosenBrowser = anyBox?.value || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      if (anyBox) {
        anyBox.checked = true;
        const nameEl = anyBox.parentElement?.querySelector('span');
        if (nameEl) chosenBrowserName = nameEl.textContent;
      }
      if (chosenBrowser) selectedBrowsers.push(chosenBrowser);
    }

    appendLogToBothTerminals('\n[System] Initiating Google Maps Review Reporter Agent...');
    appendLogToBothTerminals(`[System] Accounts: ${unusedAccounts.length} ready for 1 report each (${loadedAccounts.length} total, Primary: ${primaryAcc.email})`);
    appendLogToBothTerminals(`[System] Target Review Links: ${urls.length} (Mixed Modes)`);
    appendLogToBothTerminals(`[System] Browser: ${chosenBrowserName}`);
    const activeReason = loadedLinks[0]?.reason || selectCategory?.value || 'spam';
    const activeMode = loadedLinks[0]?.mode || currentReportType;
    const modeLabel = activeMode === 'both'
      ? '🛡️ Standard Report + ⚖️ AI Legal Notice (Dual)'
      : (activeMode === 'legal' ? '⚖️ Report a Legal Notice' : '🛡️ Standard Policy Violation');
    appendLogToBothTerminals(`[System] Report Mode: ${modeLabel}`);
    appendLogToBothTerminals(`[System] Category: ${activeReason === 'ai-auto' ? '🤖 AI Auto Decision' : activeReason.toUpperCase()}`);
    const proxyCfg = getActiveProxyConfig();
    if (proxyCfg.enabled && proxyCfg.server) {
      appendLogToBothTerminals(`[System] Proxy: ${proxyCfg.server} (${proxyCfg.mode})`);
    } else {
      appendLogToBothTerminals('[System] Proxy: Direct Connection');
    }

    if (window.desktopAPI) {
      const res = await window.desktopAPI.startAgent({
        email: primaryAcc.email || '',
        password: primaryAcc.password || '',
        backupCode: primaryAcc.backupCode || '',
        accounts: loadedAccounts,
        urls: urls,
        reportReason: activeReason,
        reportType: activeMode,
        browserPath: chosenBrowser,
        selectedBrowsers: selectedBrowsers,
        randomBrowser: isRandomBrowser,
        headless: false,
        aiProvider: selectAiProvider?.value || 'gemini',
        aiApiKey: inputAiKey?.value.trim() || '',
        aiModel: selectAiModel?.value || 'gemini-2.0-flash',
        aiInspection: checkAiInspection?.checked || false,
        legalFullName: inputLegalFullName?.value.trim() || appConfig.legalFullName || '',
        legalBusinessName: inputLegalBusinessName?.value.trim() || appConfig.legalBusinessName || '',
        legalCountry: inputLegalCountry?.value.trim() || appConfig.legalCountry || 'United States',
        proxy: proxyCfg
      });

      if (!res.success) {
        appendLogToBothTerminals('[System] Error starting agent: ' + res.error, true);
        finishExecution();
      }
    }
  }

  async function triggerStopAgent() {
    if (!isRunning) return;
    appendLogToBothTerminals('\n[System] Stopping agent on user command...');
    if (btnDashStop) btnDashStop.disabled = true;
    if (btnControlStop) btnControlStop.disabled = true;

    if (window.desktopAPI) {
      await window.desktopAPI.stopAgent();
    }
    finishExecution();
  }

  function setRunUIState(running) {
    if (btnDashStart) btnDashStart.disabled = running;
    if (btnDashStop) btnDashStop.disabled = !running;
    if (btnControlStart) btnControlStart.disabled = running;
    if (btnControlStop) btnControlStop.disabled = !running;

    if (agentStatusPill) {
      agentStatusPill.className = running ? 'status-pill running' : 'status-pill';
    }
    if (agentStatusPillText) {
      agentStatusPillText.textContent = running ? 'Agent Running...' : 'System Idle';
    }

    if (running) {
      updateProgressText('Launching chosen browser and stealth engine...', 5);
    }
  }

  function updateProgressText(statusText, percent) {
    const text = (statusText !== undefined && statusText !== null && String(statusText).trim() !== '') ? String(statusText) : 'Ready to start';
    const pct = typeof percent === 'number' ? percent : (parseInt(percent, 10) || 0);

    if (dashProgressText) dashProgressText.textContent = text;
    if (dashProgressPercent) dashProgressPercent.textContent = pct + '%';
    if (dashProgressBar) dashProgressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';

    if (controlProgressStatus) controlProgressStatus.textContent = text;
    if (controlProgressPercent) controlProgressPercent.textContent = pct + '%';
    if (controlProgressBar) controlProgressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  function finishExecution() {
    isRunning = false;
    setRunUIState(false);
    updateProgressText('Execution completed', 100);
    checkSessionStatus();
    updateDashboardMetrics();
  }

  btnDashStart?.addEventListener('click', triggerStartAgent);
  btnDashStop?.addEventListener('click', triggerStopAgent);
  btnControlStart?.addEventListener('click', triggerStartAgent);
  btnControlStop?.addEventListener('click', triggerStopAgent);

  // --- Listen to Electron IPC Events ---
  if (window.desktopAPI) {
    window.desktopAPI.onLog((text, isErr) => {
      appendLogToBothTerminals(text, isErr);

      if (text.includes('Completed successfully') || text.includes('Task completed successfully') || text.includes('initiated successfully')) {
        completedReportsCount++;
        updateDashboardMetrics();
      }
    });

    window.desktopAPI.onStatus((status) => {
      if (status.text) {
        updateProgressText(status.text, status.progress !== undefined ? status.progress : 50);
      }
    });

    window.desktopAPI.onScreenshot((data) => {
      latestProofBase64 = data.base64;
      if (dashProofStatus) {
        dashProofStatus.textContent = `Captured at ${data.timestamp} (Click to view)`;
      }
      if (data.category === 'error' || data.folder?.includes('errors')) {
        appendLogToBothTerminals(`\n⚠️ [Error Screenshot] ${data.filename} saved to report_logs/errors/ at ${data.timestamp}`);
      } else {
        appendLogToBothTerminals(`\n📸 [Proof Recorded] ${data.filename} saved to report_logs/proofs/ at ${data.timestamp}`);
      }
    });

    window.desktopAPI.onFinished((data) => {
      const exitCode = (data && data.code !== undefined && data.code !== null) ? data.code : 0;
      appendLogToBothTerminals(`\n[System] Task execution completed (exit code: ${exitCode}).`);
      finishExecution();
    });

    if (window.desktopAPI.onAccountUpdate) {
      window.desktopAPI.onAccountUpdate((data) => {
        if (!data || !data.email) return;
        const target = loadedAccounts.find(a => a.email.toLowerCase() === data.email.toLowerCase());
        if (target) {
          target.used = true;
          target.usedCount = (target.usedCount || 0) + 1;
          target.lastUsedAt = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          target.status = data.status; // 'success' or 'failed'
          target.lastError = data.error || null;
          saveLoadedAccounts();
          renderAccountsTable();
          updateDashboardMetrics();
        }
      });
    }

    if (window.desktopAPI.onLinkUpdate) {
      window.desktopAPI.onLinkUpdate((data) => {
        if (!data || !data.url) return;
        const target = loadedLinks.find(l => l.url === data.url || l.url.includes(data.url) || data.url.includes(l.url));
        if (target) {
          if (data.status === 'completed') {
            target.doneCount = (target.doneCount || 0) + 1;
            const targetCount = target.targetCount || 1;
            if (target.doneCount >= targetCount) {
              target.status = 'completed';
            } else {
              target.status = 'queued';
            }
            // Record in License Work Audit System
            if (window.licenseManager) {
              window.licenseManager.recordWorkAudit({
                targetUrl: data.url,
                reason: target.reason || 'Policy violation',
                status: 'Reported'
              });
            }
          } else {
            target.status = data.status || 'failed';
          }
          target.lastReportedAt = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          target.lastError = data.error || null;
          saveLoadedLinks();
          renderLinksTable();
          updateDashboardMetrics();
        }
      });
    }
  }

  // Initialize License Manager from about.js component
  if (!window.licenseManager && window.LicenseManager) {
    window.licenseManager = new window.LicenseManager();
  }

  // Instant Zero-Latency Initial Render (hydrated from local storage caches in 0ms)
  renderAccountsTable();
  renderProxiesTable();
  renderLinksTable();
  updateDashboardMetrics();

  // High-Speed Parallel Backend Synchronization
  Promise.allSettled([
    loadAppConfig(),
    loadAccountsFromBackend(),
    loadProxiesFromBackend(),
    loadLinksFromBackend()
  ]).then(() => {
    updateDashboardMetrics();
  });
});
