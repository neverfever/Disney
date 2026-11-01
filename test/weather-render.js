// Renders the weather cards from WEATHER and screenshots them (smoke check for the 6-hourly weather update).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.goto('file://' + (require('fs').existsSync(path.resolve(__dirname, '..', 'index.html')) ? path.resolve(__dirname, '..', 'index.html') : path.resolve(__dirname, '..', 'disney-5-day-plan.html')));
  const days = await p.$$eval('#daylist .day', es => es.map(x => x.dataset.park + ':' + x.querySelector('.rain').className.replace('rain ', '') + ':' + x.querySelector('.rain').textContent));
  console.log('days:', days.join(' | '));
  if (days.length !== 5) { console.error('expected 5 day cards'); process.exitCode = 1; }
  console.log(await p.textContent('#wxMeta'));
  await p.screenshot({ path: path.resolve(__dirname, 'out', '07-weather.png') });
  await b.close();
})();
