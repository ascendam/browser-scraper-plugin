// Filename: background/background.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Background worker for DOMAP. Fetches sitemaps (CORS-safe), navigates tabs for runner, coordinates extraction.

let RUN_STATE = null; // { tabId, urls, idx, running, paused, options }

chrome.runtime.onInstalled.addListener(() => {
  console.log('[DOMAP] Background service worker installed');
});

// handle messages from content UI and runner
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  // fetch sitemap.xml via background to avoid CORS
  if (msg.type === 'DOMAP_FETCH_SITEMAP') {
    fetch(msg.url, { credentials: 'omit' })
      .then(r => r.text())
      .then(text => sendResponse({ ok: true, xml: text }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // start runner with a list of urls and options
  if (msg.type === 'DOMAP_RUNNER_START') {
    RUN_STATE = {
      tabId: sender.tab?.id || null,
      urls: msg.urls || [],
      idx: 0,
      running: true,
      paused: false,
      options: msg.options || {}
    };
    stepRun();
    sendResponse({ ok: true });
    return true;
  }

  // pause runner
  if (msg.type === 'DOMAP_RUNNER_PAUSE') {
    if (RUN_STATE) RUN_STATE.paused = true;
    sendResponse({ ok: true });
    return false;
  }

  // resume runner
  if (msg.type === 'DOMAP_RUNNER_RESUME') {
    if (RUN_STATE) {
      RUN_STATE.paused = false;
      stepRun();
    }
    sendResponse({ ok: true });
    return false;
  }

  // stop runner
  if (msg.type === 'DOMAP_RUNNER_STOP') {
    RUN_STATE = null;
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// navigate current tab and extract when complete
async function stepRun() {
  if (!RUN_STATE || !RUN_STATE.running) return;
  if (RUN_STATE.paused) return;

  const { urls, idx } = RUN_STATE;
  if (idx >= urls.length) {
    chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_DONE' });
    RUN_STATE = null;
    return;
  }

  const url = urls[idx];

  // pick a tab to drive; if none from sender, use active
  let tabId = RUN_STATE.tabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id;
    RUN_STATE.tabId = tabId || null;
  }
  if (!tabId) {
    chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_ERROR', url, error: 'No active tab' });
    RUN_STATE = null;
    return;
  }

  // navigate
  try {
    await chrome.tabs.update(tabId, { url });
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_URL_FAIL', url, error: String(e) });
    RUN_STATE.idx++;
    setTimeout(stepRun, jitterDelay());
    return;
  }

  // wait for complete then delay for hydration and ask content to extract
  const onUpdated = async (tid, info) => {
    if (tid !== tabId || info.status !== 'complete') return;
    chrome.tabs.onUpdated.removeListener(onUpdated);

    // wait hydration then ask content to extract
    setTimeout(async () => {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DOMAP_EXTRACT_NOW' });
        chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_PAGE_DONE', url, ok: true, rows: res?.rows || 0 });
      } catch (e) {
        chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_PAGE_DONE', url, ok: false, error: String(e) });
      }
      RUN_STATE.idx++;
      setTimeout(stepRun, jitterDelay());
    }, hydrationDelay());
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
}

// helpers for runner delays
function jitterDelay() {
  const S = (globalThis.DOMAP && DOMAP.SETTINGS) ? DOMAP.SETTINGS.timing : null;
  const min = S?.interUrlDelayMinMs ?? 2000;
  const max = S?.interUrlDelayMaxMs ?? 5000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hydrationDelay() {
  const S = (globalThis.DOMAP && DOMAP.SETTINGS) ? DOMAP.SETTINGS.timing : null;
  return (S?.hydrationWaitMs ?? 1200);
}
