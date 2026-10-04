import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, emptyDoc, validateDoc, entryFromProduct, KEY, SCHEMA } from '../js/store.js';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}
let n = 0;
const make = (storage = fakeStorage(), clock = { t: 1_000_000 }) =>
  createStore(storage, { now: () => clock.t, uid: () => `id${++n}` });

test('a new store starts empty, with nothing wrong', () => {
  const s = make();
  assert.deepEqual(s.get().weighIns, []);
  assert.equal(s.get().goal, null);
  assert.equal(s.loadProblem, null);
});

test('setup stores the first Weigh-in, the Goal and the Baseline figure, and survives a reload', () => {
  const storage = fakeStorage();
  make(storage).setup({ date: '2026-10-04', weightKg: 86, targetKg: 80, paceKgPerWeek: 0.5, baselineSeed: 2600 });
  const again = make(storage).get();
  assert.deepEqual(again.weighIns, [{ date: '2026-10-04', kg: 86 }]);
  assert.deepEqual(again.goal, { targetKg: 80, startKg: 86, paceKgPerWeek: 0.5, setOn: '2026-10-04' });
  assert.equal(again.settings.baselineSeed, 2600);
});

test('one Weigh-in per day: logging again replaces it, and they stay in date order', () => {
  const s = make();
  s.logWeighIn('2026-10-03', 85);
  s.logWeighIn('2026-10-01', 86);
  s.logWeighIn('2026-10-03', 84.6);
  assert.deepEqual(s.get().weighIns, [{ date: '2026-10-01', kg: 86 }, { date: '2026-10-03', kg: 84.6 }]);
  s.removeWeighIn('2026-10-01');
  assert.deepEqual(s.get().weighIns, [{ date: '2026-10-03', kg: 84.6 }]);
});

test('one Burn per day: logging again replaces it', () => {
  const s = make();
  s.logBurn('2026-10-03', 2500);
  s.logBurn('2026-10-03', 2700);
  assert.deepEqual(s.get().burns, [{ date: '2026-10-03', kcal: 2700 }]);
  s.removeBurn('2026-10-03');
  assert.deepEqual(s.get().burns, []);
});

test('Food Entries: add, edit, remove, and put back with the same id', () => {
  const s = make();
  const e = s.addEntry({ date: '2026-10-04', meal: 'lunch', kind: 'quick', name: 'Soup', kcal: 350 });
  assert.ok(e.id);
  s.updateEntry(e.id, { kcal: 400 });
  assert.equal(s.get().entries[0].kcal, 400);
  assert.equal(s.get().entries[0].id, e.id);
  const removed = s.removeEntry(e.id);
  assert.deepEqual(s.get().entries, []);
  s.addEntry(removed);
  assert.equal(s.get().entries[0].id, e.id);
  assert.equal(s.removeEntry('nope'), null);
});

test('Food Entries reject an unknown meal or a bad kcal', () => {
  const s = make();
  assert.throws(() => s.addEntry({ date: '2026-10-04', meal: 'brunch', kind: 'quick', kcal: 100 }), /meal/);
  assert.throws(() => s.addEntry({ date: '2026-10-04', meal: 'lunch', kind: 'quick', kcal: -5 }), /kcal/);
  assert.throws(() => s.addEntry({ date: '2026-10-04', meal: 'lunch', kind: 'quick', kcal: NaN }), /kcal/);
  assert.throws(() => s.updateEntry('missing', { kcal: 1 }), /no such entry/);
});

test('a Product Entry keeps the kcal it was logged with when the Product is edited later', () => {
  const s = make();
  const oat = s.saveProduct({ name: 'Oat milk', basis: 'ml', kcalPer100: 42 });
  const fields = entryFromProduct(oat, { date: '2026-10-01', meal: 'breakfast', amount: 100 });
  assert.equal(fields.kcal, 42);
  assert.equal(fields.kcalPer100, 42);
  const entry = s.addEntry(fields);

  s.saveProduct({ id: oat.id, kcalPer100: 52 }); // the typo fix
  assert.equal(s.get().products[0].kcalPer100, 52);
  assert.equal(s.get().entries.find((e) => e.id === entry.id).kcal, 42);

  const next = entryFromProduct(s.get().products[0], { date: '2026-10-04', meal: 'breakfast', amount: 100 });
  assert.equal(next.kcal, 52);
});

test('removing a Product leaves the Food Entries it made', () => {
  const s = make();
  const p = s.saveProduct({ name: 'Egg', basis: 'g', kcalPer100: 143 });
  s.addEntry(entryFromProduct(p, { date: '2026-10-04', meal: 'breakfast', amount: 55 }));
  s.removeProduct(p.id);
  assert.deepEqual(s.get().products, []);
  assert.equal(s.get().entries.length, 1);
  assert.equal(s.get().entries[0].kcal, 79);
});

