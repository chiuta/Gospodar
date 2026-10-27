// Teste Gospodar 2.2.0: opțiuni de import CSV — coloane „Comision” și „Stare” (scădere comision, filtrare după stare), opționale și oprite implicit.
// Rulare: node tests/import-opts.test.mjs [filtru]   (Playwright din /opt/node-tools; rețea blocată)
// Notă: exemplele „Revolut” sunt sintetice, construite după coloanele documentate public de terți; nu sunt un export real.
import {createRequire} from 'module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const require = createRequire('/opt/node-tools/package.json');
const {chromium} = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_APP = 'file://' + path.join(HERE, '..', 'index.html');
const NOW_ISO = '2026-10-27T10:00:00+03:00';
const NOW = new Date(NOW_ISO).getTime();
const DAY = 86400000;
const only = process.argv[2];
const results = [];
async function T(name, fn) {
  if (only && !name.includes(only)) return;
  try { await fn(); results.push([name, true]); console.log('ok   ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 7).join('\n       ')); }
}
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'});
async function newPage() {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, locale: 'ro-RO', timezoneId: 'Europe/Bucharest', acceptDownloads: true});
  await ctx.route(/^https?:/, r => r.abort());
  const page = await ctx.newPage();
  page.errs = []; page.net = [];
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') page.errs.push(m.type() + ': ' + m.text()); });
  page.on('dialog', d => { page.errs.push('dialog nativ'); d.dismiss(); });
  page.on('request', r => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) page.net.push(u); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective)); });
  await page.clock.install({time: new Date(NOW_ISO)});
  page.ctx = ctx;
  await page.goto(URL_APP); await page.waitForSelector('#view h2');
  return page;
}
const E = (p, fn, arg) => p.evaluate(fn, arg);
const nav = async (p, v) => { await p.click(`#nav [data-v="${v}"]`); await p.waitForTimeout(100); };
async function clean(p) { assert.deepEqual(await p.evaluate(() => window.__csp), [], 'CSP'); assert.deepEqual(p.errs, [], 'erori'); assert.deepEqual(p.net, [], 'rețea'); }
async function seed(p) {
  return E(p, () => { const S = GOSPODAR.S; S.wipeAll(); const a = S.addAccount({name: 'Principal', cur: 'RON', open: 100000}); S.addTx({date: '2026-10-01', amt: -5000, acc: a.id, desc: 'TEST'}, true); S.commit('all'); GOSPODAR.U.go('dash', false); return a.id; });
}
const setMeta = (p, m) => E(p, m => { localStorage.setItem('fff.gospodar.backup', JSON.stringify(m)); GOSPODAR.U.updateHeader(); }, m);
const banner = p => E(p, () => { const e = document.getElementById('backupRemind'); return {hidden: e.hidden, text: e.textContent}; });


// Exemplu SINTETIC. Convenția „sold = sold anterior + sumă − comision” e aleasă pentru test; nu se pretinde că așa funcționează Revolut.
const H = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n';
const CSV = H
  + 'TOPUP,Current,2025-09-01 08:00:00,2025-09-01 08:00:01,Alimentare,100.00,0.00,EUR,COMPLETED,100.00\n'
  + 'CARD_PAYMENT,Current,2025-09-02 08:00:00,2025-09-02 08:00:01,Cafenea,-10.00,0.50,EUR,COMPLETED,89.50\n'
  + 'CARD_PAYMENT,Current,2025-09-03 08:00:00,,Magazin,-5.00,0.00,EUR,PENDING,89.50\n'
  + 'CARD_PAYMENT,Current,2025-09-04 08:00:00,2025-09-04 08:00:01,Taxi,-20.00,,EUR,completed,69.50\n'
  + 'TRANSFER,Current,2025-09-05 08:00:00,2025-09-05 08:00:01,Rambursat,-7.00,0.00,EUR,REVERTED,69.50\n';
