// The Settings screen: Goal, Baseline setup figure, Products, Back up and Restore.
import { h } from './dom.js';
import { S } from './strings.js';
import { goalDirection, parseNumber } from './engine.js';
import { fmtKg, fmtInt, fmtDateTime, isoForFile } from './format.js';
import { textField, note } from './components.js';
import { openGoalSheet, openProducts } from './sheets.js';

export const APP_VERSION = '0.1.0';

export function settingsScreen(ctx) {
  const { store } = ctx;
  const data = store.get();
  const root = h('div', { class: 'screen' });
  root.append(h('header', { class: 'topbar' },
    h('div', {}, h('h1', {}, S.settings.title)),
    h('button', { class: 'btn small', type: 'button', onclick: () => ctx.go('today') }, S.common.done)));

  if (store.loadProblem) {
    root.append(h('section', { class: 'card warn-card' }, h('h2', {}, S.settings.unreadableTitle), h('p', {}, S.settings.unreadableText)));
  }

  // Goal
  const goal = data.goal;
  root.append(h('section', { class: 'card' },
    h('div', { class: 'tile-head' }, h('h2', {}, S.settings.goal), h('button', { class: 'link', type: 'button', onclick: () => openGoalSheet(ctx) }, S.common.edit)),
    h('p', {}, goal ? S.progress.goalLine(goalDirection(goal), fmtKg(goal.targetKg), fmtKg(goal.paceKgPerWeek)) : S.progress.noGoal)));

  // Baseline setup figure
  const msg = h('p', { class: 'note' });
  const seed = textField({ label: S.settings.baselineLabel, value: data.settings.baselineSeed ? String(data.settings.baselineSeed) : '', inputmode: 'decimal', suffix: 'kcal', hint: S.settings.baselineHint });
  root.append(h('section', { class: 'card' },
    h('h2', {}, S.settings.baseline), seed.el, msg,
    h('button', { class: 'btn', type: 'button', onclick: () => {
      const k = parseNumber(seed.input.value);
      if (!(k > 500 && k <= 10000)) return note(msg, S.settings.needBaseline);
      store.setBaselineSeed(Math.round(k));
      ctx.toast(S.settings.baselineSaved);
    } }, S.common.save)));

  // Products
  root.append(h('section', { class: 'card' },
    h('h2', {}, S.settings.products),
    h('p', { class: 'muted' }, S.settings.productsCount(data.products.length)),
    h('button', { class: 'btn', type: 'button', onclick: () => openProducts(ctx) }, S.settings.manageProducts)));

  // Back up and Restore
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => restore(ctx, e.target.files?.[0], e.target) });
  root.append(h('section', { class: 'card' },
    h('h2', {}, S.settings.backup),
    h('p', { class: 'muted' }, S.settings.backupText),
    h('p', { class: 'muted' }, data.settings.lastBackupAt ? S.settings.lastBackup(fmtDateTime(data.settings.lastBackupAt)) : S.settings.neverBackedUp),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => backUp(ctx) }, S.settings.backUpNow),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, S.settings.restore)),
    fileInput));

  // About and erase
  root.append(h('section', { class: 'card' },
    h('h2', {}, S.settings.about),
    h('p', { class: 'muted' }, S.settings.aboutText),
    h('p', { class: 'muted small' }, S.settings.version(APP_VERSION, data.weighIns.length, data.entries.length)),
    h('button', { class: 'btn danger', type: 'button', onclick: () => {
      if (!window.confirm(S.settings.eraseConfirm)) return;
      store.reset();
      ctx.go('today');
    } }, S.settings.erase)));
  return root;
}

async function backUp(ctx) {
  const name = `diet-tracker-backup-${isoForFile(new Date(ctx.now()))}.json`;
  const file = new File([ctx.store.exportJSON()], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: S.settings.shareTitle });
      ctx.store.markBackedUp();
      ctx.toast(S.settings.backedUp);
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // closed the share sheet without saving
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  ctx.store.markBackedUp();
  ctx.toast(S.settings.downloaded);
}

async function restore(ctx, file, input) {
  if (!file) return;
  try {
    const text = await file.text();
    if (!window.confirm(S.settings.restoreConfirm)) return;
    ctx.store.importJSON(text);
    ctx.toast(S.settings.restored(fmtInt(ctx.store.get().entries.length)));
  } catch (err) {
    ctx.toast(err.message || S.settings.restoreFailed);
  } finally {
    input.value = '';
  }
}
