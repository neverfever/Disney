// Swap Magic Kingdom and Animal Kingdom between 11/4 (周三) and 11/5 (周四) in index.html.
// Running it twice restores the original file. It changes only:
//   - DAY_PARK dates → park ids
//   - the park/title of the 周三 and 周四 entries in WEATHER.days (weather text stays with the date)
//   - the `day` label of the mk and ak objects in PARKS, and their order (chronological tabs)
// Weather wording, tips and item data are left for the editor to adjust afterwards.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'index.html');
let s = fs.readFileSync(file, 'utf8');

// 1. DAY_PARK
const dpRe = /var DAY_PARK = \{[^}]*\};/;
const dpM = s.match(dpRe);
if (!dpM) throw new Error('DAY_PARK not found');
const wed = /"2026-11-04": "(\w+)"/.exec(dpM[0]), thu = /"2026-11-05": "(\w+)"/.exec(dpM[0]);
if (!wed || !thu) throw new Error('DAY_PARK dates not found');
const pair = [wed[1], thu[1]].sort().join(',');
if (pair !== 'ak,mk') throw new Error('DAY_PARK 11/4,11/5 are not mk/ak: ' + wed[1] + ',' + thu[1]);
let dp = dpM[0].replace(`"2026-11-04": "${wed[1]}"`, `"2026-11-04": "${thu[1]}"`).replace(`"2026-11-05": "${thu[1]}"`, `"2026-11-05": "${wed[1]}"`);
s = s.replace(dpRe, dp);

// 2. WEATHER.days entries for 周三 / 周四: swap park + title, keep dow/date and the weather text
const wRe = /\{ park: "(mk|ak)", dow: "(周三|周四)", date: "(11\/4|11\/5)", title: "([^"]*)",/g;
const hits = [...s.matchAll(wRe)];
if (hits.length !== 2) throw new Error('expected 2 WEATHER entries for mk/ak, found ' + hits.length);
const [a, b] = hits;
const build = (h, park, title) => `{ park: "${park}", dow: "${h[2]}", date: "${h[3]}", title: "${title}",`;
s = s.slice(0, b.index) + build(b, a[1], a[4]) + s.slice(b.index + b[0].length);
s = s.slice(0, a.index) + build(a, b[1], b[4]) + s.slice(a.index + a[0].length);

// 3. PARKS: swap the day labels of the mk/ak objects and reverse their order
const startOf = (id) => s.indexOf(`\n{ id: "${id}", name:`);
const iMk = startOf('mk'), iAk = startOf('ak');
if (iMk < 0 || iAk < 0) throw new Error('PARKS mk/ak objects not found');
const first = Math.min(iMk, iAk), second = Math.max(iMk, iAk);
const end = s.indexOf('\n];', second);
if (end < 0) throw new Error('end of PARKS not found');
const strip = (t) => t.trim().replace(/,$/, '');
const swapDay = (t) => t.replace('day: "周三 11/4"', '\u0000').replace('day: "周四 11/5"', 'day: "周三 11/4"').replace('\u0000', 'day: "周四 11/5"');
const A = swapDay(strip(s.slice(first, second)));
const B = swapDay(strip(s.slice(second, end)));
if (!/day: "周[三四] 11\/[45]"/.test(A) || !/day: "周[三四] 11\/[45]"/.test(B)) throw new Error('day labels not found in mk/ak objects');
s = s.slice(0, first) + '\n' + B + ',\n\n' + A + s.slice(end);

fs.writeFileSync(file, s);
const now = /"2026-11-04": "(\w+)"/.exec(s)[1];
console.log('swapped: 11/4 → ' + now + ', 11/5 → ' + /"2026-11-05": "(\w+)"/.exec(s)[1]);
