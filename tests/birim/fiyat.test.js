// Unit tests for the price module (src/prices.js) with a fake network.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/prices');
const I = P._internal;

// rules: [[substring of "url body", response | number (HTTP status) | function]]
function sahte(kurallar, kayit = []) {
  return async (url, o = {}) => {
    const anahtar = url + ' ' + (typeof o.body === 'string' ? o.body : '');
    kayit.push(anahtar);
    const k = kurallar.find(([m]) => anahtar.includes(m));
    let r = k ? (typeof k[1] === 'function' ? k[1](anahtar) : k[1]) : 404;
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    const govde = Buffer.isBuffer(r) ? r : Buffer.from(typeof r === 'string' ? r : JSON.stringify(r));
    return { ok: true, status: 200, json: async () => JSON.parse(govde.toString('utf8')), text: async () => govde.toString('utf8'), arrayBuffer: async () => govde.buffer.slice(govde.byteOffset, govde.byteOffset + govde.length) };
  };
}
const simdi = Math.floor(Date.now() / 1000);
const yahoo = (fiyat, onceki) => ({ chart: { result: [{ meta: { regularMarketPrice: fiyat, regularMarketTime: simdi, gmtoffset: 10800, longName: 'X' }, timestamp: [simdi - 86400 * 3, simdi], indicators: { quote: [{ close: [onceki, fiyat] }] } }] } });
const tv = fiyat => ({ data: [{ s: 'BIST:X', d: [fiyat, 'X A.Ş.', 1] }] });
const isy = fiyat => [{ last: fiyat, dayClose: fiyat / 1.01 }];
const depo = (d = {}) => ({ d: { ...d }, get(p) { return this.d[p]; }, set(p, v) { this.d[p] = v; } });

