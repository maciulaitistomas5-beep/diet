// Made-up data for looking at the screens: open the app with ?demo. It lives under its own storage key,
// so it never touches real data. Everything is generated from a fixed seed, relative to today.
import { addDays, dateRange, parseISODate } from './engine.js';
import { emptyDoc, entryFromProduct } from './store.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  { name: 'Rolled oats', basis: 'g', kcalPer100: 372, servings: [{ name: 'bowl', amount: 50 }] },
  { name: 'Kefir 1%', basis: 'ml', kcalPer100: 40, servings: [{ name: 'glass', amount: 250 }] },
  { name: 'Egg', basis: 'g', kcalPer100: 143, servings: [{ name: 'egg', amount: 55 }] },
  { name: 'Rye bread', basis: 'g', kcalPer100: 230, servings: [{ name: 'slice', amount: 30 }] },
  { name: 'Cottage cheese 5%', basis: 'g', kcalPer100: 121, servings: [{ name: 'pack', amount: 180 }] },
  { name: 'Chicken breast', basis: 'g', kcalPer100: 110, servings: [] },
  { name: 'Cooked rice', basis: 'g', kcalPer100: 130, servings: [] },
  { name: 'Banana', basis: 'g', kcalPer100: 89, servings: [{ name: 'banana', amount: 118 }] },
  { name: 'Apple', basis: 'g', kcalPer100: 52, servings: [{ name: 'apple', amount: 180 }] },
  { name: 'Olive oil', basis: 'ml', kcalPer100: 884, servings: [{ name: 'tbsp', amount: 15 }] },
];

export function buildDemoDoc(today, nowMs) {
  const r = rng(2026);
  const days = dateRange(addDays(today, -59), today);
  const firstDay = days[0];
  const doc = emptyDoc(parseISODate(firstDay).getTime() + 12 * 3600 * 1000);
  doc.settings = { baselineSeed: 2600, lastBackupAt: nowMs - 2 * 86400000 };
  doc.goal = { targetKg: 80, startKg: 86, paceKgPerWeek: 0.5, setOn: firstDay };

  let n = 0;
  const id = () => `demo-${++n}`;
  doc.products = PRODUCTS.map((p, i) => ({ ...p, id: `prod-${i}`, uses: 12 - i, lastUsedAt: nowMs - i * 3600000, createdAt: nowMs, barcode: null }));
  const by = Object.fromEntries(doc.products.map((p) => [p.name, p]));
  const yesterday = addDays(today, -1);

  const product = (date, meal, name, amount, serving = null, count = null) =>
    ({ id: id(), ...entryFromProduct(by[name], { date, meal, amount, servingName: serving, servingCount: count }) });
  const quick = (date, meal, name, kcal) => ({ id: id(), date, meal, kind: 'quick', name, kcal: Math.round(kcal) });

  days.forEach((date, i) => {
    const weekend = [0, 6].includes(parseISODate(date).getDay());
    if (date !== today && r() > 0.15) doc.weighIns.push({ date, kg: Math.round((86 - 0.07 * i + (r() - 0.5) * 0.9) * 10) / 10 });
    if (date !== today && date !== yesterday && r() > 0.1) doc.burns.push({ date, kcal: Math.round(2600 + (r() - 0.5) * 180 + (weekend ? 250 : 0)) });

    const loggedToday = date === today;
    if (!loggedToday && date !== yesterday && r() < 0.07) return; // a forgotten day

    const b = r();
    if (b < 0.34) doc.entries.push(product(date, 'breakfast', 'Rolled oats', 50, 'bowl', 1), product(date, 'breakfast', 'Kefir 1%', 250, 'glass', 1));
    else if (b < 0.67) doc.entries.push(product(date, 'breakfast', 'Egg', 110, 'egg', 2), product(date, 'breakfast', 'Rye bread', 60, 'slice', 2));
    else doc.entries.push(product(date, 'breakfast', 'Cottage cheese 5%', 180, 'pack', 1), product(date, 'breakfast', 'Banana', 118, 'banana', 1));

    if (r() < 0.5) doc.entries.push(product(date, 'lunch', 'Chicken breast', 150), product(date, 'lunch', 'Cooked rice', 150), product(date, 'lunch', 'Olive oil', 15, 'tbsp', 1));
    else doc.entries.push(quick(date, 'lunch', 'Canteen lunch', 700 + r() * 180));
    if (loggedToday) return; // today: breakfast and lunch so far

    doc.entries.push(quick(date, 'dinner', r() < 0.5 ? 'Dinner at home' : 'Dinner out', 780 + r() * 300 + (weekend ? 250 : 0)));
    if (r() < 0.6) doc.entries.push(product(date, 'snack', r() < 0.5 ? 'Apple' : 'Banana', r() < 0.5 ? 180 : 118));
    else doc.entries.push(quick(date, 'snack', 'Chocolate', 150 + r() * 200));
    if (weekend && r() < 0.5) doc.entries.push(quick(date, 'snack', 'Ice cream', 250));
  });
  return doc;
}

export function seedDemo(store, today, nowMs = Date.now()) {
  store.importJSON(JSON.stringify(buildDemoDoc(today, nowMs)));
}
