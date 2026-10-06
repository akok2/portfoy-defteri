// Portföy Defteri — desktop shell (Windows and macOS).
const { app, BrowserWindow, ipcMain, dialog, shell, session, Tray, Menu, nativeImage, safeStorage, Notification, powerMonitor, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Store } = require('./src/store');
const prices = require('./src/prices');
const zamanlama = require('./src/zamanlama');
const { epostaHatasi } = require('./src/eposta');
// Tests can replace internet access with recorded responses (never set in normal use).
const sahteAg = process.env.PD_TEST_FIXTURES ? require('./src/test-fetch')(process.env.PD_TEST_FIXTURES) : null;
const agFetch = (u, o) => sahteAg ? sahteAg(u, o) : fetcher.fetch(u, o);

app.setAppUserModelId('com.portfoydefteri.desktop');
// Optional: keep data in a custom folder (portable use or testing).
if (process.env.PD_USER_DATA) app.setPath('userData', process.env.PD_USER_DATA);
// Startup trace on stderr (written synchronously so it survives a crash).
const iz = m => { try { fs.writeSync(2, `[pd] ${m}\n`); } catch {} };
const tekKopya = app.requestSingleInstanceLock();
iz(`başlıyor: sürüm ${app.getVersion()}, electron ${process.versions.electron}, ${process.platform}-${process.arch}, veri ${app.getPath('userData')}, tek kopya kilidi ${tekKopya ? 'alındı' : 'ALINAMADI'}`);
app.on('will-finish-launching', () => iz('will-finish-launching'));
app.on('child-process-gone', (e, d) => iz(`yardımcı süreç kapandı: ${d.type} ${d.reason} ${d.exitCode}`));
app.on('render-process-gone', (e, wc, d) => iz(`sayfa süreci kapandı: ${d.reason} ${d.exitCode}`));
if (!tekKopya) app.quit();

const UID = 'local';
let win = null, tray = null, store = null, fetcher = null, quitting = false;
let settingsFile = null, settings = null;

const DEFAULTS = {
  raporSaati: '08:45', haftaIci: true, raporAktif: false, raporEmail: '',
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: '', from: '', passEnc: '' },
  acilistaBaslat: false, arkaPlanda: true, sonOtomatikGun: '', tepsiBilgisi: false
};

/* ---------- settings (non-document preferences; SMTP password encrypted with the OS key store) ---------- */
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; settings.smtp = { ...DEFAULTS.smtp, ...(settings.smtp || {}) }; }
  catch { settings = JSON.parse(JSON.stringify(DEFAULTS)); }
}
// written to a temporary file and renamed, so a crash or a reader never sees a half-written file
function saveSettings() { const tmp = settingsFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 }); fs.renameSync(tmp, settingsFile); }
function publicSettings() {
  const { smtp, ...rest } = settings;
  return { ...rest, kurtarma: store.kurtarma || null, smtp: { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from, hasPass: !!smtp.passEnc }, sifreleme: store.encryptionAvailable(), veriKlasoru: app.getPath('userData'), surum: app.getVersion(), platform: process.platform };
}
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function applySettings(patch) {
  if (!patch || typeof patch !== 'object') return;
  if (typeof patch.raporSaati === 'string' && TIME_RE.test(patch.raporSaati)) settings.raporSaati = patch.raporSaati;
  if (typeof patch.haftaIci === 'boolean') settings.haftaIci = patch.haftaIci;
  if (typeof patch.raporAktif === 'boolean') settings.raporAktif = patch.raporAktif;
  if (typeof patch.raporEmail === 'string') { const e = patch.raporEmail.trim(); if (e === '' || EMAIL_RE.test(e)) settings.raporEmail = e; else throw new Error('Geçerli bir e-posta adresi gir.'); }
  if (typeof patch.arkaPlanda === 'boolean') settings.arkaPlanda = patch.arkaPlanda;
  if (typeof patch.acilistaBaslat === 'boolean') {
    settings.acilistaBaslat = patch.acilistaBaslat;
    if (process.platform === 'win32' || process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: patch.acilistaBaslat, openAsHidden: true, args: ['--gizli'] });
  }
  if (patch.smtp && typeof patch.smtp === 'object') {
    const s = patch.smtp;
    if (typeof s.host === 'string') settings.smtp.host = s.host.trim().slice(0, 200);
    if (s.port != null && Number.isInteger(+s.port) && +s.port > 0 && +s.port < 65536) settings.smtp.port = +s.port;
    if (typeof s.secure === 'boolean') settings.smtp.secure = s.secure;
    if (typeof s.user === 'string') settings.smtp.user = s.user.trim().slice(0, 200);
    if (typeof s.from === 'string') settings.smtp.from = s.from.trim().slice(0, 200);
    if (s.pass === null) settings.smtp.passEnc = '';
    if (typeof s.pass === 'string' && s.pass) {
      // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); the spaces are not part of the password
      const pass = /(^|\.)(gmail|googlemail)\.com$/i.test(settings.smtp.host) ? s.pass.replace(/\s+/g, '') : s.pass;
      if (safeStorage.isEncryptionAvailable()) settings.smtp.passEnc = safeStorage.encryptString(pass).toString('base64');
      else { saveSettings(); throw new Error('Diğer ayarlar kaydedildi, ama bu bilgisayarda güvenli anahtar deposu olmadığı için e-posta şifresi kaydedilmedi.'); }
    }
  }
  saveSettings();
}

