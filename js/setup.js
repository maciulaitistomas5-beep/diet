// First run: the first Weigh-in, the Goal, and the Baseline setup figure.
import { h } from './dom.js';
import { S } from './strings.js';
import { parseNumber, paceWarnings, targetDeficitFor } from './engine.js';
import { textField, note } from './components.js';

export function setupScreen(ctx) {
  const today = ctx.today();
  const weight = textField({ label: S.setup.weight, inputmode: 'decimal', suffix: 'kg', hint: S.setup.weightHint, onInput: refresh });
  const target = textField({ label: S.setup.target, inputmode: 'decimal', suffix: 'kg', onInput: refresh });
  const pace = textField({ label: S.setup.pace, value: '0.5', inputmode: 'decimal', suffix: S.goal.perWeek, hint: S.goal.paceHint, onInput: refresh });
  const burn = textField({ label: S.setup.burn, inputmode: 'decimal', suffix: 'kcal', hint: S.setup.burnHint, onInput: refresh });
  const warnEl = h('p', { class: 'note' });
  const msg = h('p', { class: 'note' });

  function values() {
    return { w: parseNumber(weight.input.value), t: parseNumber(target.input.value), p: parseNumber(pace.input.value), b: parseNumber(burn.input.value) };
  }
  function refresh() {
    const { w, t, p, b } = values();
    if (!(w > 0 && t > 0 && p >= 0 && b > 0)) return note(warnEl, '');
    const goal = { targetKg: t, startKg: w, paceKgPerWeek: p };
    const warnings = paceWarnings(goal, b).map((k) => S.goal.warnings[k]);
    const target = targetDeficitFor(goal);
    const summary = target === 0 ? S.setup.maintainSummary : S.setup.summary(Math.round(Math.abs(target)), target > 0);
    note(warnEl, [summary, ...warnings].join(' '), warnings.length ? 'warn' : 'info');
  }
  function save() {
    const { w, t, p, b } = values();
    if (!(w >= 20 && w <= 500)) return note(msg, S.setup.needWeight);
    if (!(t >= 20 && t <= 400)) return note(msg, S.goal.needTarget);
    if (!(p >= 0 && p <= 3)) return note(msg, S.goal.needPace);
    if (!(b > 500 && b <= 10000)) return note(msg, S.settings.needBaseline);
    ctx.store.setup({ date: today, weightKg: Math.round(w * 10) / 10, targetKg: t, paceKgPerWeek: p, baselineSeed: Math.round(b) });
    ctx.render();
  }

  return h('div', { class: 'screen setup' },
    h('header', { class: 'topbar' }, h('div', {}, h('h1', {}, S.setup.title), h('p', { class: 'sub' }, S.setup.intro))),
    h('section', { class: 'card' }, weight.el, target.el, pace.el, burn.el, warnEl, msg,
      h('button', { class: 'btn primary wide', type: 'button', onclick: save }, S.setup.start)),
    h('p', { class: 'muted small pad' }, S.setup.privacy));
}
