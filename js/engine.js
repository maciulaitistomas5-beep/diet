// The Diet Tracker's rules, as pure functions. See ../CONTEXT.md for the vocabulary.
// Dates are local calendar days written 'YYYY-MM-DD'. Nothing here reads the clock or the DOM:
// callers pass `today` in, so every rule can be tested with fixed dates.

export const KCAL_PER_KG = 7700;      // rule of thumb: kcal in a kg of body weight change
export const TREND_DAYS = 7;          // the Trend's memory, in days
export const BASELINE_WINDOW = 7;     // logged Burns averaged into the Baseline
export const BASELINE_MIN_LOGGED = 3; // fewer logged Burns than this: use the setup figure
export const BACKUP_NAG_DAYS = 7;
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

// ---------------------------------------------------------------- dates

export function toISODate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

// Whole days from a to b (b - a), unaffected by daylight saving.
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const maxDate = (a, b) => (a > b ? a : b);

// ---------------------------------------------------------------- numbers

// Accepts "82,4" and "82.4" (a Lithuanian iPhone keyboard types a comma). NaN when it isn't a number.
export function parseNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  const s = String(text ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

export function kcalFor(kcalPer100, amount) {
  return Math.round((kcalPer100 * amount) / 100);
}

// ---------------------------------------------------------------- trend

// Smooths Weigh-ins into the Trend. Time-aware: a gap of g days moves the Trend by 1 - e^(-g/TREND_DAYS)
// of the way to the new Weigh-in, so a missed week doesn't count as one day.
export function computeTrend(weighIns) {
  const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = [];
  let prev = null;
  for (const w of sorted) {
    let trend = w.kg;
    if (prev) {
      const gap = daysBetween(prev.date, w.date);
      trend = prev.trend + (w.kg - prev.trend) * (1 - Math.exp(-gap / TREND_DAYS));
    }
    prev = { date: w.date, trend };
    out.push({ date: w.date, kg: w.kg, trend });
  }
  return out;
}

// The latest Trend point on or before `date` (points are sorted by date), or null.
export function pointOnOrBefore(points, date) {
  let lo = 0;
  let hi = points.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= date) { ans = points[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function trendOn(points, date) {
  const p = pointOnOrBefore(points, date);
  return p ? p.trend : null;
}

// ---------------------------------------------------------------- indexing

export function buildIndex(data) {
  const entriesByDate = new Map();
  for (const e of data.entries) {
    const list = entriesByDate.get(e.date);
    if (list) list.push(e); else entriesByDate.set(e.date, [e]);
  }
  const burnByDate = new Map(data.burns.map((b) => [b.date, b]));
  const burnsSorted = [...data.burns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { entriesByDate, burnByDate, burnsSorted, trend: computeTrend(data.weighIns) };
}

export function firstDataDate(data) {
  const dates = [
    ...data.weighIns.map((w) => w.date),
    ...data.burns.map((b) => b.date),
    ...data.entries.map((e) => e.date),
  ];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

// ---------------------------------------------------------------- baseline

function lastIndexBefore(sorted, date) {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date < date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function baselineSorted(date, sorted, seed) {
  const end = lastIndexBefore(sorted, date);
  const start = Math.max(0, end - BASELINE_WINDOW + 1);
  const n = end - start + 1;
  if (n >= BASELINE_MIN_LOGGED) {
    let sum = 0;
    for (let i = start; i <= end; i++) sum += sorted[i].kcal;
    return Math.round(sum / n);
  }
  return Number.isFinite(seed) && seed > 0 ? seed : null;
}

// The Burn assumed for `date` when its real Burn isn't logged: the average of the last
// BASELINE_WINDOW logged Burns before that day, or the setup figure until enough are logged.
export function baselineFor(date, burns, seed) {
  const sorted = [...burns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return baselineSorted(date, sorted, seed);
}

// ---------------------------------------------------------------- one day

// A day's Intake, Burn (real or Baseline) and Deficit. Only a logged day has an Intake and a Deficit.
// `deficit` is Burn - Intake: positive is a Deficit, negative a Surplus.
export function daySummary(date, data, ix = buildIndex(data)) {
  const entries = ix.entriesByDate.get(date) ?? [];
  const logged = entries.length > 0;
  const intake = logged ? entries.reduce((s, e) => s + e.kcal, 0) : null;
  const rec = ix.burnByDate.get(date);
  const burn = rec ? rec.kcal : baselineSorted(date, ix.burnsSorted, data.settings?.baselineSeed);
  return {
    date,
    logged,
    intake,
    burn,
    burnLogged: Boolean(rec),
    estimated: !rec && burn != null,
    deficit: logged && burn != null ? burn - intake : null,
  };
}

// ---------------------------------------------------------------- goal

// Which way the Goal points: -1 lose, +1 gain, 0 maintain. Fixed when the Goal is set, from the
// weight the user started at, so a noisy Trend near the Goal can't flip it.
export function goalDirection(goal) {
  return goal ? Math.sign(goal.targetKg - goal.startKg) : 0;
}

// kcal per day the Pace calls for: positive is a Deficit, negative a Surplus (gain Goal).
export function targetDeficitFor(goal) {
  if (!goal || !goal.paceKgPerWeek) return 0;
  return Math.round((-goalDirection(goal) * goal.paceKgPerWeek * KCAL_PER_KG) / 7) || 0;
}

// kcal still available today and keep to the Target Deficit. Negative means over.
export function leftToEat(summary, goal) {
  if (!goal || summary.burn == null) return null;
  return summary.burn - targetDeficitFor(goal) - (summary.intake ?? 0);
}

export function goalReached(goal, trendNow) {
  if (!goal || trendNow == null) return false;
  const dir = goalDirection(goal);
  if (dir < 0) return trendNow <= goal.targetKg;
  if (dir > 0) return trendNow >= goal.targetKg;
  return false; // a maintain Goal is never "reached"
}

// How far along the Goal the Trend is, 0 to 1. Null when there is nothing to measure (no Goal, or a maintain Goal).
export function goalProgress(goal, trendNow) {
  if (!goal || trendNow == null) return null;
  const total = goal.targetKg - goal.startKg;
  if (total === 0) return null;
  return Math.min(1, Math.max(0, (trendNow - goal.startKg) / total));
}

// 'on' | 'near' | 'off' for how close `actual` is to `target` (same units, same sign convention).
export function statusVsTarget(actual, target) {
  if (actual == null || target == null) return null;
  if (target === 0) {
    const a = Math.abs(actual);
    return a <= 150 ? 'on' : a <= 300 ? 'near' : 'off';
  }
  const ratio = actual / target;
  return ratio >= 0.9 ? 'on' : ratio >= 0.6 ? 'near' : 'off';
}

// Warnings, never blocks: too fast a Pace, or an eating allowance (Baseline - Target Deficit) that is too low.
export function paceWarnings(goal, baseline) {
  const out = [];
  if (!goal) return out;
  if (goal.paceKgPerWeek > 1) out.push('pace-over-1kg');
  const target = targetDeficitFor(goal);
  if (baseline != null && target > 0 && baseline - target < 1200) out.push('allowance-under-1200');
  return out;
}

// Where the Trend stands against the Goal and the Pace.
export function paceStatus(data, today, ix = buildIndex(data)) {
  const now = pointOnOrBefore(ix.trend, today);
  if (!now) return null;
  const trendNow = now.trend;
  const weekAgo = pointOnOrBefore(ix.trend, addDays(today, -7));
  const fortnightAgo = pointOnOrBefore(ix.trend, addDays(today, -14));
  const weeklyChange = weekAgo ? trendNow - weekAgo.trend : null;
  const goal = data.goal;
  const dir = goalDirection(goal);
  const reached = goalReached(goal, trendNow);
  const remainingKg = goal ? (reached ? 0 : Math.abs(goal.targetKg - trendNow)) : null;

  let plannedFinish = null;
  let currentRateFinish = null;
  if (goal && !reached && dir !== 0) {
    if (goal.paceKgPerWeek > 0) {
      plannedFinish = addDays(today, Math.ceil((remainingKg / goal.paceKgPerWeek) * 7));
    }
    const rate = fortnightAgo ? (trendNow - fortnightAgo.trend) / 2 : weeklyChange; // kg per week
    if (rate != null && rate * dir > 0.01) {
      const weeks = remainingKg / Math.abs(rate);
      if (weeks <= 104) currentRateFinish = addDays(today, Math.ceil(weeks * 7));
    }
  }
  return {
    trendNow,
    lastWeighInDate: ix.trend[ix.trend.length - 1].date,
    weeklyChange,
    plannedWeeklyChange: goal ? dir * goal.paceKgPerWeek : null,
    weeklyStatus: goal && goal.paceKgPerWeek > 0 && weeklyChange != null && dir !== 0
      ? statusVsTarget(weeklyChange, dir * goal.paceKgPerWeek)
      : null,
    remainingKg,
    reached,
    plannedFinish,
    currentRateFinish,
  };
}

// ---------------------------------------------------------------- a stretch of days

// The on-track check for the logged days from `from` to `to` (both inclusive, normally ending yesterday).
export function rangeSummary(from, to, data, ix = buildIndex(data)) {
  const days = dateRange(from, to).map((d) => daySummary(d, data, ix));

  // The Expected change is compared with the Trend over the same stretch. Normally the Trend is
  // measured from the day before `from`; if the first Weigh-in falls inside the range, from that day on.
  const before = pointOnOrBefore(ix.trend, addDays(from, -1));
  const startPoint = before ?? ix.trend.find((p) => p.date >= from && p.date <= to) ?? null;
  const endPoint = pointOnOrBefore(ix.trend, to);
  const stretchFrom = startPoint ? (before ? from : addDays(startPoint.date, 1)) : from;

  const counted = days.filter((d) => d.deficit != null);
  const inStretch = counted.filter((d) => d.date >= stretchFrom);
  const total = counted.reduce((s, d) => s + d.deficit, 0);
  const stretchTotal = inStretch.reduce((s, d) => s + d.deficit, 0);
  const weighInsInRange = data.weighIns.filter((w) => w.date >= from && w.date <= to).length;
  const measurable = Boolean(startPoint && endPoint && endPoint.date > startPoint.date);

  return {
    from,
    to,
    totalDays: days.length,
    loggedDays: days.filter((d) => d.logged).length,
    countedDays: counted.length,
    estimatedDays: counted.filter((d) => d.estimated).length,
    totalDeficit: Math.round(total),
    avgDeficit: counted.length ? Math.round(total / counted.length) : null,
    targetDeficit: targetDeficitFor(data.goal),
    avgStatus: counted.length && data.goal ? statusVsTarget(total / counted.length, targetDeficitFor(data.goal)) : null,
    expectedChangeKg: measurable ? -stretchTotal / KCAL_PER_KG : null,
    actualChangeKg: measurable ? endPoint.trend - startPoint.trend : null,
    comparable: measurable && inStretch.length >= 7 && weighInsInRange >= 2,
    days,
  };
}

// Whether the Trend moved as far as the logged Deficits predict: 'agree', 'less' or 'more' (than predicted),
// or null when the stretch can't be compared yet. Within 0.3 kg counts as agreeing.
export function expectedVsActual(summary) {
  if (!summary?.comparable) return null;
  const expected = summary.expectedChangeKg;
  const actual = summary.actualChangeKg;
  const sign = expected <= 0 ? 1 : -1;
  const shortfall = (actual - expected) * sign;
  return shortfall > 0.3 ? 'less' : shortfall < -0.3 ? 'more' : 'agree';
}

// ---------------------------------------------------------------- nudges

export function backupOverdue(settings, createdAt, nowMs) {
  const reference = settings?.lastBackupAt ?? createdAt;
  return reference != null && nowMs - reference >= BACKUP_NAG_DAYS * 86400000;
}

export function nudges(data, today, nowMs) {
  const out = [];
  const yesterday = addDays(today, -1);
  const createdOn = data.createdAt != null ? toISODate(new Date(data.createdAt)) : null;
  const hasBurn = data.burns.some((b) => b.date === yesterday);
  if (!hasBurn && (createdOn == null || createdOn <= yesterday)) out.push({ code: 'burn-missing', date: yesterday });
  if (!data.weighIns.some((w) => w.date === today)) out.push({ code: 'weigh-in-today', date: today });
  const hasData = data.weighIns.length + data.burns.length + data.entries.length > 0;
  if (hasData && backupOverdue(data.settings, data.createdAt, nowMs)) out.push({ code: 'back-up' });
  return out;
}

// ---------------------------------------------------------------- screens' view models

// Everything the Today screen shows.
export function todayView(data, today, nowMs) {
  const ix = buildIndex(data);
  const goal = data.goal;
  const target = targetDeficitFor(goal);
  const todaySum = daySummary(today, data, ix);
  const yesterdaySum = daySummary(addDays(today, -1), data, ix);
  const pace = paceStatus(data, today, ix);
  const baseline = baselineSorted(today, ix.burnsSorted, data.settings?.baselineSeed);
  const firstDate = firstDataDate(data) ?? today;
  const chartFrom = maxDate(addDays(today, -29), firstDate);
  return {
    targetDeficit: target,
    baseline,
    today: { ...todaySum, left: leftToEat(todaySum, goal) },
    yesterday: { ...yesterdaySum, status: statusVsTarget(yesterdaySum.deficit, target) },
    pace,
    warnings: paceWarnings(goal, baseline),
    nudges: nudges(data, today, nowMs),
    weightSeries: weightSeries(ix, chartFrom, today),
  };
}

// Weigh-in dots and the Trend line from `from` to `to`, plus the point just before `from` so the line enters from the left.
export function weightSeries(ix, from, to) {
  const inside = ix.trend.filter((p) => p.date >= from && p.date <= to);
  const anchor = pointOnOrBefore(ix.trend, addDays(from, -1));
  return { from, to, anchor, points: inside };
}

// Everything the Progress screen shows. `range` is 7, 30, 90 or 'all'; the check covers complete days (up to yesterday).
export function progressView(data, today, range) {
  const ix = buildIndex(data);
  const to = addDays(today, -1);
  const first = firstDataDate(data) ?? today;
  const from = range === 'all' ? first : maxDate(addDays(to, -(range - 1)), first);
  const summary = from <= to ? rangeSummary(from, to, data, ix) : null;
  return {
    from,
    to,
    summary,
    targetDeficit: targetDeficitFor(data.goal),
    pace: paceStatus(data, today, ix),
    weightSeries: weightSeries(ix, from <= to ? from : today, today),
  };
}
