// Runs the unit tests (tests/birim/*.test.js) and writes a short summary for the CI job page.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'birim');
const dosyalar = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).map(f => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...dosyalar], { encoding: 'utf8' });
const cikti = (r.stdout || '') + (r.stderr || '');
process.stdout.write(cikti);
const testler = [...cikti.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)].map(m => ({ ok: m[1] === 'ok', ad: m[2] }));
const kalan = testler.filter(t => !t.ok);
const ozet = [`## Birim testleri (${process.platform})`, '', `**${testler.length - kalan.length}/${testler.length} test geçti.**`, '', ...testler.map(t => `- ${t.ok ? '✅' : '❌'} ${t.ad}`), ''];
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ozet.join('\n') + '\n');
process.exit(r.status === 0 && testler.length && !kalan.length ? 0 : 1);
