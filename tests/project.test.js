// Guards against slips the other tests can't see: a screen asking for text that doesn't exist,
// or a file the offline copy forgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { S } from '../js/strings.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsFiles = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js'));

// "S.today.title" -> true when strings.js has it. Computed keys like S.meals[meal] are checked as far as the group.
function exists(path) {
  let node = S;
  for (const part of path.split('.')) {
    if (node == null || !(part in node)) return false;
    node = node[part];
  }
  return true;
}

test('every S.group.key a screen uses exists in strings.js', () => {
  const missing = [];
  for (const file of jsFiles) {
    if (file === 'strings.js') continue;
    const src = readFileSync(join(root, 'js', file), 'utf8');
    for (const m of src.matchAll(/\bS\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/g)) {
      if (!exists(m[1])) missing.push(`${file}: S.${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every meal and warning code has a name on screen', () => {
  for (const m of ['breakfast', 'lunch', 'dinner', 'snack']) assert.ok(S.meals[m], m);
  for (const w of ['pace-over-1kg', 'allowance-under-1200']) assert.ok(S.goal.warnings[w], w);
  for (const v of ['agree', 'less', 'more']) assert.ok(S.progress.verdict[v], v);
});

test('the service worker keeps every file the app is made of', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shell = /const SHELL = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? '';
  const listed = new Set([...shell.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.ok(listed.size > 10, 'could not read the SHELL list from sw.js');
  const needed = [
    'index.html', 'manifest.webmanifest', 'css/app.css',
    ...jsFiles.map((f) => `js/${f}`),
    ...readdirSync(join(root, 'icons')).map((f) => `icons/${f}`),
  ];
  const missing = needed.filter((f) => !listed.has(f));
  assert.deepEqual(missing, []);
});

test('the manifest points at icons that exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  const icons = new Set(readdirSync(join(root, 'icons')));
  for (const icon of manifest.icons) assert.ok(icons.has(icon.src.replace('icons/', '')), icon.src);
});

test('the page links what it loads', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const ref of ['css/app.css', 'js/app.js', 'manifest.webmanifest', 'icons/icon-180.png']) assert.ok(html.includes(ref), ref);
});
