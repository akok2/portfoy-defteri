// Checks the real price sources over the internet (used on the Windows CI machine).
// Prints a table and writes a GitHub job summary; never fails the build on its own.
const fs = require('fs');
const prices = require('../src/prices');
(async () => {
  const sonuc = await prices.testSources((u, o) => fetch(u, o));
  const http = prices._internal.makeHttp((u, o) => fetch(u, o));
  const ornek = [];
  for (const kod of ['THYAO', 'GARAN', 'ASELS', 'SISE']) {
    const q = await prices._internal.stockQuote(http, kod);
    ornek.push(q.hata ? `${kod}: alınamadı (${q.hata})` : `${kod}: ${q.fiyat} · önceki ${q.onceki} · ${q.tarih} · ${q.kaynak} · ${q.dogrulama}${q.not ? ' · ' + q.not : ''}`);
  }
  const fonlar = [];
  for (const kod of ['AFT', 'TCD', 'IPB']) {
    for (const [ad, fn] of [['yeni API', prices._internal.tefasYeni], ['eski API', prices._internal.tefasEski]]) {
      try { const r = await fn(http, kod); fonlar.push(`${kod} (${ad}): ${r.fiyat} · önceki ${r.onceki} · ${r.tarih} · ${r.gecmisEk.length} gün`); }
      catch (e) { fonlar.push(`${kod} (${ad}): alınamadı (${e.message})`); }
    }
  }
  const temettu = [];
  for (const kod of ['THYAO', 'TUPRS', 'FROTO', 'ASELS']) {
    try { const r = await prices._internal.temettuOlaylari(http, kod); const t = r.temettu; temettu.push(`${kod}: ${t.length} temettü${t.length ? ', son ' + t[t.length - 1][0] + ' hisse başı ' + t[t.length - 1][1] : ''}${r.bolunme.length ? ' · bölünme/bedelsiz: ' + r.bolunme.map(x => x[0] + ' ×' + Math.round(x[1] * 1000) / 1000).join(', ') : ''}`); }
    catch (e) { temettu.push(`${kod}: alınamadı (${e.message})`); }
  }
  let bist = '';
  try { const st = { d: {}, get(p) { return this.d[p]; }, set(p, v) { this.d[p] = v; } }; const r = await prices.bist100(st, (u, o) => fetch(u, o)); bist = `${r.sayi} hisse, ${r.fiyatli} fiyatlı · ${r.kaynak}${st.d['piyasa/bist100'].hatalar.length ? ' · uyarı: ' + st.d['piyasa/bist100'].hatalar.join('; ') : ''}`; }
  catch (e) { bist = 'alınamadı: ' + e.message; }
  const satirlar = [
    '## Canlı fiyat kaynakları', '', '| Kaynak | Durum | Örnek | Süre |', '|---|---|---|---|',
    ...sonuc.map(r => `| ${r.ad} | ${r.ok ? 'çalışıyor' : 'ÇALIŞMIYOR'} | ${r.ok ? r.ornek : r.hata} | ${r.ms} ms |`),
    '', '### Örnek hisseler', '', ...ornek.map(x => '- ' + x), '', '### Örnek fonlar', '', ...fonlar.map(x => '- ' + x), '', '### Temettü olayları (Yahoo)', '', ...temettu.map(x => '- ' + x), '', '### BIST 100', '', '- ' + bist
  ];
  console.log(satirlar.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satirlar.join('\n') + '\n');
  fs.writeFileSync('canli-kaynaklar.json', JSON.stringify({ sonuc, ornek, fonlar }, null, 1));
})().catch(e => { console.error(e); });
