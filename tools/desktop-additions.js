/* ---------- desktop-only screens and actions ---------- */
function vRaporDesktop(){
  const ds=S.ds||{}; const sm=ds.smtp||{}; const d=S.durum;
  return `<section class="panel"><div class="panel-h"><h2>Her sabah fiyat güncellemesi ve e-posta raporu</h2>${ds.raporAktif?`<span class="pill ok">Rapor açık · ${esc(maskEmail(ds.raporEmail))}</span>`:`<span class="pill neutral">Rapor kapalı</span>`}</div>
  <div class="prose small"><p>Uygulama açıkken (pencere kapalı olsa da arka planda çalışır) belirlediğin saatte fiyatları günceller ve istersen raporu e-postayla gönderir. Bilgisayar o saatte kapalıysa, açıldığında o günün işini yapar.</p></div>
  <form class="form" id="f-drapor" autocomplete="off">
    <div class="field"><label for="d-saat">Saat</label><input id="d-saat" type="time" value="${esc(ds.raporSaati||"08:45")}"></div>
    <label class="check" for="d-haftaici" style="align-self:center"><input type="checkbox" id="d-haftaici" ${ds.haftaIci!==false?"checked":""}><span>Yalnızca hafta içi</span></label>
    <label class="check wide" for="d-aktif"><input type="checkbox" id="d-aktif" ${ds.raporAktif?"checked":""}><span><b>Raporu e-postayla gönder.</b> Rapor; portföy değeri, günlük değişim, pozisyonlar, hedef/stop uyarıları ve kayıt kontrollerini içerir. Yalnızca aşağıdaki adrese gider.</span></label>
    <div class="field wide" style="max-width:420px"><label for="d-email">Raporun gideceği e-posta</label><input id="d-email" type="email" value="${esc(ds.raporEmail||"")}" placeholder="ornek@eposta.com" maxlength="120"></div>
    <div class="field wide"><h3 style="margin-top:6px">Gönderen e-posta hesabı (SMTP)</h3><span class="hint">Gmail için: Google hesabında 2 adımlı doğrulamayı aç, "Uygulama şifreleri"nden bu uygulama için bir şifre oluştur ve onu yaz. Normal Gmail şifreni yazma. Şifre bu bilgisayarın güvenli anahtar deposunda şifrelenerek saklanır.</span></div>
    <div class="field"><label for="d-host">Sunucu</label><input id="d-host" value="${esc(sm.host||"smtp.gmail.com")}" maxlength="200"></div>
    <div class="field"><label for="d-port">Port</label><input id="d-port" inputmode="numeric" value="${esc(sm.port||465)}"></div>
    <label class="check" for="d-secure" style="align-self:center"><input type="checkbox" id="d-secure" ${sm.secure!==false?"checked":""}><span>SSL/TLS (465)</span></label>
    <div class="field"><label for="d-user">Kullanıcı (e-posta)</label><input id="d-user" value="${esc(sm.user||"")}" maxlength="200" autocomplete="off"></div>
    <div class="field"><label for="d-pass">Uygulama şifresi</label><input id="d-pass" type="password" value="" placeholder="${sm.hasPass?"kayıtlı · değiştirmek için yaz":"şifre"}" autocomplete="new-password"></div>
    <div class="form-actions"><button class="btn primary" type="submit">Kaydet</button><button class="btn" type="button" data-act="mail-test" ${sm.hasPass?"":"disabled"}>Test raporu gönder</button><button class="btn" type="button" data-act="sabah-simdi">Sabah işini şimdi çalıştır</button><span class="small" id="d-msg"></span></div>
  </form></section>
  <section class="panel"><h3>Uygulama</h3>
    <label class="check" for="d-arka"><input type="checkbox" id="d-arka" ${ds.arkaPlanda!==false?"checked":""}><span>Pencereyi kapatınca arka planda çalışmaya devam et (sabah işinin yapılabilmesi için gerekli). Tamamen kapatmak için sistem tepsisi / menü çubuğundaki simgeden "Çık"ı seç.</span></label>
    <label class="check" for="d-acilis"><input type="checkbox" id="d-acilis" ${ds.acilistaBaslat?"checked":""}><span>Bilgisayar açılınca uygulamayı arka planda başlat</span></label>
  </section>
  <section class="panel"><h3>Son çalışma</h3>${d?`<p class="small">${esc(d.sonCalisma||"—")} · ${esc(d.ozet||"")}</p>${(d.ayrinti||[]).length?`<details><summary class="small">Ayrıntılar</summary><ul class="small">${d.ayrinti.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>`:""}`:`<p class="small muted">Henüz çalışmadı.</p>`}</section>`;
}
function gizlilikDesktop(){
  const ds=S.ds||{};
  return `<div class="prose"><ul>
    <li><b>Verilerin yalnızca bu bilgisayarda.</b> Hesap, bulut ya da sunucu yok. Defterin ${ds.sifreleme?"işletim sisteminin anahtar deposuyla <b>şifrelenmiş</b> bir dosyada":"bir dosyada (bu sistemde şifreleme kullanılamıyor)"} durur.</li>
    <li><b>İnternete yalnızca fiyat almak için çıkılır</b> ve gönderilen tek bilgi hisse ya da fon kodudur (örn. THYAO). Lot, maliyet ve işlem bilgilerin hiçbir yere gönderilmez.</li>
    <li>Bu ekran internete hiç bağlanamaz; fiyat bağlantılarını yalnızca uygulamanın fiyat modülü yapar.</li>
    <li>Her gün otomatik şifreli yedek alınır, son 14 gün saklanır. Ayrıca istediğin zaman Excel olarak yedek indirebilirsin.</li>
    <li>E-posta raporu isteğe bağlıdır; gönderen hesabın şifresi işletim sisteminin anahtar deposunda şifreli tutulur.</li>
    <li><b>Hassas bilgi girme.</b> T.C. kimlik numarası, hesap numarası, IBAN ya da şifre hiçbir alanda gerekmez.</li>
  </ul></div>
  <div class="row"><button class="btn" data-act="veri-klasoru">Veri klasörünü aç</button><button class="btn" data-act="kaynak-test">Fiyat kaynaklarını test et</button><span class="small muted">${esc(ds.veriKlasoru||"")}</span></div>
  <div id="kaynak-sonuc"></div>`;
}
async function raporOlustur(){
  for(let i=0;i<40&&!(S.defterGeldi&&S.piyasaGeldi);i++) await new Promise(r=>setTimeout(r,250));
  if(S.demo) throw new Error("Henüz bir defter oluşturulmamış. Uygulamada 'Boş defterle başla' ya da 'Excel'den yükle' ile defterini kur.");
  const c=hesapla(S.defter), T=c.toplam; S.calc=c;
  const g="#16794A", k="#C23A2B", m="#5B6660";
  const renk=n=>!isFinite(n)||Math.abs(n)<1e-9?"#15201B":(n>0?g:k);
  const elde=Object.values(c.poz).filter(p=>p.lot>0&&!p.bozuk).sort((a,b)=>(b.deger||0)-(a.deger||0));
  const fiyatGunu=S.piyasa?.guncelleme||"—";
  const tdc=(c="#15201B")=>`style="padding:6px 10px;border-bottom:1px solid #DCDFD8;text-align:right;font-family:Menlo,Consolas,monospace;font-size:13px;color:${c}"`; const td=tdc();
  const th='style="padding:6px 10px;border-bottom:1px solid #DCDFD8;text-align:right;font-size:11px;color:#5B6660;text-transform:uppercase"';
  const not=p=>!p.f?"fiyat yok":p.f.elle?"elle girilen fiyat":p.f.eski?"eski fiyat ("+fmtDate(String(p.f.tarih).slice(0,10))+")":p.f.dogrulama==="iki-kaynak"?"2 kaynak":p.f.dogrulama==="tek-kaynak"?"tek kaynak":"kontrol edin";
  const hareket=elde.filter(p=>p.gunlukYuzde!=null).sort((a,b)=>b.gunlukYuzde-a.gunlukYuzde);
  const alarmlar=Object.values(c.poz).filter(p=>p.alarm);
  const usd=S.piyasa?.doviz?.USD?.satis;
  const tarih=new Date().toLocaleDateString("tr-TR");
  const subject=`Portföy Defteri · ${tarih} sabah raporu · ${TL(T.deger)}${T.gunlukYuzde!=null?" ("+PCT(T.gunlukYuzde)+")":""}`;
  const satirlar=elde.map(p=>`<tr><td style="padding:6px 10px;border-bottom:1px solid #DCDFD8;font-weight:600">${esc(p.kod)}</td><td ${td}>${LOT(p.lot)}</td><td ${td}>${PX(p.ort)}</td><td ${td}>${p.f?PX(p.f.fiyat):"—"}<div style="font-size:10px;color:${m}">${not(p)}</div></td><td ${td}>${TL(p.deger)}</td><td ${tdc(renk(p.kz))}>${TLs(p.kz)}<br>${PCT(p.kzYuzde)}</td><td ${tdc(renk(p.gunluk))}>${p.gunlukYuzde!=null?PCT(p.gunlukYuzde):"—"}</td></tr>`).join("");
  const html=`<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#15201B;max-width:720px">
    <h2 style="margin:0 0 4px">Portföy Defteri · ${tarih}</h2><p style="margin:0 0 16px;color:${m};font-size:13px">Fiyatlar: ${esc(fiyatGunu)} (15 dk gecikmeli kaynaklar)</p>
    <table style="border-collapse:collapse;margin-bottom:16px"><tr>
      <td style="padding:8px 16px 8px 0"><div style="font-size:11px;color:${m}">PORTFÖY DEĞERİ</div><div style="font-size:20px;font-weight:700">${TL(T.deger)}</div>${usd?`<div style="font-size:12px;color:${m}">≈ $${nf2.format(T.deger/usd)}</div>`:""}</td>
      <td style="padding:8px 16px"><div style="font-size:11px;color:${m}">GÜNLÜK</div><div style="font-size:20px;font-weight:700;color:${renk(T.gunluk)}">${TLs(T.gunluk)}</div><div style="font-size:12px;color:${renk(T.gunluk)}">${PCT(T.gunlukYuzde)}</div></td>
      <td style="padding:8px 16px"><div style="font-size:11px;color:${m}">KÂĞIT ÜSTÜ K/Z</div><div style="font-size:20px;font-weight:700;color:${renk(T.kz)}">${TLs(T.kz)}</div><div style="font-size:12px;color:${renk(T.kz)}">${PCT(T.kzYuzde)}</div></td>
    </tr></table>
    ${elde.length?`<table style="border-collapse:collapse;width:100%"><tr><th style="padding:6px 10px;border-bottom:1px solid #DCDFD8;text-align:left;font-size:11px;color:${m}">HİSSE</th><th ${th}>Lot</th><th ${th}>Ort. alış</th><th ${th}>Fiyat</th><th ${th}>Değer</th><th ${th}>K/Z</th><th ${th}>Günlük</th></tr>${satirlar}</table>`:`<p>Açık pozisyon yok.</p>`}
    ${hareket.length?`<p style="margin-top:16px"><b>En çok yükselen:</b> ${hareket.slice(0,3).map(p=>esc(p.kod)+" "+PCT(p.gunlukYuzde)).join(", ")}<br><b>En çok düşen:</b> ${hareket.slice(-3).reverse().map(p=>esc(p.kod)+" "+PCT(p.gunlukYuzde)).join(", ")}</p>`:""}
    ${alarmlar.length?`<p><b>Hedef / stop uyarıları:</b><br>${alarmlar.map(p=>esc(p.kod)+": "+esc(p.alarm.msg)).join("<br>")}</p>`:""}
    ${c.uyarilar.filter(u=>u.lvl!=="ok").length?`<p><b>Kontrol etmen gerekenler:</b><br>${c.uyarilar.filter(u=>u.lvl!=="ok").map(u=>esc(u.kod)+": "+esc(u.msg)).join("<br>")}</p>`:""}
    ${(c.temettuOneri||[]).length?`<p><b>Bulunan temettüler:</b> ${c.temettuOneri.map(t=>esc(t.kod)+" "+fmtDate(t.tarih)+" ≈ "+TL(t.net)).join(", ")}. Uygulamadan onaylayıp deftere ekleyebilirsin.</p>`:""}
    <p style="font-size:12px;color:${m}">Gerçekleşen K/Z ${TLs(T.gerceklesen)} · Net temettü ${TL(T.temettu)} · Ödenen komisyon ${TL(T.komisyon)} · Toplam sonuç ${TLs(T.sonuc)}<br>Kâr/zarar ortalama alış fiyatına göredir, komisyon dahil değildir.</p>
    <p style="font-size:11px;color:${m};margin-top:20px">Bu rapor bilgilendirme amaçlıdır, yatırım tavsiyesi değildir. Bilgisayarındaki Portföy Defteri uygulaması tarafından hazırlandı; raporu uygulamanın "Günlük rapor" sekmesinden kapatabilirsin.</p></div>`;
  const text=[`Portföy Defteri · ${tarih}`,`Fiyatlar: ${fiyatGunu}`,`Portföy değeri: ${TL(T.deger)} · Günlük: ${TLs(T.gunluk)} (${PCT(T.gunlukYuzde)}) · K/Z: ${TLs(T.kz)} (${PCT(T.kzYuzde)})`,"",
    ...elde.map(p=>`${p.kod}: ${LOT(p.lot)} lot · fiyat ${p.f?PX(p.f.fiyat):"—"} (${not(p)}) · değer ${TL(p.deger)} · K/Z ${TLs(p.kz)}`),"",
    ...c.uyarilar.filter(u=>u.lvl!=="ok").map(u=>`Kontrol: ${u.kod}: ${u.msg}`),"","Bilgilendirme amaçlıdır, yatırım tavsiyesi değildir."].join("\n");
  return {subject,html,text};
}
async function desktopKaydet(){
  const msg=$("#d-msg"); msg.className="small"; msg.textContent="";
  const email=$("#d-email").value.trim(), aktif=$("#d-aktif").checked;
  if(aktif && !EMAIL_RE.test(email)){ msg.className="small err-msg"; msg.textContent="Geçerli bir e-posta adresi gir."; return; }
  const patch={raporSaati:$("#d-saat").value||"08:45",haftaIci:$("#d-haftaici").checked,raporAktif:aktif,raporEmail:email,
    arkaPlanda:$("#d-arka").checked,acilistaBaslat:$("#d-acilis").checked,
    smtp:{host:$("#d-host").value,port:parseInt($("#d-port").value,10)||465,secure:$("#d-secure").checked,user:$("#d-user").value}};
  const pw=$("#d-pass").value; if(pw) patch.smtp.pass=pw;
  try{ S.ds=await window.desktop.setSettings(patch); renderMain(); renderChips(); toast("Ayarlar kaydedildi"); }
  catch(e){ msg.className="small err-msg"; msg.textContent=String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,""); }
}
async function desktopEylem(a,t){
  const D=window.desktop; const temiz=e=>String(e&&e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
  if(a==="fiyat-yenile"){ S.yenileniyor=true; renderChips(); try{ await D.refreshPrices(ekranKodlari()); }catch(e){ toast("Fiyatlar alınamadı: "+temiz(e)); } return; }
  if(a==="veri-klasoru"){ D.openDataFolder(); return; }
  if(a==="kaynak-test"){ const box=$("#kaynak-sonuc"); if(box) box.innerHTML=`<p class="small muted">Kaynaklar deneniyor…</p>`;
    try{ const r=await D.testSources(); if(box) box.innerHTML=`<ul class="warnlist">${r.map(x=>`<li class="${x.ok?"ok":"bad"}"><b>${esc(x.ad)}</b><span>${x.ok?esc(x.ornek):"Çalışmıyor: "+esc(x.hata)} · ${x.ms} ms</span></li>`).join("")}</ul>`; }
    catch(e){ if(box) box.innerHTML=`<p class="err-msg">${esc(temiz(e))}</p>`; } return; }
  if(a==="mail-test"){ const msg=$("#d-msg"); t.disabled=true; msg.className="small"; msg.textContent="Gönderiliyor…";
    try{ await D.testMail(); msg.className="small ok-msg"; msg.textContent="Test raporu gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et."; }
    catch(e){ msg.className="small err-msg"; msg.textContent="Gönderilemedi: "+temiz(e); } t.disabled=false; return; }
  if(a==="sabah-simdi"){ const msg=$("#d-msg"); t.disabled=true; msg.className="small"; msg.textContent="Çalışıyor…";
    try{ const r=await D.runMorning(); msg.className="small ok-msg"; msg.textContent=r.ozet+" Rapor "+r.rapor+"."; }
    catch(e){ msg.className="small err-msg"; msg.textContent=temiz(e); } t.disabled=false; return; }
}

// While the sample portfolio is shown (nothing saved yet) the price module has no codes of its own: pass the ones on screen.
function ekranKodlari(){ if(!S.demo) return null; const m=new Map(); for(const h of S.defter.hisseler||[]) m.set(h.kod,h.tip==="Fon"?"Fon":"Hisse"); for(const x of S.defter.islemler||[]) if(!m.has(x.kod)) m.set(x.kod,"Hisse"); return [...m].map(([kod,tip])=>({kod,tip})); }
function ornekFiyatlari(){ if(!DESKTOP||!S.demo) return; const v=(S.piyasa&&S.piyasa.veriler)||{}; const k=ekranKodlari()||[]; if(k.length&&k.some(x=>!v[x.kod])) window.desktop.refreshPrices(k).catch(()=>{}); }

// A code was added on screen: fetch its price right away instead of waiting for the morning run.
function kodEklendi(kod){ if(!DESKTOP) return; setTimeout(()=>{ window.desktop.refreshPrices(ekranKodlari()).catch(()=>{}); },1200); }

/* ---------- BIST 100 page (desktop only) ---------- */
if(DESKTOP){ TABS.splice(3,0,["bist","BIST 100"]); EK_GORUNUM.bist=vBist; }
function bistYasi(){ const g=S.bist&&S.bist.zaman; return g?Date.now()-g:Infinity; }
async function bistYenile(zorla){
  if(S.bistYukleniyor) return; if(!zorla&&bistYasi()<15*60e3) return;
  S.bistYukleniyor=true; S.bistHata=null; if(S.tab==="bist") renderMain();
  try{ await window.desktop.bist100(); }catch(e){ S.bistHata=String(e&&e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,""); }
  S.bistYukleniyor=false; if(S.tab==="bist") renderMain();
}
function vBist(){
  setTimeout(()=>bistYenile(false),0);
  const B=S.bist, L=(B&&B.liste)||[];
  const q=(S.bistFiltre||"").trim().toLocaleUpperCase("tr-TR");
  const sira=S.bistSira||"kod", yon=S.bistYon||1;
  const deger=x=>sira==="degisim"?(x.degisim??-1e9):sira==="fiyat"?(x.fiyat??-1):sira==="ad"?(x.ad||""):x.kod;
  const list=L.filter(x=>!q||x.kod.includes(q)||(x.ad||"").toLocaleUpperCase("tr-TR").includes(q)).sort((a,b)=>{ const A=deger(a),Bv=deger(b); return (A<Bv?-1:A>Bv?1:0)*yon; });
  const durum=kod=>{ const p=S.calc.poz[kod]; if(p&&p.lot>0) return `<span class="pill ok">Portföyde</span>`; if(S.defter.hisseler.some(h=>h.kod===kod)) return `<span class="pill neutral">İzlemede</span>`; return `<button class="btn ghost" data-bist-ekle="${esc(kod)}">+ İzlemeye ekle</button>`; };
  const yuk=L.filter(x=>x.degisim>0).length, dus=L.filter(x=>x.degisim<0).length;
  const bas=(k,t,n)=>`<th class="${n?"n":""}"><button class="linkbtn" data-bist-sira="${k}" style="font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit">${t}${sira===k?(yon>0?" ▲":" ▼"):""}</button></th>`;
  return `<section class="panel"><div class="panel-h"><h2>BIST 100 <span class="muted num" style="font-size:15px">${L.length||""}</span></h2>
    <span class="row"><span class="small muted">${B&&B.guncelleme?`${esc(B.guncelleme)} · ${esc(B.kaynak||"")}`:""}${L.length?` · ${yuk} yükselen, ${dus} düşen`:""}</span><button class="btn" data-bist-yenile="1" ${S.bistYukleniyor?"disabled":""}>${S.bistYukleniyor?"Yükleniyor…":"↻ Yenile"}</button></span></div>
    ${S.bistHata?`<p class="err-msg">Liste alınamadı: ${esc(S.bistHata)}</p>`:""}
    <div class="row"><div class="field" style="max-width:260px"><label for="b-filtre">Ara</label><input id="b-filtre" value="${esc(S.bistFiltre||"")}" placeholder="Kod ya da şirket adı"></div><span class="small muted">Fiyatlar 15 dakika gecikmelidir. İzlemeye eklediğin hisse Pozisyonlar sekmesindeki izleme listesine girer.</span></div>
    ${L.length?`<div class="tbl-wrap"><table><thead><tr>${bas("kod","Kod")}${bas("ad","Şirket")}${bas("fiyat","Fiyat",1)}${bas("degisim","Günlük",1)}<th></th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x.kod)}</b></td><td class="small">${esc(x.ad||"")}</td><td class="n num">${x.fiyat!=null?PX(x.fiyat):"—"}</td><td class="n num ${cls(x.degisim)}">${x.degisim!=null?PCT(x.degisim):"—"}</td><td class="n">${durum(x.kod)}</td></tr>`).join("")}</tbody></table></div>`
      :`<div class="empty"><p>${S.bistYukleniyor?"BIST 100 listesi yükleniyor…":"Liste henüz alınmadı."}</p></div>`}
  </section>`;
}
document.addEventListener("click",async ev=>{
  const y=ev.target.closest("[data-bist-yenile]"); if(y){ bistYenile(true); return; }
  const s=ev.target.closest("[data-bist-sira]"); if(s){ const k=s.dataset.bistSira; if(S.bistSira===k) S.bistYon=-(S.bistYon||1); else { S.bistSira=k; S.bistYon=k==="degisim"?-1:1; } renderMain(); return; }
  const e=ev.target.closest("[data-bist-ekle]"); if(!e) return;
  const kod=e.dataset.bistEkle; if(!KOD_RE.test(kod)) return;
  if(S.demo){ await baslat(false); if(S.demo) return; }
  if(!guard()) return;
  if(S.defter.hisseler.some(h=>h.kod===kod)){ toast(kod+" zaten listede."); return; }
  const x=((S.bist&&S.bist.liste)||[]).find(v=>v.kod===kod)||{};
  S.defter.hisseler.push({kod,tip:"Hisse",ad:x.ad||"",hedef:null,stop:null,vergiSinifi:null});
  commit(kod+" izleme listesine eklendi, fiyatı alınıyor…"); kodEklendi(kod);
});
document.addEventListener("input",ev=>{ if(ev.target.id!=="b-filtre") return; S.bistFiltre=ev.target.value; const pos=ev.target.selectionStart; renderMain(); const el=$("#b-filtre"); el.focus(); try{ el.setSelectionRange(pos,pos); }catch(e){} });
