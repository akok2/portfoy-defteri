// Unit tests for the plain-language e-mail error messages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { epostaHatasi } = require('../../src/eposta');

test('e-posta hataları anlaşılır söylenir', () => {
  assert.match(epostaHatasi({ code: 'EAUTH', response: '535 5.7.139 Authentication unsuccessful, basic authentication is disabled.' }, 'smtp-mail.outlook.com'), /Outlook\/Hotmail/);
  assert.match(epostaHatasi({ code: 'EAUTH', response: '535-5.7.8 Username and Password not accepted.' }, 'smtp.gmail.com'), /uygulama şifresini/);
  assert.match(epostaHatasi({ code: 'ETIMEDOUT', message: 'Connection timeout' }, 'smtp.ornek.com'), /bağlanılamadı \(smtp\.ornek\.com\)/);
  assert.match(epostaHatasi({ code: 'EDNS', message: 'getaddrinfo ENOTFOUND smtp.yanlis' }, 'smtp.yanlis'), /sunucu adını/);
  assert.equal(epostaHatasi(new Error('Rapor e-posta adresi girilmemiş.')), 'Rapor e-posta adresi girilmemiş.');
});
