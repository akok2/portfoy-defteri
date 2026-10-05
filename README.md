# Portföy Defteri — masaüstü uygulaması

BIST hisseleri ve TEFAS fonları için kişisel portföy takibi. Windows ve macOS'ta çalışır, fiyatları internetten kendisi çeker. Tüm veriler bilgisayarınızda tutulur.

## Ne yapar

- İşlem defteri: alış, satış, bedelsiz, temettü; aracı kurum, işlem grubu ve not.
- Komisyon: sabit, oranlı ya da son X günün işlem hacmine göre kademeli; isteğe bağlı %5 BSMV.
- Kâr/zarar ortalama alış fiyatına göre: kâğıt üstü (fiyat − alış fiyatı) × lot, satışta (satış − alış fiyatı) × lot. Komisyon kâr/zarara katılmaz, ayrıca toplanır; Özet'teki "Toplam sonuç" komisyonu düşer. Bedelsiz paylar sıfır maliyetle eklenir ve ortalamayı düşürür.
- Pozisyonlar: elimdekiler, satıp kapattıklarım ve izleme listesi ayrı gösterilir. Haftalık, aylık ve yıl içi fiyat değişimi, hedef ve zarar-durdur uyarıları.
- Temettüler kendiliğinden bulunur: elinizde lot olduğu tarihlerde dağıtılan ve defterde olmayan temettüler Özet'te listelenir, onaylarsanız deftere eklenir (tutar tahminidir, düzeltilebilir).
- BIST 100 sayfası: endeksteki tüm hisseler fiyat ve günlük değişimle; tek tıkla izleme listesine eklenir.
- Vergi bilgisi: hisse ve fon kazançları, brüt temettüler ve kesilen stopajlar. Ödenecek gelir vergisi tüm yıllık gelire bağlı olduğu için hesaplanmaz.
- Kayıt kontrolü: eksik alım ve mükerrer kayıt uyarıları.
- Excel: muhasebe biçimli dışa aktarma; eski Excel takip programının dosyasını, bu uygulamanın Excel'ini ya da kendi işlem tablonuzu önizlemeli içe aktarma.
- Otomatik fiyat güncelleme: açılışta, istendiğinde, yeni bir kod eklenince (elle, Excel'den ya da BIST 100 sayfasından) hemen ve her sabah belirlenen saatte. Uygulama arka planda çalışabilir.
- Yanlış yazılmış kod hiçbir kaynakta bulunamazsa açıkça "kod bulunamadı" denir; bağlantı hatasından ayrı tutulur. Türkçe klavyeyle yazılan kodlar (ecİlc → ECILC) kendiliğinden düzeltilir.
- İsteğe bağlı sabah e-posta raporu (kendi e-posta hesabınız üzerinden).

## Kurulum

### Windows
1. `PortfoyDefteri-1.0.0-win-x64.zip` dosyasını bir klasöre çıkarın (örneğin `Belgeler\Portföy Defteri`).
2. `PortfoyDefteri.exe` dosyasını çalıştırın.
3. Uygulama imzasız olduğu için Windows "Windows kişisel bilgisayarınızı korudu" uyarısı gösterebilir. **Ek bilgi → Yine de çalıştır** seçin.
4. Pencereyi kapatınca uygulama kapanmaz, sabah işini yapabilmek için saatin yanındaki simge olarak çalışmaya devam eder (simge görünmüyorsa ^ okuna tıklayın). Tamamen kapatmak için simgeye sağ tıklayıp **Çık** seçin.

Kurulum programı (`.exe` yükleyici) isterseniz aşağıdaki "Derleme" bölümüne bakın.

### macOS
macOS paketi (`.dmg`) bir Mac'te ya da GitHub Actions üzerinde derlenir (aşağıya bakın).
1. `.dmg` dosyasını açın, Portföy Defteri'ni Uygulamalar klasörüne sürükleyin.
2. İlk açılışta uygulamaya **sağ tıklayıp "Aç"** deyin. Uygulama Apple tarafından imzalanmadığı için macOS bunu bir kez sorar.
3. "Hasarlı" uyarısı çıkarsa Terminal'de şunu çalıştırın: `xattr -cr "/Applications/Portfoy Defteri.app"`

Mac'te uygulama paketinin adı "Portfoy Defteri" (ö harfi olmadan) olarak derlenir; macOS paket adında Türkçe harf olunca Electron açılışta çöküyor. Pencere başlığı ve veri klasörü yine "Portföy Defteri"dir.

## Verileriniz nerede, ne kadar güvende

- Defter, işletim sisteminin güvenli anahtar deposuyla (Windows'ta DPAPI, macOS'ta Anahtar Zinciri) **şifrelenmiş tek bir dosyada** durur:
  - Windows: `%APPDATA%\Portföy Defteri\defter.dat`
  - macOS: `~/Library/Application Support/Portföy Defteri/defter.dat`
- Her gün otomatik şifreli yedek alınır (`yedekler` klasörü, son 14 gün).
- Uygulama ekranı internete hiç bağlanamaz. İnternete yalnızca fiyat modülü çıkar ve gönderilen tek bilgi hisse ya da fon kodudur. Lot, maliyet ve işlem bilgisi hiçbir yere gönderilmez.
- Hesap, bulut, sunucu ya da istatistik toplama yoktur.
- E-posta şifresi de anahtar deposunda şifreli tutulur.

## Fiyat kaynakları

| Veri | Kaynaklar |
|---|---|
| BIST hisseleri | Yahoo Finance (fiyat ve 1 yıllık günlük geçmiş); doğrulama için İş Yatırım ve TradingView |
| TEFAS fonları | TEFAS (2026'daki yeni API; çalışmazsa eski uç nokta) |
| Döviz (USD, EUR) | TCMB gösterge kurları |
| Temettü ve bedelsiz olayları | Yahoo Finance |
| BIST 100 listesi ve fiyatları | Borsa İstanbul endeks bileşen listesi; fiyatlar TradingView (gerekirse Yahoo) |

Ana fiyat en az bir başka kaynakla %1,5 içinde uyuşursa fiyat "2 kaynakla doğrulandı" olarak işaretlenir. Uyuşmazlık, %10'dan büyük günlük hareket ya da güncellenemeyen fiyatlar uygulamada uyarı olarak görünür; eski fiyat silinmez. Gerekirse hisse detayından fiyat elle girilebilir.

**Ayarlar ve gizlilik → "Fiyat kaynaklarını test et"** düğmesi her kaynağı dener ve çalışıp çalışmadığını gösterir. Bu kaynaklar ücretsiz ve resmi olmayan uç noktalardır; biçimleri değişirse ilgili kaynak çalışmayı durdurabilir. O durumda diğer kaynak ve elle fiyat girişi kullanılmaya devam eder.

## Sabah e-posta raporu

**Günlük rapor** sekmesinde:
1. Raporun gideceği adresi yazın, "Raporu e-postayla gönder"i işaretleyin.
2. Gönderen hesap için SMTP bilgilerini girin. Gmail için: Google hesabında 2 adımlı doğrulamayı açın, **Uygulama şifreleri** bölümünden yeni bir şifre oluşturun ve onu yazın (normal Gmail şifrenizi değil). Sunucu `smtp.gmail.com`, port `465`.
3. "Test raporu gönder" ile deneyin.

Rapor, uygulama açıkken (pencere kapalı ve arka planda olsa da) belirlenen saatte gönderilir. Bilgisayar o saatte kapalıysa, açıldığında o günün raporu gönderilir. "Bilgisayar açılınca uygulamayı başlat" seçeneği bunu otomatikleştirir.

## Eski Excel programından geçiş

**Excel'den yükle** düğmesiyle eski programın `.xlsm` dosyasını seçin. DATA sayfasındaki işlemler ve BANKA_ISLEMLERI sayfasındaki aracı kurum komisyon tabloları önizlemede gösterilir (para hareketleri alınmaz; uygulama nakit takibi yapmaz). Ardından "Mevcut defterime ekle" ya da "Defterimi bu dosyayla değiştir" seçilir. Dosya yalnızca bilgisayarınızda okunur. Programın boş şablonunda DATA sayfası boştur; o durumda önizleme bunu açıkça söyler ve yalnızca aracı kurumlar alınır.

Kendi hazırladığınız bir Excel tablosu da yüklenebilir: başlık satırında en az **Hisse** (ya da Kod) ve **Lot** (ya da Adet) sütunları olmalı; **İşlem türü** (Alış/Satış/Bedelsiz/Temettü), **Fiyat** (ya da Alış fiyatı / Maliyet), **Tarih** ve **Komisyon** sütunları da okunur. Başlıkların üstünde açıklama satırları, başlıklarda "(TL)" gibi birimler olabilir. Tür sütunu yoksa satırlar alış sayılır (eksi lot satış). Okunamayan satırlar önizlemede satır numarası ve nedeniyle listelenir.

**Tarih zorunlu değildir.** Alış tarihini hatırlamıyorsanız boş bırakın (Excel'de ya da İşlemler formunda). Kâr/zarar ortalama alış fiyatına göre hesaplandığı için sonuç tarihten etkilenmez: (güncel fiyat − ortalama alış fiyatı) × lot. Tarihsiz alışlar en eski, tarihsiz satışlar en yeni işlem sayılır. Tarihsiz kayıtlar için temettüler deftere girildikleri günden itibaren aranır; vergi sayfasında tarihsiz satış ve temettüler "Tarihsiz" yılı altında ayrı gösterilir; tarihsiz fon paylarında stopaj güncel oranla tahmin edilir.

## Geliştirme

```bash
npm install
npm start
```

### Testler

- `npm run test:birim`: hesaplama motoru (kâr/zarar, bedelsiz, eksik kayıt, temettü bulma, fon stopajı, Türkçe sayı ve Excel okuma), tarihsiz işlemler, fiyat modülü (kaynak doğrulama, TEFAS, temettü olayları, BIST 100 listesi) ve sabah görevi kararları. Elektron gerekmez.
- `npm test`: uygulamayı açıp kullanıcı gibi gezinen uçtan uca test (kayıtlı fiyat cevaplarıyla, internetsiz).
- `npm run test:tutarlilik`: aynı defter için Özet, Pozisyonlar, hisse detayı, Vergi, Excel dosyası ve e-posta raporundaki rakamların elle hesaplanmış değerlerle ve birbirleriyle aynı olduğunu; hiçbir yerde örnek ya da hazır veri kalmadığını denetler.
- `node tests/canli-uygulama.js`: uygulamanın içinden gerçek internete çıkıp fiyat, temettü ve BIST 100 verisini dener.

GitHub Actions bunların hepsini Windows'ta ve macOS'ta paketlenmiş uygulama üzerinde çalıştırır; sonuçlar işin özet sayfasındadır.

Ekran kodu `renderer/` klasöründedir. `tools/build-renderer.py`, claude.ai'deki Portföy Defteri sayfasından (`tools/artifact-source.html`) masaüstü sürümünü üretir; masaüstüne özgü ekranlar `tools/desktop-additions.js` içindedir.

## Derleme

### GitHub Actions ile (Windows yükleyici + macOS dmg)
1. Bu klasörü bir GitHub deposuna yükleyin.
2. **Actions → Uygulamayı derle → Run workflow**.
3. İş bitince sayfanın altındaki **Artifacts** bölümünden Windows (`.exe` yükleyici ve `.zip`) ve macOS (`.dmg` ve `.zip`, Intel + Apple Silicon) paketlerini indirin.

Etiket (`v1.0.1` gibi) gönderildiğinde de derleme otomatik başlar.

### Kendi bilgisayarınızda
- Windows'ta: `npm install` ve `npm run dist:win`
- Mac'te: `npm install` ve `npm run dist:mac`

### İmzalama
Uygulama imzasız derlenir. Uyarıları tamamen kaldırmak için Windows'ta bir kod imzalama sertifikası, macOS'ta Apple Developer hesabı (yıllık ücretli) ve noter onayı gerekir. electron-builder bu sertifikalar `CSC_LINK` / `CSC_KEY_PASSWORD` ortam değişkenleriyle verildiğinde otomatik imzalar.

## Bilinen sınırlamalar
- Fiyatlar 15 dakika gecikmelidir ve resmi olmayan kaynaklardan alınır; doğruluğu garanti edilmez. Yatırım tavsiyesi değildir.
- Vergi hesapları 28.09.2026 itibarıyla geçerli mevzuata göre yapılmış tahminlerdir.
- Linux'ta anahtar deposu (libsecret) yoksa defter şifrelenmeden saklanır ve e-posta şifresi kaydedilmez.
