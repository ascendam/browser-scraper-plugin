// Filename: content/runner.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Runner orchestrator in content context. Loads sitemap via background, parses CSV,
//          normalises, filters, sends queue to background to navigate + extract.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.Runner = (function () {
  const S = window.DOMAP.SETTINGS;
  const Storage = window.DOMAP.Storage;
  const Exporter = window.DOMAP.Exporter;
  const Mapper = window.DOMAP.MapperCore;

  // parse CSV text into URL list
  function parseCsvToUrls(text) {
    const raw = text.replace(/\uFEFF/g, '');
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return lines;
  }

  // request sitemap XML via background and parse <loc> entries
  async function loadSitemap(url) {
    const resp = await chrome.runtime.sendMessage({ type: 'DOMAP_FETCH_SITEMAP', url });
    if (!resp?.ok) throw new Error(resp?.error || 'sitemap fetch failed');
    const xml = new DOMParser().parseFromString(resp.xml, 'text/xml');
    const locs = Array.from(xml.getElementsByTagName('loc')).map(n => (n.textContent || '').trim()).filter(Boolean);
    return locs;
  }

  // normalise urls: absolute, no fragments, dedupe
  function normaliseUrls(urls, base = location.href) {
    const out = new Set();
    for (const u of urls) {
      try {
        const abs = new URL(u, base);
        abs.hash = '';
        out.add(abs.toString());
      } catch {}
    }
    return Array.from(out);
  }

  // apply include/exclude filters, cap to max
  function filterUrls(urls) {
    const inc = S.runner.includePattern?.trim();
    const exc = S.runner.excludePattern?.trim();
    const max = S.runner.maxUrls || 2000;
    const match = (pat, u) => {
      if (!pat) return true;
      if (pat.startsWith('/') && pat.endsWith('/')) {
        try { return new RegExp(pat.slice(1, -1)).test(u); } catch { return true; }
      }
      return u.includes(pat);
    };
    const filtered = urls.filter(u => match(inc, u) && (!exc || !match(exc, u)));
    return filtered.slice(0, max);
  }

  // start a run by passing queue to background
  async function startRun(urls) {
    const queue = filterUrls(normaliseUrls(urls));
    if (!queue.length) throw new Error('No URLs after filtering');
    await chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_START', urls: queue, options: { respectRobots: S.runner.respectRobots } });
    window.DOMAP.UIPanel?.log(`Runner started with ${queue.length} URLs`);
  }

  // pause, resume, stop
  async function pauseRun() { await chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_PAUSE' }); }
  async function resumeRun() { await chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_RESUME' }); }
  async function stopRun() { await chrome.runtime.sendMessage({ type: 'DOMAP_RUNNER_STOP' }); }

  // content-side extract on request from background
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'DOMAP_EXTRACT_NOW') {
      (async () => {
        try {
          await Mapper.refreshAllFields();
          const recs = await Storage.getRecords(); // flatten current page fields
          // also push to results[] so CSV can export mid-run
          await Storage.pushResultsBatch(recs);
          sendResponse({ ok: true, rows: recs.length });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
  });

  return { parseCsvToUrls, loadSitemap, startRun, pauseRun, resumeRun, stopRun };
})();
