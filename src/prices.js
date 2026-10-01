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
      return type === 'json' ? await res.json() : await res.text();
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
  const j = await http(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(kod)}.IS?range=1y&interval=1d&includePrePost=false`);
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

// TEFAS fund history endpoint (fund price is published once per business day).
async function tefas(http, kod) {
  const bit = new Date(), bas = new Date(Date.now() - 14 * 864e5);
  const f = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  for (const tip of ['YAT', 'EMK', 'BYF']) {
    const body = new URLSearchParams({ fontip: tip, sfontur: '', fonkod: kod, fongrup: '', bastarih: f(bas), bittarih: f(bit), fonturkod: '', fonunvantip: '' }).toString();
    const j = await http('https://www.tefas.gov.tr/api/DB/BindHistoryInfo', {
      method: 'POST', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx' }
    });
    const rows = ((j && j.data) || []).filter(r => r && num(r.FIYAT) > 0).map(r => ({ t: Number(r.TARIH), f: num(r.FIYAT), ad: r.FONUNVAN || '' })).sort((a, b) => a.t - b.t);
    if (rows.length) {
      const son = rows[rows.length - 1], once = rows[rows.length - 2];
      const gun = new Date(son.t + 10800000).toISOString().slice(0, 10);
      return { fiyat: son.f, onceki: once ? once.f : null, tarih: `${gun} 18:00`, ad: son.ad, kaynak: 'TEFAS', gecmisEk: rows.map(r => [new Date(r.t + 10800000).toISOString().slice(0, 10), r.f]) };
    }
  }
  throw new Error('fon bulunamadı');
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

async function stockQuote(http, kod) {
  const res = await Promise.allSettled([yahoo(http, kod), bigpara(http, kod)]);
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const hatalar = res.map((r, i) => r.status === 'rejected' ? `${['Yahoo', 'Bigpara'][i]}: ${r.reason && r.reason.message || r.reason}` : null).filter(Boolean);
  if (!ok.length) return { kod, hata: hatalar.join('; ') };
  const [a, b] = ok;
  let dogrulama = 'tek-kaynak', not = '';
  if (a && b) {
    const fark = Math.abs(a.fiyat / b.fiyat - 1);
    dogrulama = fark <= 0.015 ? 'iki-kaynak' : 'uyusmazlik';
    if (dogrulama === 'uyusmazlik') not = `${a.kaynak} ${a.fiyat} · ${b.kaynak} ${b.fiyat}`;
  }
  const ana = a; const onceki = ana.onceki != null ? ana.onceki : (b && b.onceki);
  if (onceki > 0 && Math.abs(ana.fiyat / onceki - 1) > 0.105 && dogrulama !== 'uyusmazlik') { dogrulama = 'supheli'; not = 'Günlük hareket %10\'dan büyük; bedelsiz ya da bölünme olabilir, kontrol edin'; }
  return { kod, fiyat: ana.fiyat, onceki: onceki ?? null, tarih: ana.tarih || (b && b.tarih), ad: ana.ad || (b && b.ad) || '', kaynak: ok.map(o => o.kaynak).join(' + '), dogrulama, not, gecmis: ok.find(o => o.gecmis)?.gecmis, uyari: hatalar.join('; ') };
}

async function fundQuote(http, kod) {
  try {
    const q = await tefas(http, kod);
    let dogrulama = 'tek-kaynak', not = '';
    if (q.onceki > 0 && Math.abs(q.fiyat / q.onceki - 1) > 0.15) { dogrulama = 'supheli'; not = 'Günlük hareket %15\'ten büyük, kontrol edin'; }
    return { kod, ...q, dogrulama, not };
  } catch (e) { return { kod, hata: `TEFAS: ${e.message}` }; }
}

// Refresh every code in the ledger. `store` is the local Store.
async function refresh(store, fetchImpl, uid = 'local') {
  const http = makeHttp(fetchImpl);
  const defter = store.get(`data/users/${uid}/defter`) || { hisseler: [] };
  const kodlar = [...new Map((defter.hisseler || []).filter(h => KOD_RE.test(h.kod)).map(h => [h.kod, h.tip === 'Fon' ? 'Fon' : 'Hisse'])).entries()];
  const sonuc = await pool(kodlar, 4, ([kod, tip]) => tip === 'Fon' ? fundQuote(http, kod) : stockQuote(http, kod));
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
  const ozet = `${guncel}/${kodlar.length} fiyat güncellendi (${iki} iki kaynakla doğrulandı)` + (basarisiz.length ? `. Güncellenemeyen: ${basarisiz.join(', ')}` : '') + (dovizHata ? `. Döviz kuru alınamadı (${dovizHata})` : '');
  const durum = { ...(store.get('piyasa/durum') || {}), sonCalisma: t.tr, ozet, ayrinti: sonuc.filter(s => s.hata || s.uyari).map(s => `${s.kod}: ${s.hata || s.uyari}`).slice(0, 60) };
  store.set('piyasa/durum', durum);
  return { guncel, toplam: kodlar.length, iki, basarisiz, dovizHata, ozet };
}

// Diagnostics: try each source once with well-known codes.
async function testSources(fetchImpl) {
  const http = makeHttp(fetchImpl);
  const deneme = async (ad, fn) => { const t0 = Date.now(); try { const r = await fn(); return { ad, ok: true, ms: Date.now() - t0, ornek: r }; } catch (e) { return { ad, ok: false, ms: Date.now() - t0, hata: e.message }; } };
  return Promise.all([
    deneme('Yahoo Finance (hisse)', async () => { const r = await yahoo(http, 'THYAO'); return `THYAO ${r.fiyat} · ${r.tarih} · ${r.gecmis.length} günlük geçmiş`; }),
    deneme('Bigpara (hisse)', async () => { const r = await bigpara(http, 'THYAO'); return `THYAO ${r.fiyat}${r.tarih ? ' · ' + r.tarih : ''}`; }),
    deneme('TEFAS (fon)', async () => { const r = await tefas(http, 'AFT'); return `AFT ${r.fiyat} · ${r.tarih}`; }),
    deneme('TCMB (döviz)', async () => { const r = await tcmb(http); return `USD ${r.USD.satis} · EUR ${r.EUR ? r.EUR.satis : '—'}`; })
  ]);
}

module.exports = { refresh, testSources, _internal: { yahoo, bigpara, tefas, tcmb, makeHttp, stockQuote } };
