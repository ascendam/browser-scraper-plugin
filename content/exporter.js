// Filename: content/exporter.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: CSV/JSON builders and download triggers with UTF-8 BOM for Excel compatibility.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.Exporter = (function () {
  const { csvDelimiter, filePrefix } = window.DOMAP.SETTINGS.export;
  const { timestamp, downloadBlob, getRecords, getResults } = window.DOMAP.Storage;

  function csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildCSV(records) {
    const head = ['Page', 'Time', 'Element Name', 'Element Content', 'Element Link'];
    const rows = records.map(r => [
      r.page || '',
      r.time || '',
      r.fieldName || '',
      r.content || '',
      r.link || ''
    ]);
    const lines = [head, ...rows].map(r => r.map(csvEscape).join(csvDelimiter)).join('\n');
    return '\uFEFF' + lines;
  }

  function downloadCSV(records) {
    const name = `${filePrefix}_${timestamp()}.csv`;
    downloadBlob(buildCSV(records), name, 'text/csv;charset=utf-8');
  }

  async function downloadCurrentCSV() {
    const results = await getResults();
    if (results && results.length) {
      downloadCSV(results);
      return;
    }
    const records = await getRecords();
    downloadCSV(records);
  }

  function downloadJSON(obj, namePrefix = 'domap-template') {
    const name = `${namePrefix}_${timestamp()}.json`;
    downloadBlob(JSON.stringify(obj, null, 2), name, 'application/json;charset=utf-8');
  }

  return { buildCSV, downloadCSV, downloadCurrentCSV, downloadJSON };
})();
