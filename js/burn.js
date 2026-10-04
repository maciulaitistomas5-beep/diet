// The Burn screen: log a day's total from Garmin.
import { h } from './dom.js';
import { S } from './strings.js';
import { addDays, baselineFor, dateRange, parseNumber } from './engine.js';
import { fmtInt, relativeDay } from './format.js';
import { header, dateSwitcher, textField, note } from './components.js';

// Yesterday if its Burn is missing (the usual morning job), otherwise today.
export function defaultBurnDate(data, today) {
  const yesterday = addDays(today, -1);
  return data.burns.some((b) => b.date === yesterday) ? today : yesterday;
}

export function burnScreen(ctx) {
  const data = ctx.store.get();
  const today = ctx.today();
  const date = ctx.ui.burnDate && ctx.ui.burnDate <= today ? ctx.ui.burnDate : defaultBurnDate(data, today);
  const logged = data.burns.find((b) => b.date === date);
  const baseline = baselineFor(date, data.burns, data.settings.baselineSeed);

  const root = h('div', { class: 'screen' });
  root.append(header(ctx, S.burn.title), dateSwitcher(ctx, date, (d) => { ctx.ui.burnDate = d; ctx.render(); }));

  const msg = h('p', { class: 'note' });
  const kcal = textField({ label: S.burn.label, value: logged ? String(logged.kcal) : '', inputmode: 'decimal', suffix: 'kcal', hint: S.burn.hint });
  const save = () => {
    const k = parseNumber(kcal.input.value);
    if (!(k > 0 && k <= 20000)) return note(msg, S.burn.needKcal);
    ctx.store.logBurn(date, Math.round(k));
    ctx.toast(S.burn.saved);
  };
  root.append(h('section', { class: 'card' },
    kcal.el, msg,
    baseline != null && !logged ? h('p', { class: 'muted' }, S.burn.baselineInfo(fmtInt(baseline))) : null,
    h('div', { class: 'actions' },
      logged ? h('button', { class: 'btn danger', type: 'button', onclick: () => { ctx.store.removeBurn(date); } }, S.common.delete) : null,
      h('button', { class: 'btn primary', type: 'button', onclick: save }, logged ? S.common.update : S.common.save))));

  const days = dateRange(addDays(today, -13), today).reverse();
  root.append(h('section', { class: 'card' },
    h('h2', {}, S.burn.recent),
    h('div', { class: 'list' }, days.map((d) => {
      const rec = data.burns.find((b) => b.date === d);
      const est = baselineFor(d, data.burns, data.settings.baselineSeed);
      return h('button', { type: 'button', class: `row${d === date ? ' current' : ''}`, onclick: () => { ctx.ui.burnDate = d; ctx.render(); } },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, relativeDay(d, today, S.words))),
        h('span', { class: rec ? 'row-kcal' : 'row-kcal faint' }, rec ? fmtInt(rec.kcal) : (est != null ? `${fmtInt(est)} ${S.words.estimate}` : '—')));
    }))));
  return root;
}
