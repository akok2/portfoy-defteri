// Price collection for Portföy Defteri.
// Only ticker / fund codes ever leave the computer: no amounts, lots or personal data are sent.
// Each source is an adapter; a price is "verified" when two independent sources agree within 1.5%.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const KOD_RE = /^[A-Z0-9]{2,8}$/;

function makeHttp(fetchImpl) {
  return async function http(url, { method = 'GET', body, headers = {}, timeout = 12000, type = 'json' } = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetchImpl(url, { method, body, signal: ac.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', ...headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return type === 'json' ? await res.json() : type === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : await res.text();
    } finally { clearTimeout(t); }
  };
}

const num = v => {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
};
const istDate = (sec, offset) => new Date((sec + (offset || 10800)) * 1000).toISOString().slice(0, 10);

/* ---------- adapters ---------- */

// Yahoo Finance chart endpoint: last price plus one year of daily closes (fills weekly/monthly/yearly returns).
async function yahoo(http, kod) {
  const yol = `/v8/finance/chart/${encodeURIComponent(kod)}.IS?range=1y&interval=1d&includePrePost=false`;
  let j;
  try { j = await http('https://query1.finance.yahoo.com' + yol); } catch (e) { j = await http('https://query2.finance.yahoo.com' + yol); }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.meta) throw new Error('yanıt boş');
  const m = r.meta, ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const hist = [];
  ts.forEach((t, i) => { if (cl[i] != null && isFinite(cl[i])) hist.push([istDate(t, m.gmtoffset), Math.round(cl[i] * 10000) / 10000]); });
  const fiyat = Number(m.regularMarketPrice);
  if (!(fiyat > 0)) throw new Error('fiyat yok');
  const gun = m.regularMarketTime ? istDate(m.regularMarketTime, m.gmtoffset) : (hist.length ? hist[hist.length - 1][0] : null);
  // previous close = last close dated before the price's own day
  const once = [...hist].reverse().find(h => h[0] < gun);
  const saat = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 10800)) * 1000).toISOString().slice(11, 16) : '18:10';
  return { fiyat, onceki: once ? once[1] : null, tarih: `${gun} ${saat}`, ad: m.longName || m.shortName || '', gecmis: hist, kaynak: 'Yahoo' };
}

// Bigpara (Hürriyet) quote endpoint. Field names are read defensively.
async function bigpara(http, kod) {
  const j = await http(`https://bigpara.hurriyet.com.tr/api/v1/borsa/hisseyuzeysel/${encodeURIComponent(kod)}`, { headers: { Referer: 'https://bigpara.hurriyet.com.tr/' } });
  const d = (j && j.data && (j.data.hisseYuzeysel || j.data)) || j;
  const pick = (...keys) => { for (const k of keys) { const hit = Object.keys(d || {}).find(x => x.toLowerCase() === k); if (hit && isFinite(num(d[hit])) && num(d[hit]) > 0) return num(d[hit]); } return null; };
  const fiyat = pick('kapanis', 'son', 'sonfiyat', 'satis', 'alis');
  if (!(fiyat > 0)) throw new Error('fiyat alanı bulunamadı');
  const tarihAlan = Object.keys(d).find(x => /tarih/i.test(x));
  const t = tarihAlan ? new Date(d[tarihAlan]) : null;
  const tarih = t && !isNaN(t) ? `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)}` : null;
  return { fiyat, onceki: pick('dunkukapanis', 'oncekikapanis', 'dunkapanis'), tarih, ad: d.aciklama || '', kaynak: 'Bigpara' };
}

// TradingView public scanner (15-minute delayed BIST quotes). Independent second source for stocks.
async function tradingview(http, kod) {
  const j = await http('https://scanner.tradingview.com/turkey/scan', {
    method: 'POST',
    body: JSON.stringify({ symbols: { tickers: [`BIST:${kod}`], query: { types: [] } }, columns: ['close', 'description', 'change'] }),
    headers: { 'Content-Type': 'application/json' } // no Origin/Referer: Chromium's network stack rejects a cross-site Origin (net::ERR_FAILED)
  });
  const row = j && Array.isArray(j.data) && j.data[0];
  const d = row && row.d;
  const fiyat = d ? Number(d[0]) : NaN;
  if (!(fiyat > 0)) throw new Error('fiyat yok');
  const deg = Number(d[2]);
  return { fiyat, onceki: isFinite(deg) && deg > -100 ? Math.round(fiyat / (1 + deg / 100) * 10000) / 10000 : null, tarih: null, ad: d[1] || '', kaynak: 'TradingView' };
}

