// Filename: popup/popup.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-11-10 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Popup actions to reveal panel, export CSV, and stop the runner.

(async function () {
  // get active tab helper
  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  // send a message to the active tab's content scripts
  async function sendToActiveTab(message) {
    const tabId = await getActiveTabId();
    if (!tabId) return { ok: false, error: 'No active tab' };
    try {
      const res = await chrome.tabs.sendMessage(tabId, message);
      return res || { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // open panel
  document.getElementById('openPanel').addEventListener('click', async () => {
    const res = await sendToActiveTab({ type: 'DOMAP_SHOW_PANEL' });
    if (!res?.ok) console.warn('[DOMAP] openPanel failed:', res?.error);
    window.close();
  });

  // export CSV
  document.getElementById('exportCSV').addEventListener('click', async () => {
    const res = await sendToActiveTab({ type: 'DOMAP_EXPORT_CSV' });
    if (!res?.ok) console.warn('[DOMAP] exportCSV failed:', res?.error);
    window.close();
  });

  // stop runner
  document.getElementById('stopRunner').addEventListener('click', async () => {
    const res = await sendToActiveTab({ type: 'DOMAP_RUNNER_STOP' });
    if (!res?.ok) console.warn('[DOMAP] stopRunner failed:', res?.error);
    window.close();
  });
})();
