/* Pure JS fixture for the browser falsifier countdown + elapsed label.
 * Extracts the EXACT functions from the served HTML between the markers, so the
 * test exercises the shipped code rather than a hand-drawn copy.
 * Run: node /opt/data/serve/test_falsifier_clock.js
 */
const fs = require('fs');
const html = fs.readFileSync('/opt/data/serve/atlas/index.html', 'utf8');
function between(startMark, endMark) {
  const s = html.indexOf(startMark), e = html.indexOf(endMark);
  if (s < 0 || e < 0 || e <= s) throw new Error('markers missing: ' + startMark);
  return html.slice(s + startMark.length, e);
}
const daysSrc = between('/* FALSIFIER_DAYS_FN_START */', '/* FALSIFIER_DAYS_FN_END */');
const labelSrc = between('/* FALSIFIER_LABEL_FN_START */', '/* FALSIFIER_LABEL_FN_END */');
const fn = new Function(daysSrc + '\n' + labelSrc + '\nreturn {d: falsifierDaysLeft, l: falsifierLabel};')();

const now = Date.parse('2026-11-27T08:00:00Z');
const past = '2026-11-26T11:23:31Z';   // elapsed relative to `now`
const future = '2026-11-28T00:00:00Z'; // live relative to `now`

// Source mutates elapsed -> future -> elapsed with the clock UNCHANGED.
const d1 = fn.d(past, now),   l1 = fn.l(past, d1, now);
const d2 = fn.d(future, now), l2 = fn.l(future, d2, now);
const d3 = fn.d(past, now),   l3 = fn.l(past, d3, now);
if (!(d1 < 0 && d2 > 0 && d3 < 0)) {
  throw new Error('days_left did not follow elapsed -> future -> elapsed: ' + d1 + ' ' + d2 + ' ' + d3);
}
if (!l1.includes('elapsed') || !l1.includes(past)) throw new Error('elapsed label missing source date: ' + l1);
if (!l2.includes('days left') || l2.includes('elapsed')) throw new Error('future label wrong: ' + l2);
if (!l3.includes('elapsed') || !l3.includes(past)) throw new Error('return to elapsed label wrong: ' + l3);
// An elapsed clock stays elapsed under an injected 60s tick — never a negative countdown.
const l4 = fn.l(past, fn.d(past, now + 60000), now + 60000);
if (!l4.includes('elapsed') || /-\d+(?:\.\d+)?\s+days/.test(l4)) {
  throw new Error('60s tick turned elapsed into a negative countdown: ' + l4);
}
// A far-future clock still counts down under the same tick.
const t0 = fn.l('2026-12-01T00:00:00Z', fn.d('2026-12-01T00:00:00Z', now), now);
const t1 = fn.l('2026-12-01T00:00:00Z', fn.d('2026-12-01T00:00:00Z', now + 61000), now + 61000);
if (!(t0.includes('days left') && t1.includes('days left') && fn.d('2026-12-01T00:00:00Z', now+61000) < fn.d('2026-12-01T00:00:00Z', now))) {
  throw new Error('60s tick did not shrink a live countdown: ' + t0 + ' -> ' + t1);
}
// Unobserved / bad source never becomes an invented number or a fake elapsed.
if (fn.l(null, fn.d(null, now), now) !== 'days-left unobserved' ||
    fn.l('not-a-date', fn.d('not-a-date', now), now) !== 'days-left unobserved') {
  throw new Error('unobserved kill_utc produced a label');
}
console.log('PASS pure JS: source elapsed->future->elapsed (' + d1 + ' -> ' + d2 + ' -> ' + d3 +
  '); 60s tick kept elapsed as elapsed; live countdown shrank; unobserved stayed unobserved');