/* ---------- window ---------- */
function createWindow(show = true) {
  // fit the work area: laptops at 125–150 % scaling have as little as ~1280×680 points, and a taller
  // window would open with its title bar off screen
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1320, Math.max(420, wa.width - 40)), height = Math.min(900, Math.max(500, wa.height - 40));
  win = new BrowserWindow({
    width, height, minWidth: Math.min(420, wa.width), minHeight: Math.min(500, wa.height), show: false, center: true,
    title: 'Portföy Defteri', backgroundColor: nativeTheme.shouldUseDarkColors ? '#0F1412' : '#F3F4F0',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: !app.isPackaged }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (show) win.show(); });
  // Links open in the default browser; the window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); });
  win.on('close', e => {
    if (!quitting && settings.arkaPlanda) {
      e.preventDefault(); win.hide(); if (process.platform === 'darwin') app.dock && app.dock.hide();
      // the first time, say where the app went (otherwise it looks like it closed or vanished)
      if (!settings.tepsiBilgisi && Notification.isSupported()) {
        settings.tepsiBilgisi = true; saveSettings();
        new Notification({ title: 'Portföy Defteri arka planda çalışıyor', body: process.platform === 'darwin' ? 'Sabah işini yapabilmek için açık kalır. Menü çubuğundaki simgeden açabilir ya da "Çık" ile kapatabilirsiniz.' : 'Sabah işini yapabilmek için açık kalır. Saatin yanındaki simgeden (gerekirse ^ okuna tıklayın) açabilir ya da "Çık" ile kapatabilirsiniz.' }).show();
      }
    }
  });
  win.webContents.on('did-start-loading', () => { sayfaHazir = false; });
  win.on('closed', () => { win = null; sayfaHazir = false; });
}
function showWindow() {
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  if (!win) createWindow(true); else { win.show(); win.focus(); }
}
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  if (process.platform === 'darwin') img.setTemplateImage(true);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Portföy Defteri');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Portföy Defteri\'ni aç', click: showWindow },
    { label: 'Fiyatları şimdi güncelle', click: () => runRefresh('elle').catch(() => {}) },
    { type: 'separator' },
    { label: 'Çık', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}
