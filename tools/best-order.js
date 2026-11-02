// Score every ordering of the parks on the still-movable days against the NWS hourly
// forecast and say whether reordering is worth it.
//   curl -sS -A "disney-plan (it@pangeo.com)" https://api.weather.gov/gridpoints/MLB/20,61/forecast/hourly > /tmp/hourly.json
//   node tools/best-order.js /tmp/hourly.json [index.html]
// Movable days: dates after tomorrow (Orlando time), so today and tomorrow never change
// and the family always has at least a day to rebook Lightning Lane.
// Cost of a park on a day = importance × sensitivity × (weighted max rain chance of
// the morning 8–12, afternoon 12–17 and evening 17–22 windows). Lower is better.
// Prints REORDER with a set-order.js command when the best ordering beats the current
// one by at least THRESHOLD points, otherwise KEEP.
const fs = require('fs');
const path = require('path');

const THRESHOLD = 10;
const PROFILE = {
  //            morning afternoon evening   why
  mk: { k: 1.3, w: [0.4, 0.4, 0.2] },   // longest, most outdoor day, parade + fireworks; the kids' main day
  ak: { k: 1.0, w: [0.85, 0.15, 0] },   // morning park (animals, Safari), closes early
  ep: { k: 0.8, w: [0.3, 0.4, 0.3] },   // indoor pavilions in the morning, World Showcase walk later
  hs: { k: 0.4, w: [0.35, 0.4, 0.25] }, // mostly indoor shows and rides
  rd: { k: 0.3, w: [0.4, 0.4, 0.2] },
};

const hourlyFile = process.argv[2];
const file = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '..', 'index.html');
if (!hourlyFile) throw new Error('usage: best-order.js hourly.json [index.html]');
const hourly = JSON.parse(fs.readFileSync(hourlyFile, 'utf8'));
const html = fs.readFileSync(file, 'utf8');
const dayPark = JSON.parse(html.match(/var DAY_PARK = (\{[^}]*\});/)[1]);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDay = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tomorrow = addDay(today, 1);

// max PoP per window, per local date (startTime carries the local offset)
const win = {};
for (const p of hourly.properties.periods) {
  const day = p.startTime.slice(0, 10), h = +p.startTime.slice(11, 13);
  const pop = (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) || 0;
  const i = h >= 8 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : -1;
  if (i < 0) continue;
  (win[day] = win[day] || [null, null, null])[i] = Math.max(win[day][i] == null ? 0 : win[day][i], pop);
}
const cost = (park, day) => {
  const pr = PROFILE[park], w = win[day];
  if (!pr || !w || w.some(v => v == null)) return null;
  return pr.k * (pr.w[0] * w[0] + pr.w[1] * w[1] + pr.w[2] * w[2]);
};

const movable = Object.keys(dayPark).filter(d => d > tomorrow && win[d] && win[d].every(v => v != null)).sort();
for (const d of Object.keys(dayPark).sort()) {
  const w = win[d];
  console.log(`${d} ${dayPark[d]}  rain% morning/afternoon/evening = ${w ? w.map(v => v == null ? '-' : v).join('/') : 'no data'}${movable.includes(d) ? '' : '  (locked)'}`);
}
if (movable.length < 2) { console.log('KEEP: fewer than two movable days'); process.exit(0); }

const parks = movable.map(d => dayPark[d]);
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));
const total = (order) => order.reduce((t, park, i) => t + cost(park, movable[i]), 0);
const current = total(parks);
let best = parks, bestCost = current;
for (const o of perms(parks)) { const c = total(o); if (c < bestCost - 1e-9) { best = o; bestCost = c; } }
console.log(`current ${movable.map((d, i) => d.slice(5) + ' ' + parks[i]).join(', ')}  cost ${current.toFixed(1)}`);
console.log(`best    ${movable.map((d, i) => d.slice(5) + ' ' + best[i]).join(', ')}  cost ${bestCost.toFixed(1)}`);
const gain = current - bestCost;
if (gain >= THRESHOLD) {
  const changed = movable.filter((d, i) => best[i] !== parks[i]);
  console.log(`REORDER (better by ${gain.toFixed(1)} ≥ ${THRESHOLD}): node tools/set-order.js ${changed.map(d => d + '=' + best[movable.indexOf(d)]).join(' ')}`);
} else {
  console.log(`KEEP (best is only ${gain.toFixed(1)} better, threshold ${THRESHOLD})`);
}
