// The Progress screen: log a Weigh-in, the Goal, and the on-track check with its two charts.
import { h, icon } from './dom.js';
import { S } from './strings.js';
import { progressView, goalDirection, goalProgress, expectedVsActual, parseNumber } from './engine.js';
import { fmtInt, fmtKg, fmtSignedKg, fmtDate, fmtDateShort } from './format.js';
import { header, dateSwitcher, textField, segmented, statusChip, stat, note } from './components.js';
import { weightChart, deficitChart } from './charts.js';
import { openGoalSheet } from './sheets.js';

export function progressScreen(ctx) {
  const data = ctx.store.get();
  const today = ctx.today();
  const range = ctx.ui.range ?? 30;
  const v = progressView(data, today, range);
  const root = h('div', { class: 'screen' });
  root.append(header(ctx, S.progress.title), weighInCard(ctx, data), goalCard(ctx, data, v.pace));
  root.append(segmented(
    [{ value: 7, label: S.progress.range7 }, { value: 30, label: S.progress.range30 }, { value: 90, label: S.progress.range90 }, { value: 'all', label: S.progress.rangeAll }],
    range, (r) => { ctx.ui.range = r; ctx.ui.selectedDay = null; ctx.render(); }, S.progress.rangeLabel));
  root.append(onTrackCard(v), weightCard(v, data), deficitCard(ctx, v), recentWeighIns(ctx, data));
  return root;
}

function weighInCard(ctx, data) {
  const today = ctx.today();
  const date = ctx.ui.weighInDate && ctx.ui.weighInDate <= today ? ctx.ui.weighInDate : today;
  const existing = data.weighIns.find((w) => w.date === date);
  const msg = h('p', { class: 'note' });
  const kg = textField({ label: S.progress.weighIn, value: existing ? fmtKg(existing.kg) : '', inputmode: 'decimal', suffix: 'kg' });
  kg.input.id = 'weighin-kg';
  const save = () => {
    const value = parseNumber(kg.input.value);
    if (!(value >= 20 && value <= 500)) return note(msg, S.progress.needKg);
    ctx.store.logWeighIn(date, Math.round(value * 10) / 10);
    ctx.ui.weighInDate = undefined;
    ctx.toast(S.progress.weighInSaved);
  };
  return h('section', { class: 'card' },
    h('h2', {}, S.progress.weighInTitle),
    dateSwitcher(ctx, date, (d) => { ctx.ui.weighInDate = d; ctx.render(); }),
    kg.el, msg,
    h('button', { class: 'btn primary wide', type: 'button', onclick: save }, existing ? S.common.update : S.common.save));
}

function goalCard(ctx, data, pace) {
  const goal = data.goal;
  const card = h('section', { class: 'card' },
    h('div', { class: 'tile-head' }, h('h2', {}, S.progress.goalTitle), h('button', { class: 'link', type: 'button', onclick: () => openGoalSheet(ctx) }, S.common.edit)));
  if (!goal) return card.append(h('p', { class: 'muted' }, S.progress.noGoal)) ?? card;
  const dir = goalDirection(goal);
  card.append(h('p', { class: 'goal-line-text' }, S.progress.goalLine(dir, fmtKg(goal.targetKg), fmtKg(goal.paceKgPerWeek))));
  const pct = pace ? goalProgress(goal, pace.trendNow) : null;
  if (pct != null) {
    card.append(
      h('div', { class: 'bar-track', role: 'img', 'aria-label': S.progress.progressLabel(Math.round(pct * 100)) }, h('div', { class: 'bar-fill', style: `width: ${Math.round(pct * 100)}%` })),
      h('p', { class: 'muted' }, pace.reached
        ? S.today.goalReachedLine(fmtKg(goal.targetKg))
        : S.progress.progressText(Math.round(pct * 100), fmtKg(pace.remainingKg))));
  }
  const finish = [];
  if (pace?.plannedFinish) finish.push(S.today.atPace(fmtDate(pace.plannedFinish)));
  if (pace?.currentRateFinish) finish.push(S.today.atRate(fmtDate(pace.currentRateFinish)));
  if (finish.length) card.append(h('p', { class: 'muted' }, finish.join(' · ')));
  return card;
}

