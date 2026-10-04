// The bottom sheets: set a Goal, add and edit Food Entries, add and edit Products.
import { h, icon, clear } from './dom.js';
import { S } from './strings.js';
import { MEALS, parseNumber, kcalFor, paceWarnings, baselineFor, computeTrend, trendOn } from './engine.js';
import { entryFromProduct } from './store.js';
import { lookupBarcode, barcodeOk } from './off.js';
import { fmtInt, fmtKg } from './format.js';
import { textField, segmented, note } from './components.js';

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const byRecent = (a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name);

// ------------------------------------------------------------------ Goal

export function openGoalSheet(ctx) {
  const { store } = ctx;
  const data = store.get();
  const goal = data.goal;
  const today = ctx.today();
  const trendNow = trendOn(computeTrend(data.weighIns), today) ?? goal?.startKg ?? null;
  const baseline = baselineFor(today, data.burns, data.settings.baselineSeed);

  const warnEl = h('p', { class: 'note' });
  const msg = h('p', { class: 'note' });
  const target = textField({ label: S.goal.target, value: goal ? String(goal.targetKg) : '', inputmode: 'decimal', suffix: 'kg', onInput: refresh });
  const pace = textField({ label: S.goal.pace, value: goal ? String(goal.paceKgPerWeek) : '0.5', inputmode: 'decimal', suffix: S.goal.perWeek, hint: S.goal.paceHint, onInput: refresh });

  function candidate() {
    const t = parseNumber(target.input.value);
    const p = parseNumber(pace.input.value);
    return { t, p, ok: t > 0 && p >= 0 && trendNow != null };
  }
  function refresh() {
    const { t, p, ok } = candidate();
    if (!ok) return note(warnEl, '');
    const warnings = paceWarnings({ targetKg: t, startKg: trendNow, paceKgPerWeek: p }, baseline);
    note(warnEl, warnings.map((w) => S.goal.warnings[w]).join(' '), 'warn');
  }
  function save() {
    const { t, p } = candidate();
    if (!(t >= 20 && t <= 400)) return note(msg, S.goal.needTarget);
    if (!(p >= 0 && p <= 3)) return note(msg, S.goal.needPace);
    if (trendNow == null) return note(msg, S.goal.needWeighIn);
    store.setGoal({ targetKg: t, paceKgPerWeek: p }, { date: today, startKg: trendNow });
    sheet.close();
    ctx.toast(S.goal.saved);
  }

  const body = h('div', { class: 'pane' },
    trendNow != null ? h('p', { class: 'muted' }, S.goal.startsFrom(fmtKg(trendNow))) : null,
    target.el, pace.el, warnEl, msg,
    h('button', { class: 'btn primary wide', type: 'button', onclick: save }, S.common.save));
  const sheet = ctx.openSheet({ title: goal ? S.goal.titleEdit : S.goal.titleNew, body });
  refresh();
  return sheet;
}

// ------------------------------------------------------------------ add food

