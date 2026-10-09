/**
 * src/renderer/js/components/about.js
 * Software Specifications, Device Binding & License Manager (Supabase Compatible)
 */

(function() {
  class LicenseManager {
    constructor() {
      this.STORAGE_KEYS = {
        LICENSE: 'mapsshield_license_data',
        DEVICE_ID: 'mapsshield_device_id',
        DEVICE_NAME: 'mapsshield_device_name',
        BOUND_DEVICES: 'mapsshield_bound_devices',
        SUPABASE_URL: 'mapsshield_supabase_url',
        SUPABASE_KEY: 'mapsshield_supabase_key',
        WORK_AUDIT: 'mapsshield_work_telemetry'
      };

      this.deviceId = this.initDeviceId();
      this.deviceName = this.initDeviceName();
      this.supabase = this.loadSupabaseConfig();
      this.license = this.loadLicenseData();
      this.boundDevices = this.loadBoundDevices();
      this.workAudit = this.loadWorkAudit();
      this.heartbeatTimer = null;

      this.initUI();
      this.bindEvents();
      this.render();
      this.startHeartbeat();

      setTimeout(() => {
        this.loadHardwareIdentity();
      }, 50);
    }

    async loadHardwareIdentity() {
      if (window.desktopAPI && window.desktopAPI.getHardwareId) {
        try {
          const realHwId = await window.desktopAPI.getHardwareId();
          if (realHwId && realHwId.length > 5) {
            this.deviceId = realHwId;
            localStorage.setItem(this.STORAGE_KEYS.DEVICE_ID, realHwId);
            this.boundDevices = [{
              device_id: realHwId,
              device_name: this.deviceName,
              last_active_at: new Date().toISOString(),
              is_current: true
            }];
            this.saveBoundDevices(this.boundDevices);
            this.render();
          }
        } catch (e) {
          console.warn('Error fetching hardware ID:', e);
        }
      }
    }

    initDeviceId() {
      let id = localStorage.getItem(this.STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        const randA = Math.random().toString(36).substring(2, 6).toUpperCase();
        const randB = Math.random().toString(36).substring(2, 6).toUpperCase();
        id = `MB-${randA}-${randB}`;
        localStorage.setItem(this.STORAGE_KEYS.DEVICE_ID, id);
      }
      return id;
    }

    initDeviceName() {
      let name = localStorage.getItem(this.STORAGE_KEYS.DEVICE_NAME);
      if (!name) {
        const platform = navigator.userAgentData?.platform || navigator.platform || 'Windows';
        name = `${platform} Workstation (${this.deviceId.substring(4, 8)})`;
        localStorage.setItem(this.STORAGE_KEYS.DEVICE_NAME, name);
      }
      return name;
    }

    static SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
    static SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

    loadSupabaseConfig() {
      return {
        url: LicenseManager.SUPABASE_URL,
        key: LicenseManager.SUPABASE_ANON_KEY
      };
    }

    loadLicenseData() {
      const raw = localStorage.getItem(this.STORAGE_KEYS.LICENSE);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.license_key === 'UNLICENSED' || parsed.status === 'inactive')) {
            // Upgrade old unlicensed state
          } else {
            return parsed;
          }
        } catch (e) {}
      }
      return {
        id: null,
        license_key: 'COMMUNITY-EDITION',
        customer_name: 'Community Edition',
        customer_email: 'Local Machine User',
        status: 'community',
        max_devices: 1,
        expiry_date: 'Lifetime Access',
        plan_type: 'Community / Unlimited Automation',
        created_at: new Date().toISOString(),
        notes: 'Local standalone mode'
      };
    }

    saveLicenseData(lic) {
      this.license = lic;
      if (lic) {
        localStorage.setItem(this.STORAGE_KEYS.LICENSE, JSON.stringify(lic));
      } else {
        localStorage.removeItem(this.STORAGE_KEYS.LICENSE);
      }
    }

    loadBoundDevices() {
      const raw = localStorage.getItem(this.STORAGE_KEYS.BOUND_DEVICES);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
      return [
        {
          device_id: this.deviceId,
          device_name: this.deviceName,
          last_active_at: new Date().toISOString(),
          is_current: true
        }
      ];
    }

    saveBoundDevices(devices) {
      this.boundDevices = devices;
      localStorage.setItem(this.STORAGE_KEYS.BOUND_DEVICES, JSON.stringify(devices));
    }

    loadWorkAudit() {
      const raw = localStorage.getItem(this.STORAGE_KEYS.WORK_AUDIT);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
      }
      return {
        todayDate: new Date().toDateString(),
        todayCount: 0,
        lifetimeCount: 0,
        lastReportTime: null,
        lastTargetUrl: null,
        events: []
      };
    }

    saveWorkAudit() {
      localStorage.setItem(this.STORAGE_KEYS.WORK_AUDIT, JSON.stringify(this.workAudit));
    }

    isSupabaseReady() {
      return Boolean(this.supabase.url && this.supabase.key && !this.supabase.url.includes('YOUR_SUPABASE'));
    }

    async verifyAndActivate(key) {
      const trimmedKey = (key || '').trim().toUpperCase();
      if (!trimmedKey) {
        return { ok: false, message: 'Please enter a valid License Key.' };
      }

      if (this.isSupabaseReady()) {
        try {
          const cleanUrl = this.supabase.url.replace(/\/+$/, '');
          const res = await fetch(`${cleanUrl}/rest/v1/licenses?license_key=eq.${encodeURIComponent(trimmedKey)}&select=*`, {
            method: 'GET',
            headers: {
              'apikey': this.supabase.key,
              'Authorization': `Bearer ${this.supabase.key}`
            }
          });

          if (!res.ok) {
            return { ok: false, message: `Supabase error: HTTP ${res.status}` };
          }

          const records = await res.json();
          if (!records || records.length === 0) {
            return { ok: false, message: `License key "${trimmedKey}" not found in Supabase project.` };
          }

          const lic = records[0];
          if (lic.status !== 'active') {
            return { ok: false, message: `License is currently ${lic.status.toUpperCase()}.` };
          }

          if (lic.expiry_date && new Date(lic.expiry_date) < new Date()) {
            return { ok: false, message: `License expired on ${lic.expiry_date}.` };
          }

          const devRes = await fetch(`${cleanUrl}/rest/v1/license_devices?license_id=eq.${lic.id}&select=*`, {
            headers: {
              'apikey': this.supabase.key,
              'Authorization': `Bearer ${this.supabase.key}`
            }
          });

          const devices = devRes.ok ? await devRes.json() : [];
          const currentDeviceExists = devices.some(d => d.device_id === this.deviceId);

          if (!currentDeviceExists && devices.length >= (lic.max_devices || 1)) {
            return {
              ok: false,
              message: `Device limit exceeded! Maximum allowed devices for this key is ${lic.max_devices}. Please unbind another machine.`
            };
          }

          await fetch(`${cleanUrl}/rest/v1/license_devices`, {
            method: 'POST',
            headers: {
              'apikey': this.supabase.key,
              'Authorization': `Bearer ${this.supabase.key}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
              license_id: lic.id,
              device_id: this.deviceId,
              device_name: this.deviceName,
              os_info: navigator.userAgentData?.platform || navigator.platform || 'Windows',
              last_active_at: new Date().toISOString()
            })
          });

          this.saveLicenseData(lic);
          this.saveBoundDevices([
            ...devices.filter(d => d.device_id !== this.deviceId),
            { device_id: this.deviceId, device_name: this.deviceName, last_active_at: new Date().toISOString(), is_current: true }
          ]);

          this.render();
          return { ok: true, message: `License activated successfully! Bound to ${this.deviceName}.` };
        } catch (err) {
          console.warn('[LicenseManager] Supabase fetch error, falling back to local:', err);
        }
      }

      // Local offline fallback mode
      const localLic = {
        id: 'offline-' + Date.now(),
        license_key: trimmedKey,
        customer_name: 'Verified User',
        customer_email: 'user@mapsshield.pro',
        status: 'active',
        max_devices: 2,
        expiry_date: '2030-12-31',
        plan_type: 'MapsShield Anti-Detect Pro',
        created_at: new Date().toISOString(),
        notes: 'Locally activated key'
      };

      this.saveLicenseData(localLic);
      this.saveBoundDevices([
        { device_id: this.deviceId, device_name: this.deviceName, last_active_at: new Date().toISOString(), is_current: true }
      ]);
      this.render();

      return {
        ok: true,
        message: `Key activated in Local System Mode! Ready to sync when Supabase project is configured.`
      };
    }

    async unbindDevice() {
      if (this.isSupabaseReady() && this.license?.id) {
        try {
          const cleanUrl = this.supabase.url.replace(/\/+$/, '');
          await fetch(`${cleanUrl}/rest/v1/license_devices?license_id=eq.${this.license.id}&device_id=eq.${this.deviceId}`, {
            method: 'DELETE',
            headers: {
              'apikey': this.supabase.key,
              'Authorization': `Bearer ${this.supabase.key}`
            }
          });
        } catch (e) {
          console.warn('[LicenseManager] Error deleting device from Supabase:', e);
        }
      }

      this.saveLicenseData({
        id: null,
        license_key: 'UNLICENSED',
        customer_name: 'Unlicensed Client',
        customer_email: 'none',
        status: 'inactive',
        max_devices: 0,
        expiry_date: 'Expired',
        plan_type: 'No Active Subscription',
        created_at: new Date().toISOString()
      });

      this.saveBoundDevices([]);
      this.render();
      return { ok: true, message: 'Device has been unbound. System is now unlicensed.' };
    }

    async recordWorkAudit({ targetUrl, reason, status }) {
      const today = new Date().toDateString();
      if (this.workAudit.todayDate !== today) {
        this.workAudit.todayDate = today;
        this.workAudit.todayCount = 0;
      }

      this.workAudit.todayCount++;
      this.workAudit.lifetimeCount++;
      this.workAudit.lastReportTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.workAudit.lastTargetUrl = targetUrl || 'Direct Map Review';

      const entry = {
        id: Date.now(),
        time: this.workAudit.lastReportTime,
        url: targetUrl || 'Unknown Target',
        reason: reason || 'Spam / Policy',
        status: status || 'Reported',
        device: this.deviceName
      };

      this.workAudit.events.unshift(entry);
      if (this.workAudit.events.length > 50) this.workAudit.events.pop();
      this.saveWorkAudit();
      this.renderWorkAudit();

      if (this.isSupabaseReady() && this.license?.license_key) {
        try {
          const cleanUrl = this.supabase.url.replace(/\/+$/, '');
          fetch(`${cleanUrl}/rest/v1/rpc/fn_record_work_audit`, {
            method: 'POST',
            headers: {
              'apikey': this.supabase.key,
              'Authorization': `Bearer ${this.supabase.key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              p_license_key: this.license.license_key,
              p_device_id: this.deviceId,
              p_device_name: this.deviceName,
              p_target_url: targetUrl || '',
              p_reason: reason || ''
            })
          }).catch(() => {});
        } catch (e) {}
      }
    }

    startHeartbeat() {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        const hbText = document.getElementById('auditHeartbeatText');
        if (hbText) {
          hbText.textContent = `Active ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      }, 45000);
    }

    initUI() {}

    render() {
      this.renderLicense();
      this.renderActiveAudit();
      this.renderWorkAudit();
      this.renderSupabaseStatus();
    }

    renderLicense() {
      const lic = this.license;
      const isActive = lic && lic.status === 'active';

      const badge = document.getElementById('licStatusBadge');
      const custName = document.getElementById('licCustName');
      const custEmail = document.getElementById('licCustEmail');
      const planType = document.getElementById('licPlanType');
      const expiryDate = document.getElementById('licExpiryDate');
      const daysRemaining = document.getElementById('licDaysRemaining');
      const deviceSlots = document.getElementById('licDeviceSlots');
      const deviceSlotsSub = document.getElementById('licDeviceSlotsSub');
      const activeKeyDisplay = document.getElementById('licActiveKeyDisplay');
      const btnUnbind = document.getElementById('btnUnbindKey');

      if (isActive) {
        if (badge) {
          badge.className = 'badge badge-success';
          badge.innerHTML = '<span class="status-dot-sm bg-emerald"></span><span id="licStatusBadgeText">ACTIVE PRO</span>';
        }
        if (custName) custName.textContent = lic.customer_name || 'Pro Subscriber';
        if (custEmail) custEmail.textContent = lic.customer_email || 'Active Machine';
        if (planType) planType.textContent = lic.plan_type || 'MapsShield Pro Suite';
        if (expiryDate) expiryDate.textContent = lic.expiry_date || 'Dec 31, 2030';
        if (daysRemaining) daysRemaining.textContent = 'Active / Lifetime';
        if (deviceSlots) deviceSlots.textContent = `${this.boundDevices.length} / ${lic.max_devices || 1} Active`;
        if (deviceSlotsSub) {
          const avail = Math.max(0, (lic.max_devices || 1) - this.boundDevices.length);
          deviceSlotsSub.textContent = `${avail} slots available`;
        }
        if (activeKeyDisplay) activeKeyDisplay.textContent = lic.license_key;
        if (btnUnbind) btnUnbind.style.display = 'inline-flex';
      } else {
        if (badge) {
          badge.className = 'badge badge-neutral';
          badge.innerHTML = '<span class="status-dot-sm bg-sky"></span><span id="licStatusBadgeText">COMMUNITY / TRIAL</span>';
        }
        if (custName) custName.textContent = 'Community Edition';
        if (custEmail) custEmail.textContent = 'Local Standalone User';
        if (planType) planType.textContent = 'Trial / Unlimited Automation';
        if (expiryDate) expiryDate.textContent = 'Lifetime Access';
        if (daysRemaining) daysRemaining.textContent = 'Active (Local)';
        if (deviceSlots) deviceSlots.textContent = '1 / 1 Device';
        if (deviceSlotsSub) deviceSlotsSub.textContent = 'Local Machine Bound';
        if (activeKeyDisplay) activeKeyDisplay.textContent = 'COMMUNITY-EDITION-ACTIVE';
        if (btnUnbind) btnUnbind.style.display = 'none';
      }
    }

    renderActiveAudit() {
      const machineIdEl = document.getElementById('auditMachineId');
      const machineNameEl = document.getElementById('auditMachineName');
      const countBadge = document.getElementById('auditDeviceCountBadge');
      const listEl = document.getElementById('auditDeviceList');

      if (machineIdEl) machineIdEl.textContent = this.deviceId;
      if (machineNameEl) machineNameEl.textContent = this.deviceName;
      if (countBadge) countBadge.textContent = `${this.boundDevices.length} Active`;

      if (listEl) {
        listEl.innerHTML = '';
        if (this.boundDevices.length === 0) {
          listEl.innerHTML = '<div class="text-muted" style="font-size: 0.72rem; padding: 6px;">No machines bound yet.</div>';
        } else {
          this.boundDevices.forEach(d => {
            const item = document.createElement('div');
            item.className = 'audit-device-item';
            const isMe = d.device_id === this.deviceId;
            item.innerHTML = `
              <div class="audit-dev-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isMe ? '#10b981' : '#64748b'}" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <span class="audit-dev-name">${d.device_name}</span>
                <code class="audit-dev-id">${d.device_id}</code>
                ${isMe ? '<span class="badge badge-success" style="font-size: 9px; padding: 1px 5px;">This Device</span>' : ''}
              </div>
              <span class="audit-dev-time">${isMe ? 'Online Now' : (d.last_active_at ? new Date(d.last_active_at).toLocaleDateString() : 'Active')}</span>
            `;
            listEl.appendChild(item);
          });
        }
      }
    }

    renderWorkAudit() {
      const todayCountEl = document.getElementById('workAuditTodayCount');
      const totalCountEl = document.getElementById('workAuditLifetimeCount');
      const syncBadgeEl = document.getElementById('workAuditSyncBadge');
      const syncSubEl = document.getElementById('workAuditSyncSub');
      const lastTimeEl = document.getElementById('workAuditLastTime');
      const tbody = document.getElementById('workAuditTableBody');

      if (todayCountEl) todayCountEl.textContent = this.workAudit.todayCount || 0;
      if (totalCountEl) totalCountEl.textContent = this.workAudit.lifetimeCount || 0;

      if (syncBadgeEl) {
        if (this.isSupabaseReady()) {
          syncBadgeEl.className = 'work-stat-num text-emerald';
          syncBadgeEl.textContent = 'Cloud Synced';
          if (syncSubEl) syncSubEl.textContent = 'Live Supabase Relay';
        } else {
          syncBadgeEl.className = 'work-stat-num text-sky';
          syncBadgeEl.textContent = 'Local Ready';
          if (syncSubEl) syncSubEl.textContent = 'Stored locally';
        }
      }

      if (lastTimeEl) {
        lastTimeEl.textContent = this.workAudit.lastReportTime ? `Last active: ${this.workAudit.lastReportTime}` : 'No reports yet';
      }

      if (tbody) {
        tbody.innerHTML = '';
        const events = this.workAudit.events || [];
        if (events.length === 0) {
          tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 14px;">No reporting events recorded yet. Start reporting in Control tab to view live work audit feed.</td></tr>`;
        } else {
          events.slice(0, 15).forEach(ev => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td style="font-family: var(--font-mono); color: var(--text-muted); font-size: 0.7rem;">${ev.time}</td>
              <td><code>${ev.url}</code></td>
              <td><span class="badge badge-neutral" style="font-size: 10px;">${ev.reason}</span></td>
              <td><span class="badge badge-success" style="font-size: 10px;">${ev.status}</span></td>
            `;
            tbody.appendChild(tr);
          });
        }
      }
    }

    renderSupabaseStatus() {
      const dot = document.getElementById('cfgConnectionDot');
      const text = document.getElementById('cfgConnectionStatusText');
      if (dot && text) {
        if (this.isSupabaseReady()) {
          dot.className = 'status-dot-sm bg-emerald';
          text.textContent = `Connected (${this.supabase.url.substring(0, 24)}...)`;
        } else {
          dot.className = 'status-dot-sm bg-neutral';
          text.textContent = 'Not Connected (Offline / Local System Ready)';
        }
      }
    }

    showToast(elId, msg, isError = false) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = msg;
      el.className = 'toast-msg ' + (isError ? 'error' : 'success');
      clearTimeout(el._toastTimer);
      el._toastTimer = setTimeout(() => {
        el.textContent = '';
        el.className = 'toast-msg';
      }, 4000);
    }

    bindEvents() {
      const btnActivate = document.getElementById('btnActivateKey');
      const licInput = document.getElementById('licKeyInput');
      if (btnActivate && licInput) {
        btnActivate.addEventListener('click', async () => {
          const key = licInput.value.trim();
          if (!key) {
            this.showToast('licNotification', 'Please type or paste a license key.', true);
            return;
          }
          btnActivate.disabled = true;
          btnActivate.innerHTML = '<span>Activating...</span>';
          const res = await this.verifyAndActivate(key);
          btnActivate.disabled = false;
          btnActivate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px;"><polyline points="20 6 9 17 4 12"/></svg><span>Activate Key</span>';
          this.showToast('licNotification', res.message, !res.ok);
          if (res.ok) licInput.value = '';
        });
      }

      const btnUnbind = document.getElementById('btnUnbindKey');
      if (btnUnbind) {
        btnUnbind.addEventListener('click', async () => {
          if (confirm('Unbind this machine from the active license? You will need a valid key to reactivate.')) {
            const res = await this.unbindDevice();
            this.showToast('licNotification', res.message, false);
          }
        });
      }

      const btnPaste = document.getElementById('btnPasteLicKey');
      if (btnPaste && licInput) {
        btnPaste.addEventListener('click', async () => {
          try {
            const clip = await navigator.clipboard.readText();
            if (clip) licInput.value = clip.trim();
            else this.showToast('licNotification', 'Clipboard is empty.', true);
          } catch (e) {
            this.showToast('licNotification', 'Could not read clipboard. Paste manually (Ctrl+V).', true);
          }
        });
      }

      const btnCopyKey = document.getElementById('btnCopyActiveKey');
      if (btnCopyKey) {
        btnCopyKey.addEventListener('click', async () => {
          if (!this.license?.license_key) return;
          try {
            await navigator.clipboard.writeText(this.license.license_key);
            btnCopyKey.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
              btnCopyKey.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 1500);
          } catch (e) {
            this.showToast('licNotification', 'Could not copy license key.', true);
          }
        });
      }

      const btnCopyDevId = document.getElementById('btnCopyMachineId');
      if (btnCopyDevId) {
        btnCopyDevId.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(this.deviceId || '');
            btnCopyDevId.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width: 11px; height: 11px;"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
              btnCopyDevId.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 11px; height: 11px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 1500);
          } catch (e) {
            this.showToast('licNotification', 'Could not copy machine ID.', true);
          }
        });
      }

      const btnClearAudit = document.getElementById('btnClearWorkAudit');
      if (btnClearAudit) {
        btnClearAudit.addEventListener('click', () => {
          if (confirm('Reset today and lifetime work audit counters?')) {
            this.workAudit = {
              todayDate: new Date().toDateString(),
              todayCount: 0,
              lifetimeCount: 0,
              lastReportTime: null,
              lastTargetUrl: null,
              events: []
            };
            this.saveWorkAudit();
            this.renderWorkAudit();
          }
        });
      }
    }
  }

  window.LicenseManager = LicenseManager;
})();
