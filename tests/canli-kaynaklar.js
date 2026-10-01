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
  const satirlar = [
    '## Canlı fiyat kaynakları', '', '| Kaynak | Durum | Örnek | Süre |', '|---|---|---|---|',
    ...sonuc.map(r => `| ${r.ad} | ${r.ok ? 'çalışıyor' : 'ÇALIŞMIYOR'} | ${r.ok ? r.ornek : r.hata} | ${r.ms} ms |`),
    '', '### Örnek hisseler', '', ...ornek.map(x => '- ' + x), '', '### Örnek fonlar', '', ...fonlar.map(x => '- ' + x)
  ];
  console.log(satirlar.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satirlar.join('\n') + '\n');
  fs.writeFileSync('canli-kaynaklar.json', JSON.stringify({ sonuc, ornek, fonlar }, null, 1));
})().catch(e => { console.error(e); });
