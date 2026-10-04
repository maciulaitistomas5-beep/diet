// The Food screen: a day's four Meals and the Food Entries under them.
import { h, icon } from './dom.js';
import { S } from './strings.js';
import { MEALS, daySummary, leftToEat } from './engine.js';
import { fmtInt } from './format.js';
import { header, dateSwitcher } from './components.js';
import { openAddFood, openEditEntry } from './sheets.js';

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function foodScreen(ctx) {
  const today = ctx.today();
  const date = ctx.ui.foodDate && ctx.ui.foodDate <= today ? ctx.ui.foodDate : today;
  const data = ctx.store.get();
  const day = daySummary(date, data);
  const entries = data.entries.filter((e) => e.date === date);
  const root = h('div', { class: 'screen' });
  root.append(header(ctx, S.food.title), dateSwitcher(ctx, date, (d) => { ctx.ui.foodDate = d; ctx.render(); }));

  const left = date === today ? leftToEat(day, data.goal) : null;
  const total = h('section', { class: 'card tile' },
    h('div', { class: 'row-between' },
      h('div', {},
        h('div', { class: 'label' }, S.food.intake),
        h('div', { class: 'mid' }, day.logged ? fmtInt(day.intake) : '—', h('small', {}, ' kcal'))),
      left != null
        ? h('div', { class: 'right-stat' },
          h('div', { class: 'label' }, left < 0 ? S.today.over : S.today.leftToEat),
          h('div', { class: `mid${left < 0 ? ' bad' : ''}` }, fmtInt(Math.abs(left)), h('small', {}, ' kcal')))
        : null));
  if (!day.logged) {
    total.append(h('div', { class: 'empty-line' },
      h('span', { class: 'muted' }, S.food.notLogged),
      h('button', { class: 'link', type: 'button', onclick: () => ctx.store.addEntry({ date, meal: 'breakfast', kind: 'quick', name: S.food.noFoodName, kcal: 0 }) }, S.food.noFoodDay)));
  }
  root.append(total);

  for (const meal of MEALS) {
    const list = entries.filter((e) => e.meal === meal);
    const sum = list.reduce((s, e) => s + e.kcal, 0);
    root.append(h('section', { class: 'card meal' },
      h('div', { class: 'meal-head' },
        h('h2', {}, S.meals[meal]),
        h('span', { class: 'muted' }, list.length ? `${fmtInt(sum)} kcal` : ''),
        h('button', { class: 'icon-btn add', type: 'button', 'aria-label': S.food.addTo(S.meals[meal]), onclick: () => openAddFood(ctx, { date, meal }) }, icon('plus'))),
      list.length
        ? h('div', { class: 'list' }, list.map((e) => entryRow(ctx, e)))
        : h('button', { class: 'empty-add', type: 'button', onclick: () => openAddFood(ctx, { date, meal }) }, S.food.addFirst)));
  }
  return root;
}

function entryRow(ctx, e) {
  const sub = e.kind === 'product'
    ? (e.servingName ? S.food.enteredAs(e.servingCount, e.servingName) : `${fmtNum(e.amount)} ${e.unit}`)
    : S.food.quickLabel;
  return h('button', { type: 'button', class: 'row', onclick: () => openEditEntry(ctx, e) },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.name || S.food.quickDefault), h('span', { class: 'row-sub' }, sub)),
    h('span', { class: 'row-kcal' }, fmtInt(e.kcal)));
}
