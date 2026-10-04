// Small pieces the screens share.
import { h, icon } from './dom.js';
import { S } from './strings.js';
import { addDays } from './engine.js';
import { relativeDay } from './format.js';

export function header(ctx, title, subtitle) {
  return h('header', { class: 'topbar' },
    h('div', {}, h('h1', {}, title), subtitle ? h('p', { class: 'sub' }, subtitle) : null),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': S.settings.open, onclick: () => ctx.go('settings') }, icon('settings')));
}

export function statusChip(status, text) {
  return h('span', { class: `chip ${status ?? ''}` }, text);
}

export function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));
}

// A card that can be tapped (a <div>, because it holds block content).
export function tapCard(className, onClick, ...children) {
  return h('div', {
    class: `card ${className} tap`, role: 'button', tabindex: '0', onclick: onClick,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
  }, ...children);
}

// A labelled text input. Returns { el, input } so a form can read the value.
export function textField({ label, value = '', placeholder = '', inputmode, hint, suffix, maxlength, autocapitalize = 'off', onInput, type = 'text' }) {
  const input = h('input', {
    type, value, placeholder, inputmode, maxlength, autocapitalize, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': label,
    oninput: (e) => onInput?.(e.target.value),
  });
  const el = h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('span', { class: 'field-row' }, input, suffix ? h('span', { class: 'suffix' }, suffix) : null),
    hint ? h('span', { class: 'hint' }, hint) : null);
  return { el, input };
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', class: o.value === value ? 'on' : '', 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value),
    }, o.label)));
}

// "◀ Today ▶": steps a day at a time, or opens the date picker by tapping the label.
export function dateSwitcher(ctx, date, onChange) {
  const today = ctx.today();
  const input = h('input', {
    type: 'date', value: date, max: today, 'aria-label': S.common.pickDate,
    onchange: (e) => { if (e.target.value) onChange(e.target.value); },
  });
  return h('div', { class: 'date-switch' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': S.common.prevDay, onclick: () => onChange(addDays(date, -1)) }, icon('left')),
    h('label', { class: 'date-label' }, h('span', {}, relativeDay(date, today, S.words)), input),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': S.common.nextDay, disabled: date >= today, onclick: () => onChange(addDays(date, 1)) }, icon('right')));
}

// Shows a message under a field or form, replacing the last one.
export function note(el, message, kind = 'error') {
  el.textContent = message ?? '';
  el.className = `note ${message ? kind : ''}`;
}