export function openAddFood(ctx, { date, meal }) {
  const { store } = ctx;
  const state = { mode: 'product', picked: null };
  const sheet = ctx.openSheet({ title: S.food.addTo(S.meals[meal]), body: h('div') });

  const draw = () => sheet.setBody(
    state.picked ? amountPane() : state.mode === 'product' ? productPane() : quickPane(),
    S.food.addTo(S.meals[meal]));
  const pick = (p) => { state.picked = p; state.mode = 'product'; draw(); };

  const modeTabs = () => segmented(
    [{ value: 'product', label: S.food.tabProduct }, { value: 'quick', label: S.food.tabQuick }],
    state.mode, (m) => { state.mode = m; draw(); }, S.food.addMode);

  function productPane() {
    const products = [...store.get().products].sort(byRecent);
    const list = h('div', { class: 'list' });
    const search = h('input', { type: 'search', placeholder: S.food.search, 'aria-label': S.food.search, autocomplete: 'off', oninput: fill });
    function fill() {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const shown = products.filter((p) => !q || p.name.toLowerCase().includes(q));
      if (!products.length) list.append(h('p', { class: 'muted pad' }, S.food.noProducts));
      else if (!shown.length) list.append(h('p', { class: 'muted pad' }, S.food.noMatch));
      for (const p of shown) {
        list.append(h('button', { type: 'button', class: 'row', onclick: () => pick(p) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, p.name), h('span', { class: 'row-sub' }, S.food.per100(fmtNum(p.kcalPer100), p.basis))),
          icon('right', 18)));
      }
    }
    const actions = h('div', { class: 'actions' },
      ctx.features.barcode
        ? h('button', { class: 'btn', type: 'button', onclick: scan }, icon('barcode', 18), S.food.scan)
        : null,
      h('button', { class: 'btn', type: 'button', onclick: () => newProduct() }, icon('plus', 18), S.food.newProduct));
    fill();
    return h('div', { class: 'pane' }, modeTabs(), search, actions, list);
  }

  async function scan() {
    const code = await ctx.scan();
    if (!code) return;
    const have = store.get().products.find((p) => p.barcode === code);
    if (have) return pick(have);
    newProduct({ barcode: code, autoLookup: true });
  }

  function newProduct(opts = {}) {
    sheet.setBody(productForm(ctx, { ...opts, onSaved: pick, onPick: pick, onBack: draw }), S.product.titleNew);
  }

  function quickPane() {
    const kcal = textField({ label: S.food.kcal, inputmode: 'decimal', suffix: 'kcal' });
    const name = textField({ label: S.food.quickName, placeholder: S.food.quickNamePlaceholder, autocapitalize: 'sentences', maxlength: 60 });
    const msg = h('p', { class: 'note' });
    const add = () => {
      const k = parseNumber(kcal.input.value);
      if (!(k >= 0)) return note(msg, S.food.needKcal);
      store.addEntry({ date, meal, kind: 'quick', name: name.input.value.trim(), kcal: Math.round(k) });
      sheet.close();
      ctx.toast(S.food.added);
    };
    return h('div', { class: 'pane' }, modeTabs(), kcal.el, name.el, msg,
      h('button', { class: 'btn primary wide', type: 'button', onclick: add }, S.common.add));
  }

  function amountPane() {
    const p = state.picked;
    let servingIdx = null;
    let count = 1;
    const chips = h('div', { class: 'chips' });
    const stepper = h('div', { class: 'stepper' });
    const preview = h('p', { class: 'preview' });
    const msg = h('p', { class: 'note' });
    const amount = textField({ label: S.food.amount, inputmode: 'decimal', suffix: p.basis, onInput: () => { servingIdx = null; drawServings(); drawPreview(); } });

    function drawPreview() {
      const a = parseNumber(amount.input.value);
      preview.textContent = a > 0 ? S.food.kcalPreview(fmtInt(kcalFor(p.kcalPer100, a))) : '';
    }
    function applyServing() {
      amount.input.value = fmtNum(Math.round(p.servings[servingIdx].amount * count * 10) / 10);
      drawPreview();
    }
    function drawServings() {
      clear(chips);
      clear(stepper);
      p.servings.forEach((sv, i) => {
        chips.append(h('button', { type: 'button', class: `chip-btn${i === servingIdx ? ' on' : ''}`, onclick: () => { servingIdx = i; count = 1; applyServing(); drawServings(); } },
          `${sv.name} · ${fmtNum(sv.amount)} ${p.basis}`));
      });
      if (servingIdx != null) {
        const sv = p.servings[servingIdx];
        stepper.append(
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': S.food.fewer, disabled: count <= 1, onclick: () => { count -= 1; applyServing(); drawServings(); } }, '−'),
          h('span', {}, `${count} × ${sv.name}`),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': S.food.more, onclick: () => { count += 1; applyServing(); drawServings(); } }, '+'));
      }
    }
    function add() {
      const a = parseNumber(amount.input.value);
      if (!(a > 0)) return note(msg, S.food.needAmount);
      const sv = servingIdx != null ? p.servings[servingIdx] : null;
      store.addEntry(entryFromProduct(p, { date, meal, amount: a, servingName: sv?.name ?? null, servingCount: sv ? count : null }));
      store.touchProduct(p.id);
      sheet.close();
      ctx.toast(S.food.added);
    }
    drawServings();
    return h('div', { class: 'pane' },
      h('div', { class: 'picked' },
        h('div', {}, h('div', { class: 'row-title' }, p.name), h('div', { class: 'row-sub' }, S.food.per100(fmtNum(p.kcalPer100), p.basis))),
        h('button', { class: 'link', type: 'button', onclick: () => { state.picked = null; draw(); } }, S.food.change)),
      p.servings.length ? chips : null, stepper, amount.el, preview, msg,
      h('button', { class: 'btn primary wide', type: 'button', onclick: add }, S.common.add));
  }

  draw();
  return sheet;
}

// ------------------------------------------------------------------ edit a Food Entry

