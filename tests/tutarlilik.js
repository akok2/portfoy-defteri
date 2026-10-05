// Consistency test: one ledger, every place a number shows up must agree with each other and with values
// worked out by hand (see BEKLENEN). Screens: Özet, Pozisyonlar, hisse detayı, Vergi, bulunan temettüler;
// files: Excel export; mail: the morning report. Also checks that no sample/placeholder data is left anywhere.
// Run:  node tests/tutarlilik.js            (development build; on Linux under xvfb-run)
//       PD_EXE=... node tests/tutarlilik.js (packaged app)
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SMTPServer } = require('smtp-server');
const fixtures = require('./fixtures');

const ROOT = path.resolve(__dirname, '..');
const XLSX = require(path.join(ROOT, 'renderer', 'vendor', 'xlsx.full.min.js'));
const YAVAS = Number(process.env.PD_TEST_YAVAS || (process.env.CI ? 3 : 1));
const bekle = ms => new Promise(r => setTimeout(r, ms * YAVAS));
const sonuclar = [];
let bolum = '';
const kontrol = (ok, mesaj) => { sonuclar.push({ test: bolum, ok: !!ok, mesaj }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${bolum}] ${mesaj}`); };
const sayi = t => { const m = String(t || '').replace(/\s/g, '').match(/[-+−]?[\d.]+(,\d+)?/); return m ? Number(m[0].replace('−', '-').replace(/\./g, '').replace(',', '.')) : NaN; };
const esit = (a, b, tol = 0.006) => Number.isFinite(a) && Math.abs(a - b) <= tol;

// Made-up trades on codes the recorded prices cover: THYAO 312,50 · ASELS 141,20 · TUPRS 171,00 · SISE 44,10 · AFT 1,056 · USD 41,60
const ISLEMLER = [
  ['THYAO', '2026-01-12', 'Alış', 200, 260, 10.4], ['THYAO', '2026-02-16', 'Alış', 100, 290, 5.8], ['THYAO', '2026-04-14', 'Satış', 120, 305, 7.32],
  ['ASELS', '2026-01-20', 'Alış', 300, 110, 6.6], ['ASELS', '2026-06-15', 'Bedelsiz', 60, null, null],
  ['TUPRS', '2026-03-02', 'Alış', 50, 180, 1.8], ['TUPRS', '2026-05-04', 'Satış', 50, 165, 1.65],
  ['THYAO', '2026-06-01', 'Temettü', null, null, null, 489.6],
  ['SISE', '2026-02-02', 'Alış', 1000, 50, 10], ['AFT', '2026-03-10', 'Alış', 20000, 0.95, 0]
];
// Worked out by hand:
//  THYAO  avg (200×260 + 100×290)/300 = 270 · sold 120 × (305 − 270) = 4 200 · 180 left: cost 48 600, value 56 250, P/L 7 650 (15,7407 %)
//  ASELS  300 × 110 = 33 000, +60 bonus → 360 lots, avg 91,6667 · value 50 832, P/L 17 832 (54,0364 %)
//  TUPRS  50 × (165 − 180) = −750, closed
//  SISE   cost 50 000, value 44 100, P/L −5 900 (−11,8 %)
//  AFT    cost 19 000, value 21 120, P/L 2 120 (11,1579 %)
//  commissions 10,40 + 5,80 + 7,32 + 6,60 + 1,80 + 1,65 + 10,00 = 43,57 · dividend 489,60 net = 576,00 gross, 86,40 withheld
const POZ = {
  THYAO: { lot: 180, ort: 270, deger: 56250, kz: 7650, yuzde: 7650 / 48600, gerc: 4200, tem: 489.6 },
  ASELS: { lot: 360, ort: 33000 / 360, deger: 50832, kz: 17832, yuzde: 17832 / 33000, gerc: 0, tem: 0 },
  SISE: { lot: 1000, ort: 50, deger: 44100, kz: -5900, yuzde: -0.118, gerc: 0, tem: 0 },
  AFT: { lot: 20000, ort: 0.95, deger: 21120, kz: 2120, yuzde: 2120 / 19000, gerc: 0, tem: 0 }
};
const BEKLENEN = { deger: 172302, maliyet: 150600, kz: 21702, yuzde: 21702 / 150600, gerc: 3450, tem: 489.6, kom: 43.57, sonuc: 21702 + 3450 + 489.6 - 43.57, usd: 172302 / 41.6, brut: 576, stopaj: 86.4 };

async function baslat(ud, fx) {
  const exe = process.env.PD_EXE;
  const args = exe ? [] : [ROOT];
  if (process.platform === 'linux') args.push('--no-sandbox', '--password-store=basic');
  const app = await electron.launch({ executablePath: exe || require('electron'), args, env: { ...process.env, PD_USER_DATA: ud, PD_TEST_FIXTURES: fx }, timeout: 60000 });
  const w = await app.firstWindow();
  await w.waitForSelector('#tabs .tab', { timeout: 30000 });
  await bekle(1500);
  return { app, w };
}
const metin = async (w, sel) => ((await w.textContent(sel)) || '').replace(/\s+/g, ' ');
const sekme = async (w, ad) => { await w.click(`[data-tab="${ad}"]`); await bekle(300); };
const kpiler = w => w.evaluate(() => Object.fromEntries([...document.querySelectorAll('#main .kpi')].map(k => [k.querySelector('.label').textContent.trim(), [k.querySelector('.v').textContent.trim(), (k.querySelector('.d') || {}).textContent || '']])));
const qpCoz = s => Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
const tumMetin = async w => { let t = ''; for (const s of await w.$$eval('#tabs .tab', b => b.map(x => x.dataset.tab))) { await sekme(w, s); t += ' ' + await metin(w, '#main'); } return t; };

async function main() {
  const tmp = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'pd-tutarlilik-'));
  const fx = fixtures.build(path.join(tmp, 'fx'));
  const ud = path.join(tmp, 'veri');
  const mailler = [];
  const smtp = new SMTPServer({ authOptional: true, allowInsecureAuth: true, disabledCommands: ['STARTTLS'], onAuth(a, s, cb) { cb(null, { user: a.username }); },
    onData(stream, s, cb) { let d = ''; stream.on('data', c => d += c); stream.on('end', () => { mailler.push(d); cb(); }); } });
  await new Promise(r => smtp.listen(2527, '127.0.0.1', r));
  const { app, w } = await baslat(ud, fx);
  const errs = []; w.on('pageerror', e => errs.push(e.message));

  /* --- ledger from an Excel table --- */
  bolum = 'yükleme';
  const satirlar = [['Hisse', 'Tarih', 'İşlem Türü', 'Lot', 'Fiyat (TL)', 'Komisyon (TL)', 'Temettü (TL)', 'Aracı Kurum'],
    ...ISLEMLER.map(([k, t, tur, lot, f, kom, tem]) => [k, t.split('-').reverse().join('.'), tur, lot, f, kom, tem ?? null, 'Kurum A'])];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(satirlar), 'Islemler');
  const dosya = path.join(tmp, 'islemler.xlsx'); fs.writeFileSync(dosya, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', dosya); await bekle(1200);
  kontrol(/10 işlem/.test(await metin(w, '#modal')), 'önizleme 10 işlem');
  await w.click('[data-act="ice-uygula"]'); await bekle(1500);
  // SISE is not in the sample portfolio: its price must arrive by itself after the import
  await sekme(w, 'poz');
  for (let i = 0; i < 30 && !/44,10/.test(await metin(w, '#main')); i++) await bekle(300);
  kontrol(/44,10/.test(await metin(w, '#main')), 'Excel\'den gelen yeni kodun fiyatı güncellemeye basmadan geldi');
  await w.click('[data-act="fiyat-yenile"]'); await bekle(4000);
  for (let i = 0; i < 20 && !/Fiyatlar: \d/.test(await metin(w, '#chips')); i++) await bekle(500);

  /* --- Özet --- */
  bolum = 'özet';
  await sekme(w, 'ozet');
  const K = await kpiler(w);
  const kp = ad => sayi((K[ad] || [])[0]);
  kontrol(esit(kp('Portföy değeri'), BEKLENEN.deger), `portföy değeri ${K['Portföy değeri']?.[0]} = 172.302,00`);
  kontrol(esit(kp('Alış tutarı'), BEKLENEN.maliyet), `alış tutarı ${K['Alış tutarı']?.[0]} = 150.600,00`);
  kontrol(esit(kp('Kâğıt üstü kâr/zarar'), BEKLENEN.kz) && esit(sayi(K['Kâğıt üstü kâr/zarar']?.[1]), BEKLENEN.yuzde * 100, 0.006), `kâğıt üstü ${K['Kâğıt üstü kâr/zarar']?.join(' ')} = +21.702,00 (%14,41)`);
  kontrol(esit(kp('Gerçekleşen kâr/zarar'), BEKLENEN.gerc), `gerçekleşen ${K['Gerçekleşen kâr/zarar']?.[0]} = +3.450,00 (4.200 − 750)`);
  kontrol(esit(kp('Temettü'), BEKLENEN.tem), `temettü ${K['Temettü']?.[0]} = 489,60`);
  kontrol(esit(kp('Ödenen komisyon'), BEKLENEN.kom), `komisyon ${K['Ödenen komisyon']?.[0]} = 43,57`);
  kontrol(esit(kp('Toplam sonuç'), BEKLENEN.sonuc), `toplam sonuç ${K['Toplam sonuç']?.[0]} = +25.598,03`);
  kontrol(esit(sayi(K['Dolar karşılığı']?.[0]), Math.round(BEKLENEN.usd * 100) / 100), `dolar karşılığı ${K['Dolar karşılığı']?.[0]} = $4.141,88`);
  // dividends found: ASELS 04-10 (300 lots × 1,00) and THYAO 09-01 (180 × 2,00); THYAO 05-20 is already in the ledger (06-01)
  const tem = await metin(w, '#temettu-oneri').catch(() => '');
  const oneriNet = async (kod, tarih) => sayi(await w.inputValue(`#temettu-oneri tr:has-text("${tarih}"):has-text("${kod}") input`).catch(() => ''));
  kontrol(esit(await oneriNet('ASELS', '10.04.2026'), 255) && esit(await oneriNet('THYAO', '01.09.2026'), 306) && !/20\.05\.2026/.test(tem), 'bulunan temettüler: ASELS 255,00 ve THYAO 306,00 net; kayıtlı olan önerilmedi');

  /* --- Pozisyonlar --- */
  bolum = 'pozisyonlar';
  await sekme(w, 'poz');
  const tablo = await w.evaluate(() => { const t = document.querySelector('#main .panel table'); return { satir: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent.trim())), alt: [...t.querySelectorAll('tfoot td')].map(c => c.textContent.trim()) }; });
  for (const [kod, e] of Object.entries(POZ)) {
    const r = tablo.satir.find(x => x[0].startsWith(kod));
    kontrol(r && sayi(r[2]) === e.lot && esit(sayi(r[3]), Math.round(e.ort * 10000) / 10000, 0.0001) && esit(sayi(r[5]), e.deger) && esit(sayi(r[6]), e.kz) && esit(sayi(r[7]), Math.round(e.yuzde * 10000) / 100), `${kod} satırı: lot ${r?.[2]}, ort ${r?.[3]}, değer ${r?.[5]}, K/Z ${r?.[6]} ${r?.[7]}`);
  }
  kontrol(esit(sayi(tablo.alt[1]), BEKLENEN.deger) && esit(sayi(tablo.alt[2]), BEKLENEN.kz) && esit(sayi(tablo.alt[5]), BEKLENEN.gerc + 750) , `alt toplam = özet (değer ${tablo.alt[1]}, K/Z ${tablo.alt[2]}, eldekilerin gerçekleşeni ${tablo.alt[5]})`);
  kontrol(/Satıp kapattıklarım/.test(await metin(w, '#main')) && /-750,00 TL/.test(await metin(w, '#main')), 'TUPRS satıp kapattıklarımda, gerçekleşen −750,00');

  /* --- hisse detayı --- */
  bolum = 'detay';
  for (const [kod, e] of Object.entries(POZ)) {
    await w.click(`#main [data-detay="${kod}"]`); await bekle(300);
    const st = await w.evaluate(() => Object.fromEntries([...document.querySelectorAll('#overlay .stat')].map(s => [s.querySelector('.label').textContent.trim(), s.querySelector('.v').textContent.trim()])));
    kontrol(sayi(st['Lot']) === e.lot && esit(sayi(st['Değer']), e.deger) && esit(sayi(st['Kâğıt üstü K/Z']), e.kz) && esit(sayi(st['Gerçekleşen']), e.gerc) && esit(sayi(st['Temettü']), e.tem), `${kod} detayı tabloyla aynı (${st['Kâğıt üstü K/Z']}, gerçekleşen ${st['Gerçekleşen']})`);
    if (kod === 'THYAO') {
      kontrol(esit(sayi(st['Başabaş fiyatı']), Math.round((48600 + 23.52 - 4200 - 489.6) / 180 * 10000) / 10000, 0.0001), `başabaş ${st['Başabaş fiyatı']} = (48.600 + 23,52 komisyon − 4.200 − 489,60) / 180`);
      kontrol(/120\s*305,00\s*270,00\s*\+4\.200,00 TL/.test(await metin(w, '#overlay')), 'satış satırı: 120 lot × (305 − 270) = +4.200,00');
      await w.fill('#s-lot', '100'); await w.fill('#s-fiyat', '320'); await w.dispatchEvent('#s-fiyat', 'input'); await bekle(200);
      kontrol(/kâr\/zarar \+5\.000,00 TL/.test(await metin(w, '#sim-out')), '"Satsam ne olur": 100 × (320 − 270) = +5.000,00');
    }
    await w.keyboard.press('Escape'); await bekle(200);
  }

  /* --- Vergi --- */
  bolum = 'vergi';
  await sekme(w, 'vergi');
  const V = await kpiler(w);
  kontrol(esit(sayi(V['Hisse alım-satım kazancı']?.[0]), 3450), `hisse kazancı ${V['Hisse alım-satım kazancı']?.[0]} = özetteki gerçekleşen`);
  kontrol(esit(sayi(V['Temettü (brüt)']?.[0]), BEKLENEN.brut) && /86,40/.test(V['Temettü (brüt)']?.[1]), `brüt temettü ${V['Temettü (brüt)']?.join(' ')} = 576,00, stopaj 86,40`);
  kontrol(esit(sayi(V['Ödenen komisyon']?.[0]), BEKLENEN.kom), 'vergi sayfasındaki komisyon = özet');

  /* --- Excel export --- */
  bolum = 'excel';
  const indir = path.join(tmp, 'disa.xlsx');
  await app.evaluate(({ dialog }, h) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: h }); }, indir);
  await sekme(w, 'ayar'); await w.click('[data-act="xlsx-disa"]'); await bekle(1500);
  const x = XLSX.read(fs.readFileSync(indir), { cellNF: true });
  const ozetSayfa = Object.fromEntries(XLSX.utils.sheet_to_json(x.Sheets['Özet'], { header: 1 }).filter(r => r.length >= 2).map(r => [r[0], r[1]]));
  kontrol(esit(ozetSayfa['Portföy değeri'], BEKLENEN.deger) && esit(ozetSayfa['Kâğıt üstü kâr/zarar'], BEKLENEN.kz) && esit(ozetSayfa['Gerçekleşen kâr/zarar'], BEKLENEN.gerc) && esit(ozetSayfa['Ödenen komisyon'], BEKLENEN.kom) && esit(ozetSayfa['Toplam sonuç (komisyon düşülmüş)'], BEKLENEN.sonuc) && esit(ozetSayfa['Kâğıt üstü kâr/zarar %'], BEKLENEN.yuzde, 1e-6), 'Excel Özet sayfası ekranla aynı');
  const pz = XLSX.utils.sheet_to_json(x.Sheets['Pozisyonlar']);
  kontrol(Object.entries(POZ).every(([k, e]) => { const r = pz.find(p => p['Kod'] === k); return r && r['Lot'] === e.lot && esit(r['Kâr/zarar'], e.kz) && esit(r['Değer'], e.deger) && esit(r['Kâr/zarar %'], e.yuzde, 1e-6); }), 'Excel Pozisyonlar sayfası ekranla aynı');
  kontrol(XLSX.utils.sheet_to_json(x.Sheets['İşlemler']).length === 10, 'Excel İşlemler sayfasında 10 işlem');
  const vs = XLSX.utils.sheet_to_json(x.Sheets['Vergi'], { header: 1 }).find(r => r[0] === '2026') || [];
  kontrol(esit(vs[1], 3450) && esit(vs[4], 576) && esit(vs[5], 86.4) && esit(vs[6], 489.6), `Excel Vergi sayfası (2026: ${vs.slice(1, 7).join(' · ')})`);
  kontrol(!x.SheetNames.includes('Nakit') && Object.keys(x.Sheets['Ayarlar']).every(k => !/Örnek|Aracı Kurumum/.test(String(x.Sheets['Ayarlar'][k].v || ''))), 'Excel dosyasında nakit sayfası ve örnek/hazır kurum yok');

  /* --- morning report e-mail --- */
  bolum = 'e-posta';
  await sekme(w, 'rapor');
  await w.fill('#d-email', 'alici@example.com'); await w.check('#d-aktif');
  await w.fill('#d-host', '127.0.0.1'); await w.fill('#d-port', '2527'); await w.uncheck('#d-secure');
  await w.fill('#d-user', 'gonderen@example.com'); await w.fill('#d-pass', 'test-sifresi');
  await w.click('#f-drapor button[type=submit]'); await bekle(600);
  await w.click('[data-act="mail-test"]');
  for (let i = 0; i < 20 && !mailler.length; i++) await bekle(500);
  const mail = mailler[0] ? qpCoz(mailler[0]) : '';
  kontrol(/172\.302,00 TL/.test(mail) && /\+21\.702,00 TL/.test(mail) && /\+7\.650,00 TL/.test(mail) && /\+17\.832,00 TL/.test(mail) && /\+25\.598,03 TL/.test(mail), 'e-posta raporundaki rakamlar ekranla aynı');
  kontrol(/ASELS 10\.04\.2026 ≈ 255,00 TL/.test(mail), 'e-posta raporu bulunan temettüleri de bildiriyor');

  /* --- leftovers --- */
  bolum = 'kalıntı';
  const hepsi = await tumMetin(w);
  kontrol(!/Örnek|örnek kayıt|Aracı Kurumum/.test(hepsi), 'hiçbir sekmede örnek veri ya da hazır kurum yok');
  kontrol(!/[Nn]akit|Reel bakiye|Ana paradan|maliyet yöntemi|FIFO|net maliyet/.test(hepsi.replace(/Kâr\/zarar her zaman[^.]*\./, '')), 'kaldırılan özelliklerden (nakit, maliyet yöntemi) iz yok');
  await sekme(w, 'ayar');
  kontrol((await w.$$('#main table tbody tr')).length === 1 && /Kurum A/.test(await metin(w, '#main table')), 'yalnızca dosyadaki aracı kurum var');

  /* --- empty ledger --- */
  bolum = 'boş defter';
  await w.click('[data-act="hepsini-sil"]'); await bekle(200); await w.click('[data-act="hepsini-sil"]'); await bekle(800);
  kontrol(/örnek veriler/i.test(await metin(w, '#banner')), 'silince örnek ekrana dönüldü');
  await w.click('[data-act="bos"]'); await bekle(800);
  const bos = (await tumMetin(w)).replace(/\(örn\. THYAO\)/g, ''); // the privacy note names a code as an example
  const bulunan = (bos.replace(/BIST 100[\s\S]*?(?=Vergi|$)/, '').match(/.{0,60}(Örnek|THYAO|ASELS|Kurum A|Aracı Kurumum).{0,60}/g) || []);
  if (bulunan.length) console.log('BOŞ DEFTERDE BULUNAN:', bulunan.slice(0, 5));
  kontrol(!/Örnek|THYAO|ASELS|Kurum A|Aracı Kurumum/.test(bos.replace(/BIST 100[\s\S]*?(?=Vergi|$)/, '')), 'boş defterde eski ya da örnek veri yok');
  await sekme(w, 'ayar');
  kontrol(/Kurum yok/.test(await metin(w, '#main')), 'boş defterde hazır aracı kurum yok');
  await sekme(w, 'islem');
  kontrol(/Kayıtlı işlem yok|İşlem girmeden önce/.test(await metin(w, '#main')), 'işlem listesi boş');
  await w.click('[data-act="fiyat-yenile"]'); await bekle(1500);
  kontrol(/hisse ya da fon yok/.test(await w.textContent('#toast')), 'boş defterde fiyat güncelle ne yapılacağını söylüyor');
  const indir2 = path.join(tmp, 'bos.xlsx');
  await app.evaluate(({ dialog }, h) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: h }); }, indir2);
  await sekme(w, 'ayar'); await w.click('[data-act="xlsx-disa"]'); await bekle(1500);
  const xb = XLSX.read(fs.readFileSync(indir2));
  kontrol(XLSX.utils.sheet_to_json(xb.Sheets['İşlemler']).length === 0 && XLSX.utils.sheet_to_json(xb.Sheets['Pozisyonlar']).length === 0, 'boş defterin Excel dosyası boş');
  kontrol(errs.length === 0, 'ekranda hata yok ' + (errs.length ? JSON.stringify(errs) : ''));

  try { await app.evaluate(({ app }) => app.exit(0)); } catch {}
  smtp.close();
  return rapor(0);
}
function rapor(cokme) {
  const basarisiz = sonuclar.filter(s => !s.ok);
  const ozet = [`## Tutarlılık testi (${process.platform})`, '', cokme ? `**Test yarıda kaldı** [${bolum}]: ${cokme}` : `**${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.**`, '', ...sonuclar.map(s => `- ${s.ok ? '✅' : '❌'} [${s.test}] ${s.mesaj}`), ''];
  console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ozet.join('\n') + '\n');
  try { fs.writeFileSync(path.join(ROOT, 'tutarlilik-sonuclari.json'), JSON.stringify({ platform: process.platform, cokme: cokme || null, sonuclar }, null, 1)); } catch {}
  process.exit(cokme ? 2 : basarisiz.length ? 1 : 0);
}
main().catch(e => { console.error(e); rapor(String(e && e.message || e).slice(0, 500)); });
