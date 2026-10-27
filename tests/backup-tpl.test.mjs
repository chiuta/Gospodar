// Teste Gospodar 2.1.0: reamintire pentru copia de siguranță, export criptat (AES-GCM + PBKDF2) și șabloane de pornire pentru import CSV.
// Rulare: node tests/backup-tpl.test.mjs [filtru]   (Playwright din /opt/node-tools; rețea blocată)
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

await T('i18n: toate cheile noi există în 8 limbi', async () => {
  const p = await newPage();
  const bad = await E(p, () => { const G = GOSPODAR.G; const out = []; const keys = Object.keys(G.DICT).filter(k => /^(bkr_|imp_tpl)/.test(k)); for (const l of G.LANGS) { G.setLang(l); keys.forEach(k => { const v = G.t(k, {n: 1, d: 'x', e: ''}); if (!v || v === k) out.push(l + ':' + k); }); } G.setLang('ro'); return {out, n: keys.length}; });
  assert.deepEqual(bad.out, []); assert.ok(bad.n >= 20, 'chei: ' + bad.n);
  await clean(p); await p.ctx.close();
});

await T('reamintire: fără date → ascunsă; niciodată salvat, după 30 de zile → apare', async () => {
  const p = await newPage();
  await setMeta(p, {first: NOW - 40 * DAY, mod: NOW}); assert.equal((await banner(p)).hidden, true, 'fără conturi/tranzacții');
  await seed(p);
  await setMeta(p, {first: NOW - 10 * DAY, mod: NOW}); assert.equal((await banner(p)).hidden, true, 'prea devreme');
  await setMeta(p, {first: NOW - 31 * DAY, mod: NOW}); const b = await banner(p);
  assert.equal(b.hidden, false); assert.match(b.text, /Nu ai făcut încă nicio copie de siguranță \(folosești aplicația de 31 zile\)/);
  assert.equal(await p.locator('#backupRemind button').count(), 4);
  await clean(p); await p.ctx.close();
});

await T('reamintire: copie veche + modificări → apare; fără modificări → nu; amânare 7 zile; oprire din setări', async () => {
  const p = await newPage(); await seed(p);
  await setMeta(p, {last: NOW - 40 * DAY, mod: NOW - 1 * DAY}); let b = await banner(p);
  assert.equal(b.hidden, false); assert.match(b.text, /acum 40 zile/); assert.match(b.text, /17\.09\.2026/);
  await setMeta(p, {last: NOW - 40 * DAY, mod: NOW - 41 * DAY}); assert.equal((await banner(p)).hidden, true, 'nicio modificare de la copie');
  await setMeta(p, {last: NOW - 40 * DAY, mod: NOW - 1 * DAY}); await p.click('#backupRemind [data-act=bksnooze]');
  assert.equal((await banner(p)).hidden, true);
  const m = await E(p, () => JSON.parse(localStorage.getItem('fff.gospodar.backup')));
  assert.ok(Math.abs(m.snooze - (NOW + 7 * DAY)) < 60000, 'snooze ' + m.snooze);
  await E(p, () => GOSPODAR.U.updateHeader()); assert.equal((await banner(p)).hidden, true, 'încă amânat');
  await p.clock.fastForward(8 * DAY); await E(p, () => GOSPODAR.U.updateHeader()); assert.equal((await banner(p)).hidden, false, 'după amânare');
  await nav(p, 'set'); await p.selectOption('#set-bk', '0'); assert.equal((await banner(p)).hidden, true, 'oprit');
  assert.equal((await E(p, () => JSON.parse(localStorage.getItem('fff.gospodar.backup')))).remind, 0);
  await p.selectOption('#set-bk', '14'); assert.equal((await banner(p)).hidden, false, 'reactivat la 14 zile');
  await clean(p); await p.ctx.close();
});

await T('modificările actualizează marcajul mod; nu e inclus în setul de date exportat', async () => {
  const p = await newPage(); await seed(p);
  await setMeta(p, {last: NOW - 40 * DAY, mod: NOW - 41 * DAY});
  await E(p, () => { GOSPODAR.S.addTx({date: '2026-10-20', amt: -100, acc: GOSPODAR.S.data().accounts[0].id, desc: 'NOU'}, true); GOSPODAR.S.commit('tx'); });
  assert.ok((await E(p, () => JSON.parse(localStorage.getItem('fff.gospodar.backup')))).mod >= NOW);
  await p.clock.fastForward(600); // salvarea (350 ms) emite „saved” și reevaluează banerul
  assert.equal((await banner(p)).hidden, false);
  const bundle = await E(p, () => JSON.stringify(GOSPODAR.bundleObj()));
  assert.ok(!bundle.includes('fff.gospodar.backup'));
  await clean(p); await p.ctx.close();
});