export function openEditEntry(ctx, entry) {
  const { store } = ctx;
  const isProduct = entry.kind === 'product';
  const msg = h('p', { class: 'note' });
  let meal = entry.meal;
  const mealSelect = h('label', { class: 'field' },
    h('span', { class: 'field-label' }, S.food.meal),
    h('select', { onchange: (e) => { meal = e.target.value; } },
      MEALS.map((m) => h('option', { value: m, selected: m === entry.meal }, S.meals[m]))));

  const kcal = textField({ label: S.food.kcal, value: String(entry.kcal), inputmode: 'decimal', suffix: 'kcal' });
  const name = textField({ label: S.food.quickName, value: entry.name ?? '', autocapitalize: 'sentences', maxlength: 60 });
  const amount = textField({ label: S.food.amount, value: isProduct ? fmtNum(entry.amount) : '', inputmode: 'decimal', suffix: entry.unit, onInput: drawPreview });
  const preview = h('p', { class: 'preview' });
  function drawPreview() {
    const a = parseNumber(amount.input.value);
    preview.textContent = a > 0 ? S.food.kcalPreview(fmtInt(kcalFor(entry.kcalPer100, a))) : '';
  }

  function save() {
    if (isProduct) {
      const a = parseNumber(amount.input.value);
      if (!(a > 0)) return note(msg, S.food.needAmount);
      const same = a === entry.amount;
      store.updateEntry(entry.id, {
        meal, amount: a, kcal: kcalFor(entry.kcalPer100, a),
        servingName: same ? entry.servingName : null, servingCount: same ? entry.servingCount : null,
      });
    } else {
      const k = parseNumber(kcal.input.value);
      if (!(k >= 0)) return note(msg, S.food.needKcal);
      store.updateEntry(entry.id, { meal, kcal: Math.round(k), name: name.input.value.trim() });
    }
    sheet.close();
  }
  function remove() {
    const removed = store.removeEntry(entry.id);
    sheet.close();
    ctx.toast(S.food.deleted, { actionLabel: S.common.undo, onAction: () => store.addEntry(removed) });
  }

  const body = h('div', { class: 'pane' },
    isProduct
      ? [h('div', { class: 'picked' }, h('div', {}, h('div', { class: 'row-title' }, entry.name), h('div', { class: 'row-sub' }, S.food.per100(fmtNum(entry.kcalPer100), entry.unit)))),
        entry.servingName ? h('p', { class: 'muted' }, S.food.enteredAs(entry.servingCount, entry.servingName)) : null,
        amount.el, preview]
      : [kcal.el, name.el],
    mealSelect, msg,
    h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', onclick: remove }, icon('trash', 18), S.common.delete),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, S.common.save)));
  const sheet = ctx.openSheet({ title: S.food.editTitle, body });
  if (isProduct) drawPreview();
  return sheet;
}

// ------------------------------------------------------------------ Products

// The form for a new or existing Product. Returns an element to put in a sheet.
export function productForm(ctx, { product = null, barcode = null, autoLookup = false, onSaved, onPick, onBack, onDeleted }) {
  const { store } = ctx;
  const st = {
    basis: product?.basis ?? 'g',
    servings: (product?.servings ?? []).map((sv) => ({ name: sv.name, amount: fmtNum(sv.amount) })),
  };
  const msg = h('p', { class: 'note' });
  const lookupMsg = h('p', { class: 'note' });
  const nameF = textField({ label: S.product.name, value: product?.name ?? '', autocapitalize: 'sentences', maxlength: 80 });
  const kcalF = textField({ label: S.product.kcalPer100, value: product ? fmtNum(product.kcalPer100) : '', inputmode: 'decimal', hint: S.product.scanTip });
  const barcodeF = textField({ label: S.product.barcode, value: product?.barcode ?? barcode ?? '', inputmode: 'numeric', maxlength: 14 });
  const basisBox = h('div', {});
  const servingsBox = h('div', { class: 'servings' });

  function drawBasis() {
    clear(basisBox).append(h('span', { class: 'field-label' }, S.product.per),
      segmented([{ value: 'g', label: S.product.perG }, { value: 'ml', label: S.product.perMl }], st.basis, (b) => { st.basis = b; drawBasis(); }, S.product.per));
  }
  function drawServings() {
    clear(servingsBox);
    st.servings.forEach((sv, i) => {
      servingsBox.append(h('div', { class: 'serving-row' },
        h('input', { type: 'text', value: sv.name, placeholder: S.product.servingName, 'aria-label': S.product.servingName, autocomplete: 'off', oninput: (e) => { sv.name = e.target.value; } }),
        h('input', { type: 'text', inputmode: 'decimal', value: sv.amount, placeholder: st.basis, 'aria-label': S.product.servingAmount, autocomplete: 'off', oninput: (e) => { sv.amount = e.target.value; } }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': S.product.removeServing, onclick: () => { st.servings.splice(i, 1); drawServings(); } }, icon('close', 18))));
    });
    servingsBox.append(h('button', { class: 'link', type: 'button', onclick: () => { st.servings.push({ name: '', amount: '' }); drawServings(); } }, `+ ${S.product.addServing}`));
  }

  async function lookup() {
    const code = barcodeF.input.value.trim();
    if (!barcodeOk(code)) return note(lookupMsg, S.product.badBarcode);
    const have = store.get().products.find((p) => p.barcode === code && p.id !== product?.id);
    if (have) {
      if (onPick) return onPick(have);
      return note(lookupMsg, S.product.alreadyHave(have.name), 'info');
    }
    note(lookupMsg, S.product.looking, 'info');
    lookupBtn.disabled = true;
    try {
      const found = await lookupBarcode(code);
      if (!found) return note(lookupMsg, S.product.notFound, 'info');
      nameF.input.value = found.name;
      if (found.kcalPer100 != null) kcalF.input.value = fmtNum(found.kcalPer100);
      st.basis = found.basis;
      st.servings = found.servings.map((sv) => ({ name: sv.name, amount: fmtNum(sv.amount) }));
      drawBasis();
      drawServings();
      note(lookupMsg, found.kcalPer100 == null ? S.product.foundNoKcal : S.product.found, found.kcalPer100 == null ? 'info' : 'ok');
    } catch {
      note(lookupMsg, S.product.lookupFailed);
    } finally {
      lookupBtn.disabled = false;
    }
  }
  const lookupBtn = h('button', { class: 'btn small', type: 'button', onclick: lookup }, S.product.lookup);

  function save() {
    const name = nameF.input.value.trim();
    const kcal = parseNumber(kcalF.input.value);
    if (!name) return note(msg, S.product.needName);
    if (!(kcal >= 0)) return note(msg, S.product.needKcal);
    const servings = st.servings
      .map((sv) => ({ name: sv.name.trim(), amount: parseNumber(sv.amount) }))
      .filter((sv) => sv.name && sv.amount > 0);
    const code = barcodeF.input.value.trim();
    const saved = store.saveProduct({ ...(product ? { id: product.id } : {}), name, basis: st.basis, kcalPer100: kcal, servings, barcode: barcodeOk(code) ? code : null });
    onSaved?.(saved);
  }
  function remove() {
    if (!window.confirm(S.product.deleteConfirm(product.name))) return;
    store.removeProduct(product.id);
    onDeleted?.();
  }

  drawBasis();
  drawServings();
  const body = h('div', { class: 'pane' },
    onBack ? h('button', { class: 'link back', type: 'button', onclick: onBack }, `‹ ${S.common.back}`) : null,
    h('div', { class: 'barcode-row' },
      barcodeF.el,
      h('div', { class: 'barcode-actions' }, lookupBtn,
        ctx.features.barcode
          ? h('button', { class: 'btn small', type: 'button', onclick: async () => { const c = await ctx.scan(); if (c) { barcodeF.input.value = c; lookup(); } } }, icon('barcode', 18), S.product.scan)
          : null)),
    lookupMsg, nameF.el, basisBox, kcalF.el,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, S.product.servings), h('span', { class: 'hint' }, S.product.servingsHint), servingsBox),
    msg,
    h('div', { class: 'actions' },
      product ? h('button', { class: 'btn danger', type: 'button', onclick: remove }, icon('trash', 18), S.common.delete) : null,
      h('button', { class: 'btn primary', type: 'button', onclick: save }, S.common.save)));
  if (autoLookup && barcodeOk(barcodeF.input.value)) queueMicrotask(lookup);
  return body;
}

// The Settings list of Products: tap one to edit it.
export function openProducts(ctx) {
  const { store } = ctx;
  const sheet = ctx.openSheet({ title: S.product.listTitle, body: h('div') });
  const draw = () => {
    const products = [...store.get().products].sort((a, b) => a.name.localeCompare(b.name));
    const list = h('div', { class: 'list' },
      products.length ? products.map((p) => h('button', { type: 'button', class: 'row', onclick: () => edit(p) },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, p.name), h('span', { class: 'row-sub' }, S.food.per100(fmtNum(p.kcalPer100), p.basis))),
        icon('right', 18))) : h('p', { class: 'muted pad' }, S.food.noProducts));
    sheet.setBody(h('div', { class: 'pane' },
      h('button', { class: 'btn', type: 'button', onclick: () => edit(null) }, icon('plus', 18), S.food.newProduct), list), S.product.listTitle);
  };
  const edit = (p) => sheet.setBody(
    productForm(ctx, { product: p, onSaved: draw, onBack: draw, onDeleted: draw }),
    p ? S.product.titleEdit : S.product.titleNew);
  draw();
  return sheet;
}
