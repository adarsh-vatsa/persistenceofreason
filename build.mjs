// Builds the site into dist/.
//   npm run build   → one-off build
//   npm run dev     → build, watch for changes, serve at http://localhost:4000

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIR = {
  posts: path.join(ROOT, 'posts'),
  content: path.join(ROOT, 'content'),
  static: path.join(ROOT, 'static'),
  sealed: path.join(ROOT, 'sealed'),
  out: path.join(ROOT, 'dist'),
};
const CONFIG = path.join(ROOT, 'site.config.mjs');

// ---------- helpers ----------

const read = (p) => fs.readFileSync(p, 'utf8');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = () => new Date().toISOString().slice(0, 10);
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
  .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'section';
const stripTags = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const fmtShort = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ---------- status (epistemic marks) ----------

const STATUS = {
  conjecture: { mark: '', label: 'conjecture', blurb: 'A hunch, possibly wrong.' },
  sketch: { mark: '', label: 'sketch', blurb: 'The argument is taking shape.' },
  settled: { mark: '', label: 'settled', blurb: "I'd defend this." },
};
const STATUS_ALIASES = { 'half-baked': 'conjecture', idea: 'conjecture', seedling: 'conjecture',
  working: 'sketch', 'working through it': 'sketch', draft: 'sketch', budding: 'sketch',
  done: 'settled', evergreen: 'settled', final: 'settled' };
const normStatus = (s) => {
  if (!s) return null;
  const k = String(s).toLowerCase().trim();
  return STATUS[k] ? k : STATUS_ALIASES[k] || null;
};

// ---------- icons (inline SVG, stroke = currentColor) ----------

