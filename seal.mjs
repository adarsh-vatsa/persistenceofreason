// Encrypts everything in vault/ into sealed/ (which is safe to publish and commit).
//   npm run seal                 → prompts for the passphrase
//   VAULT_PASSPHRASE=… npm run seal
//
// Format (matches static/vault.js):
//   sealed/index.bin   = salt(16) | iv(12) | AES-GCM(manifest JSON)
//   sealed/<id>.bin    = iv(12) | AES-GCM(file bytes)
// Key = PBKDF2-SHA256(passphrase, salt, 600k iterations) → AES-256-GCM.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'vault');
const OUT = path.join(ROOT, 'sealed');
const ITERATIONS = 600_000;

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(prompt) ? prompt : '');
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name.startsWith('.')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p)];
  });
}

const hex = (bytes) => Buffer.from(bytes).toString('hex');

async function encrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return Buffer.concat([iv, ct]);
}

if (!fs.existsSync(SRC)) {
  fs.mkdirSync(SRC);
  console.log('created vault/ — drop your private files in there and run this again.');
  process.exit(0);
}

const files = walk(SRC);
if (!files.length) { console.log('vault/ is empty, nothing to seal.'); process.exit(0); }

let pass = process.env.VAULT_PASSPHRASE;
if (!pass) {
  pass = await ask('vault passphrase: ');
  if ((await ask('again: ')) !== pass) { console.error('passphrases did not match.'); process.exit(1); }
}
if (pass.length < 12) {
  console.error('use at least 12 characters — a few random words is ideal.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

// empty sealed/ in place (keeps the dev server's file watcher attached)
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.bin')) fs.unlinkSync(path.join(OUT, f));

const manifest = { sealed: new Date().toISOString(), files: [] };
for (const rel of files.sort()) {
  const id = hex(crypto.getRandomValues(new Uint8Array(12)));
  const bytes = fs.readFileSync(path.join(SRC, rel));
  fs.writeFileSync(path.join(OUT, `${id}.bin`), await encrypt(key, bytes));
  manifest.files.push({
    id, name: rel.split(path.sep).join('/'), size: bytes.length,
    modified: fs.statSync(path.join(SRC, rel)).mtime.toISOString().slice(0, 10),
  });
}

const index = await encrypt(key, new TextEncoder().encode(JSON.stringify(manifest)));
fs.writeFileSync(path.join(OUT, 'index.bin'), Buffer.concat([salt, index]));

console.log(`sealed ${files.length} file(s) into sealed/. run \`npm run build\` to publish.`);
