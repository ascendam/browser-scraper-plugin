// Filename: content/cursor-sim.js
// App: DOMAP
// Author: Peter Polgari, peterp@forgeren.com
// Version: 1.2.0
// Created: 2025-10-24 12:00 Europe/Budapest
// License: Non-commercial; no sharing, reuse, or distribution without permission.
// Purpose: Human-like cursor behaviour (sleep, random wait, random scroll 20–80% viewport, back action).

window.DOMAP = window.DOMAP || {};
window.VWM = window.VWM || window.DOMAP;

window.DOMAP.CursorSim = (function () {
  const T = window.DOMAP.SETTINGS.timing;
  const SC = window.DOMAP.SETTINGS.scroll;

  // random int helper
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // sleep helper
  async function sleep(ms) {
    await new Promise(r => setTimeout(r, ms));
  }

  // action delay wrapper
  async function actionDelay() {
    await sleep(rand(T.actionDelayMinMs, T.actionDelayMaxMs));
  }

  // move-to-element placeholder (kept lightweight for now)
  async function moveToElement(_el) {
    await actionDelay();
  }

  // random scroll with wait before and after, distance 20–80% viewport, direction random
  async function randomScroll() {
    const vh = window.innerHeight || 800;
    const pct = rand(SC.minPercent, SC.maxPercent) / 100;
    const dist = Math.round(vh * pct);
    const dir = Math.random() < 0.5 ? -1 : 1;

    await actionDelay(); // wait before
    window.scrollBy({ top: dir * dist, left: 0, behavior: 'smooth' });
    await sleep(rand(T.scrollDelayMsMin, T.scrollDelayMsMax));
    await actionDelay(); // wait after
  }

  // back action with delays
  async function pressBack() {
    await actionDelay();
    history.back();
    await sleep(rand(T.backButtonDelayMsMin, T.backButtonDelayMsMax));
    await actionDelay();
  }

  return { moveToElement, randomScroll, pressBack, sleep, rand };
})();
