// Builds recorded-looking price responses dated relative to today, so tests behave the same on any day.
const fs = require('fs');
const path = require('path');

function yahooChart(fiyat, gunSayisi = 260) {
  const now = Math.floor(Date.now() / 1000);
  const ts = [], cl = [];
  let p = fiyat * 0.7;
  for (let i = gunSayisi; i >= 0; i--) {
    const t = now - i * 86400;
    const g = new Date(t * 1000).getUTCDay();
    if ((g === 0 || g === 6) && i !== 0) continue; // today's price is always the last point
    p = i === 0 ? fiyat : p * (1 + (Math.sin(i) * 0.01) + 0.0015);
    ts.push(t); cl.push(Math.round(p * 100) / 100);
  }
  // previous close 1 % below today's price whatever the weekday (keeps the daily move ordinary)
  if (cl.length >= 2) cl[cl.length - 2] = Math.round(fiyat / 1.01 * 100) / 100;
  return { chart: { result: [{ meta: { regularMarketPrice: fiyat, regularMarketTime: now, gmtoffset: 10800, longName: 'Test Şirketi' }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } };
}

function build(dir, { bigparaHata = false, hepsiHata = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const idx = [];
  const yaz = (file, data, match, status) => { fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data)); idx.push({ match, file, status }); };
  const hisseler = { THYAO: 312.5, ASELS: 141.2, TUPRS: 171.0, SISE: 44.1 };
  for (const [kod, f] of Object.entries(hisseler)) {
    yaz(`yahoo-${kod}.json`, yahooChart(f), `chart/${kod}.IS`, hepsiHata ? 500 : undefined);
    yaz(`bigpara-${kod}.json`, { data: { hisseYuzeysel: { sembol: kod, kapanis: String(f).replace('.', ','), dunkukapanis: f * 0.99, tarih: new Date().toISOString(), aciklama: kod + ' A.Ş.' } } }, `hisseyuzeysel/${kod}`, (bigparaHata || hepsiHata) ? 500 : undefined);
    yaz(`tv-${kod}.json`, { totalCount: 1, data: [{ s: `BIST:${kod}`, d: [f, kod + ' A.Ş.', 1.01] }] }, `"BIST:${kod}"`, (bigparaHata || hepsiHata) ? 500 : undefined);
    yaz(`isy-${kod}.json`, [{ symbol: kod, last: f, dayClose: Math.round(f / 1.0101 * 100) / 100, updateDate: new Date().toISOString().slice(0, 19) + '+03' }], `OneEndeks?endeks=${kod}`, (bigparaHata || hepsiHata) ? 500 : undefined);
  }
  const bugun = Date.now();
  const isoGun = ms => new Date(ms + 10800000).toISOString().slice(0, 10) + 'T00:00:00';
  yaz('tefas-yeni.json', { errorCode: null, errorMessage: null, resultList: [{ fonKodu: 'AFT', fonUnvan: 'TEST FON', tarih: isoGun(bugun - 2 * 864e5), fiyat: 1.02 }, { fonKodu: 'AFT', fonUnvan: 'TEST FON', tarih: isoGun(bugun - 864e5), fiyat: 1.04 }, { fonKodu: 'AFT', fonUnvan: 'TEST FON', tarih: isoGun(bugun), fiyat: 1.056 }] }, 'tefas.gov.tr/api/funds/fonFiyatBilgiGetir', hepsiHata ? 500 : undefined);
  yaz('tefas.json', { data: [{ TARIH: String(bugun - 2 * 864e5), FIYAT: 1.02, FONUNVAN: 'TEST FON' }, { TARIH: String(bugun - 864e5), FIYAT: 1.04, FONUNVAN: 'TEST FON' }, { TARIH: String(bugun), FIYAT: 1.056, FONUNVAN: 'TEST FON' }] }, 'tefas.gov.tr', hepsiHata ? 500 : undefined);
  const d = new Date(); const tr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  yaz('tcmb.xml', `<?xml version="1.0"?><Tarih_Date Tarih="${tr}"><Currency Kod="USD"><ForexBuying>41.50</ForexBuying><ForexSelling>41.60</ForexSelling></Currency><Currency Kod="EUR"><ForexBuying>48.10</ForexBuying><ForexSelling>48.20</ForexSelling></Currency></Tarih_Date>`, 'tcmb.gov.tr', hepsiHata ? 500 : undefined);
  // dividends (Yahoo events): ASELS paid 0,875 per share as Yahoo reports it after a later 8:7 bonus issue (1,00 at the time)
  const ilk = [];
  const yazIlk = (file, data, match) => { fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data)); ilk.push({ match, file, status: hepsiHata ? 500 : undefined }); };
  const sn = t => Math.floor(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 1000) - 10800;
  const olay = (div, split) => ({ chart: { result: [{ meta: { gmtoffset: 10800 }, timestamp: [], indicators: { quote: [{ close: [] }] }, events: {
    dividends: Object.fromEntries(div.map(([t, a]) => [sn(t), { amount: a, date: sn(t) }])), splits: Object.fromEntries(split.map(([t, n, d]) => [sn(t), { date: sn(t), numerator: n, denominator: d, splitRatio: n + ':' + d }])) } }] } });
  yazIlk('div-ASELS.json', olay([['2026-04-10', 0.875]], [['2026-06-15', 8, 7]]), 'ASELS.IS?range=10y');
  yazIlk('div-THYAO.json', olay([['2026-05-20', 3.2], ['2026-09-01', 2.0]], []), 'THYAO.IS?range=10y');
  // BIST 100: Borsa İstanbul's constituent list (semicolon-separated, two header rows) and TradingView prices for all of them
  const bistKod = ['THYAO', 'ASELS', 'SISE', 'TUPRS', ...Array.from({ length: 96 }, (_, i) => 'XB' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26))];
  const csv = ['ENDEKS KODU;ENDEKS ADI;BILESEN KODU;BULTEN_ADI', 'INDEX CODE;INDEX NAME;CONSTITUENT CODE;BULLETIN NAME',
    ...bistKod.map(k => `XU100;BIST 100;${k}.E;${k} ŞİRKETİ A.Ş.`), 'XU030;BIST 30;THYAO.E;TÜRK HAVA YOLLARI'].join('\r\n');
  yazIlk('bist.csv', csv, 'hisse_endeks_ds.csv');
  yazIlk('tv-bist.json', { totalCount: bistKod.length, data: bistKod.map((k, i) => ({ s: 'BIST:' + k, d: [hisseler[k] || 10 + i, (i % 7) - 3, k + ' Şirketi', 1000 + i] })) }, '"volume"');
  idx.unshift(...ilk);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1));
  return dir;
}

module.exports = { build };
