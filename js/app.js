// Boots the app: storage, the first-run and install screens, the tab bar, and which screen is showing.
import { h, icon, clear, openSheet, toast } from './dom.js';
import { S } from './strings.js';
import { createStore, KEY } from './store.js';
import { toISODate } from './engine.js';
import { todayScreen } from './today.js';
import { foodScreen } from './food.js';
import { progressScreen } from './progress.js';
import { burnScreen, defaultBurnDate } from './burn.js';
import { settingsScreen } from './settings.js';
import { setupScreen } from './setup.js';
import { seedDemo } from './demo.js';

const SCREENS = { today: todayScreen, food: foodScreen, progress: progressScreen, burn: burnScreen, settings: settingsScreen };
const TABS = ['today', 'food', 'progress', 'burn'];
const TAB_ICONS = { today: 'today', food: 'food', progress: 'progress', burn: 'burn' };

const params = new URLSearchParams(location.search);
const demoMode = params.has('demo');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function pickStorage() {
  try {
    const ls = window.localStorage;
    ls.setItem('__probe', '1');
    ls.removeItem('__probe');
    return { storage: ls, ok: true };
  } catch {
    return { storage: memoryStorage(), ok: false };
  }
}

// On an iPhone, a Safari tab and the Home Screen app keep separate storage: data entered in the tab would be lost.
function isIosBrowserTab() {
  const ua = navigator.userAgent;
  // iPadOS in "desktop site" mode calls itself a Mac, but a Mac with touch points is an iPad.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

const { storage, ok: storageOk } = pickStorage();
const store = createStore(storage, { key: demoMode ? 'diet.demo' : KEY });
if (demoMode) seedDemo(store, toISODate(new Date()));
if (storageOk && !demoMode) navigator.storage?.persist?.().catch(() => {});

const ui = { tab: SCREENS[location.hash.slice(1)] ? location.hash.slice(1) : 'today', range: 30 };
const gated = !demoMode && isIosBrowserTab();
let lastDay = toISODate(new Date());
let renderedTab = null;

const ctx = {
  store,
  ui,
  today: () => toISODate(new Date()),
  now: () => Date.now(),
  render,
  go,
  openSheet,
  toast,
  features: { barcode: false },
  scan: async () => null,
};

function go(tab, patch = {}) {
  Object.assign(ui, patch);
  ui.tab = tab;
  if (tab === 'burn' && !ui.burnDate) ui.burnDate = defaultBurnDate(store.get(), ctx.today());
  history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
  render();
  window.scrollTo(0, 0);
}

function gateScreen() {
  return h('div', { class: 'screen gate' },
    h('header', { class: 'topbar' }, h('div', {}, h('h1', {}, S.gate.title))),
    h('section', { class: 'card' },
      h('ol', { class: 'steps' }, S.gate.steps.map((step) => h('li', {}, step))),
      h('p', { class: 'muted' }, S.gate.why)));
}

function buildTabbar() {
  const nav = document.getElementById('tabbar');
  clear(nav);
  for (const id of TABS) {
    nav.append(h('button', { type: 'button', 'data-tab': id, onclick: () => go(id) }, icon(TAB_ICONS[id], 24), h('span', {}, S.tabs[id])));
  }
}

function render() {
  const today = ctx.today();
  if (today !== lastDay) { // the date rolled over while the app stayed open
    lastDay = today;
    ui.foodDate = ui.burnDate = ui.weighInDate = ui.selectedDay = undefined;
  }
  const screenEl = document.getElementById('screen');
  const keepScroll = renderedTab === ui.tab ? window.scrollY : 0;
  clear(screenEl);

  let showTabs = true;
  if (gated) {
    screenEl.append(gateScreen());
    showTabs = false;
  } else if (!store.get().goal) {
    screenEl.append(setupScreen(ctx));
    showTabs = false;
  } else {
    if (!storageOk) screenEl.append(h('div', { class: 'banner warn' }, S.app.noStorage));
    screenEl.append(SCREENS[ui.tab](ctx));
  }

  const nav = document.getElementById('tabbar');
  nav.hidden = !showTabs;
  for (const b of nav.children) {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  renderedTab = ui.tab;
  window.scrollTo(0, keepScroll);
  if (ui.focusWeighIn) {
    ui.focusWeighIn = false;
    document.getElementById('weighin-kg')?.focus();
  }
}

buildTabbar();
store.subscribe(() => render());
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (SCREENS[t] && t !== ui.tab) go(t); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.today() !== lastDay) render(); });
render();

// Offline: the service worker keeps the app's own files. Skipped on localhost unless asked for (?sw), so edits show up while building.
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || params.has('sw'))) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); } // a new version took over
  });
}