function broadcast(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

/* ---------- prices, report, schedule ---------- */
let refreshing = null;
// Codes in the ledger that have no price yet (just added by hand, from an Excel file or the BIST 100 page).
// They are fetched right away instead of waiting for the morning run; a code is retried at most every 10 minutes.
const eksikDenendi = new Map();
function eksikKodlar() {
  const d = store.get(`data/users/${UID}/defter`) || {}, v = (store.get('piyasa/fiyatlar') || {}).veriler || {};
  return (d.hisseler || []).map(h => h && h.kod).filter(k => /^[A-Z0-9]{2,8}$/.test(k || '') && !v[k] && Date.now() - (eksikDenendi.get(k) || 0) > 10 * 60e3);
}
let eksikZaman = null;
function eksikFiyatKontrol() {
  clearTimeout(eksikZaman);
  eksikZaman = setTimeout(async () => {
    if (refreshing) { try { await refreshing; } catch (e) {} }
    const k = eksikKodlar(); if (!k.length) return;
    k.forEach(x => eksikDenendi.set(x, Date.now()));
    runRefresh('yeni kod').catch(() => {});
  }, 1500);
}
// ekKodlar: codes shown on screen while the ledger is still empty (the sample portfolio on first launch).
function runRefresh(neden, ekKodlar) {
  if (refreshing) return refreshing;
  broadcast('durum', { calisiyor: true, neden });
  refreshing = prices.refresh(store, agFetch, UID, ekKodlar)
    // an automatic run with nothing to fetch stays silent
    .then(r => { broadcast('durum', { calisiyor: false, sonuc: neden === 'elle' || r.toplam ? r : null }); return r; })
    .catch(e => { broadcast('durum', { calisiyor: false, hata: e.message }); throw e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// The report is built by the page itself (it owns the calculations); main asks for it over IPC.
const bekleyen = new Map();
let sayfaHazir = false;
async function sayfayiBekle() {
  if (!win) { sayfaHazir = false; createWindow(false); }
  for (let i = 0; i < 60 && !sayfaHazir; i++) await new Promise(r => setTimeout(r, 250));
  if (!sayfaHazir) throw new Error('Uygulama ekranı hazırlanamadı.');
}
async function raporIste() {
  await sayfayiBekle();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { bekleyen.delete(id); reject(new Error('Rapor hazırlanamadı (zaman aşımı).')); }, 20000);
    bekleyen.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
    win.webContents.send('rapor:hazirla', { id });
  });
}
async function mailGonder({ subject, html, text }) {
  if (!EMAIL_RE.test(settings.raporEmail || '')) throw new Error('Rapor e-posta adresi girilmemiş.');
  const s = settings.smtp;
  if (!s.host || !s.user || !s.passEnc) throw new Error('E-posta sunucusu ayarları eksik.');
  const nodemailer = require('nodemailer');
  const pass = safeStorage.decryptString(Buffer.from(s.passEnc, 'base64'));
  // port 587 starts plain and must switch to TLS before the password is sent
  const tr = nodemailer.createTransport({ host: s.host, port: s.port, secure: !!s.secure, requireTLS: !s.secure && +s.port === 587, auth: { user: s.user, pass }, connectionTimeout: 15000 });
  try { await tr.sendMail({ from: s.from || s.user, to: settings.raporEmail, subject, html, text }); }
  catch (e) { throw new Error(epostaHatasi(e, s.host)); }
}
async function sabahGorevi(neden, { raporuErtele = false } = {}) {
  let r;
  try { r = await runRefresh(neden); } catch (e) { r = { guncel: 0, toplam: 1, ozet: 'Fiyatlar alınamadı: ' + e.message }; }
  let rapor = 'kapalı';
  // no prices yet (offline, sources down): wait for the next try instead of mailing yesterday's numbers
  if (settings.raporAktif && !zamanlama.raporGonderilsin(settings, r, raporuErtele)) rapor = 'ertelendi, fiyatlar alınınca gönderilecek';
  else if (settings.raporAktif) {
    try { await mailGonder(await raporIste()); rapor = 'gönderildi'; }
    catch (e) { rapor = 'gönderilemedi: ' + e.message; if (Notification.isSupported()) new Notification({ title: 'Portföy Defteri', body: 'Sabah raporu gönderilemedi: ' + e.message }).show(); }
  }
  const d = store.get('piyasa/durum') || {};
  store.set('piyasa/durum', { ...d, ozet: `${r.ozet}. Rapor ${rapor}.` });
  return { ...r, rapor };
}
// Runs once per day after the chosen time. If the computer was off or offline it catches up later,
// retrying every 15 minutes until prices could be fetched (or the report sent).
let gorevSuruyor = false, sonDeneme = 0;
function zamanlayici() {
  const simdi = new Date();
  if (!zamanlama.calismali(simdi, settings, { suruyor: gorevSuruyor, sonDeneme })) return;
  gorevSuruyor = true; sonDeneme = Date.now();
  const gec = zamanlama.gecKaldi(simdi, settings.raporSaati);
  sabahGorevi('zamanlanmış', { raporuErtele: !gec }).then(r => {
    if (zamanlama.gunTamam(settings, r, gec)) { settings.sonOtomatikGun = zamanlama.gun(new Date()); saveSettings(); }
  }).catch(() => {}).finally(() => { gorevSuruyor = false; });
}

/* ---------- IPC ---------- */
function handle(ch, fn) { ipcMain.handle(ch, async (e, ...a) => { if (!win || e.sender !== win.webContents) throw new Error('izin yok'); return fn(...a); }); }
function registerIpc() {
  handle('store:get', p => store.get(p));
  handle('store:set', (p, d) => { store.set(p, d); return true; });
  handle('store:delete', p => { store.delete(p); return true; });
  handle('file:save', async (filename, bytes) => {
    const ext = path.extname(String(filename)).toLowerCase();
    if (!['.xlsx', '.csv', '.json', '.txt', '.html'].includes(ext)) return { ok: false, code: 'rejected_extension' };
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), path.basename(String(filename))), filters: ext === '.xlsx' ? [{ name: 'Excel', extensions: ['xlsx'] }] : [{ name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }] });
    if (r.canceled || !r.filePath) return { ok: false, code: 'declined' };
    fs.writeFileSync(r.filePath, Buffer.from(bytes));
    return { ok: true, path: r.filePath };
  });
  handle('bist100:yenile', () => prices.bist100(store, agFetch));
  handle('prices:refresh', kodlar => runRefresh('elle', Array.isArray(kodlar) ? kodlar.slice(0, 50).filter(k => k && /^[A-Z0-9]{2,8}$/.test(k.kod) && ['Hisse', 'Fon'].includes(k.tip)).map(k => ({ kod: k.kod, tip: k.tip })) : null));
  handle('prices:test', () => prices.testSources(agFetch));
  handle('settings:get', () => publicSettings());
  handle('settings:set', patch => { applySettings(patch); return publicSettings(); });
  handle('mail:test', async () => { await mailGonder(await raporIste()); return true; });
  handle('rapor:simdi', () => sabahGorevi('elle'));
  handle('app:dataFolder', () => shell.openPath(app.getPath('userData')));
  ipcMain.on('sayfa:hazir', e => { if (win && e.sender === win.webContents) sayfaHazir = true; });
  ipcMain.on('rapor:cevap', (e, { id, ok, rapor, hata }) => {
    const b = bekleyen.get(id); if (!b) return; bekleyen.delete(id);
    if (ok && rapor && typeof rapor.subject === 'string' && typeof rapor.html === 'string') b.resolve({ subject: rapor.subject.slice(0, 200), html: rapor.html, text: String(rapor.text || '') });
    else b.reject(new Error(hata || 'Rapor hazırlanamadı.'));
  });
}

