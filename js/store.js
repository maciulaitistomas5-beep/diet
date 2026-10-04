// Storage for the Diet Tracker: one JSON document in the phone's local storage (ADR 0001).
// The backup file is exactly this document, so Back up and Restore are a copy in and out.
import { MEALS, kcalFor } from './engine.js';

export const SCHEMA = 1;
export const KEY = 'diet.v1';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE_RE.test(s);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function emptyDoc(nowMs = Date.now()) {
  return {
    schema: SCHEMA,
    createdAt: nowMs,
    settings: { baselineSeed: null, lastBackupAt: null },
    goal: null,
    weighIns: [],
    burns: [],
    entries: [],
    products: [],
  };
}

function fail(message) {
  throw new Error(`Not a valid Diet Tracker file: ${message}`);
}

// Checks a parsed document (from storage or from a backup file) and returns a clean copy. Throws if it can't be trusted.
export function validateDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('it is not a Diet Tracker file');
  if (raw.schema !== SCHEMA) fail(raw.schema > SCHEMA ? 'it was made by a newer version of the app' : 'unknown version');
  const list = (name) => {
    if (!Array.isArray(raw[name])) fail(`"${name}" is missing`);
    return raw[name];
  };

  // One Weigh-in and one Burn per day: if a file repeats a day, the last one wins.
  const weighIns = new Map();
  for (const w of list('weighIns')) {
    if (!w || !isDate(w.date) || !isNum(w.kg) || w.kg <= 0 || w.kg > 1000) fail('a Weigh-in is malformed');
    weighIns.set(w.date, { date: w.date, kg: w.kg });
  }
  const burns = new Map();
  for (const b of list('burns')) {
    if (!b || !isDate(b.date) || !isNum(b.kcal) || b.kcal < 0 || b.kcal > 20000) fail('a Burn is malformed');
    burns.set(b.date, { date: b.date, kcal: b.kcal });
  }
  const entries = list('entries').map((e) => {
    if (!e || typeof e.id !== 'string' || !isDate(e.date) || !MEALS.includes(e.meal)
      || !['quick', 'product'].includes(e.kind) || !isNum(e.kcal) || e.kcal < 0) fail('a Food Entry is malformed');
    return { ...e, name: typeof e.name === 'string' ? e.name : '' };
  });
  const products = list('products').map((p) => {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim()
      || !['g', 'ml'].includes(p.basis) || !isNum(p.kcalPer100) || p.kcalPer100 < 0) fail('a Product is malformed');
    const servings = Array.isArray(p.servings)
      ? p.servings.filter((s) => s && typeof s.name === 'string' && isNum(s.amount) && s.amount > 0)
      : [];
    return { ...p, servings, uses: isNum(p.uses) ? p.uses : 0, lastUsedAt: isNum(p.lastUsedAt) ? p.lastUsedAt : null };
  });

  let goal = null;
  if (raw.goal != null) {
    const g = raw.goal;
    if (!isNum(g.targetKg) || g.targetKg <= 0 || !isNum(g.startKg) || g.startKg <= 0
      || !isNum(g.paceKgPerWeek) || g.paceKgPerWeek < 0 || !isDate(g.setOn)) fail('the Goal is malformed');
    goal = { targetKg: g.targetKg, startKg: g.startKg, paceKgPerWeek: g.paceKgPerWeek, setOn: g.setOn };
  }
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    schema: SCHEMA,
    createdAt: isNum(raw.createdAt) ? raw.createdAt : Date.now(),
    settings: {
      baselineSeed: isNum(s.baselineSeed) && s.baselineSeed > 0 ? s.baselineSeed : null,
      lastBackupAt: isNum(s.lastBackupAt) ? s.lastBackupAt : null,
    },
    goal,
    weighIns: [...weighIns.values()].sort(byDate),
    burns: [...burns.values()].sort(byDate),
    entries,
    products,
  };
}

// The fields of a Product Entry. Its kcal is worked out now and stays as logged (CONTEXT.md: Product Entry),
// so the per-100 figure is kept on the entry too and editing the Product later never touches it.
export function entryFromProduct(product, { date, meal, amount, servingName = null, servingCount = null }) {
  if (!isNum(amount) || amount <= 0) throw new Error('amount must be a positive number');
  return {
    date,
    meal,
    kind: 'product',
    name: product.name,
    productId: product.id,
    kcalPer100: product.kcalPer100,
    amount,
    unit: product.basis,
    servingName,
    servingCount,
    kcal: kcalFor(product.kcalPer100, amount),
  };
}

