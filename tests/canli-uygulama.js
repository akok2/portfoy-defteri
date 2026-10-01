// Real-internet check from inside the app (the same network stack the user gets), on the CI machine.
// Launches the packaged app with an empty data folder, lets it fetch prices the way a user would,
// imports a small Excel table (made-up trades, real codes) and checks every code got a price.
// Run:  PD_EXE=... node tests/canli-uygulama.js      (or without PD_EXE for the development build)
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const XLSX = require(path.join(ROOT, 'renderer', 'vendor', 'xlsx.full.min.js'));
const EKRAN = path.join(ROOT, 'ekran');
const HISSELER = ['THYAO', 'GARAN', 'ASELS', 'SISE', 'BIMAS'];
const FONLAR = ['AFT', 'TCD'];
const satirlar = [];
const kontroller = [];
const kontrol = (ok, mesaj) => { kontroller.push({ ok: !!ok, mesaj }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${mesaj}`); };
const bekle = ms => new Promise(r => setTimeout(r, ms));
async function bekleKadar(fn, sn) { for (let i = 0; i < sn * 2; i++) { try { if (await fn()) return true; } catch {} await bekle(500); } return false; }

(async () => {
  fs.mkdirSync(EKRAN, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'pd-canli-'));
  const exe = process.env.PD_EXE;
  const args = exe ? [] : [ROOT];
  if (process.platform === 'linux') args.push('--no-sandbox', '--password-store=basic');
  const app = await electron.launch({ executablePath: exe || require('electron'), args, env: { ...process.env, PD_USER_DATA: path.join(tmp, 'veri') }, timeout: 60000 });
  const w = await app.firstWindow();
  const errs = [];
  w.on('pageerror', e => errs.push(e.message));
  await w.waitForSelector('#tabs .tab', { timeout: 30000 });
  const boyut = await app.evaluate(({ BrowserWindow, screen }) => ({ pencere: BrowserWindow.getAllWindows()[0].getBounds(), ekran: screen.getPrimaryDisplay().workArea }));
  const p = boyut.pencere, e = boyut.ekran;
  kontrol(p.x >= e.x && p.y >= e.y && p.x + p.width <= e.x + e.width && p.y + p.height <= e.y + e.height, `pencere ekrana sığıyor (pencere ${p.width}×${p.height}, ekran ${e.width}×${e.height})`);

  // 1. first launch: the sample portfolio gets real prices without any click
  const ilk = await bekleKadar(async () => /Fiyatlar: \d/.test(await w.textContent('#chips')), 60);
  kontrol(ilk, 'ilk açılışta örnek hisselerin fiyatları internetten kendiliğinden geldi');
  await w.screenshot({ path: path.join(EKRAN, '1-ilk-acilis-ozet.png') });

  // 2. source test screen
  await w.click('[data-tab="ayar"]'); await bekle(500);
  await w.click('[data-act="kaynak-test"]');
  await bekleKadar(async () => !/deneniyor/.test(await w.textContent('#kaynak-sonuc')) && (await w.textContent('#kaynak-sonuc')).length > 20, 60);
  const kaynakMetin = await w.evaluate(() => [...document.querySelectorAll('#kaynak-sonuc > *')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  await w.locator('#kaynak-sonuc').scrollIntoViewIfNeeded().catch(() => {});
  await w.screenshot({ path: path.join(EKRAN, '2-kaynak-testi.png') });
  for (const k of kaynakMetin) satirlar.push(`- ${k}`);
  for (const ad of ['Yahoo', 'İş Yatırım', 'TradingView', 'TEFAS', 'TCMB']) {
    const r = kaynakMetin.find(x => x.includes(ad));
    kontrol(r && !/Çalışmıyor/.test(r), `kaynak testi: ${ad} ${r && /Çalışmıyor/.test(r) ? '— ' + r : 'çalışıyor'}`);
  }

  // 3. import a hand-made table (fund codes typed without a type column) and refresh
  const veri = [['Hisse', 'Tarih', 'İşlem Türü', 'Lot', 'Fiyat (TL)', 'Komisyon (TL)']];
  [...HISSELER, ...FONLAR].forEach((k, i) => veri.push([k, new Date(Date.UTC(2026, 0, 5 + i)), 'Alış', FONLAR.includes(k) ? 1000 : 10, FONLAR.includes(k) ? 1 : 50, 1]));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Benim işlemlerim'], [], ...veri]), 'Islemler');
  const dosya = path.join(tmp, 'islemlerim.xlsx'); fs.writeFileSync(dosya, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', dosya); await bekle(1500);
  const onizleme = (await w.textContent('#modal')).replace(/\s+/g, ' ');
  kontrol(new RegExp(`${HISSELER.length + FONLAR.length} işlem`).test(onizleme), 'Excel tablosu okundu');
  kontrol(/TEFAS fonu/.test(onizleme), 'üç harfli kodların fon olarak ekleneceği söyleniyor');
  await w.screenshot({ path: path.join(EKRAN, '3-excel-onizleme.png') });
  await w.click('[data-act="ice-uygula"]'); await bekle(1500);
  await w.click('[data-act="fiyat-yenile"]');
  // read what the app stored (through the same bridge the screen uses)
  const oku = () => w.evaluate(async k => { const f = (await window.desktop.storeGet('piyasa/fiyatlar')) || {}; const d = (await window.desktop.storeGet('data/users/local/defter')) || {}; const v = f.veriler || {};
    return k.map(x => ({ kod: x, tip: ((d.hisseler || []).find(h => h.kod === x) || {}).tip, ...(v[x] || {}) })); }, [...HISSELER, ...FONLAR]);
  const tamam = await bekleKadar(async () => (await oku()).every(f => f.fiyat > 0) && !/güncelleniyor/.test(await w.textContent('#chips')), 90);
  const fiyatlar = await oku();
  satirlar.push('', '| Kod | Tür | Fiyat | Tarih | Kaynak | Doğrulama |', '|---|---|---|---|---|---|',
    ...fiyatlar.map(f => `| ${f.kod} | ${f.tip || '—'} | ${f.fiyat ?? 'YOK'} | ${f.tarih || '—'} | ${f.kaynak || '—'} | ${f.dogrulama || '—'}${f.not ? ' · ' + f.not : ''} |`));
  kontrol(tamam && fiyatlar.every(f => f.fiyat > 0), `Excel'den gelen ${fiyatlar.length} kodun hepsinin fiyatı geldi` + (tamam ? '' : ' — eksik: ' + fiyatlar.filter(f => !(f.fiyat > 0)).map(f => f.kod).join(', ')));
  kontrol(fiyatlar.filter(f => HISSELER.includes(f.kod)).every(f => f.dogrulama === 'iki-kaynak'), 'hisse fiyatları en az iki kaynakla doğrulandı');
  kontrol(fiyatlar.filter(f => FONLAR.includes(f.kod)).every(f => f.tip === 'Fon' && /TEFAS/.test(f.kaynak || '')), 'fonlar fon olarak kaydedildi ve TEFAS\'tan geldi');
  await w.click('[data-tab="poz"]'); await bekle(800);
  await w.screenshot({ path: path.join(EKRAN, '4-pozisyonlar.png') });
  await w.click('[data-tab="ozet"]'); await bekle(800);
  await w.screenshot({ path: path.join(EKRAN, '5-ozet.png') });
  kontrol(errs.length === 0, 'ekranda hata yok' + (errs.length ? ' ' + JSON.stringify(errs) : ''));
  try { await app.evaluate(({ app }) => app.exit(0)); } catch {}

  const basarisiz = kontroller.filter(k => !k.ok);
  const ozet = [`## Uygulamanın içinden canlı fiyatlar (${process.platform}, gerçek internet)`, '',
    `**${kontroller.length - basarisiz.length}/${kontroller.length} kontrol geçti.**`, '', ...kontroller.map(k => `- ${k.ok ? '✅' : '❌'} ${k.mesaj}`), '', '### Kaynak testi ekranı', '', ...satirlar, '',
    'Ekran görüntüleri bu işin **ekran-goruntuleri** dosyasında.', ''];
  console.log(ozet.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ozet.join('\n') + '\n');
  fs.writeFileSync(path.join(ROOT, 'canli-uygulama.json'), JSON.stringify({ platform: process.platform, kontroller, fiyatlar, kaynakMetin }, null, 1));
  process.exit(basarisiz.length ? 1 : 0);
})().catch(e => {
  console.error(e);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Uygulamanın içinden canlı fiyatlar (${process.platform})\n\n**Test yarıda kaldı:** ${String(e && e.message || e).slice(0, 600)}\n\n${kontroller.map(k => `- ${k.ok ? '✅' : '❌'} ${k.mesaj}`).join('\n')}\n`);
  process.exit(2);
});