async function toImport(p, csv) { await seed(p); await nav(p, 'imp'); await p.fill('#im-paste', csv); await p.waitForSelector('#imCfg:not([hidden])'); }
const info = p => E(p, () => { const I = GOSPODAR.U.imp; return {ok: I.info.ok, skipped: I.info.skipped, bal: I.info.bal, amts: I.built.map(r => Number(r.amt)), subFee: I.subFee, stateOn: I.stateOn, map: I.map}; });

await T('implicit: fără șablon, opțiunile nu apar și nimic nu se schimbă', async () => {
  const p = await newPage(); await toImport(p, CSV);
  assert.equal(await p.locator('[data-in=imsubfee], [data-in=imstateon]').count(), 0);
  const i = await info(p); assert.equal(i.map.fee, -1); assert.equal(i.map.state, -1);
  await clean(p); await p.ctx.close();
});

await T('șablon Revolut: Fee/State mapate, opțiunile apar dar sunt oprite; 5 rânduri valide', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  assert.equal(await p.locator('[data-in=imsubfee]').isChecked(), false); assert.equal(await p.locator('[data-in=imstateon]').isChecked(), false);
  assert.equal(await p.inputValue('#im-stateval'), 'COMPLETED');
  const i = await info(p); assert.equal(i.ok, 5); assert.equal(i.skipped, 0); assert.deepEqual(i.amts, [10000, -1000, -500, -2000, -700]);
  assert.match(await p.textContent('#imMap'), /nu putem verifica/);
  await clean(p); await p.ctx.close();
});

await T('scade comisionul: suma devine netă, comision gol = 0, verificarea soldurilor se îmbunătățește', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  const before = await info(p);
  await p.check('[data-in=imsubfee]'); await p.waitForTimeout(100);
  const after = await info(p);
  assert.deepEqual(after.amts, [10000, -1050, -500, -2000, -700]);
  assert.ok(after.bal.ok > before.bal.ok, JSON.stringify([before.bal, after.bal]));
  await p.uncheck('[data-in=imsubfee]'); await p.waitForTimeout(80);
  assert.deepEqual((await info(p)).amts, before.amts);
  await clean(p); await p.ctx.close();
});

await T('filtru de stare: ignoră ≠ valoare (fără majuscule), afișează câte rânduri a ignorat', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  await p.check('[data-in=imstateon]'); await p.waitForTimeout(100);
  let i = await info(p); assert.equal(i.ok, 3); assert.equal(i.skipped, 2); assert.deepEqual(i.amts, [10000, -1000, -2000]);
  assert.match(await p.textContent('#imPrev'), /2 rânduri ignorate după stare/);
  await p.fill('#im-stateval', 'pending'); await p.waitForTimeout(100);
  i = await info(p); assert.equal(i.ok, 1); assert.equal(i.skipped, 4);
  await p.fill('#im-stateval', ''); await p.waitForTimeout(100);
  i = await info(p); assert.equal(i.ok, 5, 'valoare goală = fără filtru');
  await clean(p); await p.ctx.close();
});

await T('importul efectiv respectă opțiunile (rândurile ignorate nu intră)', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  await p.check('[data-in=imstateon]'); await p.check('[data-in=imsubfee]'); await p.waitForTimeout(100);
  await p.click('[data-act=imdo]'); await p.waitForTimeout(200);
  const txs = await E(p, () => GOSPODAR.S.data().txs.map(t => [t.date, Number(t.amt)]).sort());
  assert.deepEqual(txs, [['2025-09-01', 10000], ['2025-09-02', -1050], ['2025-09-04', -2000], ['2026-10-01', -5000]]);
  await clean(p); await p.ctx.close();
});

