// Tiny DOM helpers: no framework and no build step.
import { S } from './strings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOOLEAN_PROPS = new Set(['checked', 'selected', 'disabled', 'readonly', 'required', 'multiple', 'hidden']);

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') { el.setAttribute('value', v); el.value = v; }
    else if (BOOLEAN_PROPS.has(k)) el.setAttribute(k, '');
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

// SVG elements
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const ICONS = {
  today: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  food: ['M4 12h16a8 8 0 0 1-16 0z', 'M9 4v3', 'M12 3v4', 'M15 4v3'],
  progress: ['M3 3v18h18', 'M7 15l4-4 3 3 6-7'],
  burn: ['M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.8 1 2.6 2 2.7C10.6 8 11 5.5 12 3z'],
  settings: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  barcode: ['M4 8V5h3', 'M20 8V5h-3', 'M4 16v3h3', 'M20 16v3h-3', 'M8 9v6', 'M11 9v6', 'M14 9v6', 'M17 9v6'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
};

export function icon(name, size = 22) {
  return s('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon',
  }, (ICONS[name] ?? []).map((d) => s('path', { d })));
}

// One bottom sheet at a time. Returns controls so a flow (pick a product, then an amount) can swap its content in place.
export function openSheet({ title, body, onClose }) {
  const root = document.getElementById('sheet-root');
  clear(root);
  const titleEl = h('h2', {}, title);
  const bodyEl = h('div', { class: 'sheet-body' }, body);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': S.common.close, onclick: () => close() }, icon('close'));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sheet-head' }, titleEl, closeBtn), bodyEl);
  const backdrop = h('div', { class: 'backdrop', onclick: () => close() });
  root.append(backdrop, sheet);
  document.body.classList.add('sheet-open');

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    sheet.remove();
    document.body.classList.remove('sheet-open');
    onClose?.();
  }
  return {
    close,
    el: sheet,
    setBody(node, newTitle) {
      if (newTitle) titleEl.textContent = newTitle;
      clear(bodyEl).append(node);
      bodyEl.scrollTop = 0;
    },
  };
}

let toastTimer = null;
export function toast(message, { actionLabel, onAction, ms = 4500 } = {}) {
  const root = document.getElementById('toast-root');
  clear(root);
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (actionLabel) {
    el.append(h('button', { type: 'button', onclick: () => { clearTimeout(toastTimer); el.remove(); onAction?.(); } }, actionLabel));
  }
  root.append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}
