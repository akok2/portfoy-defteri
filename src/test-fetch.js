// Test helper: answers price requests from recorded fixture files instead of the internet.
// Only used when the PD_TEST_FIXTURES environment variable is set.
const fs = require('fs');
const path = require('path');
module.exports = dir => async (url, opts) => {
  const anahtar = url + ' ' + (opts && typeof opts.body === 'string' ? opts.body : '');
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const hit = map.find(m => anahtar.includes(m.match));
  if (!hit) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  if (hit.status && hit.status >= 400) return { ok: false, status: hit.status, json: async () => ({}), text: async () => '' };
  const ham = fs.readFileSync(path.join(dir, hit.file)); const body = ham.toString('utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body, arrayBuffer: async () => ham.buffer.slice(ham.byteOffset, ham.byteOffset + ham.length) };
};
