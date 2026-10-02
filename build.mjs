// Builds the site into dist/.
//   npm run build   → one-off build
//   npm run dev     → build, watch for changes, serve at http://localhost:4000

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const SITE = {
  title: 'Persistence of Reason',
  url: 'https://persistenceofreason.com',
  description: 'Notes and ideas from Adarsh Vatsa.',
};

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIR = {
  posts: path.join(ROOT, 'posts'),
  templates: path.join(ROOT, 'templates'),
  static: path.join(ROOT, 'static'),
  sealed: path.join(ROOT, 'sealed'),
  out: path.join(ROOT, 'dist'),
};

// ---------- markdown ----------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let noteId = 0;
let notePrefix = '';

const marked = new Marked({
  extensions: [
    // ^[text] → margin note (Pandoc's inline-footnote syntax)
    {
      name: 'sidenote',
      level: 'inline',
      start: (src) => src.indexOf('^['),
      tokenizer(src) {
        const m = /^\^\[((?:[^[\]]|\[[^\]]*\])*)\]/.exec(src);
        if (m) return { type: 'sidenote', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(tok) {
        const id = `${notePrefix}sn-${++noteId}`;
        return `<label for="${id}" class="sn-ref" aria-label="note"></label>` +
          `<input type="checkbox" id="${id}" class="sn-toggle">` +
          `<span class="sidenote">${this.parser.parseInline(tok.tokens)}</span>`;
      },
    },
    // $$…$$ and $…$ → left untouched for KaTeX (so _ and * inside math survive)
    {
      name: 'math',
      level: 'inline',
      start: (src) => src.indexOf('$'),
      tokenizer(src) {
        let m = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (m) return { type: 'math', raw: m[0], text: m[1], display: true };
        m = /^\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/.exec(src);
        if (m) return { type: 'math', raw: m[0], text: m[1], display: false };
      },
      renderer: (tok) =>
        tok.display
          ? `<span class="math-display">\\[${escapeHtml(tok.text)}\\]</span>`
          : `<span class="math">\\(${escapeHtml(tok.text)}\\)</span>`,
    },
  ],
});

// ---------- helpers ----------

const read = (p) => fs.readFileSync(p, 'utf8');
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    meta[line.slice(0, i).trim()] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}

const today = () => new Date().toISOString().slice(0, 10);
const readingTime = (text) => Math.max(1, Math.round(text.split(/\s+/).length / 230));

const KATEX = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.querySelector('article'))"></script>`;

// ---------- build ----------

function build() {
  const t0 = Date.now();
  const layout = read(path.join(DIR.templates, 'layout.html'));
  const homeTpl = read(path.join(DIR.templates, 'home.html'));
  const postTpl = read(path.join(DIR.templates, 'post.html'));

  fs.mkdirSync(DIR.sealed, { recursive: true });
  fs.rmSync(DIR.out, { recursive: true, force: true });
  fs.mkdirSync(DIR.out, { recursive: true });
  fs.cpSync(DIR.static, DIR.out, { recursive: true });
  // vault ciphertext only — plaintext in vault/ never reaches dist/
  fs.cpSync(DIR.sealed, path.join(DIR.out, 'v'), { recursive: true });

  // Collect posts. Files starting with _ and posts with `draft: true` are skipped.
  const posts = fs.readdirSync(DIR.posts)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const { meta, body } = parseFrontmatter(read(path.join(DIR.posts, f)));
      const slug = meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
      return { ...meta, slug, body, date: String(meta.date || today()) };
    })
    .filter((p) => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date));

  posts.forEach((p, i) => {
    noteId = 0;
    notePrefix = '';
    const html = marked.parse(p.body);
    const newer = posts[i - 1], older = posts[i + 1];
    const body = fill(postTpl, {
      title: escapeHtml(p.title || p.slug),
      date: p.date,
      minutes: readingTime(p.body),
      status: p.status ? ` · <span class="status">${escapeHtml(p.status)}</span>` : "",
      content: html,
      older: older ? `<a href="/writing/${older.slug}/">← ${escapeHtml(older.title)}</a>` : '<span></span>',
      newer: newer ? `<a href="/writing/${newer.slug}/">${escapeHtml(newer.title)} →</a>` : '<span></span>',
    });
    const page = fill(layout, {
      title: `${escapeHtml(p.title || p.slug)} — ${SITE.title}`,
      description: escapeHtml(p.summary || SITE.description),
      head: p.math ? KATEX : '',
      bodyClass: 'post',
      body,
      updated: today(),
    });
    const dir = path.join(DIR.out, 'writing', p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
  });

  const postList = posts.length
    ? `<ol class="entries">${posts.map((p) => `
      <li><time datetime="${p.date}">${p.date}</time>
        <span><a href="/writing/${p.slug}/">${escapeHtml(p.title || p.slug)}</a>${
          p.summary ? `<span class="summary">${escapeHtml(p.summary)}</span>` : ''}</span></li>`).join('')}
    </ol>`
    : `<p class="muted"><em>Nothing here yet. Soon.</em></p>`;

  noteId = 0;
  notePrefix = 'home-';
  fs.writeFileSync(path.join(DIR.out, 'index.html'), fill(layout, {
    title: `${SITE.title} — Adarsh Vatsa`,
    description: escapeHtml(SITE.description),
    head: '',
    bodyClass: 'home',
    body: fill(homeTpl, { posts: postList }),
    updated: today(),
  }));

  // RSS
  const items = posts.map((p) => {
    noteId = 0;
    const link = `${SITE.url}/writing/${p.slug}/`;
    return `  <item>
    <title>${escapeHtml(p.title || p.slug)}</title>
    <link>${link}</link>
    <guid>${link}</guid>
    <pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>
    <description>${escapeHtml(marked.parse(p.body))}</description>
  </item>`;
  }).join('\n');
  fs.writeFileSync(path.join(DIR.out, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${SITE.title}</title>
  <link>${SITE.url}</link>
  <description>${SITE.description}</description>
${items}
</channel>
</rss>
`);

  console.log(`built ${posts.length} post(s) in ${Date.now() - t0}ms`);
}

build();

// ---------- dev server ----------

if (process.argv.includes('--serve')) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.txt': 'text/plain' };

  let timer;
  for (const d of [DIR.posts, DIR.templates, DIR.static, DIR.sealed]) {
    fs.watch(d, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 80);
    });
  }

  http.createServer((req, res) => {
    let p = path.join(DIR.out, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(DIR.out)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(4000, () => console.log('serving at http://localhost:4000'));
}
