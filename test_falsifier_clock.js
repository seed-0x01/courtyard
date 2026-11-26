/* Pure JS fixture for the browser falsifier countdown.
 * Extracts the EXACT function from the served HTML between the markers, so the
 * test exercises the shipped function rather than a hand-drawn copy.
 * Run: node /opt/data/serve/test_falsifier_clock.js
 */
const fs = require('fs');
const html = fs.readFileSync('/opt/data/serve/atlas/index.html', 'utf8');
const a = html.indexOf('/* FALSIFIER_DAYS_FN_START */');
const b = html.indexOf('/* FALSIFIER_DAYS_FN_END */');
if (a < 0 || b < 0 || b <= a) throw new Error('countdown function markers missing');
const src = html.slice(a + '/* FALSIFIER_DAYS_FN_START */'.length, b);
const fn = new Function(src + '\nreturn falsifierDaysLeft;')();

const now = Date.parse('2026-11-26T12:00:00Z');
const far = fn('2030-01-01T00:00:00Z', now);
const near = fn('2026-11-27T00:00:00Z', now);
if (!(far > 1000 && near > 0 && near < 2 && near < far)) {
  throw new Error('mutated kill_utc did not change countdown: far=' + far + ' near=' + near);
}
// Advancing the clock (as the 60s tick does) must shrink the same clock.
const t0 = fn('2026-12-01T00:00:00Z', now);
const t1 = fn('2026-12-01T00:00:00Z', now + 61000);
if (!(t1 < t0)) throw new Error('60s tick did not shrink days-left: ' + t0 + ' -> ' + t1);
// Unobserved / bad source never becomes an invented number.
if (fn(null, now) !== null || fn('not-a-date', now) !== null) {
  throw new Error('unobserved kill_utc produced a number');
}
console.log('PASS pure JS: mutated kill changed ' + far + ' -> ' + near +
  '; 61s tick shrank ' + t0 + ' -> ' + t1 + '; unobserved stayed null');