await T('export criptat: parametri, rotunjire AES-GCM + PBKDF2, parolă greșită eșuează, marchează copia', async () => {
  const p = await newPage(); await seed(p);
  await nav(p, 'set'); const vt = await p.textContent('#view'); assert.match(vt, /AES-GCM pe 256 de biți.*PBKDF2-SHA256 \(600\.000 de iterații\)/); assert.match(vt, /nu a fost auditată de terți/);
  await p.click('[data-act=exportenc]'); await p.waitForSelector('dialog[open] #pw1');
  await p.fill('#pw1', 'parola-de-test-1'); await p.fill('#pw2', 'parola-de-test-1');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('dialog[open] [data-dk=ok]')]);
  assert.match(dl.suggestedFilename(), /^gospodar-.*\.enc\.fff\.json$/);
  const txt = fs.readFileSync(await dl.path(), 'utf8'); const blob = JSON.parse(txt);
  assert.equal(blob.format, 'fff-bundle-enc'); assert.equal(blob.kdf, 'PBKDF2-SHA256'); assert.equal(blob.iter, 600000);
  const b64len = s => Buffer.from(s, 'base64').length;
  assert.equal(b64len(blob.salt), 16); assert.equal(b64len(blob.iv), 12);
  assert.ok(!txt.includes('TEST') && !txt.includes('Principal'), 'fără text clar în fișier');
  const ok = await E(p, async ([b, pw]) => { const r = await GOSPODAR.G.decryptBlob(b, pw); const o = JSON.parse(r.plain); const d = JSON.parse(o.data['fff.gospodar.data']); return {fmt: o.format, app: o.app, hasTx: JSON.stringify(d).includes('TEST')}; }, [blob, 'parola-de-test-1']);
  assert.deepEqual(ok, {fmt: 'fff-bundle', app: 'gospodar', hasTx: true});
  const wrong = await E(p, async ([b]) => { try { await GOSPODAR.G.decryptBlob(b, 'alta-parola-123'); return 'decriptat'; } catch (e) { return 'eșuat'; } }, [blob]);
  assert.equal(wrong, 'eșuat');
  const tam = JSON.parse(txt); const ct = Buffer.from(tam.ct, 'base64'); ct[5] ^= 1; tam.ct = ct.toString('base64');
  assert.equal(await E(p, async ([b]) => { try { await GOSPODAR.G.decryptBlob(b, 'parola-de-test-1'); return 'decriptat'; } catch (e) { return 'eșuat'; } }, [tam]), 'eșuat', 'text cifrat modificat');
  const m = await E(p, () => JSON.parse(localStorage.getItem('fff.gospodar.backup')));
  assert.equal(m.lastEnc, true); assert.ok(Math.abs(m.last - NOW) < 60000, 'last ' + m.last);
    await nav(p, 'dash'); await nav(p, 'set'); assert.match(await p.textContent('#bkLast'), /27\.10\.2026/); assert.match(await p.textContent('#bkLast'), /criptată/);
  await clean(p); await p.ctx.close();
});

await T('export criptat: reimport în aplicație (rotunjire completă)', async () => {
  const p = await newPage(); await seed(p);
  const blobTxt = await E(p, async () => { const r = await GOSPODAR.G.encryptWithPass(JSON.stringify(GOSPODAR.bundleObj()), 'parolă-ț-123', {format: 'fff-bundle-enc', schema: 1, app: 'gospodar'}); return JSON.stringify(r.blob); });
  await E(p, () => GOSPODAR.S.wipeAll());
  // importBundleText cere parola prin dialog
  const pr = E(p, t => GOSPODAR.importBundleText(t), blobTxt);
  await p.waitForSelector('dialog[open] #pw1'); await p.fill('#pw1', 'parolă-ț-123'); await p.click('dialog[open] [data-dk=ok]');
  const r = await pr; assert.equal(r.nd.txs.length, 1); assert.equal(r.nd.accounts[0].name, 'Principal');
  await clean(p); await p.ctx.close();
});

const REV = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n'
  + 'TOPUP,Current,2025-09-04 08:04:10,2025-09-04 08:04:11,Payment from John,163.68,0.00,EUR,COMPLETED,170.09\n'
  + 'CARD_PAYMENT,Current,2025-09-05 12:30:00,2025-09-05 12:30:02,Coffee Shop,-3.50,0.00,EUR,COMPLETED,166.59\n'
  + 'CARD_PAYMENT,Current,2025-09-06 09:00:00,2025-09-06 09:00:05,"Market, Central",-1 234.50,0.00,EUR,COMPLETED,-1067.91\n';

async function toImport(p, csv) {
  await seed(p); await nav(p, 'imp');
  await p.fill('#im-paste', csv); await p.waitForSelector('#imCfg:not([hidden])');
}

