// Filename: content/storage.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: chrome.storage.local helpers with a light in-memory cache and download utilities.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.Storage = (function () {
  let cache = null; // cache for domap_current
  const area = chrome.storage?.local;

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function downloadBlob(content, filename, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: false }, () => URL.revokeObjectURL(url));
  }

  async function get(key) {
    if (key === 'domap_current' && cache) return cache;
    const res = await area.get(key);
    if (key === 'domap_current' && res[key]) cache = res[key];
    return res[key];
  }

  async function set(key, value) {
    const obj = {}; obj[key] = value;
    await area.set(obj);
    if (key === 'domap_current') cache = value;
  }

  async function remove(key) {
    await area.remove(key);
    if (key === 'domap_current') cache = null;
  }

  async function clearAll() {
    await area.clear();
    cache = null;
  }

  async function appendRecord(record) {
    const cur = (await get('domap_current')) || { id: crypto.randomUUID(), pageType: 'product', pageUrl: location.href, fields: [], results: [] };
    cur.fields = Array.isArray(cur.fields) ? cur.fields : [];
    cur.fields.push(record);
    await set('domap_current', cur);
    return cur;
  }

  async function getRecords() {
    const cur = await get('domap_current');
    const fields = cur?.fields || [];
    return fields.map(f => ({
      page: location.href,
      time: new Date().toISOString(),
      fieldName: f.fieldName || '',
      content: f.content || '',
      link: f.link || ''
    }));
  }

  // results array for multi-URL runs
  async function pushResultsBatch(records) {
    const cur = (await get('domap_current')) || { id: crypto.randomUUID(), pageType: 'product', pageUrl: location.href, fields: [], results: [] };
    cur.results = Array.isArray(cur.results) ? cur.results : [];
    cur.results.push(...records);
    await set('domap_current', cur);
    return cur.results.length;
  }

  async function getResults() {
    const cur = await get('domap_current');
    return Array.isArray(cur?.results) ? cur.results : [];
  }

  async function clearResults() {
    const cur = (await get('domap_current')) || {};
    cur.results = [];
    await set('domap_current', cur);
  }

  return { get, set, remove, clearAll, appendRecord, getRecords, pushResultsBatch, getResults, clearResults, timestamp, downloadBlob };
})();
