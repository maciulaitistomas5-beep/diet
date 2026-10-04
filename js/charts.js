// The two charts, drawn as SVG. They scale to the screen's width through the viewBox.
import { s } from './dom.js';
import { S } from './strings.js';
import { addDays, daysBetween, statusVsTarget } from './engine.js';
import { fmtDate, fmtDateShort, fmtInt, fmtKg } from './format.js';

const W = 340;

function niceStep(span, maxTicks) {
  for (const step of [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    if (span / step <= maxTicks) return step;
  }
  return 1000;
}

function emptyChart(height, message) {
  return s('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img', 'aria-label': message },
    s('text', { x: W / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }, message));
}

// Weigh-in dots, the Trend line, and the Goal line. `series` is todayView/progressView's weightSeries.
export function weightChart({ series, goalKg, label }) {
  const H = 170;
  const m = { l: 40, r: 10, t: 12, b: 24 };
  const pts = series.points;
  if (!pts.length && !series.anchor) return emptyChart(H, S.charts.noWeighIns);

  let from = series.from;
  const to = series.to;
  if (daysBetween(from, to) < 3) from = addDays(to, -3);
  const span = daysBetween(from, to);
  const x = (date) => m.l + (Math.min(span, Math.max(0, daysBetween(from, date))) / span) * (W - m.l - m.r);

  // Where the Trend line enters from the left edge: interpolated between the point before the range and the first inside it.
  const line = [];
  if (series.anchor) {
    const first = pts[0];
    if (first && first.date > from) {
      const t = Math.min(1, Math.max(0, daysBetween(series.anchor.date, from) / daysBetween(series.anchor.date, first.date)));
      line.push({ date: from, trend: series.anchor.trend + (first.trend - series.anchor.trend) * t });
    } else if (!first) {
      line.push({ date: from, trend: series.anchor.trend }, { date: to, trend: series.anchor.trend });
    }
  }
  line.push(...pts.map((p) => ({ date: p.date, trend: p.trend })));

  const values = [...pts.map((p) => p.kg), ...line.map((p) => p.trend)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  let goalOff = null;
  if (goalKg != null) {
    if (goalKg >= lo - 4 && goalKg <= hi + 4) { lo = Math.min(lo, goalKg); hi = Math.max(hi, goalKg); }
    else goalOff = goalKg < lo ? 'below' : 'above';
  }
  const pad = Math.max(0.4, (hi - lo) * 0.12);
  lo -= pad;
  hi += pad;
  const y = (kg) => m.t + (1 - (kg - lo) / (hi - lo)) * (H - m.t - m.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  const step = niceStep(hi - lo, 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg.append(
      s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }),
      s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, fmtKg(v, step < 1 ? 1 : 0)),
    );
  }
  svg.append(
    s('text', { x: m.l, y: H - 6, 'text-anchor': 'start', class: 'axis' }, fmtDate(from)),
    s('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end', class: 'axis' }, fmtDate(to)),
  );

  if (goalKg != null) {
    if (goalOff) {
      const edgeY = goalOff === 'below' ? H - m.b - 2 : m.t + 10;
      svg.append(s('text', { x: W - m.r, y: edgeY, 'text-anchor': 'end', class: 'goal-label' },
        `${goalOff === 'below' ? '↓' : '↑'} ${S.charts.goal} ${fmtKg(goalKg)}`));
    } else {
      svg.append(
        s('line', { x1: m.l, x2: W - m.r, y1: y(goalKg), y2: y(goalKg), class: 'goal-line' }),
        s('text', { x: W - m.r, y: y(goalKg) - 4, 'text-anchor': 'end', class: 'goal-label' }, `${S.charts.goal} ${fmtKg(goalKg)}`),
      );
    }
  }

  for (const p of pts) {
    svg.append(s('circle', { cx: x(p.date), cy: y(p.kg), r: 2.6, class: 'dot' },
      s('title', {}, `${fmtDateShort(p.date)}: ${fmtKg(p.kg)} kg`)));
  }
  if (line.length > 1) {
    svg.append(s('polyline', { points: line.map((p) => `${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' '), class: 'trend-line' }));
  }
  const last = line[line.length - 1];
  if (last) svg.append(s('circle', { cx: x(last.date), cy: y(last.trend), r: 4, class: 'trend-dot' }));
  return svg;
}

// One bar per day: up is a Deficit, down a Surplus. Green, amber or red against the Target Deficit; paler when the day's
// Burn is the Baseline; a thin grey tick where a day isn't logged. Tapping a bar calls onSelect(day).
export function deficitChart({ days, target, label, selectedDate, onSelect }) {
  const H = 160;
  const m = { l: 40, r: 10, t: 14, b: 24 };
  if (!days.length) return emptyChart(H, S.charts.noDays);
  const n = days.length;
  const slot = (W - m.l - m.r) / n;
  const gap = Math.min(2, slot * 0.25);
  const values = days.filter((d) => d.deficit != null).map((d) => d.deficit);
  const top = Math.max(300, target * 1.3, ...values) * 1.08;
  const bottom = Math.min(0, ...values) * 1.15;
  const y = (v) => m.t + (1 - (v - bottom) / (top - bottom)) * (H - m.t - m.b);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart bars', role: 'img', 'aria-label': label });
  const step = niceStep(top - bottom, 4);
  for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) {
    svg.append(
      s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'zero' : 'grid' }),
      s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, fmtInt(v)),
    );
  }
  svg.append(
    s('text', { x: m.l, y: H - 6, 'text-anchor': 'start', class: 'axis' }, fmtDate(days[0].date)),
    s('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end', class: 'axis' }, fmtDate(days[n - 1].date)),
  );

  days.forEach((d, i) => {
    const bx = m.l + i * slot + gap / 2;
    const bw = Math.max(1, slot - gap);
    if (d.date === selectedDate) svg.append(s('rect', { x: m.l + i * slot, y: m.t, width: slot, height: H - m.t - m.b, class: 'sel' }));
    if (d.deficit == null) {
      svg.append(s('rect', { x: bx, y: y(0) - 1.5, width: bw, height: 3, class: 'bar-gap' }));
      return;
    }
    const y0 = y(0);
    const y1 = y(d.deficit);
    const status = target === 0 && d.deficit === 0 ? 'on' : statusVsTarget(d.deficit, target) ?? 'near';
    svg.append(s('rect', {
      x: bx, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)),
      class: `bar ${status}${d.estimated ? ' est' : ''}`,
    }, s('title', {}, `${fmtDateShort(d.date)}: ${d.deficit >= 0 ? S.words.deficit : S.words.surplus} ${fmtInt(Math.abs(d.deficit))} kcal${d.estimated ? ` (${S.words.estimate})` : ''}`)));
  });

  if (target !== 0) {
    svg.append(
      s('line', { x1: m.l, x2: W - m.r, y1: y(target), y2: y(target), class: 'goal-line' }),
      s('text', { x: W - m.r, y: y(target) - 4, 'text-anchor': 'end', class: 'goal-label' }, `${S.charts.target} ${fmtInt(target)}`),
    );
  }

  if (onSelect) {
    svg.classList.add('tappable');
    svg.addEventListener('click', (e) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.floor((vx - m.l) / slot);
      if (i >= 0 && i < n) onSelect(days[i]);
    });
  }
  return svg;
}
