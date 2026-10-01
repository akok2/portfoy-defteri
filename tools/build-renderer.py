"""Builds renderer/index.html + renderer/app.js from the Portföy Defteri artifact page.
Usage: python3 tools/build-renderer.py   (reads tools/artifact-source.html and tools/desktop-additions.js)"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'tools/artifact-source.html').read_text(encoding='utf-8')
add = (root / 'tools/desktop-additions.js').read_text(encoding='utf-8')

title = re.search(r'<title>.*?</title>', src).group(0)
style = re.search(r'<style>[\s\S]*?</style>', src).group(0)
body_start = src.index('<div class="wrap">')
body_end = src.index('<script src="https://cdnjs')
body = src[body_start:body_end]
js = re.search(r'<script>\n([\s\S]*?)</script>', src).group(1)

def rep(s, a, b, cnt=1):
    assert s.count(a) == cnt, (a[:80], s.count(a))
    return s.replace(a, b)

js = rep(js, '"use strict";', '"use strict";\nconst DESKTOP=!!window.desktop;')
js = rep(js, '''  parts.push(`<span class="chip"><span class="dot"></span>Otomatik güncelleme: hafta içi 08:45</span>`);
  parts.push(`<span class="chip lock">🔒 Portföyün yalnızca sana görünür</span>`);''',
'''  if(DESKTOP){ const ds=S.ds||{};
    parts.push(`<span class="chip"><span class="dot"></span>Otomatik: ${ds.haftaIci===false?"her gün":"hafta içi"} ${esc(ds.raporSaati||"08:45")}</span>`);
    parts.push(`<span class="chip lock">🔒 Veriler yalnızca bu bilgisayarda${ds.sifreleme?", şifreli":""}</span>`);
    parts.push(`<button class="chip btnchip" data-act="fiyat-yenile" ${S.yenileniyor?"disabled":""}>${S.yenileniyor?"Fiyatlar güncelleniyor…":"↻ Fiyatları şimdi güncelle"}</button>`);
  } else {
  parts.push(`<span class="chip"><span class="dot"></span>Otomatik güncelleme: hafta içi 08:45</span>`);
  parts.push(`<span class="chip lock">🔒 Portföyün yalnızca sana görünür</span>`);
  }''')
js = rep(js, 'function vRapor(){', 'function vRapor(){ if(DESKTOP) return vRaporDesktop();')
a = js.index('  <div class="prose"><ul>\n    <li><b>Portföyün yalnızca sana görünür.</b>')
b = js.index('  <div class="row"><button class="btn danger" data-act="hepsini-sil"')
js = js[:a] + '  ${DESKTOP?gizlilikDesktop():`' + js[a:b].rstrip('\n') + '`}\n' + js[b:]
js = rep(js, '  if(a==="xlsx-disa"){', '  if(DESKTOP&&["fiyat-yenile","veri-klasoru","kaynak-test","mail-test","sabah-simdi"].includes(a)){ desktopEylem(a,t); return; }\n  if(a==="xlsx-disa"){')
js = rep(js, '  if(id==="f-rapor") return raporKaydet();', '  if(id==="f-drapor") return desktopKaydet();\n  if(id==="f-rapor") return raporKaydet();')
js = rep(js, '  S.connected=true;\n', '''  S.connected=true;
  if(DESKTOP){ try{ S.ds=await window.desktop.getSettings(); }catch(e){}
    if(S.ds&&S.ds.kurtarma){ S.err=S.ds.kurtarma; }
    window.desktop.onStatus(v=>{ if(v.kayitHatasi){ S.err="Değişiklikler diske yazılamadı: "+v.kayitHatasi+". Disk dolu ya da klasör kilitli olabilir; uygulama tekrar deneyecek."; renderBanner(); return; } S.yenileniyor=!!v.calisiyor; if(v.sonuc) toast(v.sonuc.ozet); if(v.hata) toast("Fiyatlar alınamadı: "+v.hata); renderChips(); });
    window.desktop.onReportRequest(async()=>raporOlustur()); }
''')
js = rep(js, '/* ---------- boot ---------- */', add + '\n/* ---------- boot ---------- */')
js = rep(js, 'db.doc("piyasa/fiyatlar").onSnapshot(s=>{ ', 'db.doc("piyasa/fiyatlar").onSnapshot(s=>{ S.piyasaGeldi=true; ')
js = rep(js, '  db.doc("data/users/"+S.uid+"/defter").onSnapshot(s=>{\n', '  db.doc("data/users/"+S.uid+"/defter").onSnapshot(s=>{\n    S.defterGeldi=true;\n')

style = rep(style, '.chip .dot{', '.chip.btnchip{cursor:pointer;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent);background:var(--accent-soft);font:inherit;font-size:12.5px}\n.chip.btnchip[disabled]{opacity:.7;cursor:progress}\ndetails summary{cursor:pointer}\n.chip .dot{')
# system fonts only: nothing is loaded from the internet
style = style.replace('"Bricolage Grotesque",', '').replace('"IBM Plex Sans",', '"Segoe UI Variable","Segoe UI",').replace('"IBM Plex Mono",', '"Cascadia Mono","SF Mono",')

html = f'''<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'">
{title}
<style>[hidden]{{display:none!important}} :root{{color-scheme:light}} body{{margin:0}} img{{max-width:100%}}</style>
{style}
</head>
<body>
{body}
<script src="vendor/xlsx.full.min.js"></script>
<script src="shim.js"></script>
<script src="app.js"></script>
</body>
</html>
'''
(root / 'renderer/index.html').write_text(html, encoding='utf-8')
(root / 'renderer/app.js').write_text(js, encoding='utf-8')
print('renderer built', len(html), len(js))
