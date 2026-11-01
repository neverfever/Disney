// End-to-end test of the shared-annotation page against an in-memory mock of the Supabase REST API.
// Two browser contexts (爸爸, 妈妈) share the mock store; the test checks that marks flow both ways,
// that offline edits queue and flush, and that legacy localStorage ticks are imported.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.resolve(__dirname, '..', 'disney-5-day-plan.html');
const BASE = 'https://lvqexlphajdruidoapdu.supabase.co/rest/v1/wdw_marks';
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const store = new Map(); // key trip|item|person -> row
const log = { gets: 0, posts: [] };
let failNetwork = false;

async function mock(route) {
  const req = route.request();
  if (failNetwork) return route.abort('internetdisconnected');
  if (req.method() === 'GET') {
    log.gets++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...store.values()]) });
  }
  if (req.method() === 'POST') {
    const rows = JSON.parse(req.postData());
    log.posts.push(rows);
    for (const r of rows) {
      if (r.trip !== 'wdw-2026-11' || typeof r.item_id !== 'string' || typeof r.person !== 'string' || r.person.length > 20 || r.note.length > 500) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"check violation"}' });
      }
      store.set(`${r.trip}|${r.item_id}|${r.person}`, { ...r, updated_at: new Date().toISOString() });
    }
    return route.fulfill({ status: 201, body: '' });
  }
  return route.fulfill({ status: 405, body: '' });
}

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); console.log('ok  ', msg); }