test('entryFromProduct needs a positive amount and keeps the Serving it was entered as', () => {
  const p = { id: 'p1', name: 'Egg', basis: 'g', kcalPer100: 143 };
  assert.throws(() => entryFromProduct(p, { date: '2026-10-04', meal: 'lunch', amount: 0 }));
  const e = entryFromProduct(p, { date: '2026-10-04', meal: 'lunch', amount: 110, servingName: 'egg', servingCount: 2 });
  assert.equal(e.servingName, 'egg');
  assert.equal(e.servingCount, 2);
  assert.equal(e.unit, 'g');
});

test('touchProduct counts uses and notes when', () => {
  const clock = { t: 5 };
  const s = make(fakeStorage(), clock);
  const p = s.saveProduct({ name: 'Egg', basis: 'g', kcalPer100: 143 });
  clock.t = 99;
  s.touchProduct(p.id);
  s.touchProduct(p.id);
  assert.equal(s.get().products[0].uses, 2);
  assert.equal(s.get().products[0].lastUsedAt, 99);
});

test('subscribers hear about every change until they unsubscribe', () => {
  const s = make();
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.logBurn('2026-10-03', 2500);
  s.logWeighIn('2026-10-03', 85);
  off();
  s.logBurn('2026-10-02', 2500);
  assert.equal(calls, 2);
});

test('markBackedUp notes the time', () => {
  const clock = { t: 12345 };
  const s = make(fakeStorage(), clock);
  s.markBackedUp();
  assert.equal(s.get().settings.lastBackupAt, 12345);
});

test('Back up then Restore gives back the same data', () => {
  const a = make();
  a.setup({ date: '2026-10-01', weightKg: 86, targetKg: 80, paceKgPerWeek: 0.5, baselineSeed: 2600 });
  a.logBurn('2026-10-02', 2650);
  const p = a.saveProduct({ name: 'Kefir', basis: 'ml', kcalPer100: 40, servings: [{ name: 'glass', amount: 200 }] });
  a.addEntry(entryFromProduct(p, { date: '2026-10-02', meal: 'breakfast', amount: 200, servingName: 'glass', servingCount: 1 }));
  const file = a.exportJSON();

  const b = make();
  b.importJSON(file);
  assert.deepEqual(b.get(), a.get());
});

test('Restore refuses a file that is not valid and changes nothing', () => {
  const s = make();
  s.logBurn('2026-10-03', 2500);
  const before = JSON.stringify(s.get());
  assert.throws(() => s.importJSON('not json'), /not readable/);
  assert.throws(() => s.importJSON('[]'), /not a Diet Tracker file/);
  assert.throws(() => s.importJSON(JSON.stringify({ ...emptyDoc(), schema: SCHEMA + 1 })), /newer version/);
  assert.throws(() => s.importJSON(JSON.stringify({ ...emptyDoc(), weighIns: [{ date: 'yesterday', kg: 80 }] })), /Weigh-in/);
  assert.equal(JSON.stringify(s.get()), before);
});

test('validateDoc: a file that repeats a day keeps the last one, and sorts by date', () => {
  const doc = {
    ...emptyDoc(),
    weighIns: [{ date: '2026-10-03', kg: 85 }, { date: '2026-10-01', kg: 86 }, { date: '2026-10-03', kg: 84 }],
  };
  assert.deepEqual(validateDoc(doc).weighIns, [{ date: '2026-10-01', kg: 86 }, { date: '2026-10-03', kg: 84 }]);
});

test('validateDoc rejects a Food Entry with an unknown meal and a Product with no name', () => {
  assert.throws(() => validateDoc({ ...emptyDoc(), entries: [{ id: 'x', date: '2026-10-01', meal: 'brunch', kind: 'quick', kcal: 1 }] }), /Food Entry/);
  assert.throws(() => validateDoc({ ...emptyDoc(), products: [{ id: 'x', name: ' ', basis: 'g', kcalPer100: 1 }] }), /Product/);
});

test('unreadable saved data is kept aside, not thrown away, and reported', () => {
  const storage = fakeStorage({ [KEY]: '{"broken":' });
  const s = make(storage);
  assert.ok(s.loadProblem);
  assert.deepEqual(s.get().weighIns, []);
  const kept = storage.keys().filter((k) => k.startsWith(`${KEY}.unreadable-`));
  assert.equal(kept.length, 1);
  assert.equal(storage.getItem(kept[0]), '{"broken":');
  s.logBurn('2026-10-03', 2500); // carrying on writes the main copy only
  assert.equal(storage.getItem(kept[0]), '{"broken":');
});

test('reset empties everything', () => {
  const s = make();
  s.logBurn('2026-10-03', 2500);
  s.reset();
  assert.deepEqual(s.get().burns, []);
});
