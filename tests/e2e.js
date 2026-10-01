// End-to-end tests for the Portföy Defteri desktop app.
// Run:  node tests/e2e.js                (development build)
//       PD_EXE="dist/win-unpacked/Portföy Defteri.exe" node tests/e2e.js   (packaged app)
// On Linux run under Xvfb (xvfb-run -a node tests/e2e.js).
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SMTPServer } = require('smtp-server');
const fixtures = require('./fixtures');

const ROOT = path.resolve(__dirname, '..');
const XLSX = require(path.join(ROOT, 'renderer', 'vendor', 'xlsx.full.min.js'));
const sonuclar = [];
let aktifTest = '';
function kontrol(kosul, mesaj) { sonuclar.push({ test: aktifTest, ok: !!kosul, mesaj }); console.log(`${kosul ? 'PASS' : 'FAIL'}  [${aktifTest}] ${mesaj}`); }
// CI machines are slower; PD_TEST_YAVAS stretches every wait (for example 3 = three times longer).
const YAVAS = Number(process.env.PD_TEST_YAVAS || (process.env.CI ? 3 : 1));
const bekle = ms => new Promise(r => setTimeout(r, ms * YAVAS));

async function baslat(ud, fixtureDir, ekArgs = []) {
  const exe = process.env.PD_EXE;
  const args = [];
  if (!exe) args.push(ROOT);
  if (process.platform === 'linux') args.push('--no-sandbox', '--password-store=basic');
  const app = await electron.launch({
    executablePath: exe || require('electron'),
    args: [...args, ...ekArgs],
    env: { ...process.env, PD_USER_DATA: ud, ...(fixtureDir ? { PD_TEST_FIXTURES: fixtureDir } : {}) },
    timeout: 60000
  });
  const w = await app.firstWindow();
  const errs = [];
  w.on('pageerror', e => errs.push(e.message));
  w.on('console', m => { if (m.type() === 'error' && !/Content Security Policy|Refused to connect/.test(m.text())) errs.push('console: ' + m.text()); });
  await w.waitForSelector('#tabs .tab', { timeout: 30000 });
  await bekle(1200);
  return { app, w, errs };
}
async function kapat(app) { try { await app.evaluate(({ app }) => app.exit(0)); } catch {} await bekle(800); }
const metin = async (w, sel) => ((await w.textContent(sel)) || '').replace(/\s+/g, ' ');
async function sekme(w, ad) { await w.click(`[data-tab="${ad}"]`); await bekle(200); }

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-test-'));
  const ud = path.join(tmp, 'Kullanıcı Verisi ö ş');   // non-ASCII path with spaces, like %APPDATA%\Portföy Defteri
  const fx = fixtures.build(path.join(tmp, 'fx-ok'));
  const fxBigparaYok = fixtures.build(path.join(tmp, 'fx-bigpara-yok'), { bigparaHata: true });
  const fxHepsiYok = fixtures.build(path.join(tmp, 'fx-hepsi-yok'), { hepsiHata: true });
  const indirilen = path.join(tmp, 'disa-aktarim.xlsx');

  // Local SMTP server that collects messages.
  const mailler = [];
  const smtp = new SMTPServer({ authOptional: true, allowInsecureAuth: true, disabledCommands: ['STARTTLS'], onAuth(a, s, cb) { cb(null, { user: a.username }); },
    onData(stream, s, cb) { let d = ''; stream.on('data', c => d += c); stream.on('end', () => { mailler.push({ to: s.envelope.rcptTo.map(r => r.address), data: d }); cb(); }); } });
  await new Promise(r => smtp.listen(2526, '127.0.0.1', r));

  /* ---------------- 1. First launch ---------------- */
  aktifTest = 'ilk açılış';
  let { app, w, errs } = await baslat(ud, fx);
  kontrol(await w.title() === 'Portföy Defteri', 'pencere başlığı');
  kontrol(/örnek veriler/i.test(await metin(w, '#banner')), 'ilk açılışta örnek veri uyarısı görünüyor');
  kontrol(!/SASA|MOGAN|OSTIM|YKBNK/.test(await w.content()), 'kişisel örnek veri yok');
  for (const t of ['ozet', 'poz', 'islem', 'nakit', 'vergi', 'rapor', 'ayar']) { await sekme(w, t); }
  kontrol(errs.length === 0, 'tüm sekmeler hatasız açılıyor ' + (errs.length ? JSON.stringify(errs) : ''));
  const ag = await w.evaluate(async () => { try { await fetch('https://example.com'); return 'ulaştı'; } catch { return 'engelli'; } });
  kontrol(ag === 'engelli', 'uygulama ekranı internete bağlanamıyor');
  kontrol(await w.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'ekranda Node.js erişimi yok');

  /* ---------------- 2. Ledger editing ---------------- */
  aktifTest = 'defter';
  await w.click('[data-act="bos"]'); await bekle(500);
  kontrol(!/örnek veriler/i.test(await metin(w, '#banner')), 'boş defter başlatıldı');
  await sekme(w, 'ayar');
  await w.fill('#k-ad', 'Test Kurum'); await w.selectOption('#k-tip', 'kademeli'); await bekle(100);
  await w.fill('#k-gun', '90'); await w.fill('#k-kademe', '50000 0,2\n0,15'); await w.uncheck('#k-bsmv');
  await w.click('#f-kurum button[type=submit]'); await bekle(300);
  kontrol((await metin(w, '#main')).includes('Kademeli'), 'kademeli komisyonlu kurum eklendi');
  await sekme(w, 'poz');
  for (const [kod, tip] of [['THYAO', 'Hisse'], ['ASELS', 'Hisse'], ['AFT', 'Fon'], ['SISE', 'Hisse']]) {
    await w.fill('#h-kod', kod); await w.selectOption('#h-tip', tip); await w.click('#f-hisse button[type=submit]'); await bekle(250);
  }
  await w.fill('#h-kod', 'thyao'); await w.click('#f-hisse button[type=submit]'); await bekle(200);
  kontrol(/zaten listede/.test(await w.textContent('#h-err')), 'aynı kod iki kez eklenemiyor');
  await w.fill('#h-kod', 'X!'); await w.click('#f-hisse button[type=submit]'); await bekle(200);
  kontrol(/2–8 harf/.test(await w.textContent('#h-err')), 'geçersiz kod reddediliyor');
  await sekme(w, 'islem');
  async function islem(kod, tur, tarih, lot, fiyat, tutar) {
    await w.selectOption('#i-kod', kod); await w.fill('#i-tarih', tarih); await w.selectOption('#i-tur', tur); await bekle(80);
    await w.selectOption('#i-kurum', 'Test Kurum');
    if (tur === 'Temettü') await w.fill('#i-tutar', tutar); else { await w.fill('#i-lot', lot); if (tur !== 'Bedelsiz') { await w.fill('#i-fiyat', fiyat); await w.dispatchEvent('#i-fiyat', 'input'); } }
    await w.click('#f-islem button[type=submit]'); await bekle(250);
  }
  await islem('THYAO', 'Alış', '2026-01-10', '100', '250,50');
  await islem('ASELS', 'Alış', '2026-02-03', '400', '100');
  await islem('ASELS', 'Satış', '2026-05-05', '100', '130,25');
  await islem('THYAO', 'Temettü', '2026-06-01', '', '', '320');
  await islem('ASELS', 'Bedelsiz', '2026-06-15', '50');
  await islem('AFT', 'Alış', '2026-03-01', '10000', '0,90');
  await islem('SISE', 'Alış', '2026-03-01', '10', '40');
  let tablo = await metin(w, '#main');
  kontrol((tablo.match(/Örnek kayıt/g) || []).length === 0, 'örnek kayıtlar boş deftere karışmadı');
  kontrol(/25,05/.test(tablo) || /50,1/.test(tablo), 'komisyon kademeden otomatik hesaplandı (100×250,50×%0,2 = 50,10)');
  await w.fill('#i-filtre', 'SISE'); await bekle(300);
  await w.click('[data-sil]'); await bekle(100); await w.click('[data-sil]'); await bekle(300);
  await w.fill('#i-filtre', ''); await bekle(300);
  kontrol(!(await w.$$eval('#main tbody tr', rs => rs.some(r => r.innerText.includes('SISE')))), 'işlem silme (iki tıklamalı onay) çalışıyor');
  await w.click('[data-duzenle]'); await bekle(200);
  kontrol(/İşlemi düzenle/.test(await metin(w, '#main')), 'düzenleme formu açılıyor');
  await w.click('[data-act="iptal"]'); await bekle(200);
  await w.fill('#i-lot', '0'); await w.selectOption('#i-tur', 'Alış'); await w.fill('#i-fiyat', '10'); await w.click('#f-islem button[type=submit]'); await bekle(200);
  kontrol(/sıfırdan büyük/.test(await w.textContent('#i-err')), 'sıfır lot reddediliyor');
  await sekme(w, 'nakit');
  await w.fill('#n-tutar', '100.000,00'); await w.click('#f-nakit button[type=submit]'); await bekle(250);
  await w.selectOption('#n-tur', 'Kesinti'); await w.fill('#n-tutar', '12,5'); await w.click('#f-nakit button[type=submit]'); await bekle(250);
  kontrol((await metin(w, '#main')).includes('100.000,00 TL'), 'Türkçe sayı biçimi (100.000,00) doğru okunuyor');
  kontrol((await metin(w, '#main')).includes('12,50 TL'), 'kesinti kaydedildi');

  /* ---------------- 3. Prices ---------------- */
  aktifTest = 'fiyatlar';
  await w.click('[data-act="fiyat-yenile"]'); await bekle(3000);
  kontrol(/Fiyatlar: \d{2}\.\d{2}\.\d{4}/.test(await metin(w, '#chips')), 'fiyat güncelleme zamanı görünüyor');
  await sekme(w, 'poz');
  tablo = await metin(w, '#main');
  kontrol(tablo.includes('312,50') || tablo.includes('312,5'), 'THYAO fiyatı geldi');
  kontrol(/Elimdeki hisse ve fonlar/.test(tablo) && /İzleme listesi/.test(tablo), 'pozisyonlar bölümlere ayrılmış');
  kontrol(/1,056/.test(tablo), 'fon fiyatı (TEFAS) geldi');
  kontrol(/\+\d+,\d+%/.test(tablo), 'haftalık/aylık/yıllık getiri hesaplandı');
  await w.click('[data-detay="THYAO"]'); await bekle(300);
  kontrol(/2 kaynakla doğrulandı/.test(await metin(w, '#overlay')), 'iki kaynak doğrulama etiketi');
  await w.keyboard.press('Escape'); await bekle(200);
  await sekme(w, 'ozet');
  const ozet = await metin(w, '#main');
  if (!/Dolar karşılığı/.test(ozet)) console.log('ÖZET:', ozet.slice(0, 700));
  kontrol(/Dolar karşılığı/.test(ozet), 'dolar karşılığı (TCMB) görünüyor');
  kontrol(/Reel bakiye/.test(ozet) && /Ana paradan K\/Z/.test(ozet), 'ana para ve reel bakiye görünüyor');
  await sekme(w, 'vergi');
  console.log('VERGİ:', (await metin(w, '#main')).slice(0, 400));
  kontrol(/Temettü \(brüt\)/.test(await metin(w, '#main')) && /376,47/.test(await metin(w, '#main')), 'temettü brüt %15 stopajla geri hesaplandı (320 / 0,85 = 376,47)');
  await sekme(w, 'ayar');
  await w.click('[data-act="kaynak-test"]'); await bekle(2500);
  kontrol(((await metin(w, '#kaynak-sonuc')).match(/Çalışmıyor/g) || []).length === 0, 'kaynak testi ekranı çalışıyor');
  kontrol(errs.length === 0, 'hata yok ' + (errs.length ? JSON.stringify(errs) : ''));

  /* ---------------- 4. Excel export / import ---------------- */
  aktifTest = 'excel';
  await app.evaluate(({ dialog }, hedef) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: hedef }); }, indirilen);
  await w.click('[data-act="xlsx-disa"]'); await bekle(1500);
  kontrol(fs.existsSync(indirilen), 'Excel dosyası kaydedildi');
  if (fs.existsSync(indirilen)) {
    const wb = XLSX.read(fs.readFileSync(indirilen));
    kontrol(['Özet', 'Pozisyonlar', 'İşlemler', 'DATA', 'Nakit', 'Vergi', 'Ayarlar'].every(s => wb.SheetNames.includes(s)), 'Excel sayfaları: ' + wb.SheetNames.join(', '));
    const isl = XLSX.utils.sheet_to_json(wb.Sheets['İşlemler']);
    kontrol(isl.length === 6, `İşlemler sayfasında 6 satır (bulunan ${isl.length})`);
    const t = wb.Sheets['İşlemler'].C2;
    kontrol(t && t.t === 'n' && t.w === '10.01.2026', 'tarihler gerçek Excel tarihi ve gün kaymıyor (' + (t && t.w) + ')');
  }
  await w.setInputFiles('#xl-in', indirilen); await bekle(1200);
  kontrol(/Excel'den yükle/.test(await metin(w, '#modal')), 'içe aktarma önizlemesi açıldı');
  await w.click('[data-act="ice-uygula"]'); await bekle(800);
  kontrol(/0 işlem/.test(await w.textContent('#toast')) && /6 tekrar eden/.test(await w.textContent('#toast')), 'aynı dosya tekrar yüklenince işlemler çoğalmıyor');
  // old Excel program layout with many rows (performance)
  const eski = XLSX.utils.book_new();
  const satir = [['ISLEM_NO', 'ARACI_KURUM', 'HISSE', 'TARIH', 'ALINAN_LOT', 'SATILAN_LOT', 'ALIS_FIYATI', 'SATIS_FIYATI', 'ALIS_TOPLAM', 'SATIS_TOPLAM', 'KOMISYON', 'TEMETTU', 'ISLEM_GRUBU'], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  for (let i = 1; i <= 1500; i++) { const al = i % 3 !== 0; satir.push([i, 'Eski Kurum', 'TUPRS', `${String((i % 28) + 1).padStart(2, '0')}.${String((i % 9) + 1).padStart(2, '0')}.2025 10:${String(i % 60).padStart(2, '0')}:00`, al ? 10 : null, al ? null : 5, al ? 150 + (i % 10) : null, al ? null : 160, null, null, 0.5, null, null]); }
  XLSX.utils.book_append_sheet(eski, XLSX.utils.aoa_to_sheet(satir), 'DATA');
  const banka = XLSX.utils.aoa_to_sheet([[]]); XLSX.utils.sheet_add_aoa(banka, [['Eski Kurum']], { origin: 'F2' }); XLSX.utils.sheet_add_aoa(banka, [[1]], { origin: 'J3' });
  XLSX.utils.sheet_add_aoa(banka, [[0, 50000, 0.002], [50001, null, 0.0015]], { origin: 'H5' }); XLSX.utils.sheet_add_aoa(banka, [['01.01.2025', 250000, null, null, 'ilk']], { origin: 'A17' });
  XLSX.utils.book_append_sheet(eski, banka, 'BANKA_ISLEMLERI'); XLSX.utils.book_append_sheet(eski, XLSX.utils.aoa_to_sheet([['x']]), 'ANA SAYFA');
  const eskiYol = path.join(tmp, 'eski program.xlsm'); fs.writeFileSync(eskiYol, XLSX.write(eski, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', eskiYol); await bekle(1500);
  const onizleme = await metin(w, '#modal');
  kontrol(/1500 işlem/.test(onizleme) && /Eski Excel takip programı/.test(onizleme), 'eski programın dosyası tanındı');
  const t0 = Date.now(); await w.click('[data-act="ice-uygula"]'); await bekle(500);
  await sekme(w, 'islem'); const sure = Date.now() - t0;
  kontrol(sure < 6000, `1500 işlem içe aktarma + ekran ${sure} ms`);
  const t1 = Date.now(); await sekme(w, 'poz'); await sekme(w, 'ozet'); await sekme(w, 'vergi');
  kontrol(Date.now() - t1 < 3000, `büyük defterde sekme geçişi ${Date.now() - t1} ms`);
  kontrol(errs.length === 0, 'hata yok ' + (errs.length ? JSON.stringify(errs) : ''));

  /* ---------------- 5. E-mail report ---------------- */
  aktifTest = 'e-posta';
  await sekme(w, 'rapor');
  await w.fill('#d-email', 'alici@example.com'); await w.check('#d-aktif');
  await w.fill('#d-host', '127.0.0.1'); await w.fill('#d-port', '2526'); await w.uncheck('#d-secure');
  await w.fill('#d-user', 'gonderen@example.com'); await w.fill('#d-pass', 'uygulama-sifresi');
  await w.click('#f-drapor button[type=submit]'); await bekle(600);
  const ayar = JSON.parse(fs.readFileSync(path.join(ud, 'ayarlar.json'), 'utf8'));
  kontrol(ayar.smtp.passEnc && !JSON.stringify(ayar).includes('uygulama-sifresi'), 'e-posta şifresi şifreli saklanıyor');
  await w.click('[data-act="mail-test"]'); await bekle(4000);
  kontrol(mailler.length === 1, 'test raporu gönderildi (' + (await w.textContent('#d-msg')) + ')');
  if (mailler[0]) { kontrol(mailler[0].to[0] === 'alici@example.com', 'yalnızca girilen adrese gitti'); kontrol(/THYAO/.test(mailler[0].data) && /Portf=C3=B6y Defteri|Portföy Defteri/.test(mailler[0].data), 'rapor içeriği dolu'); }

  /* ---------------- 6. Background, restart, scheduler ---------------- */
  aktifTest = 'arka plan';
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await bekle(800);
  const durum = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(b => b.isVisible()));
  kontrol(durum.length === 1 && durum[0] === false, 'pencere kapatılınca uygulama arka planda çalışmaya devam ediyor');
  await kapat(app);
  const dat = fs.readFileSync(path.join(ud, 'defter.dat'));
  kontrol(dat.slice(0, 7).toString() === 'PDENC1:' && !dat.toString('latin1').includes('THYAO'), 'defter dosyası şifreli');
  kontrol(fs.readdirSync(path.join(ud, 'yedekler')).length >= 1, 'günlük yedek alındı');

  aktifTest = 'zamanlanmış görev';
  const a2 = JSON.parse(fs.readFileSync(path.join(ud, 'ayarlar.json'), 'utf8'));
  a2.sonOtomatikGun = ''; a2.raporSaati = '00:00'; a2.haftaIci = false; fs.writeFileSync(path.join(ud, 'ayarlar.json'), JSON.stringify(a2));
  ({ app, w, errs } = await baslat(ud, fx));
  kontrol(!/örnek veriler/i.test(await metin(w, '#banner')), 'yeniden açılınca defter yerinde');
  await sekme(w, 'islem');
  kontrol(/1506|1\.506/.test(await metin(w, '#tabs')), 'işlem sayısı korunmuş (1506)');
  for (let i = 0; i < 20 && mailler.length < 2; i++) await bekle(1000);
  kontrol(mailler.length === 2, 'saati geçmiş günlük rapor açılışta otomatik gönderildi');
  const a3 = JSON.parse(fs.readFileSync(path.join(ud, 'ayarlar.json'), 'utf8'));
  kontrol(a3.sonOtomatikGun === new Date().toLocaleDateString('sv-SE'), 'aynı gün ikinci kez gönderilmeyecek şekilde işaretlendi');
  await kapat(app);

  aktifTest = 'kaynak hataları';
  ({ app, w, errs } = await baslat(ud, fxBigparaYok));
  await w.click('[data-act="fiyat-yenile"]'); await bekle(2500);
  await w.click('[data-tab="poz"]'); await bekle(200); await w.click('[data-detay="THYAO"]'); await bekle(300);
  kontrol(/Tek kaynak/.test(await metin(w, '#overlay')), 'bir kaynak çökünce fiyat tek kaynakla geliyor');
  await kapat(app);
  ({ app, w, errs } = await baslat(ud, fxHepsiYok));
  await w.click('[data-act="fiyat-yenile"]'); await bekle(2500);
  await sekme(w, 'poz');
  kontrol((await metin(w, '#main')).includes('312,5'), 'hiçbir kaynak yokken eski fiyat korunuyor');
  kontrol(errs.length === 0, 'hata yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await kapat(app);

  aktifTest = 'bozuk dosya';
  fs.writeFileSync(path.join(ud, 'defter.dat'), 'bozuk veri ' + Math.random());
  ({ app, w, errs } = await baslat(ud, fx));
  kontrol(/yedekten açıldı/.test(await metin(w, '#banner')), 'bozuk dosyada yedekten açılıp kullanıcıya söyleniyor');
  kontrol(!/örnek veriler/i.test(await metin(w, '#banner')), 'yedekteki defter geri geldi');
  await kapat(app);

  aktifTest = 'tek kopya';
  ({ app, w, errs } = await baslat(ud, fx));
  let ikinci = null;
  try { ikinci = await electron.launch({ executablePath: process.env.PD_EXE || require('electron'), args: [...(process.env.PD_EXE ? [] : [ROOT]), ...(process.platform === 'linux' ? ['--no-sandbox', '--password-store=basic'] : [])], env: { ...process.env, PD_USER_DATA: ud }, timeout: 15000 }); } catch {}
  await bekle(2000);
  const ikinciPencere = ikinci ? await ikinci.windows().length : 0;
  kontrol(ikinciPencere === 0, 'ikinci kez açılınca yeni kopya başlamıyor, mevcut pencere öne geliyor');
  if (ikinci) await kapat(ikinci);
  await kapat(app);

  smtp.close();
  const basarisiz = sonuclar.filter(s => !s.ok);
  console.log(`\n${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.`);
  fs.writeFileSync(path.join(ROOT, 'test-sonuclari.json'), JSON.stringify({ platform: process.platform, tarih: new Date().toISOString(), sonuclar }, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const satir = [`## Uçtan uca testler (${process.platform})`, '', `**${sonuclar.length - basarisiz.length}/${sonuclar.length} kontrol geçti.**`, ''];
    if (basarisiz.length) satir.push('### Başarısız kontroller', '', ...basarisiz.map(b => `- [${b.test}] ${b.mesaj}`), '');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satir.join('\n') + '\n');
  }
  process.exit(basarisiz.length ? 1 : 0);
}
main().catch(e => {
  console.error('TEST ÇÖKTÜ', e);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Uçtan uca testler (${process.platform})\n\n**Test yarıda kaldı** [${aktifTest}]: ${String(e && e.message || e).slice(0, 600)}\n\nGeçen/kalan kontroller:\n\n${sonuclar.map(x => `- ${x.ok ? 'geçti' : 'KALDI'} [${x.test}] ${x.mesaj}`).join('\n')}\n`);
  try { fs.writeFileSync(path.join(ROOT, 'test-sonuclari.json'), JSON.stringify({ platform: process.platform, cokme: String(e && e.stack || e), aktifTest, sonuclar }, null, 1)); } catch {}
  process.exit(2);
});
