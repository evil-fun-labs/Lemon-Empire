// Number formatting for the UI. Pure, no DOM.
const UNITS = ['K', 'M', 'B', 'T'];
export const FMT_CAP = 1e15; // at or above this we show a capped label instead of a huge number

// Two decimals under 10, one decimal from 10 up. Returns the rounded text.
const mantissa = (v) => {
  const two = v.toFixed(2);
  if (v < 10 && parseFloat(two) < 10) return two;
  return v.toFixed(1);
};

export function fmt(n) {
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return '0';
  if (n >= FMT_CAP) return '999T+';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  let i = -1; let v = n;
  while (v >= 1000 && i < UNITS.length - 1) { v /= 1000; i++; }
  let text = mantissa(v);
  // Rounding can push the mantissa to 1000 (999,950 -> "1000.0K"): carry into the next unit.
  if (parseFloat(text) >= 1000) {
    if (i >= UNITS.length - 1) return '999T+';
    v /= 1000; i++;
    text = mantissa(v);
  }
  return text + UNITS[i];
}
