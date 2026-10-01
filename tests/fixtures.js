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
    if (g === 0 || g === 6) continue;
    p = i === 0 ? fiyat : p * (1 + (Math.sin(i) * 0.01) + 0.0015);
    ts.push(t); cl.push(Math.round(p * 100) / 100);
  }
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
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1));
  return dir;
}

module.exports = { build };
