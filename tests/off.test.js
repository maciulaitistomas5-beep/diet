import test from 'node:test';
import assert from 'node:assert/strict';
import { barcodeOk, mapProduct, lookupBarcode } from '../js/off.js';

test('barcodeOk accepts EAN-8, UPC-A, EAN-13 and GTIN-14 digits only', () => {
  for (const ok of ['96385074', '036000291452', '4770000000012', '04770000000012']) assert.equal(barcodeOk(ok), true, ok);
  for (const bad of ['', '123', '12345678901', '47700000000x2', 4770000000012, null]) assert.equal(barcodeOk(bad), false, String(bad));
});

test('mapProduct: a solid food per 100 g, with the pack as a Serving', () => {
  const p = mapProduct({
    status: 1,
    product: {
      code: '4770000000012', product_name: 'Varškė 5%', brands: 'Rokiškio, Other',
      quantity: '180 g', product_quantity: '180', nutriments: { 'energy-kcal_100g': 121 },
    },
  });
  assert.deepEqual(p, {
    name: 'Varškė 5% (Rokiškio)',
    kcalPer100: 121,
    basis: 'g',
    barcode: '4770000000012',
    servings: [{ name: 'pack', amount: 180 }],
  });
});

test('mapProduct: a drink is per 100 ml', () => {
  const p = mapProduct({
    status: 1,
    product: { code: '5449000000996', product_name: 'Coca-Cola', quantity: '330 ml', product_quantity: 330, product_quantity_unit: 'ml', nutriments: { 'energy-kcal_100g': 42.4 } },
  });
  assert.equal(p.basis, 'ml');
  assert.equal(p.kcalPer100, 42.4);
  assert.deepEqual(p.servings, [{ name: 'pack', amount: 330 }]);
});

test('mapProduct: the pack size is read from the quantity text when there is no number', () => {
  const p = mapProduct({ status: 1, product: { code: '1', product_name: 'Sula', quantity: '1,5 l', nutriments: { 'energy-kcal_100g': 45 } } });
  assert.equal(p.basis, 'ml');
  assert.deepEqual(p.servings, [{ name: 'pack', amount: 1500 }]);
});

test('mapProduct: kilojoules stand in when kcal is missing', () => {
  const p = mapProduct({ status: 1, product: { product_name: 'Bread', nutriments: { 'energy_100g': 1046 } } });
  assert.equal(p.kcalPer100, 250);
});

test('mapProduct: no nutrition data means no kcal, so the caller asks for it', () => {
  const p = mapProduct({ status: 1, product: { product_name: 'Mystery', nutriments: {} } });
  assert.equal(p.kcalPer100, null);
});

test('mapProduct: unknown product is null', () => {
  assert.equal(mapProduct({ status: 0 }), null);
  assert.equal(mapProduct({}), null);
  assert.equal(mapProduct(null), null);
});

test('mapProduct: name falls back through Lithuanian, plain, English, then the brand', () => {
  assert.equal(mapProduct({ status: 1, product: { product_name_lt: 'Pienas', product_name: 'Milk' } }).name, 'Pienas');
  assert.equal(mapProduct({ status: 1, product: { product_name_en: 'Milk' } }).name, 'Milk');
  assert.equal(mapProduct({ status: 1, product: { brands: 'Žemaitijos' } }).name, 'Žemaitijos');
});

test('mapProduct: a brand already in the name is not repeated', () => {
  const p = mapProduct({ status: 1, product: { product_name: 'Rokiškio varškė', brands: 'Rokiškio' } });
  assert.equal(p.name, 'Rokiškio varškė');
});

test('mapProduct: a serving different from the pack is kept as a second Serving', () => {
  const two = mapProduct({ status: 1, product: { product_name: 'Crackers', product_quantity: 200, serving_quantity: 30 } });
  assert.deepEqual(two.servings, [{ name: 'pack', amount: 200 }, { name: 'serving', amount: 30 }]);
  const same = mapProduct({ status: 1, product: { product_name: 'Yogurt', product_quantity: 150, serving_quantity: 150 } });
  assert.deepEqual(same.servings, [{ name: 'pack', amount: 150 }]);
});

const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('lookupBarcode returns the mapped Product', async () => {
  const p = await lookupBarcode('4770000000012', {
    fetchImpl: reply(200, { status: 1, product: { product_name: 'Kefyras', nutriments: { 'energy-kcal_100g': 40 } } }),
  });
  assert.equal(p.name, 'Kefyras');
  assert.equal(p.kcalPer100, 40);
});

test('lookupBarcode asks only for the barcode it was given', async () => {
  let url = '';
  await lookupBarcode('4770000000012', { fetchImpl: async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ status: 0 }) }; } });
  assert.ok(url.startsWith('https://world.openfoodfacts.org/api/v2/product/4770000000012.json'));
});

test('lookupBarcode: unknown barcode is null, a server error rejects, a bad number rejects without a request', async () => {
  assert.equal(await lookupBarcode('4770000000012', { fetchImpl: reply(404, {}) }), null);
  assert.equal(await lookupBarcode('4770000000012', { fetchImpl: reply(200, { status: 0 }) }), null);
  await assert.rejects(lookupBarcode('4770000000012', { fetchImpl: reply(503, {}) }), /503/);
  let called = false;
  await assert.rejects(lookupBarcode('abc', { fetchImpl: async () => { called = true; } }));
  assert.equal(called, false);
});
