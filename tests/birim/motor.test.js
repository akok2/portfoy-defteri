// Unit tests for the profit/loss, dividend and tax engine. Expected values are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./yukle')();

const bugun = M.today();
let sayac = 0;
const isl = (kod, tur, tarih, lot, fiyat, komisyon = 0, ek = {}) => ({ id: 'i' + (++sayac), no: sayac, kod, tur, tarih, lot, fiyat, komisyon, t: sayac, ...ek });
const defter = (islemler, hisseler = [], ek = {}) => ({ v: 1, hisseler, kurumlar: [], islemler, elleFiyat: {}, ayarlar: {}, ...ek });
function hesap(d, fiyatlar = {}, temettu = null) {
  M.S.defter = d;
  M.S.piyasa = { veriler: Object.fromEntries(Object.entries(fiyatlar).map(([k, v]) => [k, typeof v === 'number' ? { fiyat: v, tarih: bugun + ' 18:10', dogrulama: 'iki-kaynak' } : { tarih: bugun + ' 18:10', dogrulama: 'iki-kaynak', ...v }])) };
  M.S.gecmis = { veriler: {} };
  M.S.temettu = temettu;
  return M.hesapla(d);
}
const yakin = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

test('kâr/zarar ortalama alış fiyatına göre, komisyon hariç', () => {
  const c = hesap(defter([
    isl('THYAO', 'Alış', '2026-01-10', 100, 250, 10),
    isl('THYAO', 'Alış', '2026-02-10', 100, 270, 12),
    isl('THYAO', 'Satış', '2026-03-10', 50, 300, 6)
  ]), { THYAO: 280 });
  const p = c.poz.THYAO, T = c.toplam;
  // average buy price (25 000 + 27 000) / 200 = 260; sale 50 × (300 − 260) = 2 000
  yakin(p.ort, 260, 'ortalama alış'); yakin(p.gerceklesen, 2000, 'satış kârı');
  // 150 lot left: cost 39 000, value 42 000, open profit 3 000 (7,6923 %)
  assert.equal(p.lot, 150); yakin(p.maliyet, 39000, 'kalan maliyet'); yakin(p.deger, 42000, 'değer'); yakin(p.kz, 3000, 'kâğıt üstü'); yakin(p.kzYuzde, 3000 / 39000, 'yüzde');
  yakin(p.komisyon, 28, 'komisyon toplamı');
  // total result = 3 000 + 2 000 + 0 − 28
  yakin(T.sonuc, 4972, 'toplam sonuç'); yakin(T.komisyon, 28, 'ödenen komisyon'); yakin(T.maliyet, 39000, 'alış tutarı'); yakin(T.deger, 42000, 'portföy değeri');
  assert.equal(p.satislar.length, 1); yakin(p.satislar[0].ort, 260, 'satış satırındaki alış fiyatı');
});

test('bedelsiz sıfır maliyetle eklenir, ortalamayı düşürür; tamamı satılınca pozisyon kapanır', () => {
  const c = hesap(defter([
    isl('ASELS', 'Alış', '2026-02-03', 400, 100),
    isl('ASELS', 'Satış', '2026-05-05', 100, 130.25),
    isl('ASELS', 'Bedelsiz', '2026-06-15', 50, 0)
  ]), { ASELS: 141.2 });
  const p = c.poz.ASELS;
  yakin(p.gerceklesen, 3025, 'satış kârı 100 × 30,25'); assert.equal(p.lot, 350); yakin(p.maliyet, 30000, 'maliyet'); yakin(p.ort, 30000 / 350, 'ortalama 85,7143');
  const kapali = hesap(defter([isl('SISE', 'Alış', '2026-01-02', 10, 40), isl('SISE', 'Satış', '2026-02-02', 10, 44)]), { SISE: 50 }).poz.SISE;
  assert.equal(kapali.lot, 0); assert.equal(kapali.maliyet, 0); assert.equal(kapali.deger, undefined); yakin(kapali.gerceklesen, 40, 'kapalı pozisyon kârı');
});

test('eldekinden fazla satış: kayıt eksik, toplamlara katılmaz, uyarı verir', () => {
  const c = hesap(defter([
    isl('THYAO', 'Alış', '2026-01-10', 100, 250, 5),
    isl('MOGAN', 'Alış', '2026-05-12', 5000, 15.29, 16),
    isl('MOGAN', 'Satış', '2026-07-17', 10000, 17.39, 18)
  ]), { THYAO: 260, MOGAN: 9 });
  const T = c.toplam;
  assert.equal(c.poz.MOGAN.bozuk, true); assert.equal(T.tutarsiz, 1);
  assert.equal(c.poz.MOGAN.kz, null); yakin(T.gerceklesen, 0, 'eksik kaydın satış kârı sayılmaz');
  yakin(T.deger, 26000, 'yalnız THYAO değeri'); yakin(T.komisyon, 39, 'ödenen komisyon hepsini gösterir');
  yakin(T.sonuc, 1000 - 5, 'toplam sonuç yalnız kaydı tutarlı olanlar: 1 000 − 5');
  assert.ok(c.uyarilar.some(u => u.kod === 'MOGAN' && u.lvl === 'bad'));
  assert.ok(Object.values(c.satir).some(n => n.lvl === 'bad'));
});