await T('șablon Revolut: mapează după nume, data cu oră, zecimale cu punct', async () => {
  const p = await newPage(); await toImport(p, REV);
  assert.match(await p.textContent('#imCfg'), /Revolut \(antete în engleză\)/);
  assert.match(await p.textContent('#imCfg'), /Nu avem o specificație publică verificată|nu avem o specificație publică verificată/);
  await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  const st = await E(p, () => { const I = GOSPODAR.U.imp; return {map: I.map, dateFmt: I.dateFmt, numFmt: I.numFmt, header: I.header, sep: I.sep, rows: I.built.map(r => [r.date, r.amt, r.desc, r.err || ''])}; });
  assert.deepEqual(st.map, {date: 2, amount: 5, debit: -1, credit: -1, desc: 4, desc2: -1, balance: 9, fee: 6, state: 8});
  assert.equal(st.dateFmt, 'YYYY-MM-DD'); assert.equal(st.numFmt, 'us'); assert.equal(st.header, true); assert.equal(st.sep, ',');
  assert.deepEqual(st.rows.map(r => r.slice(0, 2)), [['2025-09-04', 16368], ['2025-09-05', -350], ['2025-09-06', -123450]], JSON.stringify(st.rows));
  assert.equal(st.rows[2][2], 'Market, Central'); assert.ok(st.rows.every(r => !r[3]));
  assert.match(await p.textContent('.toast, #toast'), /Șablon aplicat: Revolut/);
  await clean(p); await p.ctx.close();
});

await T('șablon Revolut: antete în altă limbă → se folosește ordinea coloanelor', async () => {
  const csv = REV.replace(/^[^\n]*\n/, 'Typ,Produkt,Datum zahájení,Datum dokončení,Popis,Částka,Poplatek,Měna,State,Zůstatek\n');
  const p = await newPage(); await toImport(p, csv); await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(100);
  const map = await E(p, () => GOSPODAR.U.imp.map);
  assert.deepEqual(map, {date: 2, amount: 5, debit: -1, credit: -1, desc: 4, desc2: -1, balance: 9, fee: 6, state: 8});
  assert.equal(await E(p, () => GOSPODAR.U.imp.info.ok), 3);
  await clean(p); await p.ctx.close();
});

await T('șablon BT/BCR/ING: doar setări românești + detectare; avertizare „de verificat”; fără mapare inventată', async () => {
  const csv = 'Data;Detalii tranzacție;Debit;Credit;Sold\n01.10.2026;PLATA POS MEGA IMAGE;123,45;;1.876,55\n02.10.2026;INCASARE SALARIU;;3.000,00;4.876,55\n';
  for (const id of ['bt', 'bcr', 'ing']) {
    const p = await newPage(); await toImport(p, csv);
    assert.match(await p.textContent(`#im-tpl option[value=${id}]`), /format de verificat/);
    await p.selectOption('#im-tpl', id); await p.waitForTimeout(100);
    const st = await E(p, () => { const I = GOSPODAR.U.imp; return {numFmt: I.numFmt, dateFmt: I.dateFmt, map: I.map, rows: I.built.map(r => [r.date, r.amt])}; });
    assert.equal(st.numFmt, 'eu'); assert.equal(st.dateFmt, 'DD.MM.YYYY');
    assert.deepEqual(st.rows, [['2026-10-01', -12345], ['2026-10-02', 300000]], id + JSON.stringify(st));
    await clean(p); await p.ctx.close();
  }
});

await T('șablon fără fișier încărcat → mesaj; profilurile existente merg în continuare', async () => {
  const p = await newPage(); await seed(p); await nav(p, 'imp');
  assert.equal(await p.locator('#imCfg').isHidden(), true);
  await p.fill('#im-paste', 'Data;Suma;Descriere\n01.10.2026;-10,00;Test\n'); await p.waitForSelector('#imCfg:not([hidden])');
  await p.click('[data-act=improfsave]'); await p.waitForSelector('dialog[open] #pf-name'); await p.fill('#pf-name', 'Profilul meu'); await p.click('dialog[open] [data-dk=ok]'); await p.waitForTimeout(100);
  await p.selectOption('#im-tpl', 'revolut'); await p.waitForTimeout(80);
  await p.selectOption('#im-prof', { label: 'Profilul meu' }); await p.waitForTimeout(80);
  assert.equal(await p.inputValue('#im-tpl'), '');
  assert.equal(await E(p, () => GOSPODAR.U.imp.info.ok), 1);
  await clean(p); await p.ctx.close();
});

await browser.close();
const bad = results.filter(r => !r[1]);
console.log(`\n${results.length - bad.length}/${results.length} teste verzi`);
process.exit(bad.length ? 1 : 0);