const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  scholar: '<path d="M2 9.5 12 4l10 5.5-10 5.5Z"/><path d="M6 11.7V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.3"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  quote: '<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>',
};
const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[n] || ''}</svg>`;

// ---------- markdown ----------

// > [!claim] Optional name  →  "Claim 1 (Optional name)." numbered like a paper
const ENVS = {
  claim: 'Claim', conjecture: 'Conjecture', definition: 'Definition', theorem: 'Theorem', lemma: 'Lemma',
  question: 'Question', proof: 'Proof', note: 'Note', example: 'Example', idea: 'Idea', warning: 'Caution',
};
const NUMBERED = new Set(['claim', 'conjecture', 'definition', 'theorem', 'lemma', 'question']);

let ctx; // per-document state: sidenote counter, toc, links

function makeMarked() {
  const m = new Marked({
    gfm: true,
    extensions: [
      // ^[text] → margin note (Pandoc's inline-footnote syntax)
      {
        name: 'sidenote', level: 'inline',
        start: (src) => src.indexOf('^['),
        tokenizer(src) {
          const r = /^\^\[((?:[^[\]]|\[[^\]]*\])*)\]/.exec(src);
          if (r) return { type: 'sidenote', raw: r[0], tokens: this.lexer.inlineTokens(r[1]) };
        },
        renderer(tok) {
          const n = ++ctx.notes;
          const id = `sn-${n}`;
          return `<label for="${id}" class="sn-ref" data-n="${n}" aria-label="Note ${n}"></label>` +
            `<input type="checkbox" id="${id}" class="sn-toggle">` +
            `<span class="sidenote" data-n="${n}">${this.parser.parseInline(tok.tokens)}</span>`;
        },
      },
      // $$…$$ and $…$ → left intact for KaTeX
      {
        name: 'math', level: 'inline',
        start: (src) => src.indexOf('$'),
        tokenizer(src) {
          let r = /^\$\$([\s\S]+?)\$\$/.exec(src);
          if (r) return { type: 'math', raw: r[0], text: r[1], display: true };
          r = /^\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/.exec(src);
          if (r) return { type: 'math', raw: r[0], text: r[1], display: false };
        },
        renderer: (t) => (ctx.math = true, t.display
          ? `<span class="math-display">\\[${esc(t.text)}\\]</span>`
          : `<span class="math">\\(${esc(t.text)}\\)</span>`),
      },
    ],
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        if (depth === 1) return `<h2>${html}</h2>`; // the page title is the only h1
        let id = slugify(stripTags(html)); let i = 2;
        while (ctx.ids.has(id)) id = `${slugify(stripTags(html))}-${i++}`;
        ctx.ids.add(id);
        if (depth <= 3) ctx.toc.push({ id, depth, text: stripTags(html) });
        return `${depth === 2 ? '<div class="cn-break" aria-hidden="true"></div>' : ''}<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${html}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang || '').split(/\s/)[0];
        return `<figure class="code"><figcaption><span>${esc(l || 'text')}</span><button type="button" class="copy" data-copy aria-label="Copy code">${icon('copy')}<span>Copy</span></button></figcaption><pre><code${l ? ` class="language-${esc(l)}"` : ''}>${esc(text.replace(/\n$/, ''))}</code></pre></figure>\n`;
      },
      blockquote({ tokens }) {
        let body = this.parser.parse(tokens);
        const r = /^<p>\[!(\w+)\][ \t]*([^\n<]*)(\n|<\/p>\n?)/.exec(body);
        const kind = r && r[1].toLowerCase();
        if (kind && ENVS[kind]) {
          const num = NUMBERED.has(kind) ? ` ${++ctx.thm}` : '';
          const head = `<b class="thm__h">${ENVS[kind]}${num}${r[2] ? ` (${r[2].trim()})` : ''}.</b> `;
          const rest = body.slice(r[0].length).trim();
          body = r[3].startsWith('</p>') ? (rest.startsWith('<p>') ? rest.replace('<p>', '<p>' + head) : `<p>${head}</p>${rest}`) : '<p>' + head + rest;
          return `<div class="thm thm--${kind}">${body}</div>\n`;
        }
        return `<blockquote>${body}</blockquote>\n`;
      },
      image({ href, title, text }) {
        const img = `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy">`;
        return title ? `<figure class="figure">${img}<figcaption>${esc(title)}</figcaption></figure>` : img;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href) && !href.startsWith(CFG.url);
        if (href.startsWith('/writing/')) ctx.links.add(href.replace(/#.*$/, '').replace(/\/?$/, '/'));
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' class="ext" rel="noopener"' : ''}>${inner}</a>`;
      },
    },
  });
  return m;
}

function renderMarkdown(src) {
  ctx = { notes: 0, thm: 0, toc: [], ids: new Set(), links: new Set(), math: false };
  const html = makeMarked().parse(src);
  return { html, ...ctx };
}

function parseFrontmatter(src) {
  const r = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!r) return { meta: {}, body: src };
  const meta = {};
  for (const line of r[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v === 'true') v = true; else if (v === 'false') v = false;
    meta[line.slice(0, i).trim()] = v;
  }
  return { meta, body: src.slice(r[0].length) };
}

// ---------- assets (cache-busted by content hash) ----------

let ASSET = {};
function copyAssets() {
  fs.cpSync(DIR.static, DIR.out, { recursive: true });
  const h = (f) => createHash('sha256').update(fs.readFileSync(path.join(DIR.out, f))).digest('hex').slice(0, 10);
  ASSET = Object.fromEntries(['site.css', 'site.js', 'vault.js', 'vault.css', 'favicon.svg']
    .map((f) => [f, `/${f}?v=${h(f)}`]));
}

// ---------- layout ----------

let CFG;
const NAV = [['Writing', '/writing/'], ['Research', '/research/'], ['About', '/about/']];

const KATEX = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.querySelector('.prose'),{throwOnError:false})"></script>`;

function layout({ title, description, body, section = '', head = '', bodyClass = '', canonical = '/' }) {
  const fullTitle = title ? `${title} · ${CFG.author}` : CFG.author;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || CFG.description)}">