test('mükerrer kayıt uyarısı', () => {
  const c = hesap(defter([isl('GARAN', 'Alış', '2026-03-01', 100, 120), isl('GARAN', 'Alış', '2026-03-01', 100, 120)]), { GARAN: 125 });
  assert.equal(c.poz.GARAN.mukerrer, true); assert.equal(c.poz.GARAN.lot, 200);
  assert.ok(c.uyarilar.some(u => u.kod === 'GARAN' && u.lvl === 'warn'));
});

test('temettü: net tutardan brüt, 22.12.2024 öncesi %10, sonrası %15', () => {
  const c = hesap(defter([
    isl('TUPRS', 'Alış', '2024-01-02', 100, 150),
    isl('TUPRS', 'Temettü', '2024-12-01', 0, 0, 0, { tutar: 90 }),
    isl('TUPRS', 'Temettü', '2026-05-28', 0, 0, 0, { tutar: 85 })
  ]), { TUPRS: 170 });
  const t = c.olaylar.filter(o => o.tur === 'temettu');
  yakin(t[0].brut, 100, '2024: 90 / 0,90'); yakin(t[0].oran, 0.10, 'oran 2024');
  yakin(t[1].brut, 100, '2026: 85 / 0,85'); yakin(t[1].stopaj, 15, 'stopaj 2026');
  yakin(c.poz.TUPRS.temettu, 175, 'net temettü toplamı');
});

test('fon stopajı ilk giren ilk çıkar sırasıyla ve alış tarihine göre', () => {
  const h = [{ kod: 'AAA', tip: 'Fon', vergiSinifi: 'diger' }, { kod: 'HYF', tip: 'Fon', vergiSinifi: 'hisseYogun' }];
  const c = hesap(defter([
    isl('AAA', 'Alış', '2024-06-01', 1000, 1.2),
    isl('AAA', 'Alış', '2025-08-01', 1000, 1.0),
    isl('AAA', 'Satış', '2026-03-01', 1500, 1.5),
    isl('HYF', 'Alış', '2025-08-01', 1000, 1.0),
    isl('HYF', 'Satış', '2026-03-01', 1000, 2.0)
  ], h), { AAA: 1.6, HYF: 2 });
  const s = c.olaylar.filter(o => o.tur === 'satis');
  // 1 000 lot from 2024-06-01 at 1,2: 300 × %7,5 = 22,5 ; 500 lot from 2025-08-01 at 1,0: 250 × %17,5 = 43,75
  yakin(s[0].stopaj, 66.25, 'AAA stopaj'); yakin(s[0].kazanc, 1500 * (1.5 - 1.1), 'AAA satış kârı ortalamaya göre');
  yakin(s[1].stopaj, 0, 'hisse yoğun fon %0');
  assert.equal(M.fonDonemOrani('2020-12-01'), 0.10); assert.equal(M.fonDonemOrani('2023-01-01'), 0); assert.equal(M.fonDonemOrani('2024-06-01'), 0.075);
  assert.equal(M.fonDonemOrani('2024-12-01'), 0.10); assert.equal(M.fonDonemOrani('2025-03-01'), 0.15); assert.equal(M.fonDonemOrani('2025-07-09'), 0.175);
  assert.equal(M.fonOran('bist51', '2025-01-01', '2026-03-01'), 0); assert.equal(M.fonOran('bist51', '2025-08-01', '2026-03-01'), 0.175);
  assert.equal(M.fonOran('girisim', '2023-01-01', '2026-03-01'), 0); assert.equal(M.fonOran('serbestHisse', '2026-04-01', '2026-06-01'), 0.175); assert.equal(M.fonOran('serbestHisse', '2026-01-01', '2026-06-01'), 0);
});