function onTrackCard(v) {
  const card = h('section', { class: 'card' }, h('h2', {}, S.progress.onTrack));
  const r = v.summary;
  if (!r) return card.append(h('p', { class: 'muted' }, S.progress.tooEarly)) ?? card;
  card.append(h('p', { class: 'sub' }, S.progress.rangeText(fmtDate(v.from), fmtDate(v.to))));
  if (r.countedDays === 0) return card.append(h('p', { class: 'muted' }, S.progress.noLoggedDays)) ?? card;

  const avgIsDeficit = r.avgDeficit >= 0;
  card.append(h('div', { class: 'row-between' },
    h('div', {},
      h('div', { class: 'label' }, avgIsDeficit ? S.progress.avgDeficit : S.progress.avgSurplus),
      h('div', { class: 'mid' }, fmtInt(Math.abs(r.avgDeficit)), h('small', {}, ' kcal'))),
    r.targetDeficit !== 0 && r.avgStatus ? statusChip(r.avgStatus, S.today.vsTarget(fmtInt(Math.abs(r.targetDeficit)))) : null));

  const totalIsDeficit = r.totalDeficit >= 0;
  const stats = [stat(totalIsDeficit ? S.progress.totalDeficit : S.progress.totalSurplus, `${fmtInt(Math.abs(r.totalDeficit))} kcal`)];
  if (r.comparable) {
    stats.push(stat(S.progress.expected, `${fmtSignedKg(r.expectedChangeKg, 2)} kg`), stat(S.progress.actual, `${fmtSignedKg(r.actualChangeKg, 2)} kg`));
  }
  card.append(h('dl', { class: 'stats three' }, stats));
  const verdict = expectedVsActual(r);
  card.append(h('p', { class: verdict === 'agree' ? 'verdict ok' : 'verdict' }, verdict ? S.progress.verdict[verdict] : S.progress.needMore));
  const foot = [S.progress.daysLogged(r.loggedDays, r.totalDays)];
  if (r.estimatedDays) foot.push(S.progress.estimatedDays(r.estimatedDays));
  card.append(h('p', { class: 'muted small' }, foot.join(' · ')));
  return card;
}

function weightCard(v, data) {
  return h('section', { class: 'card' },
    h('h2', {}, S.progress.weightChart),
    weightChart({ series: v.weightSeries, goalKg: data.goal?.targetKg ?? null, label: S.progress.weightChart }),
    h('p', { class: 'legend' }, legendItem('dot', S.progress.legendWeighIn), legendItem('line', S.progress.legendTrend)));
}

const legendItem = (kind, text) => h('span', { class: 'lg' }, h('span', { class: `swatch ${kind}` }), text);

function deficitCard(ctx, v) {
  const card = h('section', { class: 'card' }, h('h2', {}, S.progress.dailyBars));
  if (!v.summary) return card.append(h('p', { class: 'muted' }, S.progress.tooEarly)) ?? card;
  const sel = ctx.ui.selectedDay ? v.summary.days.find((d) => d.date === ctx.ui.selectedDay) : null;
  card.append(
    deficitChart({
      days: v.summary.days, target: v.targetDeficit, label: S.progress.dailyBars, selectedDate: sel?.date,
      onSelect: (d) => { ctx.ui.selectedDay = d.date; ctx.render(); },
    }),
    h('p', { class: 'readout' }, sel ? dayReadout(sel) : S.progress.tapBar),
    h('p', { class: 'legend' },
      legendItem('on', S.progress.legendOn), legendItem('near', S.progress.legendNear), legendItem('off', S.progress.legendOff),
      legendItem('est', S.progress.legendEst), legendItem('gap', S.progress.legendGap)));
  return card;
}

function dayReadout(d) {
  if (!d.logged) return S.progress.readoutNotLogged(fmtDateShort(d.date));
  if (d.deficit == null) return S.progress.readoutNoBurn(fmtDateShort(d.date), fmtInt(d.intake));
  return S.progress.readout(fmtDateShort(d.date), fmtInt(d.intake), fmtInt(d.burn), d.estimated, d.deficit >= 0, fmtInt(Math.abs(d.deficit)));
}

function recentWeighIns(ctx, data) {
  const rows = [...data.weighIns].reverse().slice(0, 8);
  const card = h('section', { class: 'card' }, h('h2', {}, S.progress.recent));
  if (!rows.length) return card.append(h('p', { class: 'muted' }, S.today.noWeighIns)) ?? card;
  card.append(h('div', { class: 'list' }, rows.map((w) => h('div', { class: 'row static' },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, fmtDateShort(w.date))),
    h('span', { class: 'row-kcal' }, `${fmtKg(w.kg)} kg`),
    h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': S.progress.deleteWeighIn,
      onclick: () => { ctx.store.removeWeighIn(w.date); ctx.toast(S.progress.weighInDeleted, { actionLabel: S.common.undo, onAction: () => ctx.store.logWeighIn(w.date, w.kg) }); },
    }, icon('trash', 18))))));
  return card;
}
