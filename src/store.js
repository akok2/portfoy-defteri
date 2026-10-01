// Local document store for Portföy Defteri.
// All documents live in one file in the user's app-data folder. When the operating system offers
// a secure key store (Windows DPAPI, macOS Keychain, Linux libsecret) the file is encrypted with it.
const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const MAGIC = 'PDENC1:';

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.file = path.join(dir, 'defter.dat');
    this.backupDir = path.join(dir, 'yedekler');
    this.docs = {};
    this.timer = null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.load();
  }

  encryptionAvailable() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
  }

  load() {
    if (!fs.existsSync(this.file)) return;
    const raw = fs.readFileSync(this.file);
    let text;
    if (raw.slice(0, MAGIC.length).toString('utf8') === MAGIC) {
      text = safeStorage.decryptString(raw.slice(MAGIC.length));
    } else {
      text = raw.toString('utf8');
    }
    const parsed = JSON.parse(text);
    this.docs = parsed && typeof parsed === 'object' && parsed.docs ? parsed.docs : {};
  }

  serialize() {
    const text = JSON.stringify({ v: 1, savedAt: new Date().toISOString(), docs: this.docs });
    if (this.encryptionAvailable()) {
      return Buffer.concat([Buffer.from(MAGIC, 'utf8'), safeStorage.encryptString(text)]);
    }
    return Buffer.from(text, 'utf8');
  }

  writeNow() {
    clearTimeout(this.timer); this.timer = null;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.serialize(), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.dailyBackup();
  }

  scheduleWrite() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { try { this.writeNow(); } catch (e) { this.emit('error', e); } }, 300);
  }

  // One encrypted copy per day, the last 14 days kept.
  dailyBackup() {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(this.backupDir, `defter-${day}.dat`);
    if (!fs.existsSync(target)) fs.copyFileSync(this.file, target);
    const files = fs.readdirSync(this.backupDir).filter(f => /^defter-\d{4}-\d{2}-\d{2}\.dat$/.test(f)).sort();
    while (files.length > 14) fs.unlinkSync(path.join(this.backupDir, files.shift()));
  }

  static validPath(p) {
    return typeof p === 'string' && p.length < 400 && /^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)+$/.test(p) && p.split('/').length % 2 === 0;
  }

  get(p) {
    if (!Store.validPath(p)) throw new Error('Geçersiz yol');
    const d = this.docs[p];
    return d === undefined ? null : JSON.parse(JSON.stringify(d));
  }

  set(p, data) {
    if (!Store.validPath(p)) throw new Error('Geçersiz yol');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Doküman bir nesne olmalı');
    const json = JSON.stringify(data);
    if (json.length > 5 * 1024 * 1024) throw new Error('Doküman çok büyük');
    this.docs[p] = JSON.parse(json);
    this.scheduleWrite();
    this.emit('change', p, this.get(p));
  }

  delete(p) {
    if (!Store.validPath(p)) throw new Error('Geçersiz yol');
    delete this.docs[p];
    this.scheduleWrite();
    this.emit('change', p, null);
  }

  flush() { if (this.timer) this.writeNow(); }
}

module.exports = { Store };
