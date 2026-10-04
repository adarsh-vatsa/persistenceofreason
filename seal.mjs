// Encrypts everything in vault/ into sealed/ (which is safe to publish and commit).
//   npm run seal   → uses the passphrase in .vault-pass (gitignored, never published),
//                    or $VAULT_PASSPHRASE, or asks for it
//
// Format (matches static/vault.js):
//   sealed/index.bin    = salt(16) | iv(12) | AES-GCM(manifest JSON)
//   sealed/<id>.bin     = iv(12) | AES-GCM(file bytes)
//   sealed/<id>.t.bin   = iv(12) | AES-GCM(extracted text JSON), powers search inside the vault
// Key = PBKDF2-SHA256(passphrase, salt, 600k iterations) → AES-256-GCM.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto, createHash } from 'node:crypto';

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

// ---------- text extraction (for titles, excerpts and full-text search) ----------

const TEXTY = new Set(('txt md markdown log tex bib py js mjs ts tsx jsx java c h cpp rs go rb jl r sh yaml yml toml ' +
  'json jsonl csv tsv xml sql lean v smt2 cedar css scss rst org html htm').split(' '));
const clean = (s) => s.replace(/\s+/g, ' ').trim();

async function extract(rel, bytes) {
  const ext = path.extname(rel).slice(1).toLowerCase();
  try {
    if (ext === 'pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        pages.push(clean(tc.items.map((it) => it.str + (it.hasEOL ? ' ' : '')).join('')));
      }
      const info = (await doc.getMetadata().catch(() => null))?.info || {};
      await doc.destroy();
      return { title: clean(info.Title || ''), pages };
    }
    if (ext === 'docx') {
      const mammoth = (await import('mammoth')).default;
      return { text: clean((await mammoth.extractRawText({ buffer: bytes })).value) };
    }
    if (ext === 'ipynb') {
      const nb = JSON.parse(bytes.toString('utf8'));
      return { text: clean((nb.cells || []).map((c) => [].concat(c.source).join('')).join('\n')) };
    }
    if (TEXTY.has(ext)) {
      let t = bytes.toString('utf8');
      if (ext === 'html' || ext === 'htm') t = t.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
      const title = ext === 'md' || ext === 'markdown' ? (t.match(/^#\s+(.+)$/m)?.[1] || '') : '';
      return { title: clean(title), text: clean(t).slice(0, 400_000) };
    }
  } catch (e) {
    console.warn(`  could not read text from ${rel} (${e.message}), it will still be sealed`);
  }
  return null;
}

function excerptOf(t) {
  const all = t.pages ? t.pages.join(' ') : t.text || '';
  const abs = /\babstract\b[.:\s]*/i.exec(all);
  const from = abs && abs.index < 4000 ? abs.index + abs[0].length : 0;
  let s = all.slice(from, from + 400);
  if (!abs && t.title && s.startsWith(t.title)) s = s.slice(t.title.length);
  s = s.trim();
  // keep whole sentences, up to about 260 characters
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g) || [s];
  let out = '';
  for (const x of sentences) { if ((out + x).length > 280 && out) break; out += x; }
  return out.trim();
}

// ---------- seal ----------

if (!fs.existsSync(SRC)) {
  fs.mkdirSync(SRC);
  console.log('created vault/. Drop your private files in there and run this again.');
  process.exit(0);
}

const files = walk(SRC);

const PASS_FILE = path.join(ROOT, '.vault-pass');
let pass = process.env.VAULT_PASSPHRASE ||
  (fs.existsSync(PASS_FILE) ? fs.readFileSync(PASS_FILE, 'utf8').trim() : '');
if (!pass) {
  pass = await ask('vault passphrase: ');
  if ((await ask('again: ')) !== pass) { console.error('passphrases did not match.'); process.exit(1); }
}
if (pass.length < 8) {
  console.error('use at least 8 characters. A few random words is ideal.');
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
  const name = rel.split(path.sep).join('/');
  const bytes = fs.readFileSync(path.join(SRC, rel));
  fs.writeFileSync(path.join(OUT, `${id}.bin`), await encrypt(key, bytes));

  const entry = {
    id, name, size: bytes.length,
    // stable across re-seals, so bookmarks and reading positions keep working
    slug: createHash('sha256').update(name).digest('hex').slice(0, 10),
    modified: fs.statSync(path.join(SRC, rel)).mtime.toISOString().slice(0, 10),
  };
  const t = await extract(rel, bytes);
  if (t) {
    if (t.title) entry.title = t.title;
    if (t.pages) entry.pages = t.pages.length;
    entry.excerpt = excerptOf(t);
    entry.words = (t.pages ? t.pages.join(' ') : t.text).split(' ').filter(Boolean).length;
    entry.text = true;
    fs.writeFileSync(path.join(OUT, `${id}.t.bin`), await encrypt(key, new TextEncoder().encode(JSON.stringify(t))));
  }
  manifest.files.push(entry);
  console.log(`  ${name}${entry.pages ? ` (${entry.pages} pages)` : ''}`);
}

const index = await encrypt(key, new TextEncoder().encode(JSON.stringify(manifest)));
fs.writeFileSync(path.join(OUT, 'index.bin'), Buffer.concat([salt, index]));

console.log(`sealed ${files.length} file(s) into sealed/. Commit and push to publish.`);