test('günlük değişim, hedef ve zarar-durdur uyarıları, elle girilen fiyat', () => {
  const h = [{ kod: 'THYAO', tip: 'Hisse', hedef: 300 }, { kod: 'ASELS', tip: 'Hisse', stop: 150 }];
  const d = defter([isl('THYAO', 'Alış', '2026-01-10', 100, 250), isl('ASELS', 'Alış', '2026-01-10', 10, 160)], h);
  const c = hesap(d, { THYAO: { fiyat: 312.5, onceki: 300 }, ASELS: 141.2 });
  yakin(c.poz.THYAO.gunluk, 1250, 'günlük TL'); yakin(c.poz.THYAO.gunlukYuzde, 312.5 / 300 - 1, 'günlük %');
  assert.equal(c.poz.THYAO.alarm.t, 'hedef'); assert.equal(c.poz.ASELS.alarm.t, 'stop');
  d.elleFiyat = { ASELS: { fiyat: 155, tarih: bugun } };
  const c2 = hesap(d, { THYAO: 312.5, ASELS: { fiyat: 141.2, tarih: '2020-01-01 18:10' } });
  assert.equal(c2.poz.ASELS.f.elle, true); yakin(c2.poz.ASELS.deger, 1550, 'elle girilen fiyat daha yeni');
});

test('fiyatı eski olan pozisyon uyarı verir, fiyatı olmayan toplamlara katılmaz', () => {
  const c = hesap(defter([isl('THYAO', 'Alış', '2026-01-10', 100, 250), isl('GARAN', 'Alış', '2026-01-10', 10, 100)]), { THYAO: { fiyat: 300, tarih: '2026-01-02 18:10' } });
  assert.ok(c.uyarilar.some(u => u.kod === 'THYAO' && /güncellenemedi/.test(u.msg)));
  assert.ok(c.uyarilar.some(u => u.kod === 'GARAN' && /Güncel fiyat yok/.test(u.msg)));
  assert.equal(c.toplam.fiyatsiz, 1); yakin(c.toplam.maliyet, 25000, 'fiyatsız GARAN alış tutarına girmez');
});

test('temettü bulma: hak kullanım tarihindeki lot, bedelsiz düzeltmesi, deftere girilmiş ve yoksayılan', () => {
  const T = { veriler: { ASELS: { temettu: [['2026-04-10', 0.875]], bolunme: [['2026-06-15', 8 / 7]] }, THYAO: { temettu: [['2026-05-20', 3.2], ['2026-09-01', 2], ['2024-06-03', 1]], bolunme: [] }, GARAN: { temettu: [['2026-03-01', 5]], bolunme: [] } } };
  const islemler = [
    isl('ASELS', 'Alış', '2026-02-03', 400, 100), isl('ASELS', 'Satış', '2026-05-05', 100, 130), isl('ASELS', 'Bedelsiz', '2026-06-15', 50, 0),
    isl('THYAO', 'Alış', '2024-01-02', 100, 250), isl('THYAO', 'Temettü', '2026-06-01', 0, 0, 0, { tutar: 272 }),
    isl('GARAN', 'Alış', '2026-03-01', 100, 120) // bought on the ex-date: not entitled
  ];
  let c = hesap(defter(islemler), {}, T);
  const o = c.temettuOneri; const bul = (k, t) => o.find(x => x.kod === k && x.tarih === t);
  // ASELS: 400 lot × (0,875 × 8/7 = 1,00) = 400 brüt, 340 net
  yakin(bul('ASELS', '2026-04-10').brut, 400, 'ASELS brüt'); yakin(bul('ASELS', '2026-04-10').net, 340, 'ASELS net');
  assert.ok(!bul('THYAO', '2026-05-20'), 'kaydedilmiş temettü tekrar önerilmez');
  yakin(bul('THYAO', '2026-09-01').net, 170, 'THYAO 100 × 2 × 0,85');
  yakin(bul('THYAO', '2024-06-03').oran, 0.10, '2024 temettüsü %10'); yakin(bul('THYAO', '2024-06-03').net, 90, '2024 net');
  assert.ok(!bul('GARAN', '2026-03-01'), 'hak kullanım günü alınan hisse temettü almaz');
  c = hesap(defter(islemler, [], { temettuYoksay: ['THYAO|2026-09-01'] }), {}, T);
  assert.ok(!c.temettuOneri.find(x => x.kod === 'THYAO' && x.tarih === '2026-09-01'), 'yoksayılan önerilmez');
  assert.equal(hesap(defter([]), {}, T).temettuOneri.length, 0, 'işlem yoksa öneri yok');
});

test('Türkçe sayı yazımları doğru okunur', () => {
  const ornekler = [['1.234,56', 1234.56], ['1234,5', 1234.5], ['250,50', 250.5], ['1.000', 1000], ['12.500', 12500], ['1.000.000', 1000000], ['0.945', 0.945], ['1.054785', 1.054785], ['12.5', 12.5], ['₺ 1.234,00', 1234], ['1.234,00 TL', 1234], ['%15', 15], ['-1.000', -1000], [42, 42]];
  for (const [g, b] of ornekler) assert.equal(M.parseNum(g), b, JSON.stringify(g));
  for (const g of ['', '-', 'abc', null, undefined]) assert.ok(Number.isNaN(M.parseNum(g)), JSON.stringify(g));
});

