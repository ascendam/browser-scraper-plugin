// Filename: content/mapper-core.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Interactive mapping core with Phase 2 hooks: resilient re-attach using selector engine,
// and refresh of field contents via strategy resolution.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.MapperCore = (function () {
  const S = window.DOMAP.SETTINGS;
  const Storage = window.DOMAP.Storage;
  const Engine = window.DOMAP.SelectorEngine;

  // === Session state ===
  let mappingArmed = false;
  let activeRowId = null;
  let session = { id: crypto.randomUUID(), pageType: 'product', pageUrl: location.href, fields: [] };

  // === Outlines and hydration ===
  let hoverOutline = null;
  const lockedOutlines = new Map();
  let mouseMoveThrottled = false;
  let hydrationObserver = null;

  // === Throttle helper ===
  function throttleMouseMove(handler) {
    return function (e) {
      if (mouseMoveThrottled) return;
      mouseMoveThrottled = true;
      handler(e);
      setTimeout(() => (mouseMoveThrottled = false), 90);
    };
  }

  // === Outline styling injection ===
  function attachOutlineStyles() {
    if (document.getElementById('domap-outline-style')) return;
    const st = document.createElement('style');
    st.id = 'domap-outline-style';
    st.textContent = `
      @keyframes domap-pulse {
        0% { box-shadow: 0 0 0 2px rgba(0,255,0,0.10); }
        50% { box-shadow: 0 0 0 6px rgba(0,255,0,0.25); }
        100% { box-shadow: 0 0 0 2px rgba(0,255,0,0.10); }
      }
      .domap-outline-locked {
        position: absolute; pointer-events: none;
        border: 2px solid ${S.highlight.lockedColor}; border-radius: 6px;
        box-shadow: 0 0 0 3px rgba(0,180,0,0.20);
        z-index: ${S.ui.wrapperZIndex - 1};
      }
      .domap-outline-edit {
        position: absolute; pointer-events: none;
        border: 2px dashed ${S.highlight.editColor}; border-radius: 6px;
        box-shadow: 0 0 0 3px rgba(255,0,0,0.15);
        z-index: ${S.ui.wrapperZIndex - 1};
      }
    `;
    document.head.appendChild(st);
  }

  // === Box helpers ===
  function ensureHoverOutline() {
    if (hoverOutline) return hoverOutline;
    const box = document.createElement('div');
    box.setAttribute('data-domap-outline', 'hover');
    box.style.position = 'absolute';
    box.style.pointerEvents = 'none';
    box.style.border = `2px solid ${S.highlight.hoverColor}`;
    box.style.borderRadius = '6px';
    box.style.boxShadow = `0 0 0 4px rgba(0,255,0,0.15)`;
    box.style.zIndex = String(S.ui.wrapperZIndex - 1);
    box.style.transition = `all 120ms ease-out`;
    box.style.animation = `domap-pulse ${S.highlight.pulseMs}ms infinite`;
    attachOutlineStyles();
    document.documentElement.appendChild(box);
    hoverOutline = box;
    return hoverOutline;
  }

  function positionBox(box, target, mode) {
    const r = target.getBoundingClientRect();
    box.style.left = `${Math.max(0, window.scrollX + r.left - 2)}px`;
    box.style.top = `${Math.max(0, window.scrollY + r.top - 2)}px`;
    box.style.width = `${Math.max(0, r.width + 4)}px`;
    box.style.height = `${Math.max(0, r.height + 4)}px`;
    box.className = mode === 'red' ? 'domap-outline-edit' : 'domap-outline-locked';
  }

  function isInternal(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute('data-domap-outline')) return true;
    if (el.closest && el.closest('#vwm-shadow-host')) return true;
    return false;
  }

  // === Hover handlers ===
  function onMouseMove(e) {
    if (!mappingArmed) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isInternal(target)) return;
    const r = target.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const box = ensureHoverOutline();
    box.style.left = `${window.scrollX + r.left - 2}px`;
    box.style.top = `${window.scrollY + r.top - 2}px`;
    box.style.width = `${r.width + 4}px`;
    box.style.height = `${r.height + 4}px`;
  }
  const throttledMove = throttleMouseMove(onMouseMove);

  // === Click-to-lock ===
  function onClick(e) {
    if (!mappingArmed) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isInternal(target)) return;
    e.preventDefault();
    e.stopPropagation();

    const selector = computeSelector(target);
    const fallback = buildFallback(target);
    const { content, link } = extract(target);

    if (!activeRowId) return;
    const id = crypto.randomUUID();
    const idx = session.fields.findIndex(f => f.rowId === activeRowId);
    const rec = { id, rowId: activeRowId, fieldName: '', selector, fallback, content, link };
    if (idx >= 0) session.fields[idx] = rec; else session.fields.push(rec);
    Storage.set('domap_current', session);

    const box = document.createElement('div');
    box.setAttribute('data-domap-outline', 'locked');
    document.documentElement.appendChild(box);
    positionBox(box, target, 'green');
    lockedOutlines.set(activeRowId, { el: box, target, mode: 'green' });

    disableHover();

    window.DOMAP.UIPanel?.onElementLocked?.({ rowId: activeRowId, selector, content, link });
  }

  // === Compute selector / fallback / extract helpers ===
  function computeSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id && !/\s/.test(el.id)) return `#${CSS.escape(el.id)}`;
    const attrs = [...el.attributes].map(a => [a.name, a.value]);
    const good = attrs.find(([k, v]) =>
      (/^data-/.test(k) || k === 'name' || k === 'aria-label' || k === 'itemprop') && v && v.length <= 80
    );
    if (good) {
      const [k, v] = good;
      return `${el.tagName.toLowerCase()}[${k}="${CSS.escape(v)}"]`;
    }
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      const tag = n.tagName.toLowerCase();
      const siblings = [...n.parentNode?.children || []].filter(c => c.tagName === n.tagName);
      const idx = siblings.indexOf(n) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
      n = n.parentElement;
    }
    return parts.join(' > ') || null;
  }

  function buildFallback(el) {
    const text = (el.textContent || '').trim().slice(0, 60);
    return { structural: computeSelector(el), textHint: text };
  }

  function extract(el) {
    if (!el) return { content: '', link: '' };
    let content = '';
    let link = '';
    if ('value' in el && el.value) content = el.value;
    content = content || (el.textContent || '').trim();
    if (el.closest && el.closest('a')) link = el.closest('a').href || '';
    if (el.getAttribute && el.getAttribute('src')) link = el.getAttribute('src');
    return { content, link };
  }

  // === Arm/disarm ===
  function enableHover(rowId) {
    mappingArmed = true;
    activeRowId = rowId || null;
    ensureHoverOutline();
    document.addEventListener('mousemove', throttledMove, true);
    document.addEventListener('click', onClick, true);
    if (!hydrationObserver) startHydrationObserver();
    window.DOMAP.UIPanel?.log(`Mapping armed for row ${rowId}`);
  }

  function disableHover() {
    mappingArmed = false;
    activeRowId = null;
    document.removeEventListener('mousemove', throttledMove, true);
    document.removeEventListener('click', onClick, true);
    if (hoverOutline?.parentNode) hoverOutline.parentNode.removeChild(hoverOutline);
    hoverOutline = null;
    window.DOMAP.UIPanel?.log('Mapping disarmed');
  }

  // === Edit mode outline toggle ===
  function setEditMode(rowId, editing) {
    const entry = lockedOutlines.get(rowId);
    if (!entry) return;
    entry.mode = editing ? 'red' : 'green';
    if (entry.target) positionBox(entry.el, entry.target, entry.mode);
  }

  // === Remove row and outline ===
  function removeRow(rowId) {
    const i = session.fields.findIndex(f => f.rowId === rowId);
    if (i >= 0) session.fields.splice(i, 1);
    Storage.set('domap_current', session);
    const entry = lockedOutlines.get(rowId);
    if (entry?.el?.parentNode) entry.el.parentNode.removeChild(entry.el);
    lockedOutlines.delete(rowId);
  }

  // === Update field name ===
  function setFieldName(rowId, name) {
    const i = session.fields.findIndex(f => f.rowId === rowId);
    if (i >= 0) {
      session.fields[i].fieldName = name || session.fields[i].fieldName || '';
      Storage.set('domap_current', session);
    }
  }

  // === Start hydration observer with resilient re-attach using selector engine ===
  function startHydrationObserver() {
    hydrationObserver = new MutationObserver(() => {
      lockedOutlines.forEach((entry, rowId) => {
        const data = session.fields.find(f => f.rowId === rowId);
        if (!data) return;
        // if target gone or moved, resolve again using selector engine
        if (!entry.target || !document.contains(entry.target)) {
          const res = Engine.resolveField(data, document);
          if (res?.el) {
            entry.target = res.el;
            window.DOMAP.UIPanel?.log(`Reattached outline for row ${rowId} via ${res.strategy}`);
          }
        }
        if (entry.target) positionBox(entry.el, entry.target, entry.mode === 'red' ? 'red' : 'green');
      });
    });
    hydrationObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.DOMAP.UIPanel?.log('Hydration observer started');
  }

  // === Phase 2: refresh all fields by strategy chain to update content/link ===
  async function refreshAllFields() {
    let updated = 0;
    for (const f of session.fields) {
      const res = Engine.resolveField(f, document);
      if (res) {
        f.content = res.content ?? f.content;
        f.link = res.link ?? f.link;
        // if element found, also reposition outline
        const entry = lockedOutlines.get(f.rowId);
        if (res.el && entry) {
          entry.target = res.el;
          positionBox(entry.el, entry.target, entry.mode === 'red' ? 'red' : 'green');
        }
        updated++;
        window.DOMAP.UIPanel?.log(`Refreshed ${f.fieldName || f.rowId} via ${res.strategy}`);
      } else {
        window.DOMAP.UIPanel?.log(`No match for ${f.fieldName || f.rowId}`, 'WARN');
      }
    }
    await Storage.set('domap_current', session);
    return updated;
  }

  // === Public API ===
  function arm(rowId) { enableHover(rowId); }
  function disarm() { disableHover(); }
  function setPageType(pt) { session.pageType = pt; Storage.set('domap_current', session); }
  function resetSession() {
    lockedOutlines.forEach(e => e.el?.parentNode?.removeChild(e.el));
    lockedOutlines.clear();
    disableHover();
    session = { id: crypto.randomUUID(), pageType: 'product', pageUrl: location.href, fields: [] };
    Storage.set('domap_current', session);
    window.DOMAP.UIPanel?.log('Session reset and outlines cleared');
  }
  function getSession() { return session; }

  // === Bootstrap: restore session and outlines ===
  (async function bootstrap() {
    const saved = await Storage.get('domap_current');
    if (saved && saved.fields) {
      session = saved;
      session.pageUrl = location.href;
      attachOutlineStyles();
      saved.fields.forEach(f => {
        const res = Engine.resolveField(f, document);
        if (!res?.el) return;
        const box = document.createElement('div');
        box.setAttribute('data-domap-outline', 'locked');
        document.documentElement.appendChild(box);
        positionBox(box, res.el, 'green');
        lockedOutlines.set(f.rowId, { el: box, target: res.el, mode: 'green' });
      });
      window.DOMAP.UIPanel?.log(`Restored session with ${saved.fields.length} fields`);
    }
  })();

  return { arm, disarm, setEditMode, setFieldName, removeRow, setPageType, resetSession, getSession, refreshAllFields };
})();