test('hisse: kaynaklar uyuşursa iki kaynakla doğrulanır', async () => {
  const http = I.makeHttp(sahte([['THYAO.IS', yahoo(312.5, 309.4)], ['"BIST:THYAO"', tv(312.4)], ['endeks=THYAO', isy(312.5)]]));
  const q = await I.stockQuote(http, 'THYAO');
  assert.equal(q.fiyat, 312.5); assert.equal(q.dogrulama, 'iki-kaynak'); assert.equal(q.kaynak, 'Yahoo + TradingView + İş Yatırım'); assert.equal(q.uyari, '');
});
test('hisse: kaynaklar %1,5ten fazla ayrışırsa uyuşmazlık', async () => {
  const http = I.makeHttp(sahte([['THYAO.IS', yahoo(312.5, 309.4)], ['"BIST:THYAO"', tv(290)], ['endeks=THYAO', 500]]));
  const q = await I.stockQuote(http, 'THYAO');
  assert.equal(q.dogrulama, 'uyusmazlik'); assert.match(q.not, /Yahoo 312.5 · TradingView 290/);
});
test('hisse: tek kaynak, olağan dışı hareket, hiç kaynak yok', async () => {
  let q = await I.stockQuote(I.makeHttp(sahte([['ASELS.IS', yahoo(141.2, 140)]])), 'ASELS');
  assert.equal(q.dogrulama, 'tek-kaynak'); assert.match(q.uyari, /TradingView: HTTP 404/);
  q = await I.stockQuote(I.makeHttp(sahte([['ASELS.IS', yahoo(141.2, 120)], ['"BIST:ASELS"', tv(141.2)]])), 'ASELS');
  assert.equal(q.dogrulama, 'supheli', '%17,7 günlük hareket');
  q = await I.stockQuote(I.makeHttp(sahte([])), 'ASELS');
  assert.ok(q.hata);
  // only İş Yatırım answers: price still comes, date falls back to today
  q = await I.stockQuote(I.makeHttp(sahte([['endeks=SISE', isy(44.1)]])), 'SISE');
  assert.equal(q.fiyat, 44.1); assert.equal(q.kaynak, 'İş Yatırım');
});
test('Yahoo query1 düşerse query2 denenir', async () => {
  const http = I.makeHttp(sahte([['query1.finance.yahoo.com', 503], ['query2.finance.yahoo.com/v8/finance/chart/THYAO.IS', yahoo(300, 297)]]));
  assert.equal((await I.yahoo(http, 'THYAO')).fiyat, 300);
});
test('TEFAS: yeni API, boş cevapta yedek uç noktalar, tarih biçimleri', async () => {
  const yeni = { errorCode: null, errorMessage: null, resultList: [{ fonKodu: 'AFT', fonUnvan: 'AK', tarih: '2026-09-29T00:00:00', fiyat: 1.04 }, { fonKodu: 'AFT', fonUnvan: 'AK', tarih: '2026-09-30T00:00:00', fiyat: 1.05 }] };
  let r = await I.tefas(I.makeHttp(sahte([['fonFiyatBilgiGetir', yeni]])), 'AFT');
  assert.deepEqual([r.fiyat, r.onceki, r.tarih, r.gecmisEk.length], [1.05, 1.04, '2026-09-30 18:00', 2]);
  const kayit = [];
  r = await I.tefas(I.makeHttp(sahte([['fonFiyatBilgiGetir', { errorMessage: 'Index 0 out of bounds for length 0' }], ['"fonTipi":"EMK"', yeni], ['fonGnlBlgSiraliGetir', { resultList: [] }]], kayit)), 'AFT');
  assert.equal(r.fiyat, 1.05); assert.ok(kayit.some(k => k.includes('"fonTipi":"YAT"')) && kayit.some(k => k.includes('"fonTipi":"EMK"')), 'fon tipleri sırayla denendi');
  r = await I.tefas(I.makeHttp(sahte([['BindHistoryInfo', { data: [{ TARIH: String(Date.UTC(2026, 8, 30) - 10800000), FIYAT: '1,06', FONUNVAN: 'AK' }] }]])), 'AFT');
  assert.equal(r.fiyat, 1.06, 'eski uç nokta ve virgüllü fiyat');
  await assert.rejects(I.tefas(I.makeHttp(sahte([])), 'ZZZ'));
  assert.equal(I.tefasTarih('30.09.2026'), '2026-09-30'); assert.equal(I.tefasTarih('20260930'), '2026-09-30'); assert.equal(I.tefasTarih(null), null);
});
test('temettü ve bedelsiz olayları', async () => {
  const sn = t => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 1000 - 10800;
  const cevap = { chart: { result: [{ meta: { gmtoffset: 10800 }, events: { dividends: { a: { amount: 2, date: sn('2026-05-20') }, b: { amount: 1.5, date: sn('2025-05-20') }, c: { amount: 0, date: sn('2024-01-01') } }, splits: { s: { date: sn('2026-06-15'), numerator: 2, denominator: 1 } } } }] } };
  const r = await I.temettuOlaylari(I.makeHttp(sahte([['THYAO.IS?range=10y', cevap]])), 'THYAO');
  assert.deepEqual(r.temettu, [['2025-05-20', 1.5], ['2026-05-20', 2]], 'sıralı, sıfır tutar atlandı');
  assert.deepEqual(r.bolunme, [['2026-06-15', 2]]);
});
test('BIST 100: Borsa İstanbul listesi (windows-1254), yoksa TradingView listesi, fiyat yoksa Yahoo', async () => {
  const kodlar = Array.from({ length: 100 }, (_, i) => 'K' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26) + 'X');
  const satir = ['ENDEKS KODU;ENDEKS ADI;BİLEŞEN KODU;BULTEN_ADI', 'INDEX CODE;INDEX NAME;CONSTITUENT CODE;BULLETIN NAME', ...kodlar.map(k => `XU100;BIST 100;${k}.E;${k} ŞİŞECAM İĞNE`), 'XU030;BIST 30;KAAX.E;X'];
  const win1254 = Buffer.from(satir.join('\r\n').replace(/[ŞİĞ]/g, c => ({ 'Ş': 'Þ', 'İ': 'Ý', 'Ğ': 'Ð' }[c])), 'latin1');
  const fiyatlar = { data: kodlar.map((k, i) => ({ s: 'BIST:' + k, d: [10 + i, 1.5, k, 100] })) };
  let st = depo();
  let r = await P.bist100(st, sahte([['hisse_endeks_ds.csv', win1254], ['"volume"', fiyatlar]]));
  assert.deepEqual([r.sayi, r.fiyatli], [100, 100]); assert.match(r.kaynak, /Borsa İstanbul listesi · TradingView fiyatları/);
  const ilk = st.d['piyasa/bist100'].liste[0];
  assert.deepEqual([ilk.kod, ilk.ad, ilk.fiyat, ilk.degisim], ['KAAX', 'KAAX ŞİŞECAM İĞNE', 10, 0.015], 'Türkçe harfler doğru, yüzde oran olarak');
  st = depo();
  r = await P.bist100(st, sahte([['hisse_endeks_ds.csv', 503], ['SYML:BIST;XU100', fiyatlar]]));
  assert.match(r.kaynak, /TradingView listesi/); assert.equal(r.fiyatli, 100);
  st = depo();
  r = await P.bist100(st, sahte([['hisse_endeks_ds.csv', win1254], ['"volume"', 500], ['.IS?range=1y', u => yahoo(50, 49)]]));
  assert.match(r.kaynak, /Yahoo fiyatları/); assert.equal(r.fiyatli, 100);
  await assert.rejects(P.bist100(depo(), sahte([])), /Borsa İstanbul/);
});
test('yenileme: defter kodları, boş defterde ekrandaki kodlar, başarısızda eski fiyat korunur', async () => {
  const kurallar = [['THYAO.IS?range=10y', { chart: { result: [{ meta: {}, events: { dividends: { a: { amount: 2, date: 1780000000 } } } }] } }], ['THYAO.IS', yahoo(312.5, 309)], ['"BIST:THYAO"', tv(312.5)], ['fonFiyatBilgiGetir', { resultList: [{ fonKodu: 'AFT', tarih: '2026-09-30', fiyat: 1.05 }] }], ['today.xml', '<Tarih_Date Tarih="30.09.2026"><Currency Kod="USD"><ForexBuying>41.5</ForexBuying><ForexSelling>41.6</ForexSelling></Currency></Tarih_Date>']];
  let st = depo({ 'data/users/local/defter': { hisseler: [{ kod: 'THYAO', tip: 'Hisse' }, { kod: 'AFT', tip: 'Fon' }, { kod: 'GARAN', tip: 'Hisse' }], islemler: [{ kod: 'THYAO' }] }, 'piyasa/fiyatlar': { guncelleme: 'eski', veriler: { GARAN: { fiyat: 120, tarih: '2026-09-01 18:10' } } } });
  const r = await P.refresh(st, sahte(kurallar));
  assert.deepEqual([r.guncel, r.toplam, r.basarisiz], [2, 3, ['GARAN']]);
  assert.equal(st.d['piyasa/fiyatlar'].veriler.GARAN.fiyat, 120, 'alınamayan fiyatın eskisi silinmedi');
  assert.equal(st.d['piyasa/fiyatlar'].doviz.USD.satis, 41.6);
  assert.deepEqual(Object.keys(st.d['piyasa/temettu'].veriler), ['THYAO'], 'temettü yalnız işlemi olan hisseler için');
  st = depo();
  const r2 = await P.refresh(st, sahte(kurallar), 'local', [{ kod: 'THYAO', tip: 'Hisse' }, { kod: 'x!', tip: 'Hisse' }]);
  assert.deepEqual([r2.guncel, r2.toplam], [1, 1], 'boş defterde ekrandaki kodlar, geçersiz kod atlandı');
  const r3 = await P.refresh(depo(), sahte(kurallar));
  assert.equal(r3.toplam, 0); assert.match(r3.ozet, /hisse ya da fon yok/);
});
test('yanlış türde kaydedilmiş kod: yalnız kod biçimi uygunsa öbür tür denenir', async () => {
  const kurallar = [['fonFiyatBilgiGetir', u => u.includes('"AFT"') ? { resultList: [{ fonKodu: 'AFT', tarih: '2026-09-30', fiyat: 1.05 }] } : { resultList: [] }], ['THYAO.IS', yahoo(312.5, 309)]];
  const st = depo({ 'data/users/local/defter': { hisseler: [{ kod: 'AFT', tip: 'Hisse' }, { kod: 'THYAO', tip: 'Fon' }, { kod: 'GARAN', tip: 'Fon' }] } });
  const kayit = [];
  const r = await P.refresh(st, sahte(kurallar, kayit));
  assert.equal(r.guncel, 2); assert.ok(st.d['piyasa/durum'].ayrinti.some(x => /AFT hisse olarak kayıtlı ama fon fiyatı bulundu/.test(x)));
  assert.equal(st.d['piyasa/fiyatlar'].veriler.THYAO.fiyat, 312.5, '5 harfli kod fon diye kaydedilmiş: hisse fiyatı bulundu');
});
test('kaynak testi beş kaynağı dener (Bigpara yok)', async () => {
  const r = await P.testSources(sahte([]));
  assert.deepEqual(r.map(x => x.ad.split(' ')[0]), ['Yahoo', 'TradingView', 'İş', 'TEFAS', 'TCMB']);
  assert.ok(r.every(x => !x.ok));
});