test('Excel okuma: farklı başlıklar, işlem türleri, tarih biçimleri, fon tahmini', () => {
  const seri = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5 + 25569;
  const r = M.islemOku([['Benim işlemlerim'], [], ['Hisse', 'Tarih', 'İşlem Türü', 'Adet', 'Fiyat (TL)', 'Komisyon (TL)', 'Temettü (TL)', 'Aracı Kurum'],
    ['thyao', seri(2026, 1, 10), 'ALIŞ', 100, 250.5, 5, null, 'A'], ['THYAO', '15.03.2026', 'satis', '50', '300,25', '1,5', null, 'A'],
    ['SISE', '2026-06-03', 'Bedelsiz', 500, null, null, null, ''], ['GARAN', '2026-05-20', 'Kâr payı', null, null, null, 850, ''],
    ['XX!', '2026-01-01', 'Alış', 1, 1, 0], ['TUPRS', 'tarih yok', 'Alış', 1, 1, 0], ['', '', '', '', '', '']]);
  assert.equal(r.islemler.length, 4); assert.equal(r.atlanan, 2);
  const [a, s, b, t] = r.islemler;
  assert.deepEqual([a.kod, a.tarih, a.tur, a.lot, a.fiyat, a.komisyon, a.kurum], ['THYAO', '2026-01-10', 'Alış', 100, 250.5, 5, 'A']);
  assert.deepEqual([s.tarih, s.tur, s.lot, s.fiyat, s.komisyon], ['2026-03-15', 'Satış', 50, 300.25, 1.5]);
  assert.deepEqual([b.tur, b.lot, b.fiyat], ['Bedelsiz', 500, 0]);
  assert.deepEqual([t.tur, t.tutar], ['Temettü', 850]);
  assert.equal(M.islemOku([['Hisse', 'Fiyat Tarihi', 'Net Lot'], ['THYAO', 1, 2]]), null, 'tarih sütunu olmayan özet tablo işlem sayılmaz');
  assert.equal(M.tahminTip('AFT'), 'Fon'); assert.equal(M.tahminTip('THYAO'), 'Hisse'); assert.equal(M.tahminTip('SISE'), 'Hisse');
  assert.equal(M.tarihIso('01.02.2026'), '2026-02-01'); assert.equal(M.tarihIso('2026-02-01T00:00:00'), '2026-02-01'); assert.equal(M.tarihIso(seri(2024, 2, 29)), '2024-02-29'); assert.equal(M.tarihIso('yok'), null);
});

test('eski programın DATA sayfası', () => {
  const r = M.islemOku([['ISLEM_NO', 'ARACI_KURUM', 'HISSE', 'TARIH', 'ALINAN_LOT', 'SATILAN_LOT', 'ALIS_FIYATI', 'SATIS_FIYATI', 'ALIS_TOPLAM', 'SATIS_TOPLAM', 'KOMISYON', 'TEMETTU', 'ISLEM_GRUBU', '', 'HISSE'],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', 0], [1, 'K', 'TUPRS', '10.01.2025 10:00:00', 10, null, 150, null, null, null, 0.5, null, '', '', 'NETAS'],
    [2, 'K', 'TUPRS', '11.01.2025', null, 5, null, 160, null, null, 0.3, null, '', '', 'TAVHL'], [3, 'K', 'TUPRS', '12.01.2025', 3, null, null, null, null, null, 0, null, '', '', '29']]);
  assert.equal(r.islemler.length, 3);
  assert.deepEqual([...r.islemler.map(x => x.tur)], ['Alış', 'Satış', 'Bedelsiz']);
  assert.deepEqual([...r.izleme].sort(), ['NETAS', 'TAVHL'], 'yardımcı kod listesi; sayı olan "29" kod sayılmaz');
});

test('kalıntı örnek veri yok: yeni defter boş, örnek defterde nakit ve kişisel kod yok', () => {
  const b = M.BOS();
  assert.deepEqual([b.hisseler.length, b.kurumlar.length, b.islemler.length], [0, 0, 0], 'yeni defter tamamen boş (hazır kurum yok)');
  assert.equal(b.nakit, undefined); assert.equal(M.ORNEK.nakit, undefined);
  assert.ok(!/SASA|MOGAN|OSTIM|YKBNK/.test(JSON.stringify(M.ORNEK)), 'örnek veride kişisel işlem yok');
  assert.ok(M.ORNEK.islemler.every(x => x.not === 'Örnek kayıt'), 'örnek kayıtlar işaretli');
});
