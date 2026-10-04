// The Today screen: today so far, yesterday, and the weight.
import { h, icon } from './dom.js';
import { S } from './strings.js';
import { todayView } from './engine.js';
import { fmtInt, fmtKg, fmtSignedKg, fmtDate, fmtDateLong, fmtDateTime, relativeDay } from './format.js';
import { header, statusChip, stat, tapCard } from './components.js';
import { weightChart } from './charts.js';
import { openGoalSheet } from './sheets.js';

export function todayScreen(ctx) {
  const data = ctx.store.get();
  const today = ctx.today();
  const v = todayView(data, today, ctx.now());
  const root = h('div', { class: 'screen' });
  root.append(header(ctx, S.today.title, fmtDateLong(today)));
  for (const n of v.nudges) root.append(nudge(ctx, n, data));
  if (v.pace?.reached) root.append(reachedCard(ctx));
  root.append(todayTile(ctx, v), yesterdayTile(ctx, v), weightCard(ctx, v, data));
  return root;
}

function nudge(ctx, n, data) {
  const go = {
    'burn-missing': () => ctx.go('burn', { burnDate: n.date }),
    'weigh-in-today': () => ctx.go('progress', { focusWeighIn: true }),
    'back-up': () => ctx.go('settings'),
  }[n.code];
  const text = {
    'burn-missing': S.nudges.burnMissing,
    'weigh-in-today': S.nudges.weighIn,
    'back-up': data.settings.lastBackupAt ? S.nudges.backUpSince(fmtDateTime(data.settings.lastBackupAt)) : S.nudges.backUpNever,
  }[n.code];
  return h('button', { class: 'nudge', type: 'button', onclick: go }, h('span', {}, text), icon('right', 18));
}

function reachedCard(ctx) {
  return h('section', { class: 'card reached' },
    h('h2', {}, S.today.reachedTitle),
    h('p', {}, S.today.reachedText),
    h('button', { class: 'btn', type: 'button', onclick: () => openGoalSheet(ctx) }, S.today.newGoal));
}

function todayTile(ctx, v) {
  const t = v.today;
  const estimate = h('span', { class: 'est' }, S.words.estimate);
  const card = h('section', { class: 'card tile' });
  card.append(h('div', { class: 'tile-head' }, h('h2', {}, S.today.today), h('span', { class: 'chip quiet' }, S.today.soFar)));

  if (t.burn == null) {
    card.append(
      h('p', { class: 'muted' }, S.today.noBurn),
      h('button', { class: 'btn small', type: 'button', onclick: () => ctx.go('settings') }, S.today.setBaseline));
    return card;
  }

  if (!t.logged) {
    card.append(h('div', { class: 'empty-line' },
      h('span', {}, S.today.nothingYet),
      h('button', { class: 'btn small', type: 'button', onclick: () => ctx.go('food', { foodDate: ctx.today() }) }, S.today.logFood)));
  } else {
    const isDeficit = t.deficit >= 0;
    card.append(h('div', { class: 'headline' },
      h('div', { class: 'label' }, isDeficit ? S.today.deficitSoFar : S.today.surplusSoFar, t.estimated ? estimate : null),
      h('div', { class: 'big' }, fmtInt(Math.abs(t.deficit)), h('small', {}, ' kcal'))));
  }

  card.append(h('dl', { class: 'stats' },
    stat(S.today.intakeSoFar, t.logged ? fmtInt(t.intake) : '0'),
    stat(t.estimated ? S.today.burnEstimate : S.today.burn, fmtInt(t.burn))));

  if (t.left != null) {
    const over = t.left < 0;
    card.append(h('div', { class: `left${over ? ' over' : ''}` },
      h('span', {}, over ? S.today.over : S.today.leftToEat),
      h('b', {}, `${fmtInt(Math.abs(t.left))} kcal`),
      t.estimated ? estimate.cloneNode(true) : null));
  }
  return card;
}

function yesterdayTile(ctx, v) {
  const y = v.yesterday;
  const children = [h('div', { class: 'tile-head' }, h('h2', {}, S.today.yesterday), icon('right', 18))];
  if (!y.logged) {
    children.push(h('p', { class: 'muted' }, S.today.yesterdayNotLogged));
  } else if (y.deficit == null) {
    children.push(h('p', { class: 'muted' }, S.today.noBurnShort));
  } else {
    const isDeficit = y.deficit >= 0;
    children.push(h('div', { class: 'row-between' },
      h('div', {},
        h('div', { class: 'label' }, isDeficit ? S.words.deficit : S.words.surplus, y.estimated ? h('span', { class: 'est' }, S.words.estimate) : null),
        h('div', { class: 'mid' }, fmtInt(Math.abs(y.deficit)), h('small', {}, ' kcal'))),
      v.targetDeficit !== 0 && y.status ? statusChip(y.status, S.today.vsTarget(fmtInt(Math.abs(v.targetDeficit)))) : null));
  }
  return tapCard('tile', () => ctx.go('progress'), ...children);
}

function weightCard(ctx, v, data) {
  const card = h('section', { class: 'card' });
  card.append(h('div', { class: 'tile-head' },
    h('h2', {}, S.today.weight),
    h('button', { class: 'link', type: 'button', onclick: () => ctx.go('progress') }, S.today.seeProgress)));
  const p = v.pace;
  if (!p) {
    card.append(h('p', { class: 'muted' }, S.today.noWeighIns));
    return card;
  }
  const goal = data.goal;
  const lines = [];
  if (p.weeklyChange != null) {
    lines.push(h('div', { class: 'row-between' },
      h('span', {}, S.today.weekChange(fmtSignedKg(p.weeklyChange))),
      goal && p.weeklyStatus ? statusChip(p.weeklyStatus, S.today.pace(fmtSignedKg(p.plannedWeeklyChange))) : null));
  } else {
    lines.push(h('p', { class: 'muted' }, S.today.needWeek));
  }
  if (goal) lines.push(h('p', { class: 'muted' }, p.reached ? S.today.goalReachedLine(fmtKg(goal.targetKg)) : S.today.toGo(fmtKg(goal.targetKg), fmtKg(p.remainingKg))));
  const finish = [];
  if (p.plannedFinish) finish.push(S.today.atPace(fmtDate(p.plannedFinish)));
  if (p.currentRateFinish) finish.push(S.today.atRate(fmtDate(p.currentRateFinish)));
  if (finish.length) lines.push(h('p', { class: 'muted' }, finish.join(' · ')));
  if (p.lastWeighInDate < ctx.today()) lines.push(h('p', { class: 'muted' }, S.today.lastWeighed(relativeDay(p.lastWeighInDate, ctx.today(), S.words))));

  card.append(
    h('div', { class: 'label' }, S.today.trend),
    h('div', { class: 'mid' }, fmtKg(p.trendNow), h('small', {}, ' kg')),
    ...lines,
    weightChart({ series: v.weightSeries, goalKg: goal?.targetKg ?? null, label: S.today.chartLabel }));
  return card;
}
