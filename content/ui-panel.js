// Filename: content/ui-panel.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Shadow DOM UI for DOMAP. Controls + status + runner card (sitemap/CSV load, filters, run/pause/resume/stop).
// Fonts: Roboto via Google Fonts with local and system fallbacks.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.UIPanel = (function () {
  const S = window.DOMAP.SETTINGS;
  const Exporter = window.DOMAP.Exporter;
  const Mapper = window.DOMAP.MapperCore;
  const Cursor = window.DOMAP.CursorSim;
  const Storage = window.DOMAP.Storage;
  const Runner = window.DOMAP.Runner;

  const LogState = { all: [], last: [] };
  const SYSTEM_STACK = "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";

  function log(line, type = 'INFO') {
    const stamp = new Date().toISOString();
    const entry = `[${type}] ${stamp} ${line}`;
    LogState.all.push(entry);
    LogState.last = LogState.all.slice(-20);
    if (renderLog) renderLog();
  }

  // load Roboto font with fallbacks
  async function setupFont(shadowRoot) {
    shadowRoot.host.style.setProperty('--domap-font', SYSTEM_STACK);
    const gf = document.createElement('link');
    gf.rel = 'stylesheet';
    gf.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap';
    let googleLoaded = false;
    const timeoutMs = Math.max(400, Math.min(2500, S.ui.minimise.durationMs + 1200));
    const done = new Promise((resolve) => {
      gf.onload = () => { googleLoaded = true; resolve(true); };
      gf.onerror = () => resolve(false);
      setTimeout(() => resolve(false), timeoutMs);
    });
    shadowRoot.appendChild(gf);
    const ok = await done;
    if (ok && googleLoaded) {
      shadowRoot.host.style.setProperty('--domap-font', "'Roboto', " + SYSTEM_STACK);
      log('Google Fonts loaded: Roboto');
      return;
    }
    try {
      const localUrl = chrome.runtime.getURL('assets/roboto-regular.woff2');
      const st = document.createElement('style');
      st.textContent = `
        @font-face {
          font-family: 'Roboto';
          src: url("${localUrl}") format('woff2');
          font-display: swap;
          font-weight: 400;
          font-style: normal;
        }
      `;
      shadowRoot.appendChild(st);
      shadowRoot.host.style.setProperty('--domap-font', "'Roboto', " + SYSTEM_STACK);
      log('Local font fallback applied: Roboto');
    } catch (e) {
      shadowRoot.host.style.setProperty('--domap-font', SYSTEM_STACK);
      log('Font fallback to system stack', 'WARN');
    }
  }

  function mount(shadowRoot) {
    const host = document.createElement('div');
    host.id = 'domap-host';
    host.style.all = 'initial';
    shadowRoot.appendChild(host);

    const style = document.createElement('style');
    style.textContent = cssText();
    shadowRoot.appendChild(style);

    const ui = document.createElement('div');
    ui.className = 'domap-wrapper';
    ui.innerHTML = markup();
    host.appendChild(ui);

    setupFont(shadowRoot);
    wireInteractions(shadowRoot, ui);
    log('DOMAP UI mounted');
  }

  function cssText() {
    const w = S.ui.panel.width;
    const r = S.ui.panel.radius;
    const p = S.ui.panel.padding;
    const dot = S.ui.minimise.dotSize;
    return `
      :host { all: initial; }
      .domap-wrapper { position: fixed; left: 0; top: 50%; transform: translateY(-50%); z-index: ${S.ui.wrapperZIndex}; background: ${S.ui.panelBackdrop}; }
      .domap-panel { width: ${w}px; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; }
      .domap-card { background: ${S.ui.theme.cardBg}; color: ${S.ui.theme.cardText}; border-radius: ${r}px; padding: ${p}px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
      .domap-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .domap-titlebar { display: flex; justify-content: space-between; align-items: center; cursor: grab; user-select: none; margin-bottom: 6px; font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-btn { appearance: none; border: 1px solid #000; background: #fff; color: #000; padding: 6px 10px; border-radius: 10px; cursor: pointer; font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-input { width: 100%; padding: 6px 8px; border: 1px solid #333; border-radius: 10px; font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-log { max-height: 120px; overflow: auto; font-size: 12px; line-height: 1.35; white-space: pre-wrap; font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-min { position: fixed; left: 0; top: 50%; transform: translate(-20%, -50%); width: ${dot}px; height: ${dot}px; border-radius: 999px; display: none; place-items: center; background: #fff; border: ${S.ui.minimise.outline}; font-family: var(--domap-font, ${SYSTEM_STACK}); }
      .domap-min span { font-weight: 700; }
      .domap-runner { display: flex; flex-direction: column; gap: 6px; }
      .domap-runner .domap-row { gap: 6px; }
    `;
  }

  function markup() {
    return `
      <div class="domap-panel" data-drag-handle="1">
        <div class="domap-card">
          <div class="domap-titlebar">
            <strong>DOMAP</strong>
            <button class="domap-btn" data-minimise="1">Minimise</button>
          </div>
          <div class="domap-controls">
            <select class="domap-input" data-page-type>
              <option value="product">product</option>
              <option value="category">category</option>
            </select>
            <button class="domap-btn" data-start>Start</button>
            <button class="domap-btn" data-add>+ Row</button>
            <button class="domap-btn" data-remove>- Row</button>
            <button class="domap-btn" data-back>Back</button>
            <button class="domap-btn" data-finish>Finish</button>
            <button class="domap-btn" data-export-results>Export CSV</button>
          </div>
          <div class="domap-rows" data-rows></div>
          <div class="domap-controls">
            <button class="domap-btn" data-save-template>Save JSON</button>
            <input type="file" accept="application/json" data-load-template />
          </div>
        </div>

        <div class="domap-card">
          <div><strong>Runner</strong></div>
          <div class="domap-runner">
            <div class="domap-row">
              <input class="domap-input" data-sitemap-url placeholder="Sitemap URL (urlset only)" />
              <button class="domap-btn" data-load-sitemap>Load</button>
            </div>
            <div class="domap-row">
              <input class="domap-input" data-include placeholder="Include pattern (substring or /regex/)" />
              <input class="domap-input" data-exclude placeholder="Exclude pattern (substring or /regex/)" />
              <input class="domap-input" data-maxurls type="number" min="1" value="${S.runner.maxUrls}" title="Max URLs" />
            </div>
            <div class="domap-row">
              <input class="domap-input" data-urls placeholder="Or paste URLs, one per line" />
              <input type="file" accept=".csv,text/csv" data-csv-upload />
            </div>
            <div class="domap-controls">
              <button class="domap-btn" data-run>Run</button>
              <button class="domap-btn" data-pause>Pause</button>
              <button class="domap-btn" data-resume>Resume</button>
              <button class="domap-btn" data-stop>Stop</button>
              <span data-counter style="font-size:12px;"></span>
            </div>
          </div>
        </div>

        <div class="domap-card">
          <div><strong>Status</strong></div>
          <div class="domap-log" data-log></div>
          <div class="domap-controls">
            <button class="domap-btn" data-download-log>Download Log</button>
            <button class="domap-btn" data-reset>Reset Session</button>
          </div>
        </div>
      </div>
      <div class="domap-min"><span>${S.ui.minimise.dotLabel}</span></div>
    `;
  }

  function wireInteractions(shadowRoot, ui) {
    const dragHandle = ui.querySelector('[data-drag-handle]');
    const minimiseBtn = ui.querySelector('[data-minimise]');
    const minBubble = shadowRoot.querySelector('.domap-min');
    const rowsEl = ui.querySelector('[data-rows]');
    const logEl = ui.querySelector('[data-log]');
    const pageTypeEl = ui.querySelector('[data-page-type]');
    const addBtn = ui.querySelector('[data-add]');
    const removeBtn = ui.querySelector('[data-remove]');
    const startBtn = ui.querySelector('[data-start]');
    const finishBtn = ui.querySelector('[data-finish]');
    const backBtn = ui.querySelector('[data-back]');
    const saveTplBtn = ui.querySelector('[data-save-template]');
    const loadTplInput = ui.querySelector('[data-load-template]');
    const dwnLogBtn = ui.querySelector('[data-download-log]');
    const resetBtn = ui.querySelector('[data-reset]');
    const exportResultsBtn = ui.querySelector('[data-export-results]');

    const sitemapInput = ui.querySelector('[data-sitemap-url]');
    const loadSitemapBtn = ui.querySelector('[data-load-sitemap]');
    const includeEl = ui.querySelector('[data-include]');
    const excludeEl = ui.querySelector('[data-exclude]');
    const maxUrlsEl = ui.querySelector('[data-maxurls]');
    const urlsInput = ui.querySelector('[data-urls]');
    const csvUpload = ui.querySelector('[data-csv-upload]');
    const runBtn = ui.querySelector('[data-run]');
    const pauseBtn = ui.querySelector('[data-pause]');
    const resumeBtn = ui.querySelector('[data-resume]');
    const stopBtn = ui.querySelector('[data-stop]');
    const counterEl = ui.querySelector('[data-counter]');

    let dragging = false;
    let startY = 0;
    let startTop = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      const rect = ui.getBoundingClientRect();
      startTop = rect.top;
      dragHandle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta = e.clientY - startY;
      const newTop = startTop + delta;
      const h = ui.offsetHeight;
      ui.style.top = `${Math.max(0, Math.min(window.innerHeight - h, newTop))}px`;
      ui.style.position = 'fixed';
      ui.style.left = '0';
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
      dragHandle.style.cursor = 'grab';
    });

    minimiseBtn.addEventListener('click', () => {
      ui.animate(
        [{ transform: 'translateY(-50%) scale(1)' }, { transform: 'translateY(-50%) scale(0.2)' }],
        { duration: S.ui.minimise.durationMs, easing: S.ui.minimise.bezier }
      );
      setTimeout(() => {
        ui.style.display = 'none';
        minBubble.style.display = 'grid';
      }, S.ui.minimise.durationMs);
    });

    minBubble.addEventListener('click', () => {
      minBubble.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.2)' }], { duration: S.ui.minimise.durationMs / 2 });
      setTimeout(() => {
        minBubble.style.display = 'none';
        ui.style.display = 'block';
        ui.animate(
          [{ transform: 'translateY(-50%) scale(0.2)' }, { transform: 'translateY(-50%) scale(1)' }],
          { duration: S.ui.minimise.durationMs, easing: S.ui.minimise.bezier }
        );
      }, S.ui.minimise.durationMs / 2);
    });

    addBtn.addEventListener('click', () => {
      const id = crypto.randomUUID();
      const row = document.createElement('div');
      row.className = 'domap-row';
      row.dataset.id = id;
      row.innerHTML = `
        <input class="domap-input" maxlength="10" data-name placeholder="field-${rowsEl.children.length + 1}" />
        <input class="domap-input" data-selector placeholder="(selector will be captured)" readonly />
        <button class="domap-btn" data-confirm>Confirm</button>
      `;
      rowsEl.appendChild(row);
      Mapper.arm(id);
      log(`Row added ${id} and mapping armed`);
    });

    removeBtn.addEventListener('click', () => {
      const last = rowsEl.lastElementChild;
      if (last) {
        const id = last.dataset.id;
        rowsEl.removeChild(last);
        Mapper.removeRow(id);
        log(`Row removed ${id}`);
      }
    });

    startBtn.addEventListener('click', () => {
      Mapper.setPageType(pageTypeEl.value);
      log(`Page type set to ${pageTypeEl.value}`);
      const last = rowsEl.lastElementChild;
      if (last) {
        Mapper.arm(last.dataset.id);
        log('Mapping armed for last row');
      }
    });

    backBtn.addEventListener('click', async () => {
      await Cursor.sleep(Cursor.rand(S.timing.actionDelayMinMs, S.timing.actionDelayMaxMs));
      await Cursor.randomScroll();
      await Cursor.sleep(Cursor.rand(S.timing.actionDelayMinMs, S.timing.actionDelayMaxMs));
      await Cursor.pressBack();
      log('Back action simulated');
    });

    finishBtn.addEventListener('click', async () => {
      const current = await Storage.get('domap_current');
      const fields = current?.fields || [];
      const records = fields.map(f => ({
        page: location.href,
        time: new Date().toISOString(),
        fieldName: f.fieldName || '',
        content: f.content || '',
        link: f.link || ''
      }));
      Exporter.downloadCSV(records);
      log(`Finish exported ${records.length} rows`);
    });

    exportResultsBtn.addEventListener('click', async () => {
      await Exporter.downloadCurrentCSV();
      log('Results CSV export triggered');
    });

    saveTplBtn.addEventListener('click', async () => {
      const current = await Storage.get('domap_current');
      const template = {
        templateName: `Template_${new Date().toISOString()}`,
        pageType: (current?.pageType) || pageTypeEl.value || 'product',
        fields: (current?.fields || []).map(f => ({ id: f.id, rowId: f.rowId, fieldName: f.fieldName, selector: f.selector, fallback: f.fallback || null }))
      };
      Exporter.downloadJSON(template, 'domap-template');
      log('Template saved to JSON');
    });

    loadTplInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const tpl = JSON.parse(text);
        rowsEl.innerHTML = '';
        pageTypeEl.value = tpl.pageType || 'product';
        Mapper.resetSession();
        Mapper.setPageType(pageTypeEl.value);
        (tpl.fields || []).forEach(f => {
          const row = document.createElement('div');
          row.className = 'domap-row';
          row.dataset.id = f.rowId || crypto.randomUUID();
          row.innerHTML = `
            <input class="domap-input" maxlength="10" data-name value="${f.fieldName || ''}" placeholder="field-${rowsEl.children.length + 1}" />
            <input class="domap-input" data-selector value="${f.selector || ''}" placeholder="(selector will be captured)" />
            <button class="domap-btn" data-confirm>Confirm</button>
          `;
          rowsEl.appendChild(row);
        });
        log('Template loaded into session');
      } catch {
        log('Invalid template file', 'ERROR');
      }
      e.target.value = '';
    });

    function renderLog() {
      logEl.textContent = LogState.last.join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }

    rowsEl.addEventListener('focusin', (e) => {
      const row = e.target.closest('.domap-row');
      if (!row) return;
      if (e.target.matches('[data-name]')) {
        Mapper.setEditMode(row.dataset.id, true);
        log(`Editing name for row ${row.dataset.id}`);
      }
    });

    rowsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.domap-row');
      if (!row) return;
      if (e.target.matches('[data-confirm]')) {
        const nameEl = row.querySelector('[data-name]');
        const name = nameEl.value || nameEl.placeholder || '';
        Mapper.setFieldName(row.dataset.id, name);
        Mapper.setEditMode(row.dataset.id, false);
        log(`Name confirmed for row ${row.dataset.id}: ${name}`);
      }
    });

    window.DOMAP.UIPanel.onElementLocked = ({ rowId, selector, content, link }) => {
      const row = rowsEl.querySelector(`.domap-row[data-id="${rowId}"]`);
      if (!row) return;
      const selEl = row.querySelector('[data-selector]');
      if (selEl) selEl.value = selector || '';
      (async () => {
        const current = await Storage.get('domap_current');
        const idx = current?.fields?.findIndex(f => f.rowId === rowId) ?? -1;
        if (current && idx >= 0) {
          current.fields[idx].content = content || current.fields[idx].content;
          current.fields[idx].link = link || current.fields[idx].link;
          await Storage.set('domap_current', current);
        }
      })();
      log(`Element locked for row ${rowId}`);
    };

    // Runner controls
    loadSitemapBtn.addEventListener('click', async () => {
      try {
        const url = sitemapInput.value.trim();
        if (!url) return;
        const list = await Runner.loadSitemap(url);
        S.runner.includePattern = includeEl.value.trim();
        S.runner.excludePattern = excludeEl.value.trim();
        S.runner.maxUrls = Number(maxUrlsEl.value || S.runner.maxUrls);
        const norm = list; // filtering happens in startRun
        urlsInput.value = norm.join('\n');
        log(`Sitemap loaded, ${norm.length} URLs found`);
      } catch (e) {
        log(`Sitemap load error: ${String(e)}`, 'ERROR');
      }
    });

    csvUpload.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const urls = Runner.parseCsvToUrls(text);
      urlsInput.value = urls.join('\n');
      log(`CSV loaded with ${urls.length} lines`);
      e.target.value = '';
    });

    runBtn.addEventListener('click', async () => {
      try {
        S.runner.includePattern = includeEl.value.trim();
        S.runner.excludePattern = excludeEl.value.trim();
        S.runner.maxUrls = Number(maxUrlsEl.value || S.runner.maxUrls);
        const urls = urlsInput.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        await Storage.clearResults();
        await Runner.startRun(urls);
        counterEl.textContent = `Running`;
      } catch (e) {
        log(`Run start error: ${String(e)}`, 'ERROR');
      }
    });

    pauseBtn.addEventListener('click', async () => {
      await Runner.pauseRun();
      counterEl.textContent = `Paused`;
      log('Runner paused');
    });

    resumeBtn.addEventListener('click', async () => {
      await Runner.resumeRun();
      counterEl.textContent = `Running`;
      log('Runner resumed');
    });

    stopBtn.addEventListener('click', async () => {
      await Runner.stopRun();
      counterEl.textContent = `Stopped`;
      log('Runner stopped');
    });

    dwnLogBtn.addEventListener('click', () => {
      const content = LogState.all.join('\n');
      Storage.downloadBlob(content, `domap-log_${Storage.timestamp()}.txt`, 'text/plain;charset=utf-8');
      log('Log downloaded');
    });

    resetBtn.addEventListener('click', async () => {
      await Storage.clearAll();
      LogState.all = [];
      LogState.last = [];
      rowsEl.innerHTML = '';
      urlsInput.value = '';
      counterEl.textContent = '';
      log('Session reset');
    });

    // listen to background runner progress
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'DOMAP_RUNNER_PAGE_DONE') {
        log(`Page done: ${msg.url} ${msg.ok ? 'OK' : 'FAIL'}`);
      }
      if (msg?.type === 'DOMAP_RUNNER_ERROR') {
        log(`Runner error: ${msg.error}`, 'ERROR');
      }
      if (msg?.type === 'DOMAP_RUNNER_URL_FAIL') {
        log(`Navigation failed: ${msg.url}`, 'ERROR');
      }
      if (msg?.type === 'DOMAP_RUNNER_DONE') {
        counterEl.textContent = `Done`;
        log('Runner completed');
      }
    });

    renderLog = renderLog;
  }

  let renderLog = null;

  return { mount, log, onElementLocked: null };
})();
