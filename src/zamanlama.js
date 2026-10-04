// Decisions of the morning job, kept free of Electron so they can be unit-tested.
// The job runs once a day after the chosen time. If the computer was off or offline it catches up later,
// retrying every 15 minutes; after three hours the day is closed with the last known prices.

const TEKRAR_MS = 15 * 60 * 1000;
const GEC_DK = 180;

const gun = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const saatDk = hhmm => { const [s, d] = String(hhmm || '08:45').split(':').map(Number); return s * 60 + d; };

// Should the job start now?
function calismali(simdi, ayar, { suruyor = false, sonDeneme = 0 } = {}) {
  const haftaSonu = simdi.getDay() === 0 || simdi.getDay() === 6;
  if (ayar.haftaIci && haftaSonu) return false;
  if (simdi.getHours() * 60 + simdi.getMinutes() < saatDk(ayar.raporSaati)) return false;
  if (ayar.sonOtomatikGun === gun(simdi)) return false;
  if (suruyor || simdi.getTime() - sonDeneme < TEKRAR_MS) return false;
  return true;
}
// Three hours or more past the chosen time.
function gecKaldi(simdi, raporSaati) { return (simdi.getHours() * 60 + simdi.getMinutes()) - saatDk(raporSaati) >= GEC_DK; }
// Mail the report now? Not while prices could not be fetched, unless it is late (then the last known prices go out).
function raporGonderilsin(ayar, sonuc, raporuErtele) {
  if (!ayar.raporAktif) return false;
  const fiyatYok = sonuc.toplam > 0 && sonuc.guncel === 0;
  return !(fiyatYok && raporuErtele);
}
// Is today's job done?
function gunTamam(ayar, sonuc, gec) {
  const raporTamam = !ayar.raporAktif || sonuc.rapor === 'gönderildi';
  const fiyatTamam = sonuc.guncel > 0 || sonuc.toplam === 0;
  return (fiyatTamam && raporTamam) || gec;
}

module.exports = { calismali, gecKaldi, raporGonderilsin, gunTamam, gun, TEKRAR_MS };