/* ---------- start ---------- */
app.on('second-instance', showWindow);
app.whenReady().then(() => {
  if (!tekKopya) return;
  // Linux test machines have no key store; tests opt into Electron's plain-text mode. Never used on Windows/macOS.
  if (process.env.PD_TEST_FIXTURES && process.platform === 'linux' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true);
  iz('hazır: ayarlar');
  settingsFile = path.join(app.getPath('userData'), 'ayarlar.json');
  iz('depo');
  store = new Store(app.getPath('userData'));
  iz('ayarlar okunuyor');
  loadSettings();
  // The page never talks to the internet: block every http(s) request from the window's session.
  iz('ağ engeli');
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => cb({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  // Price requests use their own session (system proxy settings still apply).
  iz('fiyat oturumu');
  fetcher = session.fromPartition('fiyat-kaynaklari');
  store.on('change', (p, data) => { broadcast('store:changed', { path: p, data }); if (p === `data/users/${UID}/defter`) eksikFiyatKontrol(); });
  store.on('error', e => { broadcast('durum', { kayitHatasi: e.message }); if (Notification.isSupported()) new Notification({ title: 'Portföy Defteri', body: 'Değişiklikler diske yazılamadı: ' + e.message }).show(); });
  // macOS needs an application menu for copy/paste shortcuts in text fields; Windows needs none.
  iz('menü');
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  iz('ipc');
  registerIpc();
  iz('tepsi simgesi');
  createTray();
  iz('giriş öğesi ayarları');
  const gizli = process.argv.includes('--gizli') || app.getLoginItemSettings().wasOpenedAsHidden;
  iz('pencere');
  createWindow(!gizli);
  iz('açıldı');
  // Refresh on start when prices are older than 12 hours, then check the schedule every minute.
  const f = store.get('piyasa/fiyatlar');
  const yas = f && f.guncelleme ? (() => { const m = /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/.exec(f.guncelleme); return m ? Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]).getTime() : Infinity; })() : Infinity;
  setTimeout(() => { if (yas > 12 * 3600e3 || eksikKodlar().length) runRefresh('açılış').catch(() => {}); zamanlayici(); }, 4000);
  setInterval(zamanlayici, 60 * 1000);
  powerMonitor.on('resume', () => setTimeout(zamanlayici, 20000));
  app.on('activate', showWindow);
});
app.on('before-quit', () => { quitting = true; try { store && store.flush(); } catch {} });
app.on('window-all-closed', () => { if (!settings || !settings.arkaPlanda) app.quit(); });
