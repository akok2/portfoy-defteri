# Portföy Defteri — masaüstü uygulaması

BIST hisseleri ve TEFAS fonları için kişisel portföy takibi. Windows ve macOS'ta çalışır, fiyatları internetten kendisi çeker. Tüm veriler bilgisayarınızda tutulur.

## Ne yapar

- İşlem defteri: alış, satış, bedelsiz, temettü; aracı kurum, işlem grubu ve not.
- Komisyon: sabit, oranlı ya da son X günün işlem hacmine göre kademeli; isteğe bağlı %5 BSMV.
- Maliyet yöntemleri: ağırlıklı ortalama, FIFO ve net maliyet (eski Excel programının yöntemi).
- Pozisyonlar: elimdekiler, satıp kapattıklarım ve izleme listesi ayrı gösterilir. Kâr/zarar, haftalık, aylık ve yıl içi getiri, hedef ve zarar-durdur uyarıları.
- Nakit: para yatırma, çekme ve kesintiler; ana para, reel bakiye ve ana paradan kâr/zarar.
- Türkiye vergisi (tahmini): BIST hisse kazancında %0 stopaj, temettüde %15 stopaj ve beyan sınırı kontrolü, fonlarda türe ve alış tarihine göre stopaj.
- Kayıt kontrolü: eksik alım ve mükerrer kayıt uyarıları.
- Excel: dışa aktarma; eski Excel takip programının dosyasını ya da bu uygulamanın Excel'ini önizlemeli içe aktarma.
- Otomatik fiyat güncelleme: açılışta, istendiğinde ve her sabah belirlenen saatte. Uygulama arka planda çalışabilir.
- İsteğe bağlı sabah e-posta raporu (kendi e-posta hesabınız üzerinden).

## Kurulum

### Windows
1. `PortfoyDefteri-1.0.0-win-x64.zip` dosyasını bir klasöre çıkarın (örneğin `Belgeler\Portföy Defteri`).
2. `PortfoyDefteri.exe` dosyasını çalıştırın.
3. Uygulama imzasız olduğu için Windows "Windows kişisel bilgisayarınızı korudu" uyarısı gösterebilir. **Ek bilgi → Yine de çalıştır** seçin.

Kurulum programı (`.exe` yükleyici) isterseniz aşağıdaki "Derleme" bölümüne bakın.

### macOS
macOS paketi (`.dmg`) bir Mac'te ya da GitHub Actions üzerinde derlenir (aşağıya bakın).
1. `.dmg` dosyasını açın, Portföy Defteri'ni Uygulamalar klasörüne sürükleyin.
2. İlk açılışta uygulamaya **sağ tıklayıp "Aç"** deyin. Uygulama Apple tarafından imzalanmadığı için macOS bunu bir kez sorar.
3. "Hasarlı" uyarısı çıkarsa Terminal'de şunu çalıştırın: `xattr -cr "/Applications/Portföy Defteri.app"`

## Verileriniz nerede, ne kadar güvende

- Defter, işletim sisteminin güvenli anahtar deposuyla (Windows'ta DPAPI, macOS'ta Anahtar Zinciri) **şifrelenmiş tek bir dosyada** durur:
  - Windows: `%APPDATA%\Portföy Defteri\defter.dat`
  - macOS: `~/Library/Application Support/Portföy Defteri/defter.dat`
- Her gün otomatik şifreli yedek alınır (`yedekler` klasörü, son 14 gün).
- Uygulama ekranı internete hiç bağlanamaz. İnternete yalnızca fiyat modülü çıkar ve gönderilen tek bilgi hisse ya da fon kodudur. Lot, maliyet, işlem ve nakit bilgisi hiçbir yere gönderilmez.
- Hesap, bulut, sunucu ya da istatistik toplama yoktur.
- E-posta şifresi de anahtar deposunda şifreli tutulur.

## Fiyat kaynakları

| Veri | Kaynaklar |
|---|---|
| BIST hisseleri | Yahoo Finance (fiyat ve 1 yıllık günlük geçmiş); doğrulama için Bigpara, TradingView ve İş Yatırım |
| TEFAS fonları | TEFAS (2026'daki yeni API; çalışmazsa eski uç nokta) |
| Döviz (USD, EUR) | TCMB gösterge kurları |

Ana fiyat en az bir başka kaynakla %1,5 içinde uyuşursa fiyat "2 kaynakla doğrulandı" olarak işaretlenir. Uyuşmazlık, %10'dan büyük günlük hareket ya da güncellenemeyen fiyatlar uygulamada uyarı olarak görünür; eski fiyat silinmez. Gerekirse hisse detayından fiyat elle girilebilir.

**Ayarlar ve gizlilik → "Fiyat kaynaklarını test et"** düğmesi her kaynağı dener ve çalışıp çalışmadığını gösterir. Bu kaynaklar ücretsiz ve resmi olmayan uç noktalardır; biçimleri değişirse ilgili kaynak çalışmayı durdurabilir. O durumda diğer kaynak ve elle fiyat girişi kullanılmaya devam eder.

## Sabah e-posta raporu

**Günlük rapor** sekmesinde:
1. Raporun gideceği adresi yazın, "Raporu e-postayla gönder"i işaretleyin.
2. Gönderen hesap için SMTP bilgilerini girin. Gmail için: Google hesabında 2 adımlı doğrulamayı açın, **Uygulama şifreleri** bölümünden yeni bir şifre oluşturun ve onu yazın (normal Gmail şifrenizi değil). Sunucu `smtp.gmail.com`, port `465`.
3. "Test raporu gönder" ile deneyin.

Rapor, uygulama açıkken (pencere kapalı ve arka planda olsa da) belirlenen saatte gönderilir. Bilgisayar o saatte kapalıysa, açıldığında o günün raporu gönderilir. "Bilgisayar açılınca uygulamayı başlat" seçeneği bunu otomatikleştirir.

## Eski Excel programından geçiş

**Excel'den yükle** düğmesiyle eski programın `.xlsm` dosyasını seçin. DATA sayfasındaki işlemler, BANKA_ISLEMLERI sayfasındaki para hareketleri ve aracı kurum komisyon tabloları önizlemede gösterilir. Ardından "Mevcut defterime ekle" ya da "Defterimi bu dosyayla değiştir" seçilir. Dosya yalnızca bilgisayarınızda okunur.

## Geliştirme

```bash
npm install
npm start
```

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
