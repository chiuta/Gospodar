// Teste Gospodar: import CSV pe fixture-uri GENERICE și SINTETICE (tests/fixtures/*.csv|tsv), generate cu Python (csv/codecs) de tests/fixtures/generate_csv.py.
// NU sunt exporturi bancare și nu imită formatul niciunei bănci. Rezultatul așteptat (<fișier>.expected.json) vine din datele sursă ale generatorului, nu din aplicație.
// Rulare: node tests/csv-fixtures.test.mjs [filtru]   (PW_ROOT, CHROMIUM_PATH)
import {createRequire} from 'module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(process.env.PW_ROOT || '/opt/node-tools/package.json');
const {chromium} = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const URL_APP = 'file://' + path.join(HERE, '..', 'index.html');
const only = process.argv[2];
let fail = 0, pass = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '\n       ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 900) : '')); } };
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox']});
const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, locale: 'ro-RO', timezoneId: 'Europe/Bucharest'});
await ctx.route(/^https?:/, (r) => r.abort());
const page = await ctx.newPage(); const errs = [], net = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('dialog'); d.dismiss(); });
page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) net.push(u); });
await page.goto(URL_APP); await page.waitForSelector('#view h2');
await page.evaluate(() => { const S = GOSPODAR.S; S.wipeAll(); S.addAccount({name: 'Principal', cur: 'RON', open: 0}); S.commit('all'); GOSPODAR.U.go('imp', false); });
await page.waitForSelector('#im-file');
async function load(name) {
  await page.evaluate(() => { GOSPODAR.U.imp.info = null; });
  await page.setInputFiles('#im-file', {name, mimeType: 'text/csv', buffer: fs.readFileSync(path.join(FX, name))});
  await page.waitForFunction(() => GOSPODAR.U.imp.info !== null, null, {timeout: 60000});
  return page.evaluate(() => { const I = GOSPODAR.U.imp; const iso = (d) => (d == null ? null : typeof d === 'string' ? d : d.iso || (d.y ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : JSON.stringify(d)));
    return {fmt: I.dateFmt, num: I.numFmt, sep: I.sep, enc: I.encUsed, header: I.header, skip: I.skip, ok: I.info.ok, errors: I.built.filter((r) => r.err).length,
      rows: I.built.filter((r) => !r.err).map((r) => ({date: iso(r.date), amt: Number(r.amt), desc: r.desc})), errs: I.built.filter((r) => r.err).map((r) => r.err)}; });
}
const files = fs.readdirSync(FX).filter((f) => f.endsWith('.expected.json') && !JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')).ambiguous).map((f) => f.replace(/\.expected\.json$/, '')).sort();
for (const f of files) {
  if (only && !f.includes(only)) continue;
  const E = JSON.parse(fs.readFileSync(path.join(FX, f + '.expected.json'), 'utf8'));
  const R = await load(f);
  if (E.tolerant_extra_rows) R.rows = R.rows.filter((r) => E.rows.some((e) => e.date === r.date && e.amt === r.amt)); // rândul cu ghilimele neînchise poate apărea în plus (cu textul rămas)
  const same = JSON.stringify(R.rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.amt - b.amt)) === JSON.stringify(E.rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.amt - b.amt));
  let why = '';
  if (!same) { const i = R.rows.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(E.rows[k])); why = `detectat: ${R.fmt}/${R.num}/${JSON.stringify(R.sep)}/${R.enc}/hdr=${R.header}/skip=${R.skip}; ${R.rows.length} vs ${E.rows.length} rânduri; primul diferit #${i}: ${JSON.stringify(R.rows[i])} vs ${JSON.stringify(E.rows[i])}`; }
  ok(f + ': ' + E.rows.length + ' tranzacții importate exact (dată, sumă în subunități, descriere)', same, why);
  if (E.errors !== undefined) ok(f + ': ' + E.errors + ' rânduri marcate cu eroare, ' + E.ok + ' bune', R.errors === E.errors && R.ok === E.ok, {errors: R.errors, ok: R.ok, errs: R.errs});
}
// ambiguități: autodetecția nu poate ști; utilizatorul corectează din controale și rezultatul devine exact
if (!only || 'ambiguous'.includes(only) || only.includes('ambig')) {
  const f = 'ambiguous_us_intent.csv', E = JSON.parse(fs.readFileSync(path.join(FX, f + '.expected.json'), 'utf8'));
  const R0 = await load(f);
  ok(f + ': autodetecția alege un format valid și nu aruncă (' + R0.fmt + ' / ' + R0.num + ')', ['DD/MM/YYYY', 'MM/DD/YYYY'].includes(R0.fmt) && ['eu', 'us'].includes(R0.num), R0);
  await page.selectOption('#im-datefmt', 'MM/DD/YYYY'); await page.selectOption('#im-numfmt', 'us');
  const R1 = await page.evaluate(() => { const I = GOSPODAR.U.imp; return I.built.filter((r) => !r.err).map((r) => ({date: typeof r.date === 'string' ? r.date : r.date && (r.date.iso || null), amt: Number(r.amt), desc: r.desc})); });
  ok(f + ': după alegerea manuală MM/DD/YYYY + 1,234.56 rezultatul este exact', JSON.stringify(R1) === JSON.stringify(E.rows), {R1, exp: E.rows});
}
// cap-coadă: import real din dialect european, apoi același conținut într-un alt dialect → toate marcate duplicate
if (!only || 'end2end'.includes(only) || only === 'e2e') {
  await page.evaluate(() => { const S = GOSPODAR.S; S.wipeAll(); S.addAccount({name: 'Principal', cur: 'RON', open: 0}); S.commit('all'); GOSPODAR.U.go('imp', false); });
  await page.waitForSelector('#im-file');
  const E = JSON.parse(fs.readFileSync(path.join(FX, 'semicolon_eu_bom.csv.expected.json'), 'utf8'));
  const R = await load('semicolon_eu_bom.csv'); ok('e2e: previzualizare 8 valide, 0 duplicate', R.ok === 8 && await page.evaluate(() => GOSPODAR.U.imp.info.dups) === 0);
  await page.click('[data-act="imdo"]'); await page.waitForTimeout(300);
  const tot = await page.evaluate(() => { const d = GOSPODAR.S.data(); return {n: d.txs.length, sum: d.txs.reduce((a, t) => a + Number(t.amt), 0)}; });
  ok('e2e: 8 tranzacții salvate, suma exactă (' + E.rows.reduce((a, r) => a + r.amt, 0) + ' subunități)', tot.n === 8 && tot.sum === E.rows.reduce((a, r) => a + r.amt, 0), tot);
  await page.evaluate(() => GOSPODAR.U.go('imp', false)); await page.waitForSelector('#im-file');
  await load('tab_us_mdy.tsv'); const d2 = await page.evaluate(() => GOSPODAR.U.imp.info);
  ok('e2e: același conținut în dialect US/TSV → 8 duplicate, 0 de importat', d2.dups === 8 && d2.toImport === 0, d2);
}
ok('fără erori de pagină', errs.length === 0, errs); ok('fără cereri de rețea', net.length === 0, net);
await browser.close();
console.log(`\nGospodar CSV fixture-uri: ${pass} ok, ${fail} eșuate`); process.exit(fail ? 1 : 0);
