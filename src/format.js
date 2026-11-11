// Number formatting for the UI. Pure, no DOM.
const UNITS = ['K', 'M', 'B', 'T'];
export const FMT_CAP = 1e15; // at or above this we show a capped label instead of a huge number

export function fmt(n) {
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return '0';
  if (n >= FMT_CAP) return '999T+';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  let i = -1; let v = n;
  while (v >= 1000 && i < UNITS.length - 1) { v /= 1000; i++; }
  if (v >= 999.95) return '999T+';
  return v.toFixed(v < 10 ? 2 : 1) + UNITS[i];
}