/* ---- loader fixture: the SERVED IIFE re-fetches on the 60s tick ---- */
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
  // Injected clock: the fixture advances only when WE advance it by one 60s tick.
  const clock = { now: now };
  function FakeDate(x) { return x === undefined ? new Date(clock.now) : new Date(x); }
  FakeDate.now = () => clock.now;
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;

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
  // Start ELAPSED: sera kill already past relative to the injected clock.
  payload = snap('2026-11-27T07:00:00Z', 'sera', past, 'board:t_2e7d5b58', '2026-12-01T00:00:00Z');
  new Function('document', 'fetch', 'setInterval', 'Date',
               daysSrc + '\n' + labelSrc + '\n' + loaderSrc)(document, fetchStub, setIntervalStub, FakeDate);
  const flush = () => new Promise(r => setImmediate(r));
  await flush(); await flush(); await flush();
  if (interval !== 60000 || typeof tick !== 'function') {
    throw new Error('expected one 60s timer, got interval=' + interval);
  }
  const h0 = list.children[0].children[0].textContent;
  const m0 = list.children[0].children[1].textContent;
  if (!h0.includes(past)) throw new Error('initial elapsed source date not rendered: ' + h0);
  if (!m0.includes('elapsed') || m0.includes('days left')) throw new Error('initial elapsed label wrong: ' + m0);
  if (read.textContent !== 'read 2026-11-27T07:00:00Z') {
    throw new Error('initial read-date not rendered: ' + read.textContent);
  }
  const other0 = list.children[1].children[0].textContent;
  const soulM0 = list.children[1].children[1].textContent;

  // Mutate source to FUTURE, advance one injected 60s tick, re-fetch.
  payload = snap('2026-11-27T07:01:00Z', 'sera (temp)', future, 'board:temp-mutated', '2026-12-01T00:00:00Z');
  clock.now += 60000;
  tick();
  await flush(); await flush(); await flush();
  const h1 = list.children[0].children[0].textContent;
  const m1 = list.children[0].children[1].textContent;
  if (calls < 2) throw new Error('60s tick did not re-fetch /api/falsifiers (calls=' + calls + ')');
  if (!h1.includes(future)) throw new Error('changed kill did not propagate: ' + h1);
  if (!h1.includes('sera (temp)')) throw new Error('changed owner did not propagate: ' + h1);
  if (!m1.includes('board:temp-mutated')) throw new Error('changed source did not propagate: ' + m1);
  if (!m1.includes('days left') || m1.includes('elapsed')) throw new Error('future label not rendered after refresh: ' + m1);
  if (read.textContent !== 'read 2026-11-27T07:01:00Z') {
    throw new Error('read-date did not refresh: ' + read.textContent);
  }
  if (list.children[1].children[0].textContent !== other0) {
    throw new Error('unchanged clock drifted across the tick');
  }
  const soulM1 = list.children[1].children[1].textContent;
  // "Unchanged clock stable" = the verdict, kill date and source do not flip when
  // another row's source is mutated. The `as of` stamp legitimately advances with
  // the injected tick, so compare the stable parts, not the whole string.
  if (!soulM1.includes('days left') || soulM1.includes('elapsed') ||
      !soulM1.includes('github:seed-0x01/soul#5') || !soulM1.includes('state ok')) {
    throw new Error('unchanged soul clock flipped verdict/source/state across the tick: ' + soulM0 + ' -> ' + soulM1);
  }

  // Mutate source back to ELAPSED on another 60s tick.
  payload = snap('2026-11-27T07:02:00Z', 'sera', past, 'board:t_2e7d5b58', '2026-12-01T00:00:00Z');
  clock.now += 60000;
  tick();
  await flush(); await flush(); await flush();
  const h2 = list.children[0].children[0].textContent;
  const m2 = list.children[0].children[1].textContent;
  if (!h2.includes(past) || !m2.includes('elapsed') || m2.includes('days left')) {
    throw new Error('return to elapsed label failed: ' + h2 + ' / ' + m2);
  }

  // An unobserved kill stays unobserved after a refresh, never a typed number.
  payload = snap('2026-11-27T07:03:00Z', 'sera', null, 'board:t_2e7d5b58', null);
  tick();
  await flush(); await flush(); await flush();
  const h3 = list.children[0].children[0].textContent;
  const m3 = list.children[0].children[1].textContent;
  if (!h3.includes('unobserved') || !m3.includes('days-left unobserved')) {
    throw new Error('unobserved became a number: ' + h3 + ' / ' + m3);
  }

  console.log('PASS loader JS: 60s tick re-fetched (' + calls + ' calls); source elapsed->future->elapsed ' +
    '(label ' + m0.slice(0, 18) + ' -> ' + m1.slice(0, 18) + ' -> ' + m2.slice(0, 18) + '); ' +
    'owner/source/read-date propagated; unchanged clock stable; unobserved stayed null');
}
loaderFixture().catch(e => { console.error('FAIL loader JS: ' + e.message); process.exit(1); });
