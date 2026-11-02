// Reassign which park is visited on which date.
//   node tools/set-order.js 2026-11-04=ak 2026-11-05=mk [path/to/index.html]
// The new mapping must be a permutation of the parks already scheduled on the
// dates you name. It updates, and only updates:
//   - DAY_PARK (date → park id; drives the default tab)
//   - WEATHER.days[*].park / title for those dates (the weather text stays with the date)
//   - the `day` label of each moved PARKS object, and the PARKS order (chronological tabs)
// Weather wording, intros and tips are left for the editor to rewrite afterwards.
// Applying the inverse mapping restores the file byte for byte.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const pairs = args.filter(a => /^\d{4}-\d{2}-\d{2}=\w+$/.test(a));
const fileArg = args.find(a => !/^\d{4}-\d{2}-\d{2}=\w+$/.test(a));
const file = fileArg ? path.resolve(fileArg) : path.resolve(__dirname, '..', 'index.html');
if (!pairs.length) throw new Error('usage: set-order.js YYYY-MM-DD=park ... [index.html]');
let s = fs.readFileSync(file, 'utf8');

// 1. DAY_PARK
const dpRe = /var DAY_PARK = (\{[^}]*\});/;
const dpM = s.match(dpRe);
if (!dpM) throw new Error('DAY_PARK not found');
const dayPark = JSON.parse(dpM[1]);
const want = {};
for (const p of pairs) { const [d, id] = p.split('='); want[d] = id; }
const dates = Object.keys(want);
for (const d of dates) if (!(d in dayPark)) throw new Error('date not in DAY_PARK: ' + d);
const before = dates.map(d => dayPark[d]).sort().join(',');
const after = dates.map(d => want[d]).sort().join(',');
if (before !== after) throw new Error(`not a permutation of the parks on those dates: had ${before}, asked ${after}`);
const next = Object.assign({}, dayPark, want);
const dpText = 'var DAY_PARK = { ' + Object.keys(next).map(k => `"${k}": "${next[k]}"`).join(', ') + ' };';
s = s.replace(dpRe, dpText);

// 2. WEATHER.days: park + title follow the park, dow/date/weather text stay with the date
const wRe = /\{ park: "(\w+)", dow: "([^"]+)", date: "(\d+)\/(\d+)", title: "([^"]*)",/g;
const entries = [...s.matchAll(wRe)];
const titleOf = {}, labelOf = {};
for (const e of entries) {
  titleOf[e[1]] = e[5];
  const iso = `2026-${String(e[3]).padStart(2, '0')}-${String(e[4]).padStart(2, '0')}`;
  labelOf[iso] = `${e[2]} ${e[3]}/${e[4]}`;
}
for (let i = entries.length - 1; i >= 0; i--) {
  const e = entries[i];
  const iso = `2026-${String(e[3]).padStart(2, '0')}-${String(e[4]).padStart(2, '0')}`;
  if (!(iso in want)) continue;
  const id = want[iso];
  if (!(id in titleOf)) throw new Error('no WEATHER title for park ' + id);
  const rep = `{ park: "${id}", dow: "${e[2]}", date: "${e[3]}/${e[4]}", title: "${titleOf[id]}",`;
  s = s.slice(0, e.index) + rep + s.slice(e.index + e[0].length);
}

// 3. PARKS: day labels + chronological order
const startTok = '\nvar PARKS = [';
const arrStart = s.indexOf(startTok);
if (arrStart < 0) throw new Error('PARKS not found');
const bodyStart = arrStart + startTok.length;
const bodyEnd = s.indexOf('\n];', bodyStart);
const body = s.slice(bodyStart, bodyEnd);
const starts = [];
const objRe = /\n\{ id: "(\w+)", name:/g;
let m;
while ((m = objRe.exec(body))) starts.push({ id: m[1], at: m.index });
if (!starts.length) throw new Error('no PARKS objects');
const chunks = starts.map((st, i) => {
  let t = body.slice(st.at, i + 1 < starts.length ? starts[i + 1].at : body.length);
  t = t.replace(/\s+$/, '').replace(/,$/, '');
  return { id: st.id, text: t.replace(/^\n/, '') };
});
const dateOf = {};
for (const [d, id] of Object.entries(next)) dateOf[id] = d;
for (const c of chunks) {
  const d = dateOf[c.id];
  if (!d) throw new Error('park not in DAY_PARK: ' + c.id);
  if (dates.includes(d)) {
    const lbl = labelOf[d];
    if (!lbl) throw new Error('no label for ' + d);
    const before = c.text;
    c.text = c.text.replace(/day: "[^"]*"/, `day: "${lbl}"`);
    if (before === c.text && !before.includes(`day: "${lbl}"`)) throw new Error('day label not found in ' + c.id);
  }
}
chunks.sort((a, b) => dateOf[a.id] < dateOf[b.id] ? -1 : dateOf[a.id] > dateOf[b.id] ? 1 : 0);
s = s.slice(0, bodyStart) + '\n' + chunks.map(c => c.text).join(',\n\n') + s.slice(bodyEnd);

fs.writeFileSync(file, s);
console.log('order now: ' + Object.keys(next).map(k => k.slice(5) + ' ' + next[k]).join(' | '));
