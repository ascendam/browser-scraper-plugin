// Filename: content/inject.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-11-10 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Content bootstrap. Creates Shadow DOM host, mounts UI once, and exposes light message hooks.

(() => {
  // guard against duplicate injection
  if (window.__DOMAP_INJECTED__) return;
  window.__DOMAP_INJECTED__ = true;

  // ensure namespace
  window.DOMAP = window.DOMAP || {};

  // jitter helper
  const jitter = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // create or get shadow host
  function ensureShadowHost() {
    let host = document.getElementById('vwm-shadow-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'vwm-shadow-host';
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '50%';
    host.style.transform = 'translateY(-50%)';
    host.style.zIndex = (window.DOMAP.SETTINGS?.ui?.wrapperZIndex ?? 2147483647).toString();
    host.style.pointerEvents = 'none'; // UI sets pointer-events back on internal cards
    document.documentElement.appendChild(host);
    return host;
  }

  // mount UI panel into shadow DOM
  async function mountUIPanel() {
    try {
      const S = window.DOMAP.SETTINGS || {};
      const baseDelay = S?.timing?.domLoadDelayMs ?? 2000;
      const jMin = S?.timing?.domLoadJitterMinMs ?? 500;
      const jMax = S?.timing?.domLoadJitterMaxMs ?? 1500;

      // wait for document readiness
      if (document.readyState === 'loading') {
        await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
      }

      // wait additional hydration delay with jitter
      await new Promise(r => setTimeout(r, baseDelay + jitter(jMin, jMax)));

      // create shadow root and mount
      const host = ensureShadowHost();
      if (!host.shadowRoot) host.attachShadow({ mode: 'open' });

      // avoid remounting if already mounted
      if (!host.shadowRoot.querySelector('.domap-wrapper')) {
        window.DOMAP.UIPanel?.mount(host.shadowRoot);
      }

      // pointer events back on, UI itself handles drag/controls
      host.style.pointerEvents = 'auto';
    } catch (e) {
      // last-resort console log only
      console.warn('[DOMAP] inject mount failed:', e);
    }
  }

  // simple show panel: ensure mounted and visible
  async function showPanel() {
    const host = ensureShadowHost();
    if (!host.shadowRoot || !host.shadowRoot.querySelector('.domap-wrapper')) {
      await mountUIPanel();
    } else {
      // if minimised, simulate click on mini bubble
      const mini = host.shadowRoot.querySelector('.domap-min');
      const panel = host.shadowRoot.querySelector('.domap-panel');
      if (mini && mini.style.display === 'grid') {
        mini.click();
      } else if (panel && panel.style.display === 'none') {
        // safety restore
        panel.style.display = 'block';
      }
    }
  }

  // message hooks from popup or background
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    // open or reveal the panel
    if (msg.type === 'DOMAP_SHOW_PANEL') {
      showPanel();
      sendResponse?.({ ok: true });
      return false;
    }

    // export CSV via Exporter (results first, then page fields)
    if (msg.type === 'DOMAP_EXPORT_CSV') {
      (async () => {
        try {
          await showPanel();
          await window.DOMAP.Exporter?.downloadCurrentCSV();
          sendResponse?.({ ok: true });
        } catch (e) {
          sendResponse?.({ ok: false, error: String(e) });
        }
      })();
      return true;
    }

    // stop runner convenience passthrough
    if (msg.type === 'DOMAP_RUNNER_STOP') {
      chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_STOP' });
      sendResponse?.({ ok: true });
      return false;
    }

    return false;
  });

  // mount immediately with configured delay/jitter
  mountUIPanel();

  // cleanup on unload
  window.addEventListener('beforeunload', () => {
    const host = document.getElementById('vwm-shadow-host');
    if (host && host.parentNode) host.parentNode.removeChild(host);
    window.__DOMAP_INJECTED__ = false;
  });
})();
