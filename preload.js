// Narrow bridge between the page and the desktop shell. The page gets no Node.js access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  storeGet: p => ipcRenderer.invoke('store:get', p),
  storeSet: (p, d) => ipcRenderer.invoke('store:set', p, d),
  storeDelete: p => ipcRenderer.invoke('store:delete', p),
  onStoreChanged: cb => { const f = (e, v) => cb(v); ipcRenderer.on('store:changed', f); },
  saveFile: (name, bytes) => ipcRenderer.invoke('file:save', name, bytes),
  refreshPrices: kodlar => ipcRenderer.invoke('prices:refresh', kodlar),
  bist100: () => ipcRenderer.invoke('bist100:yenile'),
  testSources: () => ipcRenderer.invoke('prices:test'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  testMail: () => ipcRenderer.invoke('mail:test'),
  runMorning: () => ipcRenderer.invoke('rapor:simdi'),
  openDataFolder: () => ipcRenderer.invoke('app:dataFolder'),
  onStatus: cb => { ipcRenderer.on('durum', (e, v) => cb(v)); },
  onReportRequest: cb => {
    ipcRenderer.send('sayfa:hazir');
    ipcRenderer.on('rapor:hazirla', async (e, { id }) => {
      try { const rapor = await cb(); ipcRenderer.send('rapor:cevap', { id, ok: true, rapor }); }
      catch (err) { ipcRenderer.send('rapor:cevap', { id, ok: false, hata: String(err && err.message || err) }); }
    });
  }
});
