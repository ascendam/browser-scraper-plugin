// Filename: content/selector-engine.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Resilient selector resolution chain. Tries CSS -> structural -> ARIA/role -> text anchor.
//          Integrates optional Next.js data reader when field spec contains jsonPath/jsonKeys.

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.SelectorEngine = (function () {
  const S = window.DOMAP.SETTINGS;

  // === Next.js data discovery ===
  function readNextData(doc = document) {
    try {
      // try window global first
      if (window.__NEXT_DATA__) return { ok: true, data: window.__NEXT_DATA__ };
      // fallback: find script tag with id __NEXT_DATA__
      const el = doc.querySelector('script#__NEXT_DATA__');
      if (!el) return { ok: false, data: null };
      const json = JSON.parse(el.textContent || '{}');
      return { ok: true, data: json };
    } catch (e) {
      return { ok: false, data: null };
    }
  }

  // === Utility: safe query ===
  function q(css, doc = document) {
    try { return doc.querySelector(css); } catch { return null; }
  }

  // === Utility: text anchor lookup ===
  function queryByNearbyText(labelText, doc = document) {
    if (!labelText) return null;
    const txt = labelText.toLowerCase();
    const all = doc.querySelectorAll('body *:not(script):not(style)');
    let best = null, bestDist = 999999;
    for (const el of all) {
      if (!el.textContent) continue;
      const t = el.textContent.trim().toLowerCase();
      if (!t) continue;
      const idx = t.indexOf(txt);
      if (idx >= 0) {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top) + Math.abs(rect.left);
        if (rect.width < 8 || rect.height < 8) continue;
        if (dist < bestDist) { best = el; bestDist = dist; }
      }
    }
    return best;
  }

  // === Utility: extract content/link from element ===
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

  // === Strategy: primary CSS selector ===
  function tryCSS(field, doc = document) {
    if (!field.selector) return null;
    const el = q(field.selector, doc);
    if (!el) return null;
    const { content, link } = extract(el);
    return { el, content, link, strategy: 'css' };
  }

  // === Strategy: structural fallback (stored as field.fallback.structural) ===
  function tryStructural(field, doc = document) {
    const css = field?.fallback?.structural;
    if (!css) return null;
    const el = q(css, doc);
    if (!el) return null;
    const { content, link } = extract(el);
    return { el, content, link, strategy: 'structural' };
  }

  // === Strategy: ARIA/role ===
  function tryAriaRole(field, doc = document) {
    if (!S.selectors.enableAriaRole) return null;
    const name = field?.fieldName || '';
    if (!name) return null;
    const candidates = doc.querySelectorAll('[role],[aria-label],[itemprop]');
    for (const c of candidates) {
      const labels = [
        c.getAttribute('aria-label'),
        c.getAttribute('itemprop'),
        c.getAttribute('name'),
        c.getAttribute('title')
      ].filter(Boolean).map(s => s.toLowerCase());
      if (labels.some(l => l.includes(name.toLowerCase()))) {
        const { content, link } = extract(c);
        return { el: c, content, link, strategy: 'aria' };
      }
    }
    return null;
  }

  // === Strategy: text-anchor (nearby label text) ===
  function tryTextAnchor(field, doc = document) {
    if (!S.selectors.enableTextAnchor) return null;
    const hint = field?.fallback?.textHint || field?.fieldName || '';
    if (!hint) return null;
    const anchor = queryByNearbyText(hint, doc);
    if (!anchor) return null;
    // choose the first reasonable child or the anchor itself
    const target = anchor.firstElementChild || anchor;
    const { content, link } = extract(target);
    return { el: target, content, link, strategy: 'text' };
  }

  // === Strategy: Next.js jsonPath or keys ===
  function tryNextData(field, doc = document) {
    if (!S.selectors.preferNextData) return null;
    const { ok, data } = readNextData(doc);
    if (!ok || !data) return null;
    // explicit jsonPath array e.g. ['props','pageProps','product','price']
    if (Array.isArray(field?.jsonPath) && field.jsonPath.length) {
      let node = data;
      for (const k of field.jsonPath) {
        if (!node || typeof node !== 'object') { node = null; break; }
        node = node[k];
      }
      if (node == null) return null;
      const content = String(node);
      return { el: null, content, link: '', strategy: 'next.jsonPath' };
    }
    // jsonKeys provides multiple key candidates to search shallowly
    if (Array.isArray(field?.jsonKeys) && field.jsonKeys.length) {
      const flat = JSON.stringify(data).toLowerCase();
      for (const key of field.jsonKeys) {
        const k = String(key).toLowerCase();
        if (flat.includes(`"${k}"`)) {
          // lightweight key-hit marker; deep parsing is template-specific
          return { el: null, content: `[nextData:${k}]`, link: '', strategy: 'next.jsonKeys' };
        }
      }
    }
    return null;
  }

  // === Public resolve function ===
  function resolveField(field, doc = document) {
    // if next data is preferred and field specifies jsonPath/jsonKeys, try it first
    const fromNext = tryNextData(field, doc);
    if (fromNext) return fromNext;

    // otherwise, normal DOM strategies in order
    return (
      tryCSS(field, doc) ||
      tryStructural(field, doc) ||
      tryAriaRole(field, doc) ||
      tryTextAnchor(field, doc) ||
      null
    );
  }

  return { resolveField, readNextData };
})();