test('bulunamayan kod ile bağlantı hatası ayrılır, düzelince kayıt silinir', async () => {
  const st = depo({ 'data/users/local/defter': { hisseler: [{ kod: 'ECZLC', tip: 'Hisse' }, { kod: 'THYAO', tip: 'Hisse' }, { kod: 'ZZZ', tip: 'Fon' }] } });
  // ECZLC: every source says "no such code"; THYAO: network down; ZZZ: TEFAS has no such fund
  await P.refresh(st, sahte([['ECZLC.IS', 404], ['"BIST:ECZLC"', { data: [] }], ['endeks=ECZLC', []], ['THYAO', () => { throw new Error('fetch failed'); }], ['fonFiyatBilgiGetir', { resultList: [] }], ['fonGnlBlgSiraliGetir', { resultList: [] }], ['BindHistoryInfo', 404]]));
  const h = st.d['piyasa/durum'].kodHata;
  assert.equal(h.ECZLC.bulunamadi, true); assert.match(h.ECZLC.mesaj, /HTTP 404/);
  assert.equal(h.THYAO.bulunamadi, false, 'bağlantı hatası "bulunamadı" sayılmaz');
  assert.equal(h.ZZZ.bulunamadi, true, 'TEFAS\'ta olmayan fon');
  await P.refresh(st, sahte([['THYAO.IS', yahoo(300, 297)], ['ECZLC.IS', 404], ['fonFiyatBilgiGetir', { resultList: [] }]]));
  assert.equal(st.d['piyasa/durum'].kodHata.THYAO, undefined, 'fiyatı gelen kodun hata kaydı kalktı');
});
