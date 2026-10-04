// Unit tests for the morning job decisions (src/zamanlama.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../../src/zamanlama');

const t = (gun, saat) => new Date(`${gun}T${saat}:00`); // local time
const ayar = (ek = {}) => ({ raporSaati: '08:45', haftaIci: true, raporAktif: true, sonOtomatikGun: '', ...ek });

test('hafta içi saatinde ve sonra çalışır, önce ve hafta sonu çalışmaz', () => {
  assert.equal(Z.calismali(t('2026-10-05', '08:44'), ayar()), false); // Monday before 08:45
  assert.equal(Z.calismali(t('2026-10-05', '08:45'), ayar()), true);
  assert.equal(Z.calismali(t('2026-10-05', '14:00'), ayar()), true); // computer was off in the morning
  assert.equal(Z.calismali(t('2026-10-04', '09:00'), ayar()), false); // Sunday
  assert.equal(Z.calismali(t('2026-10-04', '09:00'), ayar({ haftaIci: false })), true);
});
test('aynı gün ikinci kez çalışmaz, denemeler arasında 15 dakika bekler', () => {
  assert.equal(Z.calismali(t('2026-10-05', '09:00'), ayar({ sonOtomatikGun: '2026-10-05' })), false);
  assert.equal(Z.calismali(t('2026-10-06', '09:00'), ayar({ sonOtomatikGun: '2026-10-05' })), true);
  const s = t('2026-10-05', '09:00');
  assert.equal(Z.calismali(s, ayar(), { sonDeneme: s.getTime() - 10 * 60e3 }), false);
  assert.equal(Z.calismali(s, ayar(), { sonDeneme: s.getTime() - 16 * 60e3 }), true);
  assert.equal(Z.calismali(s, ayar(), { suruyor: true }), false);
});
test('üç saat geçince gecikmiş sayılır', () => {
  assert.equal(Z.gecKaldi(t('2026-10-05', '11:44'), '08:45'), false);
  assert.equal(Z.gecKaldi(t('2026-10-05', '11:45'), '08:45'), true);
});
test('fiyat alınamadıysa rapor ertelenir, gecikince eldeki fiyatlarla gider', () => {
  const yok = { toplam: 5, guncel: 0 }, var_ = { toplam: 5, guncel: 5 };
  assert.equal(Z.raporGonderilsin(ayar(), yok, true), false);
  assert.equal(Z.raporGonderilsin(ayar(), yok, false), true);
  assert.equal(Z.raporGonderilsin(ayar(), var_, true), true);
  assert.equal(Z.raporGonderilsin(ayar({ raporAktif: false }), var_, false), false);
  assert.equal(Z.raporGonderilsin(ayar(), { toplam: 0, guncel: 0 }, true), true, 'defter boşsa ertelemeye gerek yok');
});
test('gün ne zaman kapanır', () => {
  assert.equal(Z.gunTamam(ayar(), { toplam: 5, guncel: 5, rapor: 'gönderildi' }, false), true);
  assert.equal(Z.gunTamam(ayar(), { toplam: 5, guncel: 0, rapor: 'ertelendi' }, false), false, 'fiyat yok: 15 dk sonra tekrar');
  assert.equal(Z.gunTamam(ayar(), { toplam: 5, guncel: 5, rapor: 'gönderilemedi: x' }, false), false, 'e-posta gitmedi: tekrar');
  assert.equal(Z.gunTamam(ayar(), { toplam: 5, guncel: 0, rapor: 'gönderilemedi: x' }, true), true, 'üç saat sonra vazgeçer, her 15 dakikada bir denemez');
  assert.equal(Z.gunTamam(ayar({ raporAktif: false }), { toplam: 0, guncel: 0, rapor: 'kapalı' }, false), true, 'boş defter');
  assert.equal(Z.gun(t('2026-01-05', '00:30')), '2026-01-05');
});
