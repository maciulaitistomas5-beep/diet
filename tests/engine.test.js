import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, daysBetween, dateRange, toISODate, parseNumber, kcalFor,
  computeTrend, pointOnOrBefore, trendOn, baselineFor, daySummary,
  goalDirection, targetDeficitFor, leftToEat, goalReached, statusVsTarget, paceWarnings,
  paceStatus, rangeSummary, nudges, backupOverdue, todayView, progressView, firstDataDate,
  goalProgress, expectedVsActual,
} from '../js/engine.js';

const TODAY = '2026-10-04';
const near = (actual, expected, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not within ${tol} of ${expected}`);

const goal = (over = {}) => ({ targetKg: 80, paceKgPerWeek: 0.5, startKg: 86, setOn: '2026-09-01', ...over });
const makeData = (over = {}) => ({
  createdAt: new Date(2026, 8, 1, 12).getTime(),
  settings: { baselineSeed: 2600, lastBackupAt: null },
  goal: goal(),
  weighIns: [],
  burns: [],
  entries: [],
  ...over,
});
const quick = (date, kcal, meal = 'lunch') => ({ id: `${date}-${meal}-${kcal}`, date, meal, kind: 'quick', name: '', kcal });
const burn = (date, kcal) => ({ date, kcal });
const weighIn = (date, kg) => ({ date, kg });

// ------------------------------------------------------------------ dates

test('addDays crosses month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-10-04', -4), '2026-09-30');
});

test('addDays and daysBetween are not thrown by the daylight-saving change', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('daysBetween is signed and dateRange is inclusive', () => {
  assert.equal(daysBetween('2026-10-04', '2026-09-27'), -7);
  assert.deepEqual(dateRange('2026-10-02', '2026-10-04'), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(dateRange('2026-10-04', '2026-10-03'), []);
});

test('toISODate writes the local calendar date', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

// ------------------------------------------------------------------ numbers

test('parseNumber accepts a comma or a dot', () => {
  assert.equal(parseNumber('82,4'), 82.4);
  assert.equal(parseNumber('82.4'), 82.4);
  assert.equal(parseNumber(' 1 200 '), 1200);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('5.'), 5);
  assert.equal(parseNumber(7), 7);
});

test('parseNumber rejects what is not a number', () => {
  for (const bad of ['', '  ', 'abc', '1,2,3', '1.234,5', '82kg', null, undefined, NaN, Infinity]) {
    assert.ok(Number.isNaN(parseNumber(bad)), `expected NaN for ${String(bad)}`);
  }
});

test('kcalFor scales per-100 values and rounds to whole kcal', () => {
  assert.equal(kcalFor(42, 100), 42);
  assert.equal(kcalFor(121, 150), 182); // 181.5 rounds up
  assert.equal(kcalFor(143, 55), 79);
});

// ------------------------------------------------------------------ trend

test('Trend: nothing yields nothing, the first Weigh-in is its own Trend', () => {
  assert.deepEqual(computeTrend([]), []);
  assert.deepEqual(computeTrend([weighIn('2026-10-01', 84.2)]), [{ date: '2026-10-01', kg: 84.2, trend: 84.2 }]);
});

test('Trend: a steady weight stays steady', () => {
  const pts = computeTrend(['01', '02', '03', '04'].map((d) => weighIn(`2026-10-${d}`, 80)));
  for (const p of pts) near(p.trend, 80);
});

test('Trend is time-aware: one week of gap moves it 1 - 1/e of the way', () => {
  const pts = computeTrend([weighIn('2026-10-01', 80), weighIn('2026-10-08', 79)]);
  near(pts[1].trend, 80 + (79 - 80) * (1 - Math.exp(-1)), 1e-9);
});

test('Trend: daily weigh-ins converge on a new weight within a month', () => {
  const rows = [weighIn('2026-09-01', 80)];
  for (let i = 1; i <= 30; i++) rows.push(weighIn(addDays('2026-09-01', i), 78));
  const pts = computeTrend(rows);
  assert.ok(Math.abs(pts[pts.length - 1].trend - 78) < 0.05);
});

test('Trend: input order does not matter and a duplicate date does not move it', () => {
  const a = computeTrend([weighIn('2026-10-03', 79), weighIn('2026-10-01', 80), weighIn('2026-10-02', 79.5)]);
  assert.deepEqual(a.map((p) => p.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
  const dup = computeTrend([weighIn('2026-10-01', 80), weighIn('2026-10-01', 70)]);
  near(dup[1].trend, dup[0].trend);
});

test('trendOn carries the last Trend forward and is null before the first Weigh-in', () => {
  const pts = computeTrend([weighIn('2026-10-02', 80), weighIn('2026-10-04', 79)]);
  assert.equal(trendOn(pts, '2026-10-01'), null);
  assert.equal(trendOn(pts, '2026-10-02'), 80);
  assert.equal(trendOn(pts, '2026-10-03'), 80);
  assert.equal(trendOn(pts, '2026-10-09'), pts[1].trend);
  assert.equal(pointOnOrBefore(pts, '2026-10-04').date, '2026-10-04');
});

// ------------------------------------------------------------------ baseline

test('Baseline is the setup figure until three Burns are logged', () => {
  assert.equal(baselineFor('2026-10-04', [], 2600), 2600);
  assert.equal(baselineFor('2026-10-04', [burn('2026-10-01', 2000), burn('2026-10-02', 2100)], 2600), 2600);
});

test('Baseline averages the last logged Burns before the day', () => {
  const burns = [burn('2026-10-01', 2400), burn('2026-10-02', 2600), burn('2026-10-03', 2800)];
  assert.equal(baselineFor('2026-10-04', burns, 9999), 2600);
});

test('Baseline uses only the last seven logged Burns', () => {
  const burns = [];
  for (let i = 1; i <= 10; i++) burns.push(burn(addDays('2026-09-20', i), i <= 3 ? 1000 : 2000));
  assert.equal(baselineFor('2026-10-04', burns, 2600), 2000);
});

test('Baseline ignores the day itself and later days', () => {
  const burns = [burn('2026-10-01', 2000), burn('2026-10-02', 2000), burn('2026-10-03', 2000), burn('2026-10-04', 5000), burn('2026-10-05', 5000)];
  assert.equal(baselineFor('2026-10-04', burns, 2600), 2000);
});

test('Baseline is null with no history and no setup figure', () => {
  assert.equal(baselineFor('2026-10-04', [], null), null);
  assert.equal(baselineFor('2026-10-04', [], 0), null);
});

// ------------------------------------------------------------------ one day

test('a day with no Food Entry is not logged: no Intake, no Deficit', () => {
  const d = daySummary('2026-10-03', makeData({ burns: [burn('2026-10-03', 2700)] }));
  assert.equal(d.logged, false);
  assert.equal(d.intake, null);
  assert.equal(d.deficit, null);
  assert.equal(d.burn, 2700);
});

test('a logged day with a logged Burn has a final Deficit', () => {
  const d = daySummary('2026-10-03', makeData({
    burns: [burn('2026-10-03', 2700)],
    entries: [quick('2026-10-03', 800), quick('2026-10-03', 1200, 'dinner')],
  }));
  assert.equal(d.logged, true);
  assert.equal(d.intake, 2000);
  assert.equal(d.deficit, 700);
  assert.equal(d.estimated, false);
  assert.equal(d.burnLogged, true);
});

test('a logged day without a Burn is estimated from the Baseline', () => {
  const d = daySummary('2026-10-04', makeData({ entries: [quick('2026-10-04', 1240)] }));
  assert.equal(d.burn, 2600);
  assert.equal(d.estimated, true);
  assert.equal(d.deficit, 1360);
});

test('eating more than Burn is a negative Deficit, a Surplus', () => {
  const d = daySummary('2026-10-03', makeData({ burns: [burn('2026-10-03', 2400)], entries: [quick('2026-10-03', 2900)] }));
  assert.equal(d.deficit, -500);
});

test('a 0 kcal Quick Entry makes a no-food day logged', () => {
  const d = daySummary('2026-10-03', makeData({ burns: [burn('2026-10-03', 2400)], entries: [quick('2026-10-03', 0)] }));
  assert.equal(d.logged, true);
  assert.equal(d.deficit, 2400);
});

test('no Burn and no Baseline means no Deficit can be worked out', () => {
  const d = daySummary('2026-10-03', makeData({ settings: { baselineSeed: null }, entries: [quick('2026-10-03', 900)] }));
  assert.equal(d.burn, null);
  assert.equal(d.deficit, null);
});

// ------------------------------------------------------------------ goal

test('Target Deficit follows the Pace: 7,700 kcal per kg over 7 days', () => {
  assert.equal(targetDeficitFor(goal({ paceKgPerWeek: 0.5 })), 550);
  assert.equal(targetDeficitFor(goal({ paceKgPerWeek: 0.25 })), 275);
  assert.equal(targetDeficitFor(goal({ paceKgPerWeek: 0.7 })), 770);
});

test('a gain Goal has a negative Target Deficit, a Surplus', () => {
  assert.equal(targetDeficitFor(goal({ targetKg: 90, startKg: 85, paceKgPerWeek: 0.5 })), -550);
});

test('maintain, a zero Pace, or no Goal all mean no Target Deficit', () => {
  assert.equal(targetDeficitFor(goal({ targetKg: 86, startKg: 86 })), 0);
  assert.equal(Object.is(targetDeficitFor(goal({ targetKg: 86, startKg: 86 })), 0), true); // not -0
  assert.equal(targetDeficitFor(goal({ paceKgPerWeek: 0 })), 0);
  assert.equal(targetDeficitFor(null), 0);
});

test('goalDirection is fixed by the start weight', () => {
  assert.equal(goalDirection(goal()), -1);
  assert.equal(goalDirection(goal({ targetKg: 90 })), 1);
  assert.equal(goalDirection(goal({ targetKg: 86 })), 0);
  assert.equal(goalDirection(null), 0);
});

test('Left to eat = Burn - Target Deficit - Intake so far', () => {
  const g = goal();
  assert.equal(leftToEat({ burn: 2600, intake: 1240 }, g), 810);
  assert.equal(leftToEat({ burn: 2600, intake: 2170 }, g), -120);
  assert.equal(leftToEat({ burn: 2600, intake: null }, g), 2050);
});

test('Left to eat needs a Goal and a Burn', () => {
  assert.equal(leftToEat({ burn: 2600, intake: 100 }, null), null);
  assert.equal(leftToEat({ burn: null, intake: 100 }, goal()), null);
});

test('Left to eat for a gain Goal adds the Surplus to the allowance', () => {
  assert.equal(leftToEat({ burn: 2600, intake: 2000 }, goal({ targetKg: 90, startKg: 85 })), 1150);
});

test('goalReached looks at the Trend in the direction of the Goal', () => {
  assert.equal(goalReached(goal(), 80.4), false);
  assert.equal(goalReached(goal(), 80), true);
  assert.equal(goalReached(goal(), 79.2), true);
  assert.equal(goalReached(goal({ targetKg: 90, startKg: 85 }), 89.9), false);
  assert.equal(goalReached(goal({ targetKg: 90, startKg: 85 }), 90.1), true);
  assert.equal(goalReached(goal({ targetKg: 86, startKg: 86 }), 86), false);
  assert.equal(goalReached(null, 80), false);
  assert.equal(goalReached(goal(), null), false);
});

test('statusVsTarget grades against the target', () => {
  assert.equal(statusVsTarget(550, 550), 'on');
  assert.equal(statusVsTarget(500, 550), 'on'); // 91%
  assert.equal(statusVsTarget(400, 550), 'near'); // 73%
  assert.equal(statusVsTarget(200, 550), 'off');
  assert.equal(statusVsTarget(-100, 550), 'off');
  assert.equal(statusVsTarget(-600, -550), 'on'); // gain Goal, Surplus
  assert.equal(statusVsTarget(50, -550), 'off');
  assert.equal(statusVsTarget(100, 0), 'on');
  assert.equal(statusVsTarget(250, 0), 'near');
  assert.equal(statusVsTarget(-500, 0), 'off');
  assert.equal(statusVsTarget(null, 550), null);
});

test('Pace warnings never block, they only warn', () => {
  assert.deepEqual(paceWarnings(goal({ paceKgPerWeek: 0.5 }), 2600), []);
  assert.deepEqual(paceWarnings(goal({ paceKgPerWeek: 1.2 }), 3200), ['pace-over-1kg']);
  assert.deepEqual(paceWarnings(goal({ paceKgPerWeek: 0.5 }), 1700), ['allowance-under-1200']); // 1700 - 550 = 1150
  assert.deepEqual(paceWarnings(goal({ paceKgPerWeek: 0.5 }), null), []);
  assert.deepEqual(paceWarnings(goal({ targetKg: 90, startKg: 85 }), 1500), []); // gaining: no allowance floor
  assert.deepEqual(paceWarnings(null, 1500), []);
});

// ------------------------------------------------------------------ pace status

function rampData(days, perDay = 0.07, start = 86, over = {}) {
  const weighIns = [];
  for (let i = 0; i < days; i++) weighIns.push(weighIn(addDays(addDays(TODAY, -(days - 1)), i), +(start - perDay * i).toFixed(3)));
  return makeData({ weighIns, ...over });
}

test('paceStatus is null before the first Weigh-in', () => {
  assert.equal(paceStatus(makeData(), TODAY), null);
});

test('paceStatus reports a weekly change near the Pace for a steady loss', () => {
  // The Trend lags a ramp and needs a few weeks to show the full rate: after six weeks it is within 5%.
  const s = paceStatus(rampData(42), TODAY);
  assert.ok(s.weeklyChange < -0.46 && s.weeklyChange > -0.5, `weeklyChange ${s.weeklyChange}`);
  assert.equal(s.plannedWeeklyChange, -0.5);
  assert.equal(s.reached, false);
  assert.equal(s.weeklyStatus, 'on');
  assert.ok(s.remainingKg > 0);
  assert.ok(s.plannedFinish > TODAY);
  assert.ok(s.currentRateFinish > TODAY);
});

test('paceStatus has no weekly change before a week of Weigh-ins', () => {
  const s = paceStatus(rampData(4), TODAY);
  assert.equal(s.weeklyChange, null);
  assert.equal(s.weeklyStatus, null);
  assert.equal(s.currentRateFinish, null);
});

test('paceStatus: once the Trend passes the Goal it is reached, with no finish dates', () => {
  const s = paceStatus(makeData({ weighIns: [weighIn(TODAY, 79.5)] }), TODAY);
  assert.equal(s.reached, true);
  assert.equal(s.remainingKg, 0);
  assert.equal(s.plannedFinish, null);
  assert.equal(s.currentRateFinish, null);
});

test('paceStatus: a Trend moving the wrong way has no current-rate finish', () => {
  const s = paceStatus(rampData(21, -0.05), TODAY);
  assert.ok(s.weeklyChange > 0);
  assert.equal(s.currentRateFinish, null);
  assert.ok(s.plannedFinish); // the plan itself is still there
  assert.equal(s.weeklyStatus, 'off');
});

test('paceStatus: maintain Goals have no finish dates', () => {
  const s = paceStatus(rampData(10, 0, 86, { goal: goal({ targetKg: 86, startKg: 86 }) }), TODAY);
  assert.equal(s.plannedFinish, null);
  assert.equal(s.currentRateFinish, null);
});

// ------------------------------------------------------------------ stretch of days

// Ten complete days, 2026-09-24 .. 2026-10-03, eating 2,050 against a Burn of 2,600: a 550 Deficit each.
function stretchData(over = {}) {
  const days = dateRange('2026-09-24', '2026-10-03');
  const burns = days.filter((d) => d !== '2026-09-28' && d !== '2026-09-29').map((d) => burn(d, 2600));
  const entries = days.filter((d) => d !== '2026-09-30').map((d) => quick(d, 2050));
  const weighIns = [weighIn('2026-09-23', 85.0)];
  days.forEach((d, i) => weighIns.push(weighIn(d, +(85.0 - 0.07 * (i + 1)).toFixed(3))));
  return makeData({ burns, entries, weighIns, ...over });
}

test('rangeSummary: totals, averages and the day counts', () => {
  const r = rangeSummary('2026-09-24', '2026-10-03', stretchData());
  assert.equal(r.totalDays, 10);
  assert.equal(r.loggedDays, 9); // 09-30 has no food
  assert.equal(r.countedDays, 9);
  assert.equal(r.estimatedDays, 2); // 09-28 and 09-29 use the Baseline
  assert.equal(r.avgDeficit, 550);
  assert.equal(r.totalDeficit, 9 * 550);
  assert.equal(r.targetDeficit, 550);
  assert.equal(r.avgStatus, 'on');
});

test('rangeSummary: Expected change against the Trend’s actual change', () => {
  const r = rangeSummary('2026-09-24', '2026-10-03', stretchData());
  near(r.expectedChangeKg, -(9 * 550) / 7700, 1e-9);
  assert.ok(r.actualChangeKg < 0);
  assert.equal(r.comparable, true);
});

test('rangeSummary: not comparable with fewer than 7 counted days', () => {
  const r = rangeSummary('2026-09-24', '2026-09-29', stretchData());
  assert.equal(r.comparable, false);
});

test('rangeSummary: not comparable with fewer than two Weigh-ins in the range', () => {
  const d = stretchData();
  d.weighIns = [weighIn('2026-09-23', 85.0), weighIn('2026-10-03', 84.3)];
  const r = rangeSummary('2026-09-24', '2026-10-03', d);
  assert.equal(r.comparable, false);
});

test('rangeSummary: without any Weigh-in there is no Expected or actual change', () => {
  const r = rangeSummary('2026-09-24', '2026-10-03', stretchData({ weighIns: [] }));
  assert.equal(r.expectedChangeKg, null);
  assert.equal(r.actualChangeKg, null);
  assert.equal(r.comparable, false);
});

test('rangeSummary: when the first Weigh-in is inside the range, the comparison starts the day after', () => {
  const d = stretchData();
  d.weighIns = d.weighIns.filter((w) => w.date >= '2026-09-26'); // first Weigh-in is 09-26
  const r = rangeSummary('2026-09-24', '2026-10-03', d);
  // Only the Deficits from 09-27 on count: 09-27, 09-28, 09-29, 10-01, 10-02, 10-03 (09-30 has no food).
  const counted = r.days.filter((x) => x.deficit != null && x.date >= '2026-09-27').length;
  assert.equal(counted, 6);
  near(r.expectedChangeKg, -(counted * 550) / 7700, 1e-9);
  assert.equal(r.comparable, counted >= 7); // 6 days: not enough
});

test('rangeSummary: with no Goal there is no target and no status', () => {
  const r = rangeSummary('2026-09-24', '2026-10-03', stretchData({ goal: null }));
  assert.equal(r.targetDeficit, 0);
  assert.equal(r.avgStatus, null);
});

test('rangeSummary: an all-surplus stretch has a negative average Deficit and a positive Expected change', () => {
  const days = dateRange('2026-09-27', '2026-10-03');
  const weighIns = [weighIn('2026-09-26', 84), ...days.map((x, i) => weighIn(x, 84 + 0.07 * (i + 1)))];
  const d = makeData({ burns: days.map((x) => burn(x, 2400)), entries: days.map((x) => quick(x, 2900)), weighIns });
  const r = rangeSummary('2026-09-27', '2026-10-03', d);
  assert.equal(r.avgDeficit, -500);
  assert.equal(r.totalDeficit, -3500);
  near(r.expectedChangeKg, 3500 / 7700, 1e-9);
  assert.ok(r.actualChangeKg > 0);
});

// ------------------------------------------------------------------ nudges and backup

test('nudge: yesterday’s Burn is missing, then not once it is logged', () => {
  const now = new Date(2026, 9, 4, 9).getTime();
  assert.ok(nudges(makeData(), TODAY, now).some((n) => n.code === 'burn-missing' && n.date === '2026-10-03'));
  const logged = makeData({ burns: [burn('2026-10-03', 2600)] });
  assert.ok(!nudges(logged, TODAY, now).some((n) => n.code === 'burn-missing'));
});

test('nudge: no Burn nudge for days before the app existed', () => {
  const d = makeData({ createdAt: new Date(2026, 9, 4, 8).getTime() });
  assert.ok(!nudges(d, TODAY, new Date(2026, 9, 4, 9).getTime()).some((n) => n.code === 'burn-missing'));
});

test('nudge: weigh in today until a Weigh-in exists for today', () => {
  const now = new Date(2026, 9, 4, 9).getTime();
  assert.ok(nudges(makeData(), TODAY, now).some((n) => n.code === 'weigh-in-today'));
  assert.ok(!nudges(makeData({ weighIns: [weighIn(TODAY, 84)] }), TODAY, now).some((n) => n.code === 'weigh-in-today'));
});

test('backup nag: a week after the last backup, or after the app was set up if never backed up', () => {
  const day = 86400000;
  const now = new Date(2026, 9, 4, 9).getTime();
  assert.equal(backupOverdue({ lastBackupAt: now - 2 * day }, now - 30 * day, now), false);
  assert.equal(backupOverdue({ lastBackupAt: now - 8 * day }, now - 30 * day, now), true);
  assert.equal(backupOverdue({ lastBackupAt: null }, now - 3 * day, now), false);
  assert.equal(backupOverdue({ lastBackupAt: null }, now - 8 * day, now), true);
});

test('nudge: back up only when there is data to lose', () => {
  const now = new Date(2026, 9, 4, 9).getTime();
  const old = { createdAt: new Date(2026, 8, 1, 12).getTime() };
  assert.ok(!nudges(makeData(old), TODAY, now).some((n) => n.code === 'back-up'));
  assert.ok(nudges(makeData({ ...old, weighIns: [weighIn('2026-09-02', 85)] }), TODAY, now).some((n) => n.code === 'back-up'));
});

test('goalProgress: how far along from the start weight to the Goal', () => {
  assert.equal(goalProgress(goal(), 83), 0.5);
  assert.equal(goalProgress(goal(), 87), 0); // moved the wrong way: clamped
  assert.equal(goalProgress(goal(), 79), 1); // past the Goal: clamped
  assert.equal(goalProgress(goal({ targetKg: 90, startKg: 85 }), 87.5), 0.5);
  assert.equal(goalProgress(goal({ targetKg: 86, startKg: 86 }), 86), null);
  assert.equal(goalProgress(null, 83), null);
  assert.equal(goalProgress(goal(), null), null);
});

test('expectedVsActual: does the Trend move as far as the logged Deficits predict', () => {
  const s = (expected, actual, comparable = true) => ({ comparable, expectedChangeKg: expected, actualChangeKg: actual });
  assert.equal(expectedVsActual(s(-0.6, -0.5)), 'agree');
  assert.equal(expectedVsActual(s(-0.6, -0.1)), 'less'); // lost less than predicted
  assert.equal(expectedVsActual(s(-0.6, -1.2)), 'more');
  assert.equal(expectedVsActual(s(0.5, 0.0)), 'less'); // gained less than predicted
  assert.equal(expectedVsActual(s(0.5, 1.1)), 'more');
  assert.equal(expectedVsActual(s(-0.6, -0.5, false)), null);
  assert.equal(expectedVsActual(null), null);
});

// ------------------------------------------------------------------ view models

test('todayView: the numbers of the Today and Yesterday tiles', () => {
  const data = stretchData({
    entries: [...stretchData().entries, quick(TODAY, 1240, 'breakfast')],
  });
  const v = todayView(data, TODAY, new Date(2026, 9, 4, 9).getTime());
  assert.equal(v.targetDeficit, 550);
  assert.equal(v.today.intake, 1240);
  assert.equal(v.today.estimated, true);
  assert.equal(v.today.left, v.today.burn - 550 - 1240);
  assert.equal(v.yesterday.date, '2026-10-03');
  assert.equal(v.yesterday.deficit, 550);
  assert.equal(v.yesterday.status, 'on');
  assert.ok(Array.isArray(v.nudges));
  assert.ok(v.weightSeries.points.length > 0);
  assert.equal(v.baseline, 2600);
});

test('todayView: nothing logged today still gives the allowance, but no Deficit', () => {
  const v = todayView(stretchData(), TODAY, new Date(2026, 9, 4, 9).getTime());
  assert.equal(v.today.logged, false);
  assert.equal(v.today.deficit, null);
  assert.equal(v.today.left, 2600 - 550);
});

test('progressView: ranges end yesterday and start no earlier than the first data', () => {
  const data = stretchData();
  const week = progressView(data, TODAY, 7);
  assert.equal(week.to, '2026-10-03');
  assert.equal(week.from, '2026-09-27');
  assert.equal(week.summary.totalDays, 7);
  const all = progressView(data, TODAY, 'all');
  assert.equal(all.from, '2026-09-23');
  const long = progressView(data, TODAY, 90);
  assert.equal(long.from, '2026-09-23'); // clipped to the first data
});

test('progressView: when the first data is from today there is no complete day yet', () => {
  const data = makeData({ weighIns: [weighIn(TODAY, 85)] });
  const v = progressView(data, TODAY, 30);
  assert.equal(v.summary, null);
  assert.equal(v.pace.trendNow, 85);
});

test('firstDataDate is the earliest date across everything logged', () => {
  assert.equal(firstDataDate(makeData()), null);
  assert.equal(firstDataDate(makeData({ weighIns: [weighIn('2026-10-02', 84)], entries: [quick('2026-09-30', 500)] })), '2026-09-30');
});