function defaultUid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStore(storage, { key = KEY, now = () => Date.now(), uid = defaultUid } = {}) {
  const listeners = new Set();
  let loadProblem = null;

  function load() {
    let raw = null;
    try {
      raw = storage.getItem(key);
      if (raw) return validateDoc(JSON.parse(raw));
    } catch (err) {
      // Never throw saved data away: keep the unreadable text beside the main copy and say so.
      try { storage.setItem(`${key}.unreadable-${now()}`, raw ?? ''); } catch { /* storage is full or blocked */ }
      loadProblem = err.message;
    }
    return emptyDoc(now());
  }

  let doc = load();

  function commit(change) {
    const result = change(doc);
    storage.setItem(key, JSON.stringify(doc));
    for (const fn of listeners) fn(doc);
    return result;
  }

  function upsertByDate(list, record) {
    const i = list.findIndex((r) => r.date === record.date);
    if (i >= 0) list[i] = record; else { list.push(record); list.sort(byDate); }
  }

  return {
    get: () => doc,
    get loadProblem() { return loadProblem; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // First run: the first Weigh-in, the Goal, and the Baseline setup figure, all at once.
    setup({ date, weightKg, targetKg, paceKgPerWeek, baselineSeed }) {
      return commit((d) => {
        upsertByDate(d.weighIns, { date, kg: weightKg });
        d.goal = { targetKg, startKg: weightKg, paceKgPerWeek, setOn: date };
        d.settings.baselineSeed = baselineSeed;
      });
    },
    setGoal({ targetKg, paceKgPerWeek }, { date, startKg }) {
      return commit((d) => { d.goal = { targetKg, startKg, paceKgPerWeek, setOn: date }; });
    },
    setBaselineSeed(kcal) {
      return commit((d) => { d.settings.baselineSeed = kcal; });
    },

    logWeighIn(date, kg) {
      return commit((d) => upsertByDate(d.weighIns, { date, kg }));
    },
    removeWeighIn(date) {
      return commit((d) => { d.weighIns = d.weighIns.filter((w) => w.date !== date); });
    },
    logBurn(date, kcal) {
      return commit((d) => upsertByDate(d.burns, { date, kcal }));
    },
    removeBurn(date) {
      return commit((d) => { d.burns = d.burns.filter((b) => b.date !== date); });
    },

    addEntry(fields) {
      if (!MEALS.includes(fields.meal)) throw new Error('unknown meal');
      if (!isNum(fields.kcal) || fields.kcal < 0) throw new Error('kcal must be a number');
      const entry = { name: '', ...fields, id: fields.id ?? uid() };
      return commit((d) => { d.entries.push(entry); return entry; });
    },
    updateEntry(id, patch) {
      return commit((d) => {
        const i = d.entries.findIndex((e) => e.id === id);
        if (i < 0) throw new Error('no such entry');
        d.entries[i] = { ...d.entries[i], ...patch, id };
        return d.entries[i];
      });
    },
    removeEntry(id) {
      return commit((d) => {
        const i = d.entries.findIndex((e) => e.id === id);
        return i < 0 ? null : d.entries.splice(i, 1)[0];
      });
    },

    // Editing a Product changes only Food Entries logged from now on (see entryFromProduct).
    saveProduct(fields) {
      return commit((d) => {
        const i = fields.id ? d.products.findIndex((p) => p.id === fields.id) : -1;
        if (i >= 0) {
          d.products[i] = { ...d.products[i], ...fields };
          return d.products[i];
        }
        const product = { servings: [], uses: 0, lastUsedAt: null, ...fields, id: fields.id ?? uid(), createdAt: now() };
        d.products.push(product);
        return product;
      });
    },
    removeProduct(id) {
      return commit((d) => { d.products = d.products.filter((p) => p.id !== id); });
    },
    touchProduct(id) {
      return commit((d) => {
        const p = d.products.find((x) => x.id === id);
        if (p) { p.uses = (p.uses ?? 0) + 1; p.lastUsedAt = now(); }
      });
    },

    markBackedUp() {
      return commit((d) => { d.settings.lastBackupAt = now(); });
    },
    exportJSON() {
      return JSON.stringify(doc, null, 1);
    },
    // Replaces everything with the contents of a backup file. Throws, and changes nothing, if the file isn't valid.
    importJSON(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { fail('it is not readable'); }
      const next = validateDoc(parsed);
      return commit(() => { doc = next; });
    },
    reset() {
      return commit(() => { doc = emptyDoc(now()); });
    },
  };
}
