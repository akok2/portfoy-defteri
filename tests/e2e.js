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
  const env = { ...process.env, PD_USER_DATA: ud, ...(fixtureDir ? { PD_TEST_FIXTURES: fixtureDir } : {}) };
  let app;
  sonBaslatma = { exe: exe || require('electron'), args: [...args, ...ekArgs], env: { ...env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_ENABLE_STACK_DUMPING: '1' } };
  try {
    app = await electron.launch({ executablePath: exe || require('electron'), args: [...args, ...ekArgs], env, timeout: 60000 });
  } catch (e) {
    // Launch failed: start the program directly for a few seconds and attach its own output to the error.
    await taniCalistir();
    throw e;
  }
  sonBaslatma = null;
  const w = await app.firstWindow();
  const errs = [];
  w.on('pageerror', e => errs.push(e.message));
  w.on('console', m => { if (m.type() === 'error' && !/Content Security Policy|Refused to connect/.test(m.text())) errs.push('console: ' + m.text()); });
  await w.waitForSelector('#tabs .tab', { timeout: 30000 });
  await bekle(1200);
  return { app, w, errs };
}
const tani = [];
let taniBekle = null, sonBaslatma = null;
function taniCalistir() {
  if (!taniBekle && sonBaslatma) {
    const { exe, args, env } = sonBaslatma;
    taniBekle = dogrudanCalistir(exe, args, env).then(cikti => { tani.push(`Program doğrudan çalıştırıldı (${exe}):\n${cikti}`); });
  }
  return taniBekle || Promise.resolve();
}
function dogrudanCalistir(exe, args, env) {
  return new Promise(resolve => {
    let out = '';
    let p;
    try { p = require('child_process').spawn(exe, args, { env }); } catch (e) { return resolve('başlatılamadı: ' + e.message); }
    const ekle = d => { out += d; if (out.length > 20000) out = out.slice(-20000); };
    p.stdout.on('data', ekle); p.stderr.on('data', ekle);
    const t = setTimeout(() => { out += `\n[15 sn sonra hâlâ çalışıyordu, kapatıldı]`; try { p.kill(); } catch {} }, 15000);
    p.on('error', e => { out += '\n[hata] ' + e.message; });
    const t0 = Date.now();
    p.on('exit', (code, sig) => { clearTimeout(t); setTimeout(() => resolve(out + `\n[çıkış kodu ${code}${sig ? ', sinyal ' + sig : ''}]` + (sig ? cokmeRaporu(t0) : '')), sig ? 8000 : 0); });
  });
}
// macOS writes a crash report (.ips) for crashed programs; pull out the crashing thread.
function cokmeRaporu(t0) {
  if (process.platform !== 'darwin') return '';
  try {
    const dir = path.join(os.homedir(), 'Library', 'Logs', 'DiagnosticReports');
    const dosyalar = fs.readdirSync(dir).filter(f => f.endsWith('.ips')).map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).filter(x => x.m >= t0 - 2000).sort((a, b) => b.m - a.m);
    if (!dosyalar.length) return '\n[çökme raporu bulunamadı]';
    const ham = fs.readFileSync(path.join(dir, dosyalar[0].f), 'utf8');
    const govde = JSON.parse(ham.slice(ham.indexOf('\n') + 1));
    const imaj = govde.usedImages || [];
    const th = (govde.threads || [])[govde.faultingThread] || {};
    const kareler = (th.frames || []).slice(0, 30).map((k, i) => `${i} ${(imaj[k.imageIndex] || {}).name || '?'} ${k.symbol || ''}+${k.symbolLocation || k.imageOffset || ''}`);
    return `\n--- çökme raporu: ${dosyalar[0].f}\nexception: ${JSON.stringify(govde.exception)}\ntermination: ${JSON.stringify(govde.termination)}\nasi: ${JSON.stringify(govde.asi)}\nthread ${govde.faultingThread} ${th.name || th.queue || ''}:\n${kareler.join('\n')}`;
  } catch (e) { return '\n[çökme raporu okunamadı: ' + e.message + ']'; }
}
async function kapat(app) { try { await app.evaluate(({ app }) => app.exit(0)); } catch {} await bekle(800); }
const metin = async (w, sel) => ((await w.textContent(sel)) || '').replace(/\s+/g, ' ');
async function sekme(w, ad) { await w.click(`[data-tab="${ad}"]`); await bekle(200); }

