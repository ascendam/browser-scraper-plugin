// Filename: content/settings.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.3.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Central configuration file for DOMAP (theme, timings, random delays, highlight, Phase 2 flags).

window.DOMAP = window.DOMAP || {};
window.DOMAP.SETTINGS = {
  ui: {
    wrapperZIndex: 2147483647,
    theme: {
      wrapperBg: 'transparent',
      cardBg: '#ffffff',
      cardText: '#000000',
      panelBackdrop: 'rgba(0,0,0,0.0)'
    },
    font: {
      family: "'Roboto', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" // Roboto for controls
    },
    panel: {
      width: 360,
      radius: 16,
      padding: 12
    },
    minimise: {
      dotSize: 50,
      dotLabel: 'S',
      outline: '1px solid #000',
      bezier: 'cubic-bezier(0.25, 1, 0.5, 1)',
      durationMs: 360
    }
  },

  highlight: {
    hoverColor: 'rgba(0,255,0,0.55)',
    lockedColor: 'rgba(0,200,0,0.9)',
    editColor: 'rgba(255,0,0,0.85)',
    pulseMs: 900
  },

  timing: {
    domLoadDelayMs: 2000,
    domLoadJitterMinMs: 500,
    domLoadJitterMaxMs: 1500,
    cursorMoveMsMin: 300,
    cursorMoveMsMax: 800,
    hoverDelayMsMin: 150,
    hoverDelayMsMax: 400,
    scrollDelayMsMin: 500,
    scrollDelayMsMax: 1500,
    backButtonDelayMsMin: 1000,
    backButtonDelayMsMax: 2000,
    actionDelayMinMs: 400,
    actionDelayMaxMs: 1100,
    interUrlDelayMinMs: 2000,
    interUrlDelayMaxMs: 5000,
    hydrationWaitMs: 1200 // delay after 'complete' before extraction
  },

  scroll: { minPercent: 20, maxPercent: 80 },

  selectors: {
    preferNextData: true,
    enableAriaRole: true,
    enableTextAnchor: true
  },

  export: {
    csvDelimiter: ',',
    filePrefix: 'domap-map'
  },

  api: {
    enabled: false,
    endpoint: '',
    headers: {}
  },

  // runner settings and defaults
  runner: {
    respectRobots: false, // default fetch disallowed URLs
    maxUrls: 2000,
    includePattern: '', // substring or regex literal like /jobs/
    excludePattern: ''  // substring or regex literal like /admin/
  }
};