(async () => {
  const browser = await chromium.launch();
  const mk = async (name, init) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(BASE + '**', mock);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.error('PAGE ERROR', name, e.message); process.exitCode = 1; });
    page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', name, m.text()); });
    if (init) await page.addInitScript(init);
    await page.goto(FILE);
    return { ctx, page };
  };

  // ---- 爸爸 ----
  const A = await mk('A');
  await A.page.waitForSelector('#whoModal:not([hidden])');
  await A.page.screenshot({ path: path.join(OUT, '01-modal.png') });
  await A.page.click('.whobtn:has-text("爸爸")');
  assert(await A.page.$('#whoModal[hidden]'), 'A: modal closes after choosing 爸爸');
  assert((await A.page.textContent('#meName')) === '爸爸', 'A: identity shown');
  // Today is 11/1 → rest-day tab opens by default
  assert((await A.page.getAttribute('#tabs button[data-park=rd]', 'aria-selected')) === 'true', 'A: opens on today\'s park (rd)');
  await A.page.check('input[data-id=rd-lego]');
  await A.page.waitForFunction(() => document.getElementById('n').textContent === '1');
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(store.has('wdw-2026-11|rd-lego|爸爸') && store.get('wdw-2026-11|rd-lego|爸爸').checked === true, 'A: tick upserted to server');
  await A.page.screenshot({ path: path.join(OUT, '02-A-ticked.png') });

  // ---- 妈妈 ----
  const B = await mk('B');
  await B.page.click('.whobtn:has-text("妈妈")');
  await B.page.waitForFunction(() => document.getElementById('others-rd-lego').textContent.includes('爸✓'), null, { timeout: 8000 });
  assert(true, 'B: sees 爸✓ chip on rd-lego');
  assert(!(await B.page.isChecked('input[data-id=rd-lego]')), 'B: own checkbox is NOT ticked by A\'s tick');
  await B.page.click('.favbtn[data-id=rd-lego]');
  await B.page.click('.toggle[aria-controls=more-rd-lego]');
  await B.page.fill('textarea.mynote[data-id=rd-lego]', '带雨披');
  await B.page.locator('textarea.mynote[data-id=rd-lego]').blur();
  await B.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  const bRow = store.get('wdw-2026-11|rd-lego|妈妈');
  assert(bRow && bRow.fav === true && bRow.note === '带雨披' && bRow.checked === false, 'B: star + note upserted, checked stays false');
  await B.page.screenshot({ path: path.join(OUT, '03-B-note.png') });

  // ---- A sees B's star and note after poll ----
  await A.page.waitForFunction(() => document.getElementById('others-rd-lego').textContent.includes('妈★'), null, { timeout: 8000 });
  assert(true, 'A: sees 妈★ chip');
  assert((await A.page.textContent('#others-rd-lego')).includes('备注 1'), 'A: sees 备注 1 chip');
  await A.page.click('#others-rd-lego .notechip');
  assert(await A.page.$('#more-rd-lego.open'), 'A: note chip expands details');
  assert((await A.page.textContent('#notes-rd-lego')).includes('带雨披'), 'A: sees B\'s note text');
  assert((await A.page.inputValue('textarea.mynote[data-id=rd-lego]')) === '', 'A: own note box stays empty');
  assert(await A.page.isChecked('input[data-id=rd-lego]'), 'A: own tick kept after merge');
  assert((await A.page.textContent('#othersLine')).includes('妈妈'), 'A: othersLine lists 妈妈');
  await A.page.screenshot({ path: path.join(OUT, '04-A-sees-B.png') });

  // ---- 只看 ★ filter uses anyone's star ----
  await A.page.click('#favOnly');
  assert(!(await A.page.$('#row-rd-lego.hidden')), 'A: favOnly keeps row starred by B');
  assert(await A.page.$('#row-rd-wod.hidden'), 'A: favOnly hides unstarred row');
  await A.page.click('#favOnly');

  // ---- offline: edits queue, then flush ----
  failNetwork = true;
  await A.page.check('input[data-id=rd-goofy]');
  await A.page.waitForFunction(() => /离线/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(true, 'A: offline status shown with pending change');
  assert(await A.page.isChecked('input[data-id=rd-goofy]'), 'A: offline tick stays ticked locally');
  const pend = await A.page.evaluate(() => JSON.parse(localStorage.getItem('wdw-plan-pending')));
  assert(pend && pend['爸爸|rd-goofy'] && pend['爸爸|rd-goofy'].checked === true, 'A: pending saved in localStorage');
  failNetwork = false;
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 10000 });
  assert(store.get('wdw-2026-11|rd-goofy|爸爸').checked === true, 'A: pending flushed after reconnect');

  // ---- reload keeps identity and marks ----
  await A.page.reload();
  assert(await A.page.$('#whoModal[hidden]'), 'A: no modal after reload');
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(await A.page.isChecked('input[data-id=rd-lego]'), 'A: tick restored after reload');
  assert((await A.page.textContent('#others-rd-lego')).includes('妈★'), 'A: chips restored after reload');

  // ---- clear this park only affects me ----
  A.page.once('dialog', d => d.accept());
  await A.page.click('#reset');
  await A.page.waitForFunction(() => document.getElementById('n').textContent === '0');
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(store.get('wdw-2026-11|rd-lego|爸爸').checked === false, 'A: clear writes checked=false');
  assert(store.get('wdw-2026-11|rd-lego|妈妈').fav === true, 'A: clear leaves 妈妈 untouched');

  // ---- legacy localStorage import ----
  const C = await mk('C', () => {
    localStorage.setItem('wdw-plan-checked', JSON.stringify({ peterpan: 1, dwarfs: 1, bogus: 1 }));
    localStorage.setItem('wdw-plan-fav', JSON.stringify({ dwarfs: 1 }));
  });
  await C.page.click('.whobtn:has-text("爷爷")');
  await C.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(store.get('wdw-2026-11|peterpan|爷爷').checked === true, 'C: legacy tick imported');
  const d = store.get('wdw-2026-11|dwarfs|爷爷');
  assert(d.checked === true && d.fav === true, 'C: legacy tick+fav imported');
  assert(!store.has('wdw-2026-11|bogus|爷爷'), 'C: unknown legacy id ignored');
  assert((await C.page.evaluate(() => localStorage.getItem('wdw-plan-checked'))) === null, 'C: legacy keys removed');

  // ---- custom name + switch identity ----
  await C.page.click('#switchMe');
  await C.page.fill('#whoInput', '小姨');
  await C.page.click('#whoOk');
  assert((await C.page.textContent('#meName')) === '小姨', 'C: custom name accepted');
  await C.page.click('#tabs button[data-park=mk]');
  assert(!(await C.page.isChecked('input[data-id=peterpan]')), 'C: switching identity shows the new person\'s (empty) marks');
  assert((await C.page.textContent('#others-peterpan')).includes('爷✓'), 'C: previous identity shows as another person');

  // ---- note clipped to 500 chars client-side ----
  await C.page.click('.toggle[aria-controls=more-peterpan]');
  await C.page.fill('textarea.mynote[data-id=peterpan]', 'x'.repeat(500));
  await C.page.evaluate(() => { const ta = document.querySelector('textarea.mynote[data-id=peterpan]'); ta.value = 'y'.repeat(600); ta.dispatchEvent(new Event('input')); });
  // maxlength prevents >500 via typing; the page itself also slices to 500, so this stays accepted
  await C.page.locator('textarea.mynote[data-id=peterpan]').blur();
  await C.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 8000 });
  assert(store.get('wdw-2026-11|peterpan|小姨').note.length === 500, 'C: note clipped to 500 before upload');

  await C.page.screenshot({ path: path.join(OUT, '05-C-mk.png'), fullPage: false });
  // dark mode screenshot
  await C.page.emulateMedia({ colorScheme: 'dark' });
  await C.page.screenshot({ path: path.join(OUT, '06-dark.png') });

  console.log('GETs', log.gets, 'POST batches', log.posts.length);
  await browser.close();
  console.log('ALL PASSED');
})().catch(e => { console.error(e); process.exit(1); });