<meta property="og:title" content="${esc(title || CFG.author)}">
<meta property="og:description" content="${esc(description || CFG.description)}">
<meta property="og:url" content="${CFG.url}${canonical}">
<link rel="canonical" href="${CFG.url}${canonical}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161513" media="(prefers-color-scheme: dark)">
<link rel="alternate" type="application/rss+xml" title="${esc(CFG.author)}" href="/feed.xml">
<link rel="icon" href="${ASSET['favicon.svg']}" type="image/svg+xml">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Caveat:wght@500;600&family=JetBrains+Mono:wght@400&display=swap">
<link rel="stylesheet" href="${ASSET['site.css']}">
${head}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<div class="progress" aria-hidden="true"></div>
<div class="page">
  <header class="top">
    <a class="top__home" href="/" data-door>${esc(CFG.author)}</a>
    <nav class="top__nav" aria-label="Main">
      ${NAV.map(([l, h]) => `<a href="${h}"${section === h ? ' aria-current="page"' : ''}>${l.toLowerCase()}</a>`).join('\n      ')}
      <button type="button" class="tool" data-palette aria-label="Search">${icon('search')}<kbd data-mod>⌘K</kbd></button>
      <button type="button" class="tool" data-theme-toggle aria-label="Toggle dark mode">${icon('sun', 'i-sun')}${icon('moon', 'i-moon')}</button>
    </nav>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="foot">
    <span>© ${new Date().getFullYear()} ${esc(CFG.author)}</span>
    <span><a href="/feed.xml">RSS</a></span>
  </footer>
</div>
<script src="${ASSET['site.js']}" data-vault="${ASSET['vault.js']}" data-vault-css="${ASSET['vault.css']}" defer></script>
</body>
</html>
`;
}

// ---------- page bodies ----------

const postHref = (p) => `/writing/${p.slug}/`;
const monthYear = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const statusWord = (k) => (k ? `<span class="st">${STATUS[k].label}</span>` : '');

function postRow(p) {
  return `<li class="row" data-status="${p.status || ''}" data-tags="${esc(p.tags.join(' '))}" data-text="${esc((p.title + ' ' + (p.summary || '') + ' ' + p.tags.join(' ')).toLowerCase())}">
      <a href="${postHref(p)}"><span class="t">${esc(p.title)}${statusWord(p.status)}</span><span class="lead"></span><time class="r" datetime="${p.date}">${monthYear(p.date)}</time></a>
      ${p.summary ? `<span class="s">${esc(p.summary)}</span>` : ''}
    </li>`;
}

const refItem = (p, i, full = false) => `<li id="paper-${i + 1}">
      <span class="au">${esc(p.authors).replace(esc(CFG.author), `<b>${esc(CFG.author)}</b>`)}.</span>
      <a class="ti" href="${esc(paperHref(p))}">${esc(p.title)}</a>.
      <span class="ve">${esc(p.venue)}, ${p.year}.</span>
      ${full ? `<div class="acts">
        ${p.abstract ? `<details><summary>abstract</summary><p>${esc(p.abstract)}</p></details>` : ''}
        ${p.pdf ? `<a href="${esc(p.pdf)}" rel="noopener">pdf</a>` : ''}
        ${p.url.includes('arxiv') ? `<a href="${esc(p.url)}" rel="noopener">arxiv</a>` : ''}
        ${p.bibtex ? `<button type="button" data-copy-text="${esc(p.bibtex)}">bibtex</button>` : ''}
      </div>` : ''}
    </li>`;

const paperHref = (p) => p.slug ? `/research/${p.slug}/` : p.url;
const authorsHtml = (p) => esc(p.authors).replace(esc(CFG.author), `<b>${esc(CFG.author)}</b>`);
const paperCard = (p) => `<a class="pcard" href="${paperHref(p)}">
      ${p.figure ? `<span class="pcard__fig"><img src="${esc(p.figure)}" alt="" loading="lazy"></span>` : ''}
      <span class="pcard__body">
        <span class="pcard__venue">${esc(p.venue)}${String(p.venue).includes(String(p.year)) ? '' : `, ${p.year}`}</span>
        <span class="pcard__title">${esc(p.title)}</span>
        ${p.takeaway ? `<span class="pcard__take">${esc(p.takeaway)}</span>` : ''}
      </span>
      ${p.note ? `<span class="pcard__note" aria-hidden="true">${esc(p.note)}</span>` : ''}
    </a>`;
const paperLinks = (p) => `<span class="plinks">
      ${p.pdf ? `<a href="${esc(p.pdf)}" rel="noopener">pdf</a>` : ''}
      ${p.url.includes('arxiv') ? `<a href="${esc(p.url)}" rel="noopener">arxiv</a>` : ''}
      ${p.bibtex ? `<button type="button" data-copy-text="${esc(p.bibtex)}">bibtex</button>` : ''}
    </span>`;

function paperBody(p) {
  const { html } = renderMarkdown(read(path.join(DIR.content, 'papers', p.slug + '.md')));
  return `