// İş Yatırım quote endpoint.
async function isyatirim(http, kod) {
  let j = await http(`https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/OneEndeks?endeks=${encodeURIComponent(kod)}`, { headers: { Referer: 'https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/default.aspx' } });
  if (Array.isArray(j)) j = j[0];
  const fiyat = j ? num(j.last) : NaN;
  if (!(fiyat > 0)) throw new Error('fiyat yok');
  const t = j.updateDate ? new Date(String(j.updateDate).replace(/\+03$/, '+03:00')) : null;
  const tarih = t && !isNaN(t) ? new Date(t.getTime() + 10800000).toISOString().replace('T', ' ').slice(0, 16) : null;
  return { fiyat, onceki: num(j.dayClose) > 0 ? num(j.dayClose) : null, tarih, ad: '', kaynak: 'İş Yatırım' };
}

// TEFAS. The site was redesigned in 2026; the new JSON API is tried first, the old endpoint is kept as a fallback.
const tefasTarih = v => {
  if (v == null) return null;
  if (typeof v === 'number' || /^\d{12,}$/.test(String(v))) return new Date(Number(v) + 10800000).toISOString().slice(0, 10);
  const s = String(v);
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[./-](\d{2})[./-](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};
function tefasSonuc(rows) {
  const seri = new Map();
  for (const r of rows) if (r.gun && r.f > 0) seri.set(r.gun, r);
  const sirali = [...seri.values()].sort((a, b) => a.gun < b.gun ? -1 : 1);
  if (!sirali.length) return null;
  const son = sirali[sirali.length - 1], once = sirali[sirali.length - 2];
  return { fiyat: son.f, onceki: once ? once.f : null, tarih: `${son.gun} 18:00`, ad: son.ad || '', kaynak: 'TEFAS', gecmisEk: sirali.map(r => [r.gun, r.f]) };
}
const TEFAS_JSON = { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/tr/fon-verileri' };
const tefasListe = j => {
  if (j && j.errorMessage && !/out of bounds|bulunamad/i.test(j.errorMessage)) throw new Error(String(j.errorMessage).slice(0, 80));
  return (j && (j.resultList || j.data)) || [];
};
async function tefasYeni(http, kod) {
  // 1) price history endpoint (works for every fund type; one year so weekly/monthly/year-to-date returns can be shown)
  try {
    const j = await http('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir', { method: 'POST', body: JSON.stringify({ fonKodu: kod, dil: 'TR', periyod: 12 }), headers: TEFAS_JSON });
    const r = tefasSonuc(tefasListe(j).map(x => ({ gun: tefasTarih(x.tarih), f: num(x.fiyat), ad: x.fonUnvan })));
    if (r) return r;
  } catch (e) { if (/HTTP 429/.test(e.message)) throw e; }
  // 2) general info endpoint, per fund type, last 14 days
  const g = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const bit = new Date(), bas = new Date(Date.now() - 14 * 864e5);
  let sonHata = null;
  for (const tip of ['YAT', 'EMK', 'BYF']) {
    try {
      const j = await http('https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir', { method: 'POST', headers: TEFAS_JSON, body: JSON.stringify({ fonTipi: tip, fonKodu: kod, aramaMetni: null, fonTurKod: null, fonGrubu: null, sfonTurKod: null, fonTurAciklama: null, kurucuKod: null, basTarih: g(bas), bitTarih: g(bit), basSira: 1, bitSira: 1000, dil: 'TR', sFonTurKod: '', fonKod: '', fonGrup: '', fonUnvanTip: '' }) });
      const r = tefasSonuc(tefasListe(j).filter(x => !x.fonKodu || String(x.fonKodu).toUpperCase() === kod).map(x => ({ gun: tefasTarih(x.tarih), f: num(x.fiyat), ad: x.fonUnvan })));
      if (r) return r;
    } catch (e) { sonHata = e; }
  }
  throw sonHata || new Error('fon bulunamadı');
}
async function tefasEski(http, kod) {
  const bit = new Date(), bas = new Date(Date.now() - 14 * 864e5);
  const f = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  for (const tip of ['YAT', 'EMK', 'BYF']) {
    const body = new URLSearchParams({ fontip: tip, sfontur: '', fonkod: kod, fongrup: '', bastarih: f(bas), bittarih: f(bit), fonturkod: '', fonunvantip: '' }).toString();
    const j = await http('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx' }
    });
    const r = tefasSonuc(((j && j.data) || []).map(x => ({ gun: tefasTarih(Number(x.TARIH)), f: num(x.FIYAT), ad: x.FONUNVAN })));
    if (r) return r;
  }
  throw new Error('fon bulunamadı');
}
async function tefas(http, kod) {
  try { return await tefasYeni(http, kod); } catch (e1) {
    try { return await tefasEski(http, kod); } catch (e2) { throw new Error(`yeni API: ${e1.message}; eski API: ${e2.message}`); }
  }
}

