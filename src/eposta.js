// Turns e-mail server errors into plain advice. Kept free of Electron so it can be unit-tested.
function epostaHatasi(e, host) {
  const m = String((e && (e.response || e.message)) || e || '').replace(/\s+/g, ' ').trim();
  const kod = e && e.code;
  const kisa = m.slice(0, 160);
  if (/basic authentication is (disabled|not supported)|5\.7\.139|5\.7\.30/i.test(m))
    return 'Microsoft (Outlook/Hotmail) bu hesapta uygulamaların şifreyle e-posta göndermesini kapatmış. Gönderen olarak Gmail, Yandex, iCloud ya da Yahoo hesabı kullan; rapor yine Outlook adresine gidebilir.';
  if (kod === 'EAUTH' || /\b(535|534)\b|invalid login|username and password not accepted|authentication (failed|unsuccessful)|application-specific password required/i.test(m))
    return `Kullanıcı adı ya da şifre kabul edilmedi. Normal hesap şifresi değil, sağlayıcının verdiği uygulama şifresini yazdığından ve kullanıcı olarak e-posta adresinin tamamını yazdığından emin ol. (${kisa})`;
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND'].includes(kod) || /timeout|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(m))
    return `E-posta sunucusuna bağlanılamadı (${host || 'sunucu yok'}). İnternet bağlantını, sunucu adını, portu ve SSL ayarını kontrol et. (${kisa})`;
  return m || 'Bilinmeyen e-posta hatası.';
}
module.exports = { epostaHatasi };
