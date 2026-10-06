// Loads the calculation engine and the Excel/number readers from the shipped screen code (renderer/app.js)
// into an isolated context, so the exact code the app runs is what gets tested.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function yukle() {
  const kod = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'app.js'), 'utf8');
  const parca = (bas, son) => { const a = kod.indexOf(bas), b = kod.indexOf(son, a); if (a < 0 || b < 0) throw new Error('bölüm bulunamadı: ' + bas); return kod.slice(a, b); };
  const motor = parca('const $ = s =>', '/* ---------- persistence ---------- */');
  const okuyucu = parca('const normH=', 'function bankaOku(');
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON, Number, String, Map, Set, Object, Array, isFinite, parseInt, parseFloat, RegExp, document: { querySelector: () => null } });
  return vm.runInContext(`"use strict";\n${motor}\n${okuyucu}\n;({ hesapla, temettuBul, kodNorm, kodHatasi, kodDegistir, maliyetKarsilastir, yontemAdi, fiyatOf, S, ORNEK, BOS, parseNum, islemOku, tarihIso, turNorm, tahminTip, normH, normB, fonOran, fonDonemOrani, temettuOran, getiri, today })`, ctx, { filename: 'renderer/app.js (bölümler)' });
};
