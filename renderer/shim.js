// Gives the page the same small API it uses on claude.ai (window.claude.use), backed by the local store.
(function () {
  'use strict';
  const D = window.desktop;
  if (!D) return;
  const subs = new Map();
  const kopya = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const snap = d => ({ exists: d != null, data: () => (d == null ? undefined : kopya(d)), metadata: { fromCache: false, hasPendingWrites: false } });
  D.onStoreChanged(({ path, data }) => { (subs.get(path) || []).slice().forEach(f => { try { f(snap(data)); } catch (e) { console.error(e); } }); });
  const birlestir = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && v.__delete__) delete o[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = birlestir(o[k], v); else o[k] = v; } return o; };
  const doc = path => ({
    path, id: path.split('/').pop(),
    get: async () => snap(await D.storeGet(path)),
    set: async d => { await D.storeSet(path, kopya(d)); },
    update: async d => { const cur = await D.storeGet(path); if (cur == null) throw { code: 'invalid_argument', message: 'Doküman yok' }; await D.storeSet(path, birlestir(cur, kopya(d))); },
    delete: async () => { await D.storeDelete(path); },
    onSnapshot: (next, err) => {
      const list = subs.get(path) || []; list.push(next); subs.set(path, list);
      D.storeGet(path).then(d => next(snap(d))).catch(e => err && err({ code: 'unavailable', message: String(e) }));
      return () => { const l = subs.get(path) || []; const i = l.indexOf(next); if (i >= 0) l.splice(i, 1); };
    }
  });
  const db = { doc, collection: p => ({ path: p, doc: id => doc(p + '/' + id) }) };
  const user = { id: async () => 'local', can: async () => true, isOwner: async () => true, canEdit: async () => true };
  const downloads = {
    save: async ({ filename, data }) => {
      let bytes;
      if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
      else if (typeof data === 'string') bytes = new TextEncoder().encode(data);
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else bytes = new Uint8Array(data.buffer || data);
      const r = await D.saveFile(filename, bytes);
      if (!r || !r.ok) throw { code: (r && r.code) || 'declined', message: 'Kaydedilmedi' };
      return r;
    }
  };
  const caps = { db, user, downloads };
  window.claude = { use: async name => caps[name] || null };
})();