// Dividend and split (bonus issue) events from Yahoo. Monthly bars over ten years keep the answer small;
// the events still carry their exact dates. Amounts are per share as Yahoo reports them (adjusted for later splits).
async function temettuOlaylari(http, kod) {
  const yol = `/v8/finance/chart/${encodeURIComponent(kod)}.IS?range=10y&interval=1mo&events=div%2Csplit`;
  let j;
  try { j = await http('https://query1.finance.yahoo.com' + yol); } catch (e) { j = await http('https://query2.finance.yahoo.com' + yol); }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error('yanıt boş');
  const ev = r.events || {}, off = (r.meta && r.meta.gmtoffset) || 10800;
  const sirala = a => a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  const temettu = sirala(Object.values(ev.dividends || {}).filter(d => d && d.amount > 0 && d.date).map(d => [istDate(d.date, off), Math.round(d.amount * 1e6) / 1e6]));
  const bolunme = sirala(Object.values(ev.splits || {}).filter(x => x && x.numerator > 0 && x.denominator > 0 && x.date).map(x => [istDate(x.date, off), x.numerator / x.denominator]));
  return { temettu, bolunme };
}

// BIST 100: constituents from Borsa İstanbul's own list (TradingView's index list as fallback),
// prices from TradingView in one request (Yahoo one by one as fallback).
function metinCoz(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1254').decode(b); }
}
async function bistBilesenleriBIST(http) {
  const csv = metinCoz(await http('https://www.borsaistanbul.com/datum/hisse_endeks_ds.csv', { type: 'bytes', timeout: 20000 }));
  const satirlar = csv.split(/\r?\n/).map(l => l.split(';').map(x => x.replace(/^"|"$/g, '').trim()));
  const hi = satirlar.findIndex(r => r.some(c => /BILESEN KODU|BİLEŞEN KODU/i.test(c)) && r.some(c => /ENDEKS KODU/i.test(c)));
  if (hi < 0) throw new Error('liste biçimi tanınmadı');
  const H = satirlar[hi], ix = re => H.findIndex(c => re.test(c));
  const iKod = ix(/BILESEN KODU|BİLEŞEN KODU/i), iEnd = ix(/ENDEKS KODU/i), iAd = ix(/BULTEN_ADI|BÜLTEN ADI|BULTEN ADI/i);
  const m = new Map();
  for (const r of satirlar.slice(hi + 1)) {
    if ((r[iEnd] || '').toUpperCase() !== 'XU100') continue;
    const kod = (r[iKod] || '').replace(/\.E$/i, '').toUpperCase();
    if (KOD_RE.test(kod)) m.set(kod, iAd >= 0 ? r[iAd] : '');
  }
  if (m.size < 80) throw new Error(`listede yalnızca ${m.size} hisse var`);
  return [...m].map(([kod, ad]) => ({ kod, ad }));
}
async function tvTara(http, govde) {
  const j = await http('https://scanner.tradingview.com/turkey/scan', { method: 'POST', body: JSON.stringify({ columns: ['close', 'change', 'description', 'volume'], ...govde }), headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
  return ((j && j.data) || []).map(r => ({ kod: String(r.s || '').replace(/^BIST:/, ''), fiyat: Number(r.d && r.d[0]), degisim: r.d && isFinite(r.d[1]) ? r.d[1] / 100 : null, ad: (r.d && r.d[2]) || '' })).filter(x => KOD_RE.test(x.kod));
}
async function bist100(store, fetchImpl) {
  const http = makeHttp(fetchImpl);
  let liste = null, kaynak = [], hatalar = [];
  try { liste = await bistBilesenleriBIST(http); kaynak.push('Borsa İstanbul listesi'); } catch (e) { hatalar.push('Borsa İstanbul: ' + e.message); }
  let fiyatlar = new Map();
  if (!liste) {
    try { const r = await tvTara(http, { symbols: { symbolset: ['SYML:BIST;XU100'] }, range: [0, 200] }); if (r.length >= 80) { liste = r.map(x => ({ kod: x.kod, ad: x.ad })); r.forEach(x => fiyatlar.set(x.kod, x)); kaynak.push('TradingView listesi'); } else hatalar.push(`TradingView listesi: ${r.length} hisse`); } catch (e) { hatalar.push('TradingView listesi: ' + e.message); }
  }
  if (!liste) throw new Error(hatalar.join('; '));
  if (!fiyatlar.size) {
    try { (await tvTara(http, { symbols: { tickers: liste.map(x => 'BIST:' + x.kod), query: { types: [] } } })).forEach(x => fiyatlar.set(x.kod, x)); } catch (e) { hatalar.push('TradingView fiyatları: ' + e.message); }
  }
  if (fiyatlar.size >= liste.length * 0.8) kaynak.push('TradingView fiyatları');
  else {
    const eksik = liste.filter(x => !fiyatlar.has(x.kod));
    await pool(eksik, 8, async x => { try { const y = await yahoo(http, x.kod); fiyatlar.set(x.kod, { kod: x.kod, fiyat: y.fiyat, degisim: y.onceki ? y.fiyat / y.onceki - 1 : null }); } catch (e) {} });
    kaynak.push('Yahoo fiyatları');
  }
  const t = now();
  const doc = { guncelleme: t.tr, zaman: Date.now(), kaynak: kaynak.join(' · '), hatalar, liste: liste.map(x => { const f = fiyatlar.get(x.kod) || {}; return { kod: x.kod, ad: x.ad || f.ad || '', fiyat: isFinite(f.fiyat) && f.fiyat > 0 ? f.fiyat : null, degisim: isFinite(f.degisim) ? f.degisim : null }; }) };
  store.set('piyasa/bist100', doc);
  return { sayi: doc.liste.length, fiyatli: doc.liste.filter(x => x.fiyat != null).length, kaynak: doc.kaynak };
}

// Central Bank of the Republic of Türkiye daily indicative rates.
async function tcmb(http) {
  const x = await http('https://www.tcmb.gov.tr/kurlar/today.xml', { type: 'text' });
  const tarih = (/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(x) || []).slice(1);
  const kur = kod => {
    const blk = new RegExp(`<Currency[^>]*Kod="${kod}"[\\s\\S]*?</Currency>`).exec(x);
    if (!blk) return null;
    const a = /<ForexBuying>([\d.]+)<\/ForexBuying>/.exec(blk[0]), s = /<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(blk[0]);
    return a && s ? { alis: Number(a[1]), satis: Number(s[1]), tarih: tarih.length ? `${tarih[2]}-${tarih[1]}-${tarih[0]}` : null, kaynak: 'TCMB' } : null;
  };
  const USD = kur('USD'), EUR = kur('EUR');
  if (!USD) throw new Error('kur bulunamadı');
  return { USD, EUR };
}

/* ---------- orchestration ---------- */

function now() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return { tr: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`, iso: d.toISOString().slice(0, 10) };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// Bigpara answers HTTP 403 to these requests (seen from Türkiye and abroad), so it is no longer queried.
const HISSE_KAYNAKLARI = [['Yahoo', yahoo], ['TradingView', tradingview], ['İş Yatırım', isyatirim]];
// A source that answered "no such code" (as opposed to a network or server problem).
const BULUNAMADI_RE = /HTTP 404|fiyat yok|yanıt boş|bulunamad|fiyat alanı/;
async function stockQuote(http, kod) {
  const res = await Promise.allSettled(HISSE_KAYNAKLARI.map(([, fn]) => fn(http, kod)));
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const hatalar = res.map((r, i) => r.status === 'rejected' ? `${HISSE_KAYNAKLARI[i][0]}: ${r.reason && r.reason.message || r.reason}` : null).filter(Boolean);
  if (!ok.length) return { kod, hata: hatalar.join('; '), bulunamadi: hatalar.every(h => BULUNAMADI_RE.test(h)) };
  // Main price: Yahoo when available (it also brings the daily history), otherwise the first source that answered.
  const ana = ok[0], digerleri = ok.slice(1);
  let dogrulama = 'tek-kaynak', not = '';
  if (digerleri.length) {
    const uyan = digerleri.filter(o => Math.abs(ana.fiyat / o.fiyat - 1) <= 0.015);
    if (uyan.length) dogrulama = 'iki-kaynak';
    else { dogrulama = 'uyusmazlik'; not = ok.map(o => `${o.kaynak} ${o.fiyat}`).join(' · '); }
  }
  const onceki = ana.onceki != null ? ana.onceki : (digerleri.find(o => o.onceki != null) || {}).onceki;
  if (onceki > 0 && Math.abs(ana.fiyat / onceki - 1) > 0.105 && dogrulama !== 'uyusmazlik') { dogrulama = 'supheli'; not = 'Günlük hareket %10\'dan büyük; bedelsiz ya da bölünme olabilir, kontrol edin'; }
  return { kod, fiyat: ana.fiyat, onceki: onceki ?? null, tarih: ana.tarih || (digerleri.find(o => o.tarih) || {}).tarih || now().iso + ' 18:10', ad: ana.ad || (digerleri.find(o => o.ad) || {}).ad || '', kaynak: ok.map(o => o.kaynak).join(' + '), dogrulama, not, gecmis: ok.find(o => o.gecmis)?.gecmis, uyari: ok.length < 2 ? hatalar.join('; ') : '' };
}

async function fundQuote(http, kod) {
  try {
    const q = await tefas(http, kod);
    let dogrulama = 'tek-kaynak', not = '';
    if (q.onceki > 0 && Math.abs(q.fiyat / q.onceki - 1) > 0.15) { dogrulama = 'supheli'; not = 'Günlük hareket %15\'ten büyük, kontrol edin'; }
    return { kod, ...q, dogrulama, not };
  } catch (e) { return { kod, hata: `TEFAS: ${e.message}`, bulunamadi: /yeni API: (fon bulunamad|HTTP 404|yanıt boş)/.test(e.message) || /^fon bulunamad/.test(e.message) }; }
}

// Refresh every code in the ledger. `store` is the local Store.
async function refresh(store, fetchImpl, uid = 'local', ekKodlar = null) {
  const http = makeHttp(fetchImpl);
  const defter = store.get(`data/users/${uid}/defter`) || { hisseler: [] };
  let liste = (defter.hisseler || []);
  // empty ledger: use the codes the screen is showing (sample portfolio), if any were passed
  if (!liste.length && Array.isArray(ekKodlar)) liste = ekKodlar;
  const kodlar = [...new Map(liste.filter(h => h && KOD_RE.test(h.kod)).map(h => [h.kod, h.tip === 'Fon' ? 'Fon' : 'Hisse'])).entries()];
  // If a code was filed under the wrong type (for example a fund imported as a share), try the other kind before giving up.
  const sonuc = await pool(kodlar, 4, async ([kod, tip]) => {
    const q = tip === 'Fon' ? await fundQuote(http, kod) : await stockQuote(http, kod);
    if (!q.hata) return q;
    // only where the code's shape fits the other kind: TEFAS codes have 3 characters, BIST tickers 4 or more
    const digerUygun = tip === 'Fon' ? kod.length >= 4 : kod.length === 3;
    if (!digerUygun) return q;
    const diger = tip === 'Fon' ? await stockQuote(http, kod) : await fundQuote(http, kod);
    return diger.hata ? { ...q, bulunamadi: q.bulunamadi && diger.bulunamadi } : { ...diger, uyari: `${kod} ${tip === 'Fon' ? 'fon' : 'hisse'} olarak kayıtlı ama ${tip === 'Fon' ? 'hisse' : 'fon'} fiyatı bulundu; hisse detayından türünü düzeltin.` };
  });
  let doviz = null, dovizHata = null;
  try { doviz = await tcmb(http); } catch (e) { dovizHata = e.message; }

  const t = now();
  const eski = store.get('piyasa/fiyatlar') || { veriler: {} };
  const veriler = { ...(eski.veriler || {}) };
  const gecmisDoc = store.get('piyasa/gecmis') || { veriler: {} };
  const gecmis = { ...(gecmisDoc.veriler || {}) };
  const basarisiz = [];
  let iki = 0, guncel = 0;
  for (const s of sonuc) {
    if (s.hata) { basarisiz.push(s.kod); continue; }
    guncel++; if (s.dogrulama === 'iki-kaynak') iki++;
    veriler[s.kod] = { fiyat: s.fiyat, onceki: s.onceki, tarih: s.tarih, kaynak: s.kaynak, ad: s.ad, dogrulama: s.dogrulama, not: s.not };
    if (s.gecmis && s.gecmis.length) gecmis[s.kod] = s.gecmis.slice(-260);
    else {
      const seri = new Map((gecmis[s.kod] || []).map(x => [x[0], x[1]]));
      (s.gecmisEk || []).forEach(([d, c]) => seri.set(d, c));
      seri.set(String(s.tarih).slice(0, 10), s.fiyat);
      gecmis[s.kod] = [...seri.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-260);
    }
  }
  const fiyatDoc = { guncelleme: guncel ? t.tr : (eski.guncelleme || null), veriler, doviz: doviz || eski.doviz || null };
  store.set('piyasa/fiyatlar', fiyatDoc);
  store.set('piyasa/gecmis', { veriler: gecmis });
  const islemli = new Set(((defter.islemler) || []).map(x => x.kod));
  const hisseler = kodlar.filter(([kod, tip]) => tip === 'Hisse' && (islemli.has(kod) || !islemli.size)).map(([kod]) => kod);
  if (hisseler.length) {
    const tDoc = store.get('piyasa/temettu') || { veriler: {} }; const tv = { ...(tDoc.veriler || {}) }; let tGuncel = 0;
    await pool(hisseler, 4, async kod => { try { tv[kod] = await temettuOlaylari(http, kod); tGuncel++; } catch (e) {} });
    if (tGuncel) store.set('piyasa/temettu', { guncelleme: t.tr, veriler: tv });
  }
  const ozet = !kodlar.length ? 'Defterde fiyatı çekilecek hisse ya da fon yok. Önce bir alış girin ya da Excel\'den yükleyin.' : `${guncel}/${kodlar.length} fiyat güncellendi (${iki} iki kaynakla doğrulandı)` + (() => { const yok = sonuc.filter(x => x.hata && x.bulunamadi).map(x => x.kod), diger = basarisiz.filter(k => !yok.includes(k));
    return (yok.length ? `. Hiçbir kaynakta bulunamayan kod: ${yok.join(', ')} (yazımını kontrol edin)` : '') + (diger.length ? `. Güncellenemeyen: ${diger.join(', ')}` : ''); })() + (dovizHata ? `. Döviz kuru alınamadı (${dovizHata})` : '');
  // per code: why the last try failed, and whether every source said the code does not exist (likely a typo)
  const kodHata = {};
  for (const s of sonuc) if (s.hata) kodHata[s.kod] = { mesaj: s.hata.slice(0, 300), bulunamadi: !!s.bulunamadi, tarih: t.tr };
  const durum = { ...(store.get('piyasa/durum') || {}), sonCalisma: t.tr, ozet, kodHata, ayrinti: sonuc.filter(s => s.hata || s.uyari).map(s => `${s.kod}: ${s.hata || s.uyari}`).slice(0, 60) };
  store.set('piyasa/durum', durum);
  return { guncel, toplam: kodlar.length, iki, basarisiz, dovizHata, ozet };
}

// Diagnostics: try each source once with well-known codes.
async function testSources(fetchImpl) {
  const http = makeHttp(fetchImpl);
  const deneme = async (ad, fn) => { const t0 = Date.now(); try { const r = await fn(); return { ad, ok: true, ms: Date.now() - t0, ornek: r }; } catch (e) { return { ad, ok: false, ms: Date.now() - t0, hata: e.message }; } };
  return Promise.all([
    deneme('Yahoo Finance (hisse)', async () => { const r = await yahoo(http, 'THYAO'); return `THYAO ${r.fiyat} · ${r.tarih} · ${r.gecmis.length} günlük geçmiş`; }),
    deneme('TradingView (hisse)', async () => { const r = await tradingview(http, 'THYAO'); return `THYAO ${r.fiyat}`; }),
    deneme('İş Yatırım (hisse)', async () => { const r = await isyatirim(http, 'THYAO'); return `THYAO ${r.fiyat}${r.tarih ? ' · ' + r.tarih : ''}`; }),
    deneme('TEFAS (fon)', async () => { const r = await tefas(http, 'AFT'); return `AFT ${r.fiyat} · ${r.tarih}`; }),
    deneme('TCMB (döviz)', async () => { const r = await tcmb(http); return `USD ${r.USD.satis} · EUR ${r.EUR ? r.EUR.satis : '—'}`; })
  ]);
}

module.exports = { refresh, testSources, bist100, _internal: { temettuOlaylari, bistBilesenleriBIST, tvTara, yahoo, bigpara, tradingview, isyatirim, tefas, tefasYeni, tefasEski, tefasTarih, tcmb, makeHttp, stockQuote } };