async function main() {
  const tmp = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'pd-test-'));
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
  { const izinli = ['THYAO', 'ASELS', 'TUPRS', 'AFT', 'GARAN', 'BIMAS']; await sekme(w, 'poz'); const kodlar = await w.evaluate(() => [...document.querySelectorAll('[data-detay]')].map(b => b.dataset.detay)); await sekme(w, 'ozet');
    kontrol(kodlar.length > 0 && kodlar.every(k => izinli.includes(k)), 'örnek ekranda yalnız izinli örnek kodlar var (' + [...new Set(kodlar)].join(', ') + ')'); }
  for (let i = 0; i < 20 && !/Fiyatlar: \d/.test(await metin(w, '#chips')); i++) await bekle(500);
  kontrol(/Fiyatlar: \d/.test(await metin(w, '#chips')), 'ilk açılışta örnek hisselerin fiyatları kendiliğinden geliyor');
  const bosluk = await w.evaluate(() => { const c = [...document.querySelector('#main').children]; return c.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().top - c[i].getBoundingClientRect().bottom)); });
  kontrol(bosluk.length >= 2 && bosluk.every(x => x >= 12), 'özet ekranındaki bölümler arasında boşluk var (' + bosluk.join(', ') + ' px)');
  const yazi = await w.evaluate(() => getComputedStyle(document.querySelector('.kpi .v')).fontFamily);
  kontrol(!/mono|Menlo|Courier|Consolas/i.test(yazi), 'rakamlar sistem yazı tipiyle gösteriliyor (' + yazi + ')');
  kontrol(!(await w.$('[data-tab="nakit"]')), 'nakit sekmesi kaldırıldı');
  for (const t of ['ozet', 'poz', 'islem', 'bist', 'vergi', 'rapor', 'ayar']) { await sekme(w, t); }
  kontrol(errs.length === 0, 'tüm sekmeler hatasız açılıyor ' + (errs.length ? JSON.stringify(errs) : ''));
  const ag = await w.evaluate(async () => { try { await fetch('https://example.com'); return 'ulaştı'; } catch { return 'engelli'; } });
  kontrol(ag === 'engelli', 'uygulama ekranı internete bağlanamıyor');
  kontrol(await w.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'ekranda Node.js erişimi yok');

  /* ---------------- 2. Ledger editing ---------------- */
  aktifTest = 'defter';
  await sekme(w, 'poz');
  await w.fill('#h-kod', 'KCHOL'); await w.click('#f-hisse button[type=submit]'); await bekle(800);
  kontrol(!/örnek veriler/i.test(await metin(w, '#banner')), 'örnek verideyken kod eklemek boş defteri başlatıyor');
  kontrol(/İzleme listesi 1/.test(await metin(w, '#main')) && /KCHOL/.test(await metin(w, '#main')), 'kod izleme listesine eklendi');
  // KCHOL is not in the recorded answers: every source says "no such code", which must be said plainly and right away
  for (let i = 0; i < 20 && !/kod bulunamadı/.test(await metin(w, '#main')); i++) await bekle(300);
  kontrol(/kod bulunamadı/.test(await metin(w, '#main')), 'yanlış kod birkaç saniye içinde "kod bulunamadı" diye işaretlendi (fiyat güncellemeye basmadan)');
  await w.fill('#h-kod', 'ecİlc'); await w.dispatchEvent('#h-kod', 'input');
  kontrol(await w.inputValue('#h-kod') === 'ECILC', 'Türkçe klavyeyle yazılan kod düzeltiliyor (ecİlc → ECILC)');
  await w.fill('#h-kod', '');
  await w.click('[data-detay="KCHOL"]'); await bekle(300);
  kontrol(/hiçbir fiyat kaynağında bulunamadı/.test(await metin(w, '#overlay')), 'hisse detayında nedeni yazıyor');
  await w.click('[data-act="hisse-sil"]'); await bekle(100); await w.click('[data-act="hisse-sil"]'); await bekle(400);
  kontrol(!/KCHOL/.test(await metin(w, '#main')), 'yanlış kod silindi');
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
  await w.fill('#h-kod', ''); // a half-typed form is never redrawn under the user; clear it so the table can refresh
  for (let i = 0; i < 20 && !/44,10/.test(await metin(w, '#main')); i++) await bekle(300);
  kontrol(/44,10/.test(await metin(w, '#main')), 'yeni eklenen kodun (SISE) fiyatı güncellemeye basmadan geldi');
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
  await islem('AFT', 'Alış', '2026-03-01', '10.000', '0,90'); // Turkish thousands separator
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

  /* ---------------- 3. Prices ---------------- */
  aktifTest = 'fiyatlar';
  await sekme(w, 'ayar'); await w.fill('#k-ad', 'Yarım kalan yazı');
  await w.click('[data-act="fiyat-yenile"]'); await bekle(3000);
  kontrol(await w.inputValue('#k-ad') === 'Yarım kalan yazı', 'fiyatlar arka planda gelince doldurulan form silinmiyor');
  await w.fill('#k-ad', '');
  // a price arriving while a form is half-filled is drawn as soon as the form is cleared, without any click
  await sekme(w, 'poz'); await w.fill('#h-kod', 'YAZ');
  const fOnce = await w.evaluate(() => window.desktop.storeGet('piyasa/fiyatlar'));
  await w.evaluate(f => window.desktop.storeSet('piyasa/fiyatlar', { ...f, veriler: { ...f.veriler, THYAO: { ...f.veriler.THYAO, fiyat: 313.75 } } }), fOnce); await bekle(800);
  kontrol(await w.inputValue('#h-kod') === 'YAZ', 'arka planda fiyat gelince yarım yazılmış kod silinmedi');
  await w.fill('#h-kod', '');
  for (let i = 0; i < 20 && !/313,75/.test(await metin(w, '#main')); i++) await bekle(200);
  kontrol(/313,75/.test(await metin(w, '#main')), 'form boşalınca, beklemede kalan fiyat tıklamadan ekrana geldi');
  await w.evaluate(f => window.desktop.storeSet('piyasa/fiyatlar', f), fOnce); await bekle(600);
  await sekme(w, 'ozet');
  kontrol(/Fiyatlar: \d{2}\.\d{2}\.\d{4}/.test(await metin(w, '#chips')), 'fiyat güncelleme zamanı görünüyor');
  await sekme(w, 'poz');
  tablo = await metin(w, '#main');
  kontrol(tablo.includes('312,50') || tablo.includes('312,5'), 'THYAO fiyatı geldi');
  kontrol(/Elimdeki hisse ve fonlar/.test(tablo) && /İzleme listesi/.test(tablo), 'pozisyonlar bölümlere ayrılmış');
  kontrol(/1,056/.test(tablo), 'fon fiyatı (TEFAS) geldi');
  kontrol(/AFT[^]*?Açık\s*10\.000\s*0,90/.test(tablo), '"10.000" yazılan lot on bin olarak kaydedildi');
  kontrol(/\+\d+,\d+%/.test(tablo), 'haftalık/aylık/yıllık getiri hesaplandı');
  kontrol(tablo.includes('+6.200,00 TL'), 'THYAO kâr/zararı alış fiyatına göre, komisyonsuz: 100 × (312,50 − 250,50) = 6.200,00');
  await w.click('[data-detay="ASELS"]'); await bekle(300);
  const asels = await metin(w, '#overlay');
  kontrol(/Gerçekleşen\s*\+3\.025,00 TL/.test(asels), 'satış kârı: 100 × (130,25 − 100) = 3.025,00 (komisyon hariç)');
  kontrol(/85,7143/.test(asels), 'bedelsiz sonrası ortalama alış fiyatı: 30.000 / 350 = 85,7143');
  await w.keyboard.press('Escape'); await bekle(200);
  await w.click('[data-detay="THYAO"]'); await bekle(300);
  kontrol(/2 kaynakla doğrulandı/.test(await metin(w, '#overlay')), 'iki kaynak doğrulama etiketi');
  await w.keyboard.press('Escape'); await bekle(200);
  await sekme(w, 'ozet');
  const ozet = await metin(w, '#main');
  if (!/Dolar karşılığı/.test(ozet)) console.log('ÖZET:', ozet.slice(0, 700));
  kontrol(/Dolar karşılığı/.test(ozet), 'dolar karşılığı (TCMB) görünüyor');
  kontrol(/Ödenen komisyon/.test(ozet) && /Toplam sonuç/.test(ozet) && !/Reel bakiye|Ana paradan/.test(ozet), 'özet: komisyon ayrı, toplam sonuç var, nakit kalemleri yok');
  // dividends found from the price module's events: a short pointer on Özet, the list on its own tab
  kontrol(/2 bulunan temettü onayını bekliyor/.test(await metin(w, '#temettu-ozet').catch(() => '')) && !(await w.$('#main [data-temettu-ekle]')), 'özet sayfasında uzun temettü listesi yok, kısa bir not ve sekmeye bağlantı var');
  kontrol(/Temettü\s*2/.test(await metin(w, '#tabs')), 'Temettü sekmesinde bekleyen sayısı görünüyor');
  await w.click('#temettu-ozet [data-tab="temettu"]'); await bekle(300);
  const oneri = await metin(w, '#temettu-oneri').catch(() => '');
  kontrol(/ASELS/.test(oneri) && /10\.04\.2026/.test(oneri) && /400,00 TL/.test(oneri) && /01\.09\.2026/.test(oneri) && !/20\.05\.2026/.test(oneri), 'temettüler bulundu (ASELS 400 lot × 1,00 brüt; bedelsiz geri düzeltildi), deftere girilmiş olan tekrar önerilmiyor');
  kontrol(await w.inputValue('#temettu-oneri tr:has-text("ASELS") input') === '340,00', 'net temettü %15 stopajla önerildi (340,00)');
  await w.selectOption('#tm-kod', 'THYAO'); await bekle(300);
  { const f = await metin(w, '#temettu-oneri'); kontrol(/01\.09\.2026/.test(f) && !/ASELS/.test(f) && /Listedeki 1 temettünün/.test(f), 'hisse filtresi yalnız seçilen hisseyi gösteriyor'); }
  await w.selectOption('#tm-kod', ''); await w.selectOption('#tm-yil', '2026'); await bekle(300);
  kontrol((await w.$$eval('#tm-yil option', o => o.map(x => x.value))).join(',') === ',2026' && (await w.$$('#temettu-oneri [data-temettu-ekle]')).length === 2, 'yıl filtresinde yalnız temettü olan yıllar var, 2026 seçilince ikisi de görünüyor');
  await w.selectOption('#tm-yil', ''); await bekle(300);
  await w.click('#temettu-oneri tr:has-text("01.09.2026") [data-temettu-yoksay]'); await bekle(400);
  await w.click('#temettu-oneri tr:has-text("ASELS") [data-temettu-ekle]'); await bekle(500);
  kontrol(!(await w.$('#temettu-oneri [data-temettu-ekle]')) && /Deftere girilmiş temettüler\s*2/.test(await metin(w, '#main')) && /1 temettü yoksayıldı/.test(await metin(w, '#main')), 'onaylanan deftere girdi, yoksayılan bir daha önerilmiyor');
  kontrol(!/Temettü\s*\d/.test(await metin(w, '#tabs')), 'bekleyen kalmayınca sekmedeki sayı kalkıyor');
  await sekme(w, 'vergi');
  console.log('VERGİ:', (await metin(w, '#main')).slice(0, 400));
  const vergi = await metin(w, '#main');
  kontrol(/Temettü \(brüt\)/.test(vergi) && /376,47/.test(vergi) && /400,00/.test(vergi), 'temettü brüt %15 stopajla geri hesaplandı (320 / 0,85 = 376,47), onaylanan temettü listede');
  kontrol(/Ödeyeceğin vergi burada hesaplanmaz/.test(vergi) && !/Beyan gerekmiyor|Beyan sınırı aşılıyor/.test(vergi), 'vergi sayfası ödenecek vergi ya da beyan hükmü vermiyor');
  // BIST 100 page
  await sekme(w, 'bist');
  for (let i = 0; i < 20 && (await w.$$('#main tbody tr')).length < 100; i++) await bekle(300);
  const bist = await metin(w, '#main');
  kontrol((await w.$$('#main tbody tr')).length === 100 && /Borsa İstanbul listesi/.test(bist), 'BIST 100 sayfası 100 hisseyi listeliyor');
  kontrol(/Portföyde/.test(await metin(w, '#main tbody tr:has-text("THYAO")')), 'portföydeki hisse işaretli');
  await w.click('#main tbody tr:has-text("TUPRS") [data-bist-ekle]'); await bekle(3500);
  await sekme(w, 'poz');
  kontrol(/TUPRS/.test(await metin(w, '#main')) && /171,00/.test(await metin(w, '#main')), 'BIST 100 sayfasından izleme listesine eklendi ve fiyatı hemen geldi');
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
    kontrol(['Özet', 'Pozisyonlar', 'İşlemler', 'DATA', 'Vergi', 'Ayarlar'].every(s => wb.SheetNames.includes(s)) && !wb.SheetNames.includes('Nakit'), 'Excel sayfaları: ' + wb.SheetNames.join(', '));
    const pz = XLSX.read(fs.readFileSync(indirilen), { cellNF: true }).Sheets['Pozisyonlar'];
    const kzHucre = Object.keys(pz).find(k => /^J\d+$/.test(k) && k !== 'J1' && pz[k].t === 'n');
    kontrol(kzHucre && /₺/.test(pz[kzHucre].z || '') && /\* /.test(pz[kzHucre].z || ''), 'tutarlar Excel muhasebe biçiminde (' + (kzHucre && pz[kzHucre].z) + ')');
    const yuzde = Object.keys(pz).find(k => /^K\d+$/.test(k) && k !== 'K1' && pz[k].t === 'n');
    kontrol(yuzde && /%/.test(pz[yuzde].z || '') && Math.abs(pz[yuzde].v) < 5, 'yüzdeler gerçek yüzde biçiminde');
    const isl = XLSX.utils.sheet_to_json(wb.Sheets['İşlemler']);
    kontrol(isl.length === 7, `İşlemler sayfasında 7 satır (bulunan ${isl.length})`);
    const t = wb.Sheets['İşlemler'].C2;
    kontrol(t && t.t === 'n' && t.w === '10.01.2026', 'tarihler gerçek Excel tarihi ve gün kaymıyor (' + (t && t.w) + ')');
  }
  await w.setInputFiles('#xl-in', indirilen); await bekle(1200);
  kontrol(/Excel'den yükle/.test(await metin(w, '#modal')), 'içe aktarma önizlemesi açıldı');
  await w.click('[data-act="ice-uygula"]'); await bekle(800);
  kontrol(/0 işlem/.test(await w.textContent('#toast')) && /7 tekrar eden/.test(await w.textContent('#toast')), 'aynı dosya tekrar yüklenince işlemler çoğalmıyor');
  // a hand-made table: title rows, Turkish headers with units ("Fiyat (TL)", "İşlem Türü"), real Excel dates
  const elle = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(elle, XLSX.utils.aoa_to_sheet([['PORTFÖY ÖZETİ'], [], ['Hisse', 'Güncel Fiyat (TL)', 'Fiyat Tarihi', 'Net Lot'], ['KCHOL', 190, new Date(Date.UTC(2026, 8, 1)), 50]]), 'Portfoy');
  XLSX.utils.book_append_sheet(elle, XLSX.utils.aoa_to_sheet([['İŞLEM KAYITLARI'], ['Mavi hücreler giriş alanıdır'], ['Hisse', 'Tarih', 'İşlem Türü', 'Lot', 'Fiyat (TL)', 'Komisyon (TL)', 'Tutar (TL)'],
    ['KCHOL', new Date(Date.UTC(2026, 2, 2)), 'Alış', 100, 180, 9.45, null], ['FROTO', new Date(Date.UTC(2026, 2, 3)), 'Alış', 20, 900, 9.45, null],
    ['KCHOL', new Date(Date.UTC(2026, 3, 6)), 'Satış', 50, 200, 5.25, null], ['FROTO', new Date(Date.UTC(2026, 4, 7)), 'Bedelsiz', 20, 0, 0, null], ['YAC', new Date(Date.UTC(2026, 4, 8)), 'Alış', 1000, 2.5, 0, null]]), 'Islemler');
  const elleYol = path.join(tmp, 'kendi tablom.xlsx'); fs.writeFileSync(elleYol, XLSX.write(elle, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', elleYol); await bekle(1200);
  const elleOn = await metin(w, '#modal');
  kontrol(/5 işlem/.test(elleOn) && /KCHOL/.test(elleOn) && /FROTO/.test(elleOn) && !/okunamadı/.test(elleOn) && /02\.03\.2026/.test(elleOn), 'başlıkları farklı yazılmış kendi Excel tablosu okunuyor');
  kontrol(/YAC üç harfli olduğu için TEFAS fonu/.test(elleOn) && !/(KCHOL|FROTO), YAC üç harfli/.test(elleOn), 'tür sütunu olmayan tabloda üç harfli kod fon olarak tanınıyor');
  await w.click('[data-act="ice-kapat-btn"]'); await bekle(300);
  // the old program's empty template: no trades, only brokers and its helper code list
  const sablon = XLSX.utils.book_new();
  const sab = [['ISLEM_NO', 'ARACI_KURUM', 'HISSE', 'TARIH', 'ALINAN_LOT', 'SATILAN_LOT', 'ALIS_FIYATI', 'SATIS_FIYATI', 'ALIS_TOPLAM', 'SATIS_TOPLAM', 'KOMISYON', 'TEMETTU', 'ISLEM_GRUBU', '', '', '', '', '', 'HISSE', '', '', '', '', '', '', '', 'TARİH', 'ARACI KURUM', 'HİSSE'], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', '', '', '', '', 0]];
  for (const k of ['TAVHL', 'CEMAS', 'NETAS']) { const r = new Array(29).fill(''); r[18] = k; r[26] = 27; r[27] = 28; r[28] = 29; sab.push(r); }
  XLSX.utils.book_append_sheet(sablon, XLSX.utils.aoa_to_sheet(sab), 'DATA');
  const bankaS = XLSX.utils.aoa_to_sheet([[]]); XLSX.utils.sheet_add_aoa(bankaS, [['Şablon Kurum']], { origin: 'F2' }); XLSX.utils.sheet_add_aoa(bankaS, [[1]], { origin: 'J3' }); XLSX.utils.sheet_add_aoa(bankaS, [[0, null, 0.002]], { origin: 'H5' });
  XLSX.utils.book_append_sheet(sablon, bankaS, 'BANKA_ISLEMLERI'); XLSX.utils.book_append_sheet(sablon, XLSX.utils.aoa_to_sheet([['x']]), 'ANA SAYFA');
  const sablonYol = path.join(tmp, 'bos sablon.xlsm'); fs.writeFileSync(sablonYol, XLSX.write(sablon, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', sablonYol); await bekle(1200);
  const sabOn = await metin(w, '#modal');
  kontrol(/alış\/satış kaydı yok/.test(sabOn) && /DATA sayfası boş/.test(sabOn), 'boş şablon yüklenince işlem olmadığı açıkça söyleniyor');
  kontrol(!(await w.$('#ice-degistir')) && !(await w.isChecked('#ice-izleme')) && /3 kodu/.test(sabOn) && !/\b29\b/.test(sabOn), 'boş şablon defteri silemez, yardımcı kod listesi doğru okunuyor ve varsayılan olarak eklenmiyor');
  await w.click('[data-act="ice-kapat-btn"]'); await bekle(300);
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
  { const u = await w.$('#eposta-yardim'); const kutu = u && await u.boundingBox(); const m = u ? (await u.textContent()).replace(/\s+/g, ' ') : '';
    kontrol(await w.inputValue('#d-saglayici') === 'gmail' && kutu && kutu.height > 80 && /Gmail için normal şifreni yazma/.test(m) && /16 harfli/.test(m) && await w.isVisible('#eposta-yardim a[href*="apppasswords"]'), 'Gmail uygulama şifresi uyarısı belirgin bir kutuda, adımları ve bağlantısıyla tam görünüyor'); }
  await w.selectOption('#d-saglayici', 'yandex'); await bekle(200);
  kontrol(await w.inputValue('#d-host') === 'smtp.yandex.com' && await w.inputValue('#d-port') === '465' && /Yandex için normal şifreni yazma/.test(await metin(w, '#eposta-yardim')), 'Yandex seçilince sunucu ayarı ve Yandex adımları geliyor');
  await w.selectOption('#d-saglayici', 'icloud'); await bekle(200);
  kontrol(await w.inputValue('#d-host') === 'smtp.mail.me.com' && await w.inputValue('#d-port') === '587' && !(await w.isChecked('#d-secure')) && /Uygulamaya özel parolalar/.test(await metin(w, '#eposta-yardim')), 'iCloud seçilince 587 portu ve Apple adımları geliyor');
  await w.selectOption('#d-saglayici', 'outlook'); await bekle(200);
  kontrol(/Outlook ve Hotmail hesaplarından gönderilemiyor/.test(await metin(w, '#eposta-yardim')) && /Raporu yine Outlook/.test(await metin(w, '#eposta-yardim')), 'Outlook seçilince gönderen olamayacağı ve ne yapılacağı söyleniyor');
  await w.selectOption('#d-saglayici', 'diger'); await bekle(200);
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
  kontrol(/1507|1\.507/.test(await metin(w, '#tabs')), 'işlem sayısı korunmuş (1507)');
  for (let i = 0; i < 20 && mailler.length < 2; i++) await bekle(1000);
  kontrol(mailler.length === 2, 'saati geçmiş günlük rapor açılışta otomatik gönderildi');
  { const d = await w.evaluate(() => window.desktop.storeGet('piyasa/durum')); const f = await w.evaluate(() => window.desktop.storeGet('piyasa/fiyatlar'));
    kontrol(/fiyat güncellendi/.test(d && d.ozet || '') && /Rapor gönderildi/.test(d && d.ozet || '') && f && f.veriler && f.veriler.THYAO && f.veriler.THYAO.fiyat === 312.5, 'sabah görevi önce fiyatları çekti, sonra raporu gönderdi (' + (d && d.ozet) + ')'); }
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

  /* ---------------- 7. Excel without dates, undated trades ---------------- */
  aktifTest = 'tarihsiz excel';
  const ud2 = path.join(tmp, 'tarihsiz');
  ({ app, w, errs } = await baslat(ud2, fx));
  const basit = XLSX.utils.book_new();
  // a plain holdings list: no date column, no trade type; one row without a lot
  XLSX.utils.book_append_sheet(basit, XLSX.utils.aoa_to_sheet([['Hisse', 'Adet', 'Maliyet'], ['THYAO', 200, 270], ['ASELS', '1.000', '100,50'], ['SISE', 500, 40], ['TUPRS', '', 160]]), 'Portföyüm');
  const basitYol = path.join(tmp, 'tarihsiz liste.xlsx'); fs.writeFileSync(basitYol, XLSX.write(basit, { type: 'buffer', bookType: 'xlsx' }));
  await w.setInputFiles('#xl-in', basitYol); await bekle(1200);
  const basitOn = await metin(w, '#modal');
  kontrol(/3 işlem/.test(basitOn) && /3 işlemde tarih yok/.test(basitOn) && /tarih yok/.test(basitOn), 'tarih sütunu olmayan liste okunuyor, tarihsiz olduğu söyleniyor');
  kontrol(/satır 5 \(lot yok\)/.test(basitOn), 'okunamayan satırın numarası ve nedeni yazıyor');
  await w.click('[data-act="ice-uygula"]'); await bekle(800);
  await sekme(w, 'poz');
  for (let i = 0; i < 30 && !/312,50/.test(await metin(w, '#main')); i++) await bekle(300);
  const tp = await metin(w, '#main');
  // (price − purchase price) × lot: THYAO 200 × 42,50; ASELS 1 000 × 40,70; SISE 500 × 4,10
  kontrol(tp.includes('+8.500,00 TL') && tp.includes('+40.700,00 TL') && tp.includes('+2.050,00 TL'), 'tarihsiz alışlarda kâr/zarar alış fiyatına göre: 8.500 + 40.700 + 2.050');
  await sekme(w, 'ozet');
  kontrol(/Kâğıt üstü kâr\/zarar\s*\+51\.250,00 TL/.test(await metin(w, '#main')), 'özet: kâğıt üstü kâr/zarar 51.250,00');
  kontrol(!(await w.$('#temettu-ozet')) && !/Temettü\s*\d/.test(await metin(w, '#tabs')), 'tarihsiz alış için geçmiş temettüler önerilmiyor (alındığı gün bilinmiyor)');
  // a sale typed by hand without a date
  await sekme(w, 'islem');
  kontrol(((await metin(w, '#main')).match(/tarih yok/g) || []).length === 3, 'işlemler listesinde "tarih yok" yazıyor');
  await w.selectOption('#i-kod', 'THYAO'); await w.fill('#i-tarih', ''); await w.selectOption('#i-tur', 'Satış');
  await w.fill('#i-lot', '50'); await w.fill('#i-fiyat', '320'); await w.click('#f-islem button[type=submit]'); await bekle(600);
  kontrol(/THYAO satış kaydedildi/.test(await w.textContent('#toast')) && !(await metin(w, '#i-err')), 'tarihi boş bırakılan satış kaydedildi');
  await w.click('[data-detay="THYAO"]'); await bekle(300);
  const thy = await metin(w, '#overlay');
  kontrol(/Gerçekleşen\s*\+2\.500,00 TL/.test(thy) && /tarih yok/.test(thy), 'tarihsiz satış: 50 × (320 − 270) = 2.500,00 gerçekleşen');
  await w.keyboard.press('Escape'); await bekle(200);
  await sekme(w, 'vergi');
  kontrol(await w.$('#v-yil option:text-is("Tarihsiz")') !== null, 'vergi sayfasında "Tarihsiz" yılı var');
  await w.selectOption('#v-yil', 'Tarihsiz'); await bekle(300);
  const vt = await metin(w, '#main');
  kontrol(/tarihi girilmemiş/.test(vt) && /\+2\.500,00 TL/.test(vt), 'tarihsiz satış vergi sayfasında ayrı gösteriliyor');
  // export and re-import: undated rows stay undated and are not duplicated
  const indirilen2 = path.join(tmp, 'tarihsiz-disa.xlsx');
  await app.evaluate(({ dialog }, hedef) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: hedef }); }, indirilen2);
  await sekme(w, 'ayar'); await w.click('[data-act="xlsx-disa"]'); await bekle(1500);
  if (fs.existsSync(indirilen2)) {
    const isl2 = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(indirilen2)).Sheets['İşlemler'], { defval: '' });
    kontrol(isl2.length === 4 && isl2.every(r => r.TARIH === ''), 'Excel\'de tarihsiz işlemlerin tarihi boş');
  } else kontrol(false, 'tarihsiz defter Excel\'e aktarılamadı');
  await w.setInputFiles('#xl-in', indirilen2); await bekle(1200);
  kontrol(/4 işlem zaten var/.test(await metin(w, '#modal')), 'aynı dosya yeniden yüklenince tarihsiz işlemler tekrar sayılmıyor');
  await w.click('[data-act="ice-kapat-btn"]'); await bekle(300);

  /* ---------------- 8. Mistyped codes: remove, correct, clean up on import ---------------- */
  aktifTest = 'yanlış kod';
  const kodBul = async kod => { for (let i = 0; i < 30 && !new RegExp(kod + '[^]*?kod bulunamadı').test(await metin(w, '#main')); i++) await bekle(300); return new RegExp(kod + '[^]*?kod bulunamadı').test(await metin(w, '#main')); };
  await sekme(w, 'poz'); await w.fill('#h-kod', 'XYZW'); await w.click('#f-hisse button[type=submit]'); await bekle(500);
  kontrol(await kodBul('XYZW'), 'izleme listesine eklenen yanlış kod işaretlendi');
  await w.click('tr:has-text("XYZW") [data-act="kod-kaldir"]'); await bekle(150); await w.click('tr:has-text("XYZW") [data-act="kod-kaldir"]'); await bekle(500);
  kontrol(!/XYZW/.test(await metin(w, '#main')), 'izleme listesindeki kod "Kaldır" ile silindi');
  // a second file with a typo in a code that has trades: correct it from the warning on Özet
  const yaz = (ad, satirlar) => { const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(satirlar), 'Liste'); const y = path.join(tmp, ad); fs.writeFileSync(y, XLSX.write(b, { type: 'buffer', bookType: 'xlsx' })); return y; };
  await w.setInputFiles('#xl-in', yaz('yazim hatasi.xlsx', [['Hisse', 'Adet', 'Maliyet'], ['ASELZ', 100, 50]])); await bekle(1200);
  await w.click('[data-act="ice-uygula"]'); await bekle(800);
  kontrol(await kodBul('ASELZ'), 'Excel\'deki yanlış kod "kod bulunamadı" olarak işaretlendi');
  await sekme(w, 'ozet');
  await w.click('.warnlist li:has-text("ASELZ") [data-detay="ASELZ"]'); await bekle(400);
  await w.fill('#kd-yeni', 'asels'); await w.click('#f-kod-duzelt button[type=submit]'); await bekle(700);
  kontrol(/ASELZ → ASELS olarak düzeltildi/.test(await w.textContent('#toast')), 'yanlış kod doğru koda düzeltildi');
  await w.keyboard.press('Escape'); await bekle(200); await sekme(w, 'poz');
  { const t = await metin(w, '#main'); kontrol(!/ASELZ/.test(t) && /ASELS[^]*?Açık\s*1\.100/.test(t), 'işlemleri doğru koda taşındı (ASELS 1.000 + 100 = 1.100 lot)'); }
  // a watch-list typo the new file does not have is offered for removal when the file is added
  await w.fill('#h-kod', 'QWER'); await w.click('#f-hisse button[type=submit]'); await bekle(500);
  kontrol(await kodBul('QWER'), 'ikinci yanlış kod işaretlendi');
  await w.setInputFiles('#xl-in', yaz('duzeltilmis.xlsx', [['Hisse', 'Adet', 'Maliyet'], ['THYAO', 200, 270]])); await bekle(1200);
  { const m = await metin(w, '#modal'); kontrol(/bu dosyada olmayan 1 kodu defterimden kaldır/.test(m) && /QWER/.test(m) && await w.isChecked('#ice-kaldir'), 'Excel yüklerken dosyada olmayan yanlış kodun kaldırılması öneriliyor'); }
  await w.click('[data-act="ice-uygula"]'); await bekle(800);
  kontrol(/QWER kaldırıldı/.test(await w.textContent('#toast')) && !/QWER/.test(await metin(w, '#main')), 'yanlış kod Excel yüklenirken kaldırıldı');

  /* ---------------- 9. Cost method like the broker's, step-by-step breakdown ---------------- */
  aktifTest = 'maliyet yöntemi';
  await sekme(w, 'islem');
  await w.selectOption('#i-kod', 'THYAO'); await w.fill('#i-tarih', '2026-02-01'); await w.selectOption('#i-tur', 'Alış');
  await w.fill('#i-lot', '100'); await w.fill('#i-fiyat', '300'); await w.click('#f-islem button[type=submit]'); await bekle(500);
  // THYAO: undated 200 @ 270 (oldest), 100 @ 300, undated sale 50 @ 320 (newest). Average 84 000 / 300 = 280; FIFO keeps 150 @ 270 + 100 @ 300 = 282
  await sekme(w, 'poz'); await w.click('[data-detay="THYAO"]'); await bekle(400);
  { const o = await metin(w, '#overlay'); kontrol(/Ort\. alış fiyatı\s*280,00/.test(o) && /Bu kâr\/zarar nasıl hesaplandı/.test(o), 'ortalama yöntemle 280,00 ve hesap dökümü var');
    kontrol(/Ağırlıklı ortalama: ortalama alış 280,00/.test(o) && /\(FIFO\): ortalama alış 282,00/.test(o), 'hesap dökümünde yöntemler karşılaştırılıyor (280,00 / 282,00)'); }
  await w.keyboard.press('Escape'); await bekle(200);
  await sekme(w, 'ayar'); await w.selectOption('#v-yontem', 'fifo'); await w.click('#f-vergi button[type=submit]'); await bekle(500);
  await sekme(w, 'poz');
  kontrol(/ilk giren ilk çıkar \(FIFO\) maliyetine göre/.test(await metin(w, '#main')), 'pozisyonlar başlığı seçilen yöntemi söylüyor');
  await w.click('[data-detay="THYAO"]'); await bekle(400);
  kontrol(/Ort\. alış fiyatı\s*282,00/.test(await metin(w, '#overlay')) && /Gerçekleşen\s*\+2\.500,00/.test(await metin(w, '#overlay')), 'FIFO seçilince kalan maliyet 282,00, satış kârı 50 × (320 − 270) = 2.500');
  await w.keyboard.press('Escape'); await bekle(200);
  await sekme(w, 'ayar'); await w.selectOption('#v-yontem', 'ortalama'); await w.click('#f-vergi button[type=submit]'); await bekle(400);
  kontrol(errs.length === 0, 'hata yok ' + (errs.length ? JSON.stringify(errs) : ''));
  await kapat(app);

  aktifTest = 'tek kopya';
  ({ app, w, errs } = await baslat(ud, fx));
  let ikinci = null; ikinciDeneniyor = true;
  try { ikinci = await electron.launch({ executablePath: process.env.PD_EXE || require('electron'), args: [...(process.env.PD_EXE ? [] : [ROOT]), ...(process.platform === 'linux' ? ['--no-sandbox', '--password-store=basic'] : [])], env: { ...process.env, PD_USER_DATA: ud }, timeout: 15000 }); } catch {}
  await bekle(2000);
  const ikinciPencere = ikinci ? await ikinci.windows().length : 0;
  kontrol(ikinciPencere === 0, 'ikinci kez açılınca yeni kopya başlamıyor, mevcut pencere öne geliyor');
  if (ikinci) await kapat(ikinci);
  ikinciDeneniyor = false;
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
let coktu = false;
// The second copy quits on purpose; Playwright then reports its closed session as an unhandled error.
let ikinciDeneniyor = false;
async function cokus(e) {
  if (ikinciDeneniyor && /session closed|Target.*closed|has been closed/i.test(String(e && e.message))) return;
  if (coktu) return; coktu = true;
  if (/failed to launch|launch/i.test(String(e && e.message))) await taniCalistir().catch(() => {});
  else if (taniBekle) await taniBekle.catch(() => {});
  console.error('TEST ÇÖKTÜ', e);
  if (tani.length) console.error(tani.join('\n\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Uçtan uca testler (${process.platform})\n\n**Test yarıda kaldı** [${aktifTest}]: ${String(e && e.message || e).slice(0, 600)}\n\nGeçen/kalan kontroller:\n\n${sonuclar.map(x => `- ${x.ok ? 'geçti' : 'KALDI'} [${x.test}] ${x.mesaj}`).join('\n')}\n${tani.length ? '\n### Tanı\n\n```\n' + tani.join('\n\n').slice(-12000) + '\n```\n' : ''}`);
  try { fs.writeFileSync(path.join(ROOT, 'test-sonuclari.json'), JSON.stringify({ platform: process.platform, cokme: String(e && e.stack || e), tani, aktifTest, sonuclar }, null, 1)); } catch {}
  process.exit(2);
}
// Playwright can also report a failed launch outside the awaited call; send it to the same report.
process.on('uncaughtException', cokus);
process.on('unhandledRejection', cokus);
main().catch(cokus);