await T('dezactivarea coloanei Fee/State oprește opțiunea corespunzătoare', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  await p.check('[data-in=imsubfee]'); await p.check('[data-in=imstateon]'); await p.waitForTimeout(100);
  await p.selectOption('#im-fee', '-1'); await p.waitForTimeout(100);
  let i = await info(p); assert.equal(i.subFee, false); assert.equal(i.stateOn, true); assert.equal(await p.locator('[data-in=imsubfee]').count(), 0);
  await p.selectOption('#im-state', '-1'); await p.waitForTimeout(100);
  i = await info(p); assert.equal(i.stateOn, false); assert.equal(i.ok, 5); assert.equal(await p.locator('[data-in=imstateon]').count(), 0);
  await clean(p); await p.ctx.close();
});

await T('profil salvat păstrează opțiunile (comision, stare, valoare)', async () => {
  const p = await newPage(); await toImport(p, CSV); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  await p.check('[data-in=imsubfee]'); await p.check('[data-in=imstateon]'); await p.fill('#im-stateval', 'COMPLETED'); await p.waitForTimeout(100);
  await p.click('[data-act=improfsave]'); await p.waitForSelector('dialog[open] #pf-name'); await p.fill('#pf-name', 'Rev cu opțiuni'); await p.click('dialog[open] [data-dk=ok]'); await p.waitForTimeout(100);
  await p.fill('#im-paste', ''); await p.fill('#im-paste', CSV); await p.waitForSelector('#imCfg:not([hidden])');
  assert.equal((await info(p)).subFee, false, 'fișier nou → opțiuni oprite');
  await p.selectOption('#im-prof', {label: 'Rev cu opțiuni'}); await p.waitForTimeout(150);
  const i = await info(p); assert.equal(i.subFee, true); assert.equal(i.stateOn, true); assert.equal(i.ok, 3); assert.deepEqual(i.amts, [10000, -1050, -2000]);
  await clean(p); await p.ctx.close();
});

await T('motor: comision invalid → eroare badamt; comision negativ tratat ca modul; stare cu spații', async () => {
  const p = await newPage();
  const r = await E(p, () => { const G = GOSPODAR.G; const rows = [['d', 'a', 'f', 's'], ['2025-09-01', '-10.00', 'abc', 'OK'], ['2025-09-02', '-10.00', '-0.50', ' ok '], ['2025-09-03', '-10.00', '', 'NO']];
    const o = G.buildImportRows({ rows, start: 0, header: true, map: {date: 0, amount: 1, debit: -1, credit: -1, desc: -1, desc2: -1, balance: -1, fee: 2, state: 3}, dateFmt: 'YYYY-MM-DD', numFmt: 'us', cur: 'EUR', invert: false, subFee: true, stateOn: true, stateVal: 'ok' });
    return {n: o.length, skipped: o.skipped, rows: o.map(x => [x.err, x.amt == null ? null : Number(x.amt)])}; });
  assert.equal(r.skipped, 1); assert.equal(r.rows.length, 2); assert.equal(r.rows[0][0], 'badamt'); assert.deepEqual(r.rows[1], [null, -1050]);
  await clean(p); await p.ctx.close();
});

await T('i18n: cheile noi există în 8 limbi, fără chei brute', async () => {
  const p = await newPage();
  const bad = await E(p, () => { const G = GOSPODAR.G; const out = []; const keys = ['imp_fee', 'imp_state', 'imp_subfee', 'imp_stateon', 'imp_stateval', 'imp_skipped', 'imp_opt_help', 'imp_tpl_note']; for (const l of G.LANGS) { G.setLang(l); keys.forEach(k => { const v = G.t(k, {n: 1}); if (!v || v === k || /^imp_/.test(v)) out.push(l + ':' + k); }); } G.setLang('ro'); return out; });
  assert.deepEqual(bad, []);
  await clean(p); await p.ctx.close();
});

await browser.close();
const bad = results.filter(r => !r[1]);
console.log(`\n${results.length - bad.length}/${results.length} teste verzi`);
process.exit(bad.length ? 1 : 0);