<header class="titleblock">
  <h1>${esc(p.title)}</h1>
  <p class="byline">${authorsHtml(p)}</p>
  <p class="post-meta"><span>${esc(p.venue)}${String(p.venue).includes(String(p.year)) ? '' : `, ${p.year}`}</span>${paperLinks(p)}</p>
</header>
<div class="cornell paper-page">
  <div class="cn-prose"><div class="prose">${html}</div></div>
</div>
<nav class="post-foot" aria-label="More research">
  <a href="/research/"><small>research</small><span>All papers</span></a>
</nav>`;
}

const row = (cue, body, { id = '', cls = '', note = '', more = '' } = {}) => `
  <section class="cn-row ${cls}"${id ? ` id="${id}"` : ''}>
    <div class="cn-cue"><h2 class="cue">${cue}</h2>${more}${note ? `<span class="note">${esc(note)}</span>` : ''}</div>
    <div class="cn-body">${body}</div>
  </section>`;
const num = (n, label) => `<span class="n">${n}</span>${label}`;
const summaryRow = (text) => text ? row('Summary', `<p>${esc(text)}</p>`, { cls: 'cn-summary' }) : '';

function homeBody(posts) {
  let n = 0;
  return `
<header class="titleblock">
  <h1>${esc(CFG.author)}</h1>
</header>
<div class="cornell">
  ${row('Abstract', `<div class="cn-abstract">${CFG.abstract.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`, { note: CFG.marginNote })}
  ${posts.length ? row(num(++n, 'Writing'), `<ol class="toclist">${posts.slice(0, 8).map(postRow).join('')}</ol>`,
    { id: 'writing', more: '<a class="cue-more" href="/writing/">full index</a>' }) : ''}
  ${row(num(++n, 'Research'), `<div class="pgrid">${CFG.papers.map(paperCard).join('')}</div>`,
    { id: 'research', more: '<a class="cue-more" href="/research/">all papers</a>' })}
  ${row(num(++n, 'Correspondence'), `<dl class="corr">
      ${CFG.links.map((l) => `<dt>${esc(l.label.toLowerCase())}</dt><dd><a href="${esc(l.href)}">${esc(l.text || l.href)}</a></dd>`).join('\n      ')}
    </dl>`, { id: 'correspondence' })}
</div>`;
}

function postBody(p, newer, older, backlinks) {
  const hasToc = p.toc.filter((h) => h.depth === 2).length >= 2;
  return `
