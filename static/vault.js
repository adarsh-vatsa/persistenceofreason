// The vault. Opened by double-clicking the name in the corner, the palette's "vault" command, or /#vault.
// Everything is decrypted and rendered here in the browser. The server only ever holds ciphertext.
(() => {
  if (window.__vault) return window.__vault.open(window.__vaultRoute || '');

  const ITERATIONS = 600_000; // must match seal.mjs
  const BASE = '/v/';
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const PDFJS = CDN + 'pdfjs-dist@4.10.38/';
  let key = null, manifest = null;

  // ---------- helpers ----------
  const el = (tag, attrs = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), attrs);
    n.append(...kids.flat().filter((k) => k != null && k !== false));
    return n;
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ICON = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    search: ICON('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    back: ICON('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    prev: ICON('<path d="m15 18-6-6 6-6"/>'),
    next: ICON('<path d="m9 18 6-6-6-6"/>'),
    down: ICON('<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>'),
    link: ICON('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    pages: ICON('<rect x="4" y="3" width="7" height="9" rx="1"/><rect x="13" y="3" width="7" height="9" rx="1"/><rect x="4" y="14" width="7" height="7" rx="1"/><rect x="13" y="14" width="7" height="7" rx="1"/>'),
    menu: ICON('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  };
  const store = {
    get: (k, d = null) => { try { const v = localStorage.getItem('vault:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('vault:' + k, JSON.stringify(v)); } catch {} },
    clear: () => { try { Object.keys(localStorage).filter((k) => k.startsWith('vault:')).forEach((k) => localStorage.removeItem(k)); } catch {} },
  };
  const toast = (m) => window.__toast?.(m);
  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const ext = (name) => (name.match(/\.([^./]+)$/)?.[1] || '').toLowerCase();
  const base = (name) => name.split('/').pop();
  const folderOf = (name) => name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
  const titleOf = (f) => f.title || base(f.name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mark = (s, q) => {
    if (!q) return escH(s);
    const i = s.toLowerCase().indexOf(q);
    return i < 0 ? escH(s) : escH(s.slice(0, i)) + '<mark>' + escH(s.slice(i, i + q.length)) + '</mark>' + escH(s.slice(i + q.length));
  };

  // ---------- crypto ----------
  async function fetchBytes(name) {
    const r = await fetch(BASE + name, { cache: 'no-store' });
    if (!r.ok) throw new Error('missing');
    return new Uint8Array(await r.arrayBuffer());
  }
  const decrypt = (buf) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));

  async function readManifest(k) {
    const raw = await fetchBytes('index.bin');
    key = k;
    try { manifest = JSON.parse(new TextDecoder().decode(await decrypt(raw.slice(16)))); }
    catch { key = manifest = null; throw new Error('wrong'); }
  }
  async function unlock(pass, remember) {
    const raw = await fetchBytes('index.bin');
    const b = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: raw.slice(0, 16), iterations: ITERATIONS },
      b, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    await readManifest(k);
    if (remember) await remembered.set(k);
  }

  // The derived key is kept in IndexedDB as a non-extractable CryptoKey. Pages on this site can use it
  // to decrypt, nothing can read it out, and the passphrase itself is never stored.
  const idb = (mode, fn) => new Promise((res, rej) => {
    const req = indexedDB.open('vault', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('keys', mode);
      const r = fn(tx.objectStore('keys'));
      tx.oncomplete = () => res(r?.result);
      tx.onerror = () => rej(tx.error);
    };
  });
  const remembered = {
    get: () => idb('readonly', (s) => s.get('key')).catch(() => null),
    set: (k) => idb('readwrite', (s) => s.put(k, 'key')).catch(() => {}),
    forget: () => idb('readwrite', (s) => s.delete('key')).catch(() => {}),
  };
  async function autoUnlock() {
    const k = await remembered.get();
    if (!k) return false;
    try { await readManifest(k); return true; } catch { await remembered.forget(); return false; }
  }

  // ---------- full-text search over the sealed text blobs ----------
  let texts = null;
  async function loadTexts() {
    if (texts) return texts;
    const t = {};
    await Promise.all(manifest.files.filter((f) => f.text).map(async (f) => {
      try { t[f.id] = JSON.parse(new TextDecoder().decode(await decrypt(await fetchBytes(f.id + '.t.bin')))); } catch {}
    }));
    return (texts = t);
  }
  function hitsIn(t, q, max = 3) {
    const out = [];
    const scan = (s, page) => {
      const low = s.toLowerCase();
      let i = low.indexOf(q);
      while (i >= 0 && out.length < max) {
        const a = Math.max(0, i - 50), b = Math.min(s.length, i + q.length + 70);
        out.push({ page, text: (a ? '…' : '') + s.slice(a, b) + (b < s.length ? '…' : '') });
        i = low.indexOf(q, i + q.length + 40);
      }
    };
    if (t.pages) t.pages.forEach((p, n) => out.length < max && scan(p, n + 1));
    else if (t.text) scan(t.text, 0);
    return out;
  }
  const countIn = (t, q) => (t.pages ? t.pages.join(' ') : t.text || '').toLowerCase().split(q).length - 1;

  // ---------- kinds ----------
  const MIME = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac',
  };
  const TEXT = new Set(('txt log tex bib sty cls py js mjs ts tsx jsx java c h cpp hpp rs go rb jl r m sh bash zsh yaml yml ' +
    'toml ini cfg xml sql lean v coq smt2 cedar json jsonl css scss rst org ml hs scala kt swift lua').split(' '));
  function kindOf(name) {
    const e = ext(name), m = MIME[e] || '';
    if (e === 'pdf') return 'pdf';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (e === 'md' || e === 'markdown') return 'markdown';
    if (e === 'ipynb') return 'notebook';
    if (e === 'csv' || e === 'tsv') return 'csv';
    if (['xlsx', 'xls', 'ods'].includes(e)) return 'sheet';
    if (e === 'docx') return 'docx';
    if (e === 'html' || e === 'htm') return 'html';
    if (TEXT.has(e) || !e) return 'text';
    return 'other';
  }
  const KIND_LABEL = { pdf: 'PDF', image: 'IMG', video: 'VID', audio: 'AUD', markdown: 'MD', notebook: 'NB', csv: 'CSV', sheet: 'XLS', docx: 'DOC', html: 'HTML', text: 'TXT', other: 'FILE' };

  // ---------- lazy libraries ----------
  const loaded = {};
  const script = (src) => loaded[src] ||= new Promise((res, rej) =>
    document.head.append(el('script', { src, onload: res, onerror: () => rej(new Error('A viewer library could not load.')) })));
  const style = (href) => { if (!loaded[href]) { loaded[href] = 1; document.head.append(el('link', { rel: 'stylesheet', href })); } };
  let pdfjsP;
  const lib = {
    marked: async () => { await script(CDN + 'marked@15/marked.min.js'); return window.marked; },
    katex: async () => {
      style(CDN + 'katex@0.16.11/dist/katex.min.css');
      await script(CDN + 'katex@0.16.11/dist/katex.min.js');
      await script(CDN + 'katex@0.16.11/dist/contrib/auto-render.min.js');
      return window.renderMathInElement;
    },
    mammoth: async () => { await script(CDN + 'mammoth@1.8.0/mammoth.browser.min.js'); return window.mammoth; },
    xlsx: async () => { await script(CDN + 'xlsx@0.18.5/dist/xlsx.full.min.js'); return window.XLSX; },
    pdfjs: () => pdfjsP ||= (async () => {
      style(PDFJS + 'web/pdf_viewer.css');
      const p = await import(PDFJS + 'build/pdf.min.mjs');
      p.GlobalWorkerOptions.workerSrc = PDFJS + 'build/pdf.worker.min.mjs';
      return p;
    })(),
  };

  async function markdownInto(node, src) {
    const marked = await lib.marked();
    const stash = [];
    const safe = src.replace(/\$\$[\s\S]+?\$\$|\$[^\s$](?:[^$\n]*?[^\s$\\])?\$/g, (m) => `\u0000${stash.push(m) - 1}\u0000`);
    node.innerHTML = marked.parse(safe).replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i].replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    if (stash.length) (await lib.katex())(node, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
  }

  // ---------- state + dialog ----------
  const dlg = el('dialog', { className: 'vault' });
  dlg.setAttribute('aria-label', 'Vault');
  document.body.append(dlg);
  const view = { folder: '', query: '', sort: store.get('sort', 'name'), file: null };
  let shell, side, mainEl, cleanupReader = () => {};
  let urls = [];
  const objectURL = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const revoke = () => { urls.forEach(URL.revokeObjectURL); urls = []; };

  const setRoute = (r) => history.replaceState(null, '', location.pathname + location.search + (r ? '#' + r : ''));
  function close() {
    cleanupReader();
    revoke();
    view.file = null;
    setRoute('');
    if (dlg.open) dlg.close();
    document.body.style.overflow = '';
  }
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (view.file) return showList();
    close();
  });

  // ---------- lock screen ----------
  function renderLock(msg = '') {
    const input = el('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'current-password', required: true });
    input.setAttribute('aria-label', 'Passphrase');
    const status = el('p', { className: 'vx-status', textContent: msg, role: 'status' });
    const remember = el('input', { type: 'checkbox', checked: true });
    const form = el('form', {},
      el('div', { className: 'vx-field' }, input, el('button', { type: 'submit', textContent: 'Unlock' })),
      el('label', { className: 'vx-remember' }, remember, 'Remember this device'),
      status);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = 'Deriving the key…';
      input.disabled = true;
      try {
        await unlock(input.value, remember.checked);
        renderApp();
        route(pendingRoute);
      } catch (err) {
        input.disabled = false;
        input.value = '';
        input.focus();
        status.textContent = err.message === 'missing' ? 'Nothing has been sealed yet.' : 'Not quite. Try again.';
        form.classList.remove('vx-shake'); void form.offsetWidth; form.classList.add('vx-shake');
      }
    });
    const x = el('button', { type: 'button', className: 'vx-x', innerHTML: '×' });
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    dlg.replaceChildren(el('div', { className: 'vx-lock' }, x,
      el('div', { className: 'vx-lock__card' },
        el('div', { className: 'vx-lock__mark', innerHTML: '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>' }),
        el('h2', { textContent: 'The vault' }),
        el('p', { textContent: 'Nothing to see here, unless you know the words.' }),
        form)));
    setTimeout(() => input.focus(), 40);
  }

  // ---------- app ----------
  function folders() {
    const counts = new Map();
    for (const f of manifest.files) {
      const parts = folderOf(f.name).split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const k = parts.slice(0, i).join('/');
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderApp() {
    const n = manifest.files.length;
    const search = el('input', { type: 'search', placeholder: 'Search names and text', value: view.query });
    search.setAttribute('aria-label', 'Search the vault');
    let t;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { view.query = search.value; showList(); }, 140); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); search.blur(); moveSel(0); }
      if (e.key === 'Enter') { e.preventDefault(); openSel(); }
    });

    const nav = el('nav', { className: 'vx-nav' });
    nav.setAttribute('aria-label', 'Folders');
    const lock = el('button', { type: 'button', textContent: 'Lock and forget this device' });
    lock.addEventListener('click', async () => { key = manifest = texts = null; await remembered.forget(); store.clear(); close(); toast('Vault locked'); });
    const exit = el('button', { type: 'button', textContent: 'Close' });
    exit.addEventListener('click', close);

    side = el('aside', { className: 'vx-side' },
      el('div', { className: 'vx-brand' }, el('span', { textContent: 'Vault' }), el('small', { textContent: `${n} file${n === 1 ? '' : 's'}` })),
      el('label', { className: 'vx-search', innerHTML: I.search }, search, el('kbd', { textContent: '/' })),
      nav,
      el('div', { className: 'vx-side__foot' },
        el('div', { className: 'vx-side__row' }, el('span', { textContent: `Sealed ${fmtDate(manifest.sealed.slice(0, 10))}` }), exit),
        lock));
    mainEl = el('section', { className: 'vx-main' });
    shell = el('div', { className: 'vx' }, side, mainEl);
    dlg.replaceChildren(shell);
    renderNav();
  }

  function renderNav() {
    const nav = $('.vx-nav', side);
    const recent = store.get('recent', []).map((s) => manifest.files.find((f) => f.slug === s)).filter(Boolean);
    const item = (label, ico, count, on, fn, depth = 0) => {
      const b = el('button', { type: 'button', className: `${on ? 'is-on' : ''} depth-${depth}` },
        el('span', { className: 'ico', textContent: ico }), el('span', { textContent: label }), count != null ? el('span', { className: 'n', textContent: count }) : null);
      b.addEventListener('click', () => { fn(); shell.classList.remove('side-open'); });
      return b;
    };
    const kids = [item('All files', '·', manifest.files.length, !view.folder && !view.query && !view.file, () => {
      view.folder = ''; view.query = ''; $('.vx-search input', side).value = ''; showList();
    })];
    const fs = folders();
    if (fs.length) {
      kids.push(el('div', { className: 'vx-nav__label', textContent: 'Folders' }));
      fs.forEach(([f, c]) => kids.push(item(f.split('/').pop(), '▸', c, view.folder === f && !view.file, () => { view.folder = f; showList(); }, f.split('/').length - 1)));
    }
    if (recent.length) {
      kids.push(el('div', { className: 'vx-nav__label', textContent: 'Recently opened' }));
      recent.slice(0, 5).forEach((f) => kids.push(item(titleOf(f), '◦', null, view.file?.id === f.id, () => openFile(f))));
    }
    nav.replaceChildren(...kids);
  }

  function topBar(...kids) {
    const menu = el('button', { type: 'button', className: 'vx-btn vx-menu-btn', innerHTML: I.menu });
    menu.setAttribute('aria-label', 'Folders');
    menu.addEventListener('click', () => shell.classList.toggle('side-open'));
    return el('header', { className: 'vx-top' }, menu, ...kids);
  }

  // ---------- list ----------
  let listed = [], sel = 0;
  async function showList() {
    cleanupReader();
    view.file = null;
    revoke();
    setRoute('vault');
    renderNav();
    const raw = view.query.trim();
    const q = raw.toLowerCase();
    const files = manifest.files.filter((f) => !view.folder || f.name.startsWith(view.folder + '/'));
    const cmp = {
      name: (a, b) => titleOf(a).localeCompare(titleOf(b)),
      date: (a, b) => b.modified.localeCompare(a.modified),
      size: (a, b) => b.size - a.size,
    }[view.sort] || ((a, b) => titleOf(a).localeCompare(titleOf(b)));
    files.sort(cmp);

    const sortBtns = ['name', 'date', 'size'].map((s) => {
      const b = el('button', { type: 'button', className: `vx-btn ${view.sort === s ? 'is-on' : ''}`, textContent: s[0].toUpperCase() + s.slice(1) });
      b.addEventListener('click', () => { view.sort = s; store.set('sort', s); showList(); });
      return b;
    });
    const heading = q ? `Results for “${raw}”` : view.folder ? view.folder.split('/').pop() : 'All files';
    const count = el('small');
    const body = el('div', { className: 'vx-list' });
    mainEl.replaceChildren(
      topBar(el('h2', {}, heading, count), el('div', { className: 'vx-sort vx-hide-sm' }, sortBtns)),
      el('div', { className: 'vx-scroll' }, body));

    if (!manifest.files.length) {
      body.append(el('div', { className: 'vx-empty', innerHTML: 'Empty for now. Add files to <code>vault/</code> and run <code>npm run seal</code>.' }));
      return;
    }

    let results = files.map((f) => ({ f, hits: [] }));
    if (q) {
      const tx = await loadTexts();
      if (view.query.trim().toLowerCase() !== q || view.file) return; // a newer search or a file took over
      results = [];
      for (const f of files) {
        const inName = (titleOf(f) + ' ' + f.name).toLowerCase().includes(q);
        const t = tx[f.id];
        const hits = t ? hitsIn(t, q) : [];
        if (inName || hits.length) results.push({ f, hits, score: (inName ? 1000 : 0) + (t ? countIn(t, q) : 0) });
      }
      results.sort((a, b) => b.score - a.score);
    }
    count.textContent = `${results.length} file${results.length === 1 ? '' : 's'}`;

    listed = results.map((r) => r.f);
    sel = 0;
    if (!results.length) {
      body.append(el('div', { className: 'vx-empty', innerHTML: 'Nothing in the vault mentions that.' }));
      return;
    }
    const pos = store.get('pos', {});
    results.forEach(({ f, hits }, i) => {
      const k = kindOf(f.name);
      const meta = [folderOf(f.name) || null, f.pages ? `${f.pages} pages` : null, f.words ? `${f.words.toLocaleString('en-US')} words` : null, fmtSize(f.size), `Added ${fmtDate(f.modified)}`].filter(Boolean);
      const resume = pos[f.slug] > 1 && f.pages ? el('span', { className: 'vx-resume', textContent: `Continue on p. ${pos[f.slug]}` }) : null;
      const type = el('div', { className: 'vx-type', textContent: KIND_LABEL[k] });
      type.dataset.k = k;
      const card = el('div', { className: 'vx-card', role: 'button', tabIndex: 0 },
        type,
        el('div', { className: 'vx-card__main' },
          el('div', { className: 'vx-card__title', innerHTML: mark(titleOf(f), q) }),
          el('div', { className: 'vx-card__meta' }, meta.map((m) => el('span', { textContent: m }))),
          !hits.length && f.excerpt ? el('p', { className: 'vx-card__excerpt', textContent: f.excerpt }) : null,
          hits.length ? el('div', { className: 'vx-hits' }, hits.map((h) => {
            const b = el('button', { type: 'button', className: 'vx-hitline' }, h.page ? el('b', { textContent: `p. ${h.page}` }) : null, el('span', { innerHTML: mark(h.text, q) }));
            b.addEventListener('click', (e) => { e.stopPropagation(); openFile(f, h.page || 1, q); });
            return b;
          })) : null),
        resume);
      card.addEventListener('click', () => openFile(f, undefined, q || undefined));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); openFile(f, undefined, q || undefined); } });
      card.addEventListener('mousemove', () => setSel(i, false));
      body.append(card);
    });
    body.append(el('div', { className: 'vx-keys vx-hide-sm', innerHTML: '<span><kbd>/</kbd> search</span><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>↵</kbd> open</span><span><kbd>[</kbd><kbd>]</kbd> previous or next file</span><span><kbd>esc</kbd> back or close</span>' }));
    setSel(0, false);
  }
  function setSel(i, scroll = true) {
    const cards = $$('.vx-card', mainEl);
    if (!cards.length) return;
    sel = (i + cards.length) % cards.length;
    cards.forEach((c, n) => c.classList.toggle('is-sel', n === sel));
    if (scroll) cards[sel].scrollIntoView({ block: 'nearest' });
  }
  const moveSel = (d) => setSel(sel + d);
  const openSel = () => { const f = listed[sel]; if (f) openFile(f, undefined, view.query.trim().toLowerCase() || undefined); };

  // ---------- reader ----------
  async function openFile(f, page, query) {
    cleanupReader();
    revoke();
    view.file = f;
    store.set('recent', [f.slug, ...store.get('recent', []).filter((s) => s !== f.slug)].slice(0, 8));
    renderNav();
    const k = kindOf(f.name);
    const order = listed.length ? listed : manifest.files;
    const idx = order.indexOf(f);
    const prevF = idx > 0 ? order[idx - 1] : null, nextF = idx >= 0 ? order[idx + 1] : null;

    const back = el('button', { type: 'button', className: 'vx-btn', innerHTML: I.back + '<span class="vx-hide-sm">Files</span>', title: 'Back to files (esc)' });
    back.addEventListener('click', showList);
    const prev = el('button', { type: 'button', className: 'vx-btn', innerHTML: I.prev, title: prevF ? `Previous file, ${titleOf(prevF)}` : 'No previous file', disabled: !prevF });
    const next = el('button', { type: 'button', className: 'vx-btn', innerHTML: I.next, title: nextF ? `Next file, ${titleOf(nextF)}` : 'No next file', disabled: !nextF });
    prev.addEventListener('click', () => prevF && openFile(prevF));
    next.addEventListener('click', () => nextF && openFile(nextF));
    const linkBtn = el('button', { type: 'button', className: 'vx-btn vx-hide-sm', innerHTML: I.link, title: 'Copy a link to this file' });
    linkBtn.addEventListener('click', () => navigator.clipboard.writeText(location.href).then(() => toast('Link copied. It only opens for you.')));
    const dl = el('a', { className: 'vx-btn', innerHTML: I.down, title: 'Download' });
    const pdfTools = el('div', { className: 'vx-group', hidden: true });
    const stage = el('div', { className: 'vx-stage' }, el('div', { className: 'vx-loading', innerHTML: '<b></b><span>Decrypting…</span>' }));
    const rail = el('aside', { className: 'vx-rail' });
    const reader = el('div', { className: 'vx-reader' }, rail, stage);
    mainEl.replaceChildren(
      topBar(back,
        el('div', { className: 'vx-titlebox' }, el('h2', { textContent: titleOf(f) }), el('span', { className: 'vx-crumbs', textContent: f.name })),
        pdfTools, el('div', { className: 'vx-group' }, prev, next), linkBtn, dl),
      reader);
    setRoute(`vault/${f.slug}`);

    try {
      const bytes = new Uint8Array(await decrypt(await fetchBytes(f.id + '.bin')));
      if (view.file !== f) return;
      dl.href = objectURL(new Blob([bytes], { type: MIME[ext(f.name)] || 'application/octet-stream' }));
      dl.download = base(f.name);
      if (k === 'pdf') return await pdfReader(f, bytes, { stage, rail, reader, tools: pdfTools, page, query });
      stage.classList.add(k === 'html' ? 'vx-stage--frame' : 'vx-stage--doc');
      stage.replaceChildren(await render(f, k, bytes));
      stage.scrollTop = 0;
    } catch (err) {
      if (view.file === f) stage.replaceChildren(el('div', { className: 'vx-empty', innerHTML: `Couldn't open this one. ${escH(err.message)}` }));
    }
  }

  // ---------- PDF reader ----------
  async function pdfReader(f, bytes, { stage, rail, reader, tools, page, query }) {
    const pdfjs = await lib.pdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    if (view.file !== f) { doc.destroy(); return; }
    const N = doc.numPages;
    const start = Math.max(1, Math.min(N, page || store.get('pos', {})[f.slug] || 1));
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });
    let zoom = store.get('zoom', 1);
    let current = 0;
    const wrap = el('div', { className: 'pdfv' });
    stage.replaceChildren(wrap);

    // toolbar
    const pageBox = el('input', { type: 'text', inputMode: 'numeric', value: String(start) });
    pageBox.setAttribute('aria-label', 'Page number');
    const pageNo = el('label', { className: 'vx-pageno' }, pageBox, el('span', { textContent: `/ ${N}` }));
    const zOut = el('button', { type: 'button', className: 'vx-btn vx-hide-sm', textContent: '−', title: 'Zoom out (−)' });
    const zIn = el('button', { type: 'button', className: 'vx-btn vx-hide-sm', textContent: '+', title: 'Zoom in (+)' });
    const zFit = el('button', { type: 'button', className: 'vx-btn vx-hide-sm', textContent: '100%', title: 'Fit to width (0)' });
    const thumbsBtn = el('button', { type: 'button', className: 'vx-btn vx-hide-sm', innerHTML: I.pages, title: 'Page thumbnails (p)' });
    tools.replaceChildren(thumbsBtn, pageNo, zOut, zFit, zIn);
    tools.hidden = false;
    const showRail = (v) => { reader.classList.toggle('has-rail', v); thumbsBtn.classList.toggle('is-on', v); store.set('rail', v); };
    showRail(store.get('rail', true));
    thumbsBtn.addEventListener('click', () => showRail(!reader.classList.contains('has-rail')));

    // pages, laid out at full size before any of them render, so scrolling is stable
    const pages = [];
    const layout = () => {
      const w = Math.max(240, Math.min(stage.clientWidth - 48, 860) * zoom);
      pages.forEach((p) => { p.el.style.width = `${w}px`; p.el.style.height = `${w * p.ratio}px`; p.drawn = -1; });
      zFit.textContent = `${Math.round(zoom * 100)}%`;
    };
    for (let n = 1; n <= N; n++) {
      const pe = el('div', { className: 'pdfv-page' });
      pe.dataset.n = n;
      pages.push({ n, el: pe, ratio: first.height / first.width, drawn: -1, visible: false });
      wrap.append(pe);
    }
    layout();

    let gen = 0;
    async function draw(p) {
      if (p.drawn === gen) return;
      p.drawn = gen;
      const my = gen;
      const pg = await doc.getPage(p.n);
      const vp1 = pg.getViewport({ scale: 1 });
      const cssW = parseFloat(p.el.style.width);
      if (Math.abs(vp1.height / vp1.width - p.ratio) > 0.001) { p.ratio = vp1.height / vp1.width; p.el.style.height = `${cssW * p.ratio}px`; }
      const scale = cssW / vp1.width;
      const vp = pg.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const canvas = el('canvas', { width: Math.floor(vp.width * dpr), height: Math.floor(vp.height * dpr) });
      await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
      if (my !== gen || view.file !== f) return;
      const tl = el('div', { className: 'textLayer' });
      p.el.style.setProperty('--scale-factor', scale);
      p.el.style.setProperty('--total-scale-factor', scale);
      p.el.style.setProperty('--user-unit', 1);
      p.el.replaceChildren(canvas, tl);
      try {
        await new pdfjs.TextLayer({ textContentSource: pg.streamTextContent(), container: tl, viewport: vp }).render();
        if (query) highlight(tl, query);
      } catch {}
    }
    function highlight(tl, q) {
      $$('span', tl).forEach((s) => {
        const t = s.textContent, i = t.toLowerCase().indexOf(q);
        if (i < 0 || s.children.length) return;
        s.innerHTML = escH(t.slice(0, i)) + '<mark class="vx-hit">' + escH(t.slice(i, i + q.length)) + '</mark>' + escH(t.slice(i + q.length));
      });
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const p = pages[+e.target.dataset.n - 1];
      p.visible = e.isIntersecting;
      if (e.isIntersecting) draw(p);
    }), { root: stage, rootMargin: '900px 0px' });
    pages.forEach((p) => io.observe(p.el));
    const redrawVisible = () => pages.filter((p) => p.visible).forEach(draw);

    // thumbnails
    const thumbs = pages.map((p) => {
      const c = el('canvas');
      const b = el('button', { type: 'button', className: 'vx-thumb', title: `Page ${p.n}` }, c, el('span', { textContent: p.n }));
      b.style.setProperty('--ratio', `${1 / p.ratio}`);
      b.addEventListener('click', () => go(p.n));
      rail.append(b);
      return { b, c, done: false, n: p.n };
    });
    const tio = new IntersectionObserver((es) => es.forEach(async (e) => {
      if (!e.isIntersecting) return;
      const t = thumbs.find((x) => x.b === e.target);
      if (!t || t.done) return;
      t.done = true;
      const pg = await doc.getPage(t.n);
      const vp = pg.getViewport({ scale: 300 / pg.getViewport({ scale: 1 }).width });
      t.c.width = vp.width; t.c.height = vp.height;
      await pg.render({ canvasContext: t.c.getContext('2d'), viewport: vp }).promise;
    }), { root: rail, rootMargin: '500px 0px' });
    thumbs.forEach((t) => tio.observe(t.b));

    // which page is in view
    const setCurrent = (n) => {
      if (n === current) return;
      current = n;
      if (document.activeElement !== pageBox) pageBox.value = n;
      thumbs.forEach((t) => t.b.classList.toggle('is-on', t.n === n));
      thumbs[n - 1]?.b.scrollIntoView({ block: 'nearest' });
      const pos = store.get('pos', {}); pos[f.slug] = n; store.set('pos', pos);
      setRoute(`vault/${f.slug}${n > 1 ? '/p' + n : ''}`);
    };
    const onScroll = () => {
      const mid = stage.getBoundingClientRect().top + stage.clientHeight * 0.4;
      let best = 1;
      for (const p of pages) { if (p.el.getBoundingClientRect().top <= mid) best = p.n; else break; }
      setCurrent(best);
    };
    stage.addEventListener('scroll', onScroll, { passive: true });
    const go = (n, smooth = true) => {
      n = Math.max(1, Math.min(N, n | 0 || 1));
      stage.scrollTo({ top: pages[n - 1].el.offsetTop - 16, behavior: smooth ? 'smooth' : 'auto' });
    };
    pageBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(+pageBox.value); pageBox.blur(); } });
    pageBox.addEventListener('change', () => go(+pageBox.value));

    const setZoom = (z) => {
      const keep = current || start;
      zoom = Math.max(0.5, Math.min(3, Math.round(z * 100) / 100));
      store.set('zoom', zoom);
      gen++;
      layout();
      go(keep, false);
      redrawVisible();
    };
    zIn.addEventListener('click', () => setZoom(zoom + 0.15));
    zOut.addEventListener('click', () => setZoom(zoom - 0.15));
    zFit.addEventListener('click', () => setZoom(1));
    // re-lay out only for real resizes (a scrollbar appearing is not one), and only once things settle
    let lastW = stage.clientWidth, resizeT;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (Math.abs(stage.clientWidth - lastW) < 40) return;
        lastW = stage.clientWidth;
        const keep = current || start;
        gen++; layout(); go(keep, false); redrawVisible();
      }, 150);
    });
    ro.observe(stage);

    const onKey = (e) => {
      if (!dlg.open || view.file !== f || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'j' || k === 'PageDown') { e.preventDefault(); go(current + 1); }
      else if (k === 'ArrowLeft' || k === 'k' || k === 'PageUp') { e.preventDefault(); go(current - 1); }
      else if (k === '+' || k === '=') setZoom(zoom + 0.15);
      else if (k === '-') setZoom(zoom - 0.15);
      else if (k === '0') setZoom(1);
      else if (k === 'p') showRail(!reader.classList.contains('has-rail'));
      else if (k === 'Home') { e.preventDefault(); go(1); }
      else if (k === 'End') { e.preventDefault(); go(N); }
    };
    document.addEventListener('keydown', onKey);
    cleanupReader = () => {
      document.removeEventListener('keydown', onKey);
      io.disconnect(); tio.disconnect(); ro.disconnect();
      doc.destroy();
      cleanupReader = () => {};
    };

    requestAnimationFrame(() => {
      go(start, false);
      setCurrent(start);
      if (query) {
        // once the target page has drawn, bring the first highlight into view
        let tries = 0;
        const findHit = () => {
          const m = $('mark.vx-hit', pages[start - 1].el);
          if (m) m.scrollIntoView({ block: 'center' });
          else if (++tries < 40 && view.file === f) setTimeout(findHit, 100);
        };
        findHit();
      }
    });
  }

  // ---------- other renderers ----------
  const textOf = (bytes) => new TextDecoder().decode(bytes);
  function parseDelimited(src, sep) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function table(rows, limit = 2000) {
    const [head = [], ...body] = rows;
    return el('div', { className: 'vx-table' },
      el('table', {},
        el('thead', {}, el('tr', {}, head.map((h) => el('th', { textContent: h })))),
        el('tbody', {}, body.slice(0, limit).map((r) => el('tr', {}, r.map((c) => el('td', { textContent: c })))))),
      body.length > limit ? el('p', { className: 'vx-crumbs', textContent: `Showing ${limit} of ${body.length} rows. Download for the rest.` }) : null);
  }
  const joinSrc = (s) => (Array.isArray(s) ? s.join('') : s || '');
  async function notebook(src) {
    const nb = JSON.parse(src);
    const wrap = el('div', { className: 'vx-doc vx-nb' });
    for (const cell of nb.cells || []) {
      const body = joinSrc(cell.source);
      if (cell.cell_type === 'markdown') { const d = el('div'); await markdownInto(d, body); wrap.append(d); continue; }
      if (cell.cell_type !== 'code') { wrap.append(el('pre', { textContent: body })); continue; }
      wrap.append(el('div', { className: 'cell' }, el('div', { className: 'prompt', textContent: `In [${cell.execution_count ?? ' '}]` }), el('pre', { textContent: body })));
      for (const out of cell.outputs || []) {
        const d = out.data || {};
        if (out.output_type === 'stream') wrap.append(el('pre', { className: 'out', textContent: joinSrc(out.text) }));
        else if (out.output_type === 'error') wrap.append(el('pre', { className: 'out err', textContent: (out.traceback || []).join('\n').replace(/\x1b\[[0-9;]*m/g, '') }));
        else if (d['image/png']) wrap.append(el('img', { src: 'data:image/png;base64,' + joinSrc(d['image/png']).replace(/\s/g, '') }));
        else if (d['image/jpeg']) wrap.append(el('img', { src: 'data:image/jpeg;base64,' + joinSrc(d['image/jpeg']).replace(/\s/g, '') }));
        else if (d['image/svg+xml']) wrap.append(el('img', { src: objectURL(new Blob([joinSrc(d['image/svg+xml'])], { type: 'image/svg+xml' })) }));
        else if (d['text/html']) wrap.append(el('div', { className: 'vx-table', innerHTML: joinSrc(d['text/html']) }));
        else if (d['text/plain']) wrap.append(el('pre', { className: 'out', textContent: joinSrc(d['text/plain']) }));
      }
    }
    return wrap;
  }
  async function render(f, k, bytes) {
    const e = ext(f.name);
    const blob = () => new Blob([bytes], { type: MIME[e] || 'application/octet-stream' });
    switch (k) {
      case 'image': return el('div', { className: 'vx-media' }, el('img', { src: objectURL(blob()), alt: titleOf(f) }));
      case 'video': return el('div', { className: 'vx-media' }, el('video', { src: objectURL(blob()), controls: true, playsInline: true }));
      case 'audio': return el('div', { className: 'vx-media' }, el('audio', { src: objectURL(blob()), controls: true }));
      case 'markdown': { const n = el('div', { className: 'vx-doc' }); await markdownInto(n, textOf(bytes)); return n; }
      case 'notebook': return notebook(textOf(bytes));
      case 'csv': return table(parseDelimited(textOf(bytes), e === 'tsv' ? '\t' : ','));
      case 'sheet': {
        const XLSX = await lib.xlsx();
        const wb = XLSX.read(bytes, { type: 'array' });
        return el('div', {}, wb.SheetNames.map((s) => el('section', {},
          wb.SheetNames.length > 1 ? el('h3', { textContent: s }) : null,
          table(XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' }).map((r) => r.map(String))))));
      }
      case 'docx': {
        const mammoth = await lib.mammoth();
        const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
        return el('div', { className: 'vx-doc', innerHTML: value });
      }
      case 'html': {
        const fr = el('iframe', { className: 'vx-frame', title: titleOf(f) });
        fr.setAttribute('sandbox', '');
        fr.srcdoc = textOf(bytes);
        return fr;
      }
      case 'text': {
        let src = textOf(bytes);
        if (e === 'json') { try { src = JSON.stringify(JSON.parse(src), null, 2); } catch {} }
        return el('pre', { className: 'vx-code', textContent: src });
      }
      default:
        return el('div', { className: 'vx-empty', innerHTML: `No preview for .${escH(e || '?')} files. Use the download button above.` });
    }
  }

  // ---------- routing + keys ----------
  let pendingRoute = '';
  function route(r = '') {
    const m = /^vault\/([0-9a-f]{6,})(?:\/p(\d+))?/.exec(r || '');
    const f = m && manifest.files.find((x) => x.slug === m[1]);
    if (f) openFile(f, m[2] ? +m[2] : undefined);
    else showList();
  }
  document.addEventListener('keydown', (e) => {
    if (!dlg.open || !manifest || !shell) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('.vx-search input', side)?.focus(); return; }
    if (typing) return;
    if (!view.file) {
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter' && !e.target.closest('.vx-card, button, a')) { e.preventDefault(); openSel(); }
    } else if (e.key === '[' || e.key === ']') {
      const order = listed.length ? listed : manifest.files;
      const t = order[order.indexOf(view.file) + (e.key === ']' ? 1 : -1)];
      if (t) openFile(t);
    }
  });

  async function open(r = '') {
    pendingRoute = r;
    if (!dlg.open) { dlg.showModal(); document.body.style.overflow = 'hidden'; }
    if (manifest || await autoUnlock()) {
      if (!shell || !dlg.contains(shell)) renderApp();
      route(r);
    } else renderLock();
  }
  window.__vault = { open };
  open(window.__vaultRoute || '');
})();
