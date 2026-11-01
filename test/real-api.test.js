// Opens the page from file:// in headless Chromium and talks to the REAL Supabase table as person "测试".
// Leaves the row neutral (checked=false, fav=false, note='') so the family never sees it.
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + (require('fs').existsSync(path.resolve(__dirname, '..', 'index.html')) ? path.resolve(__dirname, '..', 'index.html') : path.resolve(__dirname, '..', 'disney-5-day-plan.html'));
const KEY = 'sb_publishable_kA3BmnYlgIhwi7jQKhuoow_QFW4eu49';
const URL = 'https://lvqexlphajdruidoapdu.supabase.co/rest/v1/wdw_marks';
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); console.log('ok  ', m); }
async function serverRow() {
  const r = await fetch(URL + '?select=item_id,person,checked,fav,note,updated_at&item_id=eq.rd-lego&person=eq.' + encodeURIComponent('测试'), { headers: { apikey: KEY } });
  return (await r.json())[0];
}
async function neutralize() {
  await fetch(URL + '?on_conflict=trip,item_id,person', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ trip: 'wdw-2026-11', item_id: 'rd-lego', person: '测试', checked: false, fav: false, note: '' }]) });
}

(async () => {
  const browser = await chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.error('PAGE ERROR', name, e.message); process.exitCode = 1; });
    page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', name, m.text()); });
    page.on('response', async r => { if (r.url().includes('supabase.co')) console.log('  ', name, r.request().method(), r.status(), (Date.now() - t0) + 'ms', r.request().method() === 'GET' ? (await r.text()).slice(0, 160) : ''); });
    await page.goto(FILE);
    return { ctx, page };
  };
  const t0 = Date.now();
  const A = await mk('A');
  await A.page.fill('#whoInput', '测试');
  await A.page.click('#whoOk');
  await A.page.click('#tabs button[data-park=rd]');
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 30000 });
  assert(true, 'A: first sync against the real server from file:// (origin null)');
  await A.page.check('input[data-id=rd-lego]');
  await A.page.click('.favbtn[data-id=rd-lego]');
  await A.page.waitForFunction(() => /同步中/.test(document.getElementById('syncText').textContent));
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 30000 });
  const row = await serverRow();
  console.log('server row after A wrote:', JSON.stringify(row));
  assert(row && row.checked === true && row.fav === true, 'A: real upsert persisted checked+fav');

  const B = await mk('B');
  await B.page.click('.whobtn:has-text("爸爸")');
  await B.page.click('#tabs button[data-park=rd]');
  try {
    await B.page.waitForFunction(() => document.getElementById('others-rd-lego').textContent.includes('测试✓★'), null, { timeout: 40000 });
    assert(true, 'B: second phone sees 测试✓★ from the real server');
  } finally {
    console.log('B others-rd-lego =', JSON.stringify(await B.page.textContent('#others-rd-lego')), 'status =', await B.page.textContent('#syncText'));
    console.log('B cache =', (await B.page.evaluate(() => localStorage.getItem('wdw-plan-cache') || '')).slice(0, 200));
  }
  await B.ctx.close();
  await A.page.uncheck('input[data-id=rd-lego]');
  await A.page.click('.favbtn[data-id=rd-lego]');
  await A.page.waitForFunction(() => /同步中/.test(document.getElementById('syncText').textContent));
  await A.page.waitForFunction(() => /已同步/.test(document.getElementById('syncText').textContent), null, { timeout: 30000 });
  await browser.close();
  await neutralize();
  console.log('final server row:', JSON.stringify(await serverRow()));
  console.log('REAL API PASSED');
})().catch(async e => { console.error(e); await neutralize(); process.exit(1); });
