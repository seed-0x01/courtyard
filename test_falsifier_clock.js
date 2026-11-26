/* Pure JS fixture for the browser falsifier countdown.
 * Extracts the EXACT functions from the served HTML between the markers, so the
 * test exercises the shipped code rather than a hand-drawn copy.
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

/* ---- loader fixture: the SERVED IIFE re-fetches on the 60s tick ---- */
function between(startMark, endMark) {
  const s = html.indexOf(startMark), e = html.indexOf(endMark);
  if (s < 0 || e < 0 || e <= s) throw new Error('loader markers missing: ' + startMark);
  return html.slice(s + startMark.length, e);
}
function El() {
  this._text = ''; this.children = []; this.style = {}; this.className = '';
}
Object.defineProperty(El.prototype, 'textContent', {
  get() { return this._text; },
  set(v) { this._text = String(v); if (v === '') this.children = []; }
});
El.prototype.appendChild = function (c) { this.children.push(c); return c; };

async function loaderFixture() {
  const loaderSrc = between('/* FALSIFIER_LOADER_START */', '/* FALSIFIER_LOADER_END */');
  const list = new El(), read = new El();
  const document = {
    getElementById: id => id === 'falsifier-list' ? list : id === 'falsifier-read' ? read : null,
    createElement: () => new El()
  };
  let calls = 0, payload = null, tick = null, interval = null;
  const fetchStub = () => {
    calls++;
    const p = payload;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(p) });
  };
  const setIntervalStub = (cb, ms) => { tick = cb; interval = ms; };
  const snap = (read_utc, seraOwner, seraKill, seraSource, soulKill) => ({
    read_utc: read_utc,
    falsifiers: [
      { owner: seraOwner, kill_utc: seraKill, days_left: null,
        source: seraSource, state: seraKill ? 'ok' : 'unobserved' },
      { owner: 'soul#5', kill_utc: soulKill, days_left: null,
        source: 'github:seed-0x01/soul#5', state: soulKill ? 'ok' : 'unobserved' }
    ]
  });
  payload = snap('2026-11-26T12:00:00Z', 'sera', '2026-11-27T00:00:00Z',
                 'board:t_2e7d5b58', '2026-12-01T00:00:00Z');
  new Function('document', 'fetch', 'setInterval',
               src + '\n' + loaderSrc)(document, fetchStub, setIntervalStub);
  const flush = () => new Promise(r => setImmediate(r));
  await flush(); await flush(); await flush();
  if (interval !== 60000 || typeof tick !== 'function') {
    throw new Error('expected one 60s timer, got interval=' + interval);
  }
  const h0 = list.children[0].children[0].textContent;
  const m0 = list.children[0].children[1].textContent;
  if (!h0.includes('2026-11-27T00:00:00Z')) throw new Error('initial kill not rendered: ' + h0);
  if (read.textContent !== 'read 2026-11-26T12:00:00Z') {
    throw new Error('initial read-date not rendered: ' + read.textContent);
  }
  const other0 = list.children[1].children[0].textContent;

  // Mutate a temp source snapshot, then let the 60s tick re-fetch it.
  payload = snap('2026-11-26T12:01:00Z', 'sera (temp)', '2026-11-28T00:00:00Z',
                 'board:temp-mutated', '2026-12-01T00:00:00Z');
  tick();
  await flush(); await flush(); await flush();
  const h1 = list.children[0].children[0].textContent;
  const m1 = list.children[0].children[1].textContent;
  if (calls < 2) throw new Error('60s tick did not re-fetch /api/falsifiers (calls=' + calls + ')');
  if (!h1.includes('2026-11-28T00:00:00Z')) throw new Error('changed kill did not propagate: ' + h1);
  if (!h1.includes('sera (temp)')) throw new Error('changed owner did not propagate: ' + h1);
  if (!m1.includes('board:temp-mutated')) throw new Error('changed source did not propagate: ' + m1);
  if (read.textContent !== 'read 2026-11-26T12:01:00Z') {
    throw new Error('read-date did not refresh: ' + read.textContent);
  }
  if (list.children[1].children[0].textContent !== other0) {
    throw new Error('unchanged clock drifted across the tick');
  }
  if (!m1.includes('days left')) throw new Error('countdown not rendered after refresh: ' + m1);

  // An unobserved kill stays unobserved after a refresh, never a typed number.
  payload = snap('2026-11-26T12:02:00Z', 'sera', null, 'board:t_2e7d5b58', null);
  tick();
  await flush(); await flush(); await flush();
  const h2 = list.children[0].children[0].textContent;
  const m2 = list.children[0].children[1].textContent;
  if (!h2.includes('unobserved') || !m2.includes('days-left unobserved')) {
    throw new Error('unobserved became a number: ' + h2 + ' / ' + m2);
  }

  console.log('PASS loader JS: 60s tick re-fetched (' + calls + ' calls); changed owner/kill/source/read-date propagated within the tick (' + h0 + ' -> ' + h1 + '); unchanged clock stable; unobserved stayed null');
}
loaderFixture().catch(e => { console.error('FAIL loader JS: ' + e.message); process.exit(1); });
