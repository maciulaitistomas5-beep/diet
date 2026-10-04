// Open Food Facts: turn a scanned barcode into the fields of a Product.
// Free, no key, and it allows requests straight from a web page, so no server is involved (ADR 0001).
// The only thing sent is the barcode number.

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = [
  'code', 'product_name', 'product_name_lt', 'product_name_en', 'brands',
  'quantity', 'product_quantity', 'product_quantity_unit', 'serving_size', 'serving_quantity', 'nutriments',
].join(',');

const KJ_PER_KCAL = 4.184;
const UNIT_TO_BASE = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };

export function barcodeOk(code) {
  return typeof code === 'string' && /^(\d{8}|\d{12,14})$/.test(code);
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// "330 ml", "1,5 l", "2 x 125 g" (only the plain form is read) -> { amount: 330, unit: 'ml' } in g or ml.
function parseQuantity(text) {
  const m = /^\s*([\d.,]+)\s*(kg|g|l|cl|ml)\b/i.exec(text ?? '');
  const n = m ? num(m[1]) : null;
  if (n == null) return null;
  const unit = m[2].toLowerCase();
  return { amount: n * UNIT_TO_BASE[unit], basis: unit === 'g' || unit === 'kg' ? 'g' : 'ml' };
}

// Open Food Facts' JSON for one product -> { name, kcalPer100, basis, barcode, servings }, or null when it has no such product.
export function mapProduct(json) {
  const p = json?.product;
  if (!p || json.status === 0) return null;

  const base = [p.product_name_lt, p.product_name, p.product_name_en].map((s) => (s ?? '').trim()).find(Boolean) ?? '';
  const brand = (p.brands ?? '').split(',')[0].trim();
  let name = base;
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) name = base ? `${base} (${brand})` : brand;

  const n = p.nutriments ?? {};
  let kcalPer100 = num(n['energy-kcal_100g']);
  if (kcalPer100 == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj != null) kcalPer100 = Math.round(kj / KJ_PER_KCAL);
  }

  // Drinks are quoted per 100 ml, everything else per 100 g.
  const fromText = parseQuantity(p.quantity);
  const unit = (p.product_quantity_unit ?? '').toLowerCase();
  const basis = unit ? (unit === 'g' || unit === 'kg' ? 'g' : 'ml') : fromText?.basis ?? 'g';

  const servings = [];
  const pack = num(p.product_quantity) ?? fromText?.amount ?? null;
  if (pack != null && pack > 0) servings.push({ name: 'pack', amount: pack });
  const serving = num(p.serving_quantity);
  if (serving != null && serving > 0 && serving !== pack) servings.push({ name: 'serving', amount: serving });

  return { name, kcalPer100: kcalPer100 ?? null, basis, barcode: p.code ?? null, servings };
}

// Looks a barcode up. Resolves to the mapped Product fields, or null if Open Food Facts doesn't know it;
// rejects if the lookup itself fails (offline, timeout, server error).
export async function lookupBarcode(code, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!barcodeOk(code)) throw new Error('That is not a barcode number');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`${API}${code}.json?fields=${FIELDS}`, ctl ? { signal: ctl.signal } : undefined);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
    return mapProduct(await res.json());
  } finally {
    if (timer) clearTimeout(timer);
  }
}
