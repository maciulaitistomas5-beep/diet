// How numbers and dates are written on screen. Fixed English names, so the output is the same on every device.
import { parseISODate, daysBetween } from './engine.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');
export const fmtKg = (n, digits = 1) => n.toFixed(digits);

// +0.4 / −0.4 / 0.0, with a real minus sign.
export function fmtSignedKg(n, digits = 1) {
  const r = Number(n.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}`;
}

export function fmtDate(iso) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateShort(iso) {
  const d = parseISODate(iso);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateLong(iso) {
  const d = parseISODate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

// "Today", "Yesterday", or "Fri 3 Oct".
export function relativeDay(iso, today, words) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return words.today;
  if (diff === 1) return words.yesterday;
  return fmtDateShort(iso);
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

export const isoForFile = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