<article>
  <header class="titleblock">
    <h1>${esc(p.title)}</h1>
    <p class="byline">${esc(CFG.author)}</p>
    <p class="post-meta"><time datetime="${p.date}">${fmtDate(p.date)}</time>${p.status ? `<span class="st">${STATUS[p.status].label}</span>` : ''}<span>${p.minutes} min</span>${p.tags.map((t) => `<a href="/writing/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</p>
  </header>
  <div class="cornell cn-prose-wrap">
    ${hasToc ? `<nav class="toc" aria-label="Contents"><details><summary>Contents</summary>
      <ol>${p.toc.map((h) => `<li class="toc__d${h.depth}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol>
    </details></nav>` : ''}
    <div class="cn-prose"><div class="prose">
      ${p.html}
    </div></div>
    ${summaryRow(p.summary)}
  </div>
  ${backlinks.length ? `<p class="backlinks">Referenced in ${backlinks.map((b) => `<a class="link" href="${postHref(b)}">${esc(b.title)}</a>`).join(', ')}.</p>` : ''}
  <nav class="post-foot" aria-label="More writing">
    ${older ? `<a href="${postHref(older)}"><small>previous</small><span>${esc(older.title)}</span></a>` : '<span></span>'}
    ${newer ? `<a class="next" href="${postHref(newer)}"><small>next</small><span>${esc(newer.title)}</span></a>` : `<a class="next" href="/writing/"><small>index</small><span>All writing</span></a>`}
  </nav>
</article>`;
}

function archiveBody(posts, tags) {
  const years = [...new Set(posts.map((p) => p.date.slice(0, 4)))];
  return `
<header class="titleblock">
  <h1>Writing</h1>
</header>
<div class="cornell archive">
  ${!posts.length ? '' : row('Filter', `<div class="filters" role="search">
    <label class="filter-search">${icon('search')}<input type="search" placeholder="Filter by title or topic" data-filter-text aria-label="Filter writing"></label>
    <div class="filter-group" data-filter-status>
      <button type="button" class="chip is-on" data-v="">all</button>
      ${Object.entries(STATUS).map(([k, st]) => `<button type="button" class="chip" data-v="${k}" title="${esc(st.blurb)}">${st.label}</button>`).join('')}
    </div>
    ${tags.length ? `<div class="filter-group" data-filter-tag>${tags.map(([t]) => `<button type="button" class="chip" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
  </div>`, { cls: 'cn-filters' })}
  ${years.map((y) => `<div data-year>${row(`<span class="num">${y}</span>`, `<ol class="toclist">${posts.filter((p) => p.date.startsWith(y)).map(postRow).join('')}</ol>`)}</div>`).join('')}
  ${posts.length ? '' : '<p class="empty">Nothing here yet.</p>'}
  <p class="empty" data-empty hidden>Nothing matches.</p>
</div>`;
}

function researchBody() {
  const intro = read(path.join(DIR.content, 'research.md')).split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return `
<header class="titleblock">
  <h1>Research</h1>
</header>
<div class="cornell">
  ${row('Abstract', `<div class="cn-abstract">${intro.map((p) => renderMarkdown(p).html).join('')}</div>`)}
  ${row(num(1, 'Interests'), `<p class="interests">${CFG.interests.map(esc).join(', ')}.</p>`)}
  ${row(num(2, 'Papers'), `<div class="pgrid">${CFG.papers.map(paperCard).join('')}</div>`)}
  ${row(num(3, 'References'), `<ol class="refs">${CFG.papers.map((p, i) => refItem(p, i, true)).join('')}</ol>`,
    { more: `<a class="cue-more" href="${esc(CFG.links.find((l) => /scholar/i.test(l.label))?.href || '#')}" rel="noopener">google scholar</a>` })}
</div>`;
}

function aboutBody() {
  const { html } = renderMarkdown(read(path.join(DIR.content, 'about.md')));
  return `
<header class="titleblock">
  <h1>About</h1>
</header>
<div class="cornell page-prose">
  <div class="cn-prose"><div class="prose">${html}</div></div>
</div>`;
}

const notFoundBody = () => `
<header class="titleblock lost">
  <h1>Not found</h1>
  <p>There is nothing at this address. It may have moved.</p>
  <p><a class="link" href="/">Return to the start</a> or <button type="button" class="tool link" data-palette>search the site</button>.</p>
</header>`;


// ---------- build ----------

async function build() {
  const t0 = Date.now();
  CFG = (await import(pathToFileURL(CONFIG).href + '?t=' + Date.now())).default;

  fs.mkdirSync(DIR.sealed, { recursive: true });
  fs.rmSync(DIR.out, { recursive: true, force: true });
  fs.mkdirSync(DIR.out, { recursive: true });
  copyAssets();
  // vault ciphertext only, plaintext in vault/ never reaches dist/
  fs.cpSync(DIR.sealed, path.join(DIR.out, 'v'), { recursive: true });

  const write = (rel, html) => {
    const f = path.join(DIR.out, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, html);
  };

  // posts (files starting with _ and drafts are skipped)
  const posts = fs.readdirSync(DIR.posts)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const { meta, body } = parseFrontmatter(read(path.join(DIR.posts, f)));
      const r = renderMarkdown(body);
      const text = stripTags(r.html.replace(/<span class="sidenote"[\s\S]*?<\/span>/g, ''));
      const words = text.split(/\s+/).filter(Boolean).length;
      return {
        slug: meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
        title: meta.title || f, date: String(meta.date || today()), summary: meta.summary || '',
        status: normStatus(meta.status), draft: !!meta.draft,
        tags: String(meta.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        html: r.html, toc: r.toc, links: [...r.links], math: r.math || !!meta.math, text, words,
        minutes: Math.max(1, Math.round(words / 230)),
        excerpt: text.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 240),
      };
    })
    .filter((p) => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date));

  const tagCount = new Map();
  posts.forEach((p) => p.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  const tags = [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  posts.forEach((p, i) => {
    const backlinks = posts.filter((q) => q !== p && q.links.includes(postHref(p)));
    write(`writing/${p.slug}/index.html`, layout({
      title: p.title, description: p.summary, section: '/writing/', canonical: postHref(p),
      head: p.math ? KATEX : '', bodyClass: 'is-post',
      body: postBody(p, posts[i - 1], posts[i + 1], backlinks),
    }));
  });

  for (const p of CFG.papers.filter((x) => x.slug && fs.existsSync(path.join(DIR.content, 'papers', x.slug + '.md')))) {
    write(`research/${p.slug}/index.html`, layout({ title: p.title, description: p.takeaway, section: '/research/', canonical: `/research/${p.slug}/`, body: paperBody(p), bodyClass: 'is-paper' }));
  }
  write('index.html', layout({ body: homeBody(posts), bodyClass: 'is-home' }));
  write('writing/index.html', layout({ title: 'Writing', section: '/writing/', canonical: '/writing/', body: archiveBody(posts, tags) }));
  write('research/index.html', layout({ title: 'Research', section: '/research/', canonical: '/research/', body: researchBody() }));
  write('about/index.html', layout({ title: 'About', section: '/about/', canonical: '/about/', body: aboutBody() }));
  write('404.html', layout({ title: 'Not found', body: notFoundBody(), bodyClass: 'is-lost' }));

  // search index for the ⌘K palette and link previews
  const index = [
    { kind: 'page', title: 'Home', url: '/', summary: CFG.description },
    { kind: 'page', title: 'Writing', url: '/writing/', summary: 'All writing, by year.' },
    { kind: 'page', title: 'Research', url: '/research/', summary: 'Papers.' },
    { kind: 'page', title: 'About', url: '/about/', summary: 'Background and contact.' },
    ...posts.map((p) => ({ kind: 'post', title: p.title, url: postHref(p), summary: p.summary, date: fmtDate(p.date),
      status: p.status, mark: p.status ? STATUS[p.status].mark : '', statusLabel: p.status ? STATUS[p.status].label : '',
      tags: p.tags, minutes: p.minutes, headings: p.toc.map((h) => ({ id: h.id, text: h.text })), text: p.text.slice(0, 20000) })),
    ...CFG.papers.map((p, i) => ({ kind: 'paper', title: p.title, url: p.slug ? `/research/${p.slug}/` : `/research/#paper-${i + 1}`, summary: p.takeaway || p.venue,
      text: p.slug && fs.existsSync(path.join(DIR.content, 'papers', p.slug + '.md')) ? stripTags(renderMarkdown(read(path.join(DIR.content, 'papers', p.slug + '.md'))).html) : (p.abstract || '') })),
  ];
  write('search.json', JSON.stringify(index));

  // RSS
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(CFG.title)}</title>
  <link>${CFG.url}</link>
  <description>${esc(CFG.description)}</description>
${posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${CFG.url}${postHref(p)}</link>
    <guid>${CFG.url}${postHref(p)}</guid>
    <pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>
    <description>${esc(p.html)}</description>
  </item>`).join('\n')}
</channel>
</rss>
`);

  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/writing/', '/research/', '/about/', ...CFG.papers.filter((p) => p.slug).map((p) => `/research/${p.slug}/`), ...posts.map(postHref)].map((u) => `  <url><loc>${CFG.url}${u}</loc></url>`).join('\n')}
</urlset>
`);

  console.log(`built ${posts.length} post(s) in ${Date.now() - t0}ms`);
}

await build();

// ---------- dev server ----------

if (process.argv.includes('--serve')) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.txt': 'text/plain' };

  let timer;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => build().catch((e) => console.error(e)), 80); };
  for (const d of [DIR.posts, DIR.content, DIR.static, DIR.sealed]) fs.watch(d, { recursive: true }, rebuild);
  fs.watch(CONFIG, rebuild);

  http.createServer((req, res) => {
    let p = path.join(DIR.out, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(DIR.out)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) {
      res.writeHead(404, { 'content-type': 'text/html' });
      fs.createReadStream(path.join(DIR.out, '404.html')).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  }).listen(4000, () => console.log('serving at http://localhost:4000'));
}
