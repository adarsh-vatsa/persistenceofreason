// Private vault. Loaded after a double-tap on the ∴, or by visiting /#vault.
// Everything is decrypted and rendered here in the browser; the server only ever holds ciphertext.
(() => {
  if (window.__vault) return window.__vault.open();

  const ITERATIONS = 600_000; // must match seal.mjs
  const BASE = '/v/';
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  let key = null, manifest = null;

  // ---------- tiny DOM helper ----------
  const el = (tag, attrs = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), attrs);
    n.append(...kids.filter((k) => k != null));
    return n;
  };

  const dlg = el('dialog', { className: 'vault' });
  dlg.setAttribute('aria-label', 'vault');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    revoke();
    dlg.classList.remove('reading');
  });

  // ---------- remembered device ----------
  // The derived AES key is stored in IndexedDB as a non-extractable CryptoKey. Scripts on
  // this site can use it to decrypt, but nothing can read the key out, and the passphrase
  // itself is never stored. Re-sealing changes the salt, which quietly invalidates it.
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
    get: () => idb('readonly', (st) => st.get('key')).catch(() => null),
    set: (k) => idb('readwrite', (st) => st.put(k, 'key')).catch(() => {}),
    forget: () => idb('readwrite', (st) => st.delete('key')).catch(() => {}),
  };

  // ---------- crypto ----------
  async function fetchBytes(name) {
    const r = await fetch(BASE + name, { cache: 'no-store' });
    if (!r.ok) throw new Error('missing');
    return new Uint8Array(await r.arrayBuffer());
  }

  const decrypt = (buf) =>
    crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));

  async function readManifest(k) {
    const raw = await fetchBytes('index.bin');
    key = k;
    try {
      manifest = JSON.parse(new TextDecoder().decode(await decrypt(raw.slice(16))));
    } catch {
      key = manifest = null;
      throw new Error('wrong');
    }
  }

  async function unlock(pass, remember) {
    const raw = await fetchBytes('index.bin');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: raw.slice(0, 16), iterations: ITERATIONS },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    await readManifest(k);
    if (remember) await remembered.set(k);
  }

  // Try the remembered key first. Returns true if the vault opened without a passphrase.
  async function autoUnlock() {
    const k = await remembered.get();
    if (!k) return false;
    try { await readManifest(k); return true; }
    catch { await remembered.forget(); return false; }
  }

  // ---------- file kinds ----------
  const ext = (name) => (name.match(/\.([^./]+)$/)?.[1] || '').toLowerCase();

  const MIME = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  };
  const TEXT = new Set(('txt log tex bib sty cls py js mjs ts tsx jsx java c h cpp hpp cc rs go rb jl r m ' +
    'sh bash zsh yaml yml toml ini cfg conf xml sql lean v coq smt2 cedar json jsonl css scss rst org ' +
    'ml hs scala kt swift lua pl php dockerfile makefile gitignore env').split(' '));

  function kindOf(name) {
    const e = ext(name);
    if (e === 'pdf') return 'pdf';
    if (/^image\//.test(MIME[e] || '')) return 'image';
    if (/^video\//.test(MIME[e] || '')) return 'video';
    if (/^audio\//.test(MIME[e] || '')) return 'audio';
    if (e === 'md' || e === 'markdown') return 'markdown';
    if (e === 'ipynb') return 'notebook';
    if (e === 'csv' || e === 'tsv') return 'csv';
    if (e === 'xlsx' || e === 'xls' || e === 'ods') return 'sheet';
    if (e === 'docx') return 'docx';
    if (e === 'html' || e === 'htm') return 'html';
    if (TEXT.has(e) || !e) return 'text';
    return 'other';
  }

  // ---------- lazy libraries ----------
  const loaded = {};
  const script = (src) => loaded[src] ||= new Promise((res, rej) =>
    document.head.append(el('script', { src, onload: res, onerror: () => rej(new Error('could not load ' + src)) })));
  const style = (href) => { if (!loaded[href]) { loaded[href] = 1; document.head.append(el('link', { rel: 'stylesheet', href })); } };

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
    pdfjs: async () => {
      const pdfjs = await import(CDN + 'pdfjs-dist@4.10.38/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = CDN + 'pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      return pdfjs;
    },
  };

  // PDFs are drawn page by page with PDF.js (consistent everywhere, incl. iOS),
  // rendering each page only as it scrolls into view.
  async function pdf(bytes) {
    const pdfjs = await lib.pdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const wrap = el('div', { className: 'v-pdf' });
    const io = new IntersectionObserver((entries) => entries.forEach(async (en) => {
      if (!en.isIntersecting || en.target.dataset.done) return;
      en.target.dataset.done = 1;
      const page = await doc.getPage(+en.target.dataset.n);
      const base = page.getViewport({ scale: 1 });
      const scale = (wrap.clientWidth / base.width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = en.target.querySelector('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }), { rootMargin: '600px 0px' });
    const first = (await doc.getPage(1)).getViewport({ scale: 1 });
    wrap.style.setProperty('--ratio', `${first.width} / ${first.height}`);
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = el('div', { className: 'v-page' }, el('canvas'));
      pg.dataset.n = n;
      wrap.append(pg);
      io.observe(pg);
    }
    wrap.append(el('p', { className: 'mono small muted v-pages', textContent: `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}` }));
    return wrap;
  }

  // Markdown with $math$ protected from the markdown parser, then typeset by KaTeX.
  async function markdownInto(node, src) {
    const marked = await lib.marked();
    const stash = [];
    const safe = src.replace(/\$\$[\s\S]+?\$\$|\$[^\s$](?:[^$\n]*?[^\s$\\])?\$/g, (m) => `\u0000${stash.push(m) - 1}\u0000`);
    node.innerHTML = marked.parse(safe).replace(/\u0000(\d+)\u0000/g, (_, i) =>
      stash[i].replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    if (stash.length) {
      const render = await lib.katex();
      render(node, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
    }
  }

  // ---------- renderers ----------
  let urls = [];
  const objectURL = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const revoke = () => { urls.forEach(URL.revokeObjectURL); urls = []; };
  const text = (bytes) => new TextDecoder().decode(bytes);

  function parseDelimited(src, sep) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function table(rows, limit = 2000) {
    const [head = [], ...body] = rows;
    const t = el('table', {},
      el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { textContent: h })))),
      el('tbody', {}, ...body.slice(0, limit).map((r) => el('tr', {}, ...r.map((c) => el('td', { textContent: c }))))));
    const more = body.length > limit ? el('p', { className: 'mono small muted', textContent: `showing ${limit} of ${body.length} rows — download for the rest` }) : null;
    return el('div', { className: 'v-table' }, t, more);
  }

  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const joinSrc = (s) => (Array.isArray(s) ? s.join('') : s || '');

  async function notebook(src) {
    const nb = JSON.parse(src);
    const lang = nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name || '';
    const wrap = el('div', { className: 'v-notebook' });
    for (const cell of nb.cells || []) {
      const body = joinSrc(cell.source);
      if (cell.cell_type === 'markdown') {
        const md = el('div', { className: 'v-prose' });
        await markdownInto(md, body);
        wrap.append(md);
        continue;
      }
      if (cell.cell_type !== 'code') { wrap.append(el('pre', { textContent: body })); continue; }
      wrap.append(el('div', { className: 'v-cell' },
        el('span', { className: 'v-prompt mono', textContent: `[${cell.execution_count ?? ' '}]` }),
        el('pre', { className: 'v-code', textContent: body, title: lang })));
      for (const out of cell.outputs || []) {
        const d = out.data || {};
        if (out.output_type === 'stream') wrap.append(el('pre', { className: 'v-out', textContent: joinSrc(out.text) }));
        else if (out.output_type === 'error') wrap.append(el('pre', { className: 'v-out v-err', textContent: stripAnsi((out.traceback || []).join('\n')) }));
        else if (d['image/png']) wrap.append(el('img', { src: 'data:image/png;base64,' + joinSrc(d['image/png']).replace(/\s/g, '') }));
        else if (d['image/jpeg']) wrap.append(el('img', { src: 'data:image/jpeg;base64,' + joinSrc(d['image/jpeg']).replace(/\s/g, '') }));
        else if (d['image/svg+xml']) wrap.append(el('img', { src: objectURL(new Blob([joinSrc(d['image/svg+xml'])], { type: 'image/svg+xml' })) }));
        else if (d['text/html']) wrap.append(el('div', { className: 'v-out-html', innerHTML: joinSrc(d['text/html']) }));
        else if (d['text/plain']) wrap.append(el('pre', { className: 'v-out', textContent: joinSrc(d['text/plain']) }));
      }
    }
    return wrap;
  }

  async function render(file, bytes) {
    const e = ext(file.name);
    const blob = (type) => new Blob([bytes], { type: type || MIME[e] || 'application/octet-stream' });
    switch (kindOf(file.name)) {
      case 'pdf':   return pdf(bytes);
      case 'image': return el('div', { className: 'v-media' }, el('img', { src: objectURL(blob()), alt: file.name }));
      case 'video': return el('div', { className: 'v-media' }, el('video', { src: objectURL(blob()), controls: true, playsInline: true }));
      case 'audio': return el('div', { className: 'v-media' }, el('audio', { src: objectURL(blob()), controls: true }));
      case 'markdown': { const n = el('div', { className: 'v-prose' }); await markdownInto(n, text(bytes)); return n; }
      case 'notebook': return notebook(text(bytes));
      case 'csv':   return table(parseDelimited(text(bytes), e === 'tsv' ? '\t' : ','));
      case 'sheet': {
        const XLSX = await lib.xlsx();
        const wb = XLSX.read(bytes, { type: 'array' });
        return el('div', {}, ...wb.SheetNames.map((s) => el('section', {},
          wb.SheetNames.length > 1 ? el('p', { className: 'label', textContent: s }) : null,
          table(XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' }).map((r) => r.map(String))))));
      }
      case 'docx': {
        const mammoth = await lib.mammoth();
        const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
        return el('div', { className: 'v-prose', innerHTML: value });
      }
      case 'html': {
        // sandboxed: renders the page but cannot run scripts or reach this one
        const f = el('iframe', { className: 'v-frame', title: file.name });
        f.setAttribute('sandbox', '');
        f.srcdoc = text(bytes);
        return f;
      }
      case 'text': {
        let src = text(bytes);
        if (e === 'json') { try { src = JSON.stringify(JSON.parse(src), null, 2); } catch {} }
        return el('pre', { className: 'v-text', textContent: src });
      }
      default:
        return el('div', { className: 'v-empty' },
          el('p', { textContent: `No preview for .${e || '?'} files.` }),
          el('a', { href: objectURL(blob()), download: file.name.split('/').pop(), textContent: 'download it instead ↓' }));
    }
  }

  // ---------- views ----------
  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  function renderLock(msg = '') {
    const input = el('input', { type: 'password', placeholder: 'passphrase', autocomplete: 'current-password', required: true });
    const status = el('p', { className: 'vault-status mono small', textContent: msg });
    const remember = el('input', { type: 'checkbox', checked: true });
    const form = el('form', {},
      el('p', { className: 'label', textContent: 'vault' }),
      el('p', { className: 'vault-intro', textContent: 'Nothing to see here, unless you know the words.' }),
      input,
      el('label', { className: 'vault-remember small' }, remember, ' remember this device'),
      status);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = 'deriving key…';
      input.disabled = true;
      try {
        await unlock(input.value, remember.checked);
        renderList();
      } catch (err) {
        input.disabled = false;
        input.value = '';
        input.focus();
        status.textContent = err.message === 'missing' ? 'Nothing has been sealed yet.' : 'nope.';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    });
    dlg.classList.remove('reading');
    dlg.replaceChildren(form);
    setTimeout(() => input.focus(), 30);
  }

  function renderList() {
    revoke();
    dlg.classList.remove('reading');
    const n = manifest.files.length;
    const items = manifest.files.map((f) => {
      const a = el('a', { href: '#', textContent: f.name });
      a.addEventListener('click', (e) => { e.preventDefault(); renderFile(f); });
      return el('li', {}, el('time', { textContent: f.modified }),
        el('span', {}, a, el('span', { className: 'summary', textContent: `${ext(f.name) || 'file'} · ${fmtSize(f.size)}` })));
    });
    const lock = el('button', { type: 'button', className: 'vault-lock', textContent: 'lock and forget this device' });
    lock.addEventListener('click', async () => { key = manifest = null; await remembered.forget(); dlg.close(); });
    dlg.replaceChildren(
      el('p', { className: 'label', textContent: `vault · ${n} file${n === 1 ? '' : 's'}` }),
      n ? el('ol', { className: 'entries' }, ...items)
        : el('p', { className: 'vault-intro', textContent: 'Empty for now. Add files to vault/ and run npm run seal.' }),
      el('p', { className: 'mono small muted', textContent: `sealed ${manifest.sealed.slice(0, 10)} · ` }, lock));
  }

  async function renderFile(f) {
    revoke();
    const back = el('button', { type: 'button', className: 'vault-lock', textContent: '← vault' });
    back.addEventListener('click', renderList);
    const dl = el('a', { className: 'mono small', textContent: 'download ↓', href: '#' });
    const stage = el('div', { className: 'v-stage' }, el('p', { className: 'mono small muted', textContent: 'decrypting…' }));
    dlg.classList.add('reading');
    dlg.replaceChildren(
      el('header', { className: 'v-bar mono small' }, back, el('span', { className: 'v-name', textContent: f.name }), dl),
      stage);
    try {
      const bytes = new Uint8Array(await decrypt(await fetchBytes(f.id + '.bin')));
      dl.href = objectURL(new Blob([bytes], { type: MIME[ext(f.name)] || 'application/octet-stream' }));
      dl.download = f.name.split('/').pop();
      stage.replaceChildren(await render(f, bytes));
      stage.scrollTop = 0;
    } catch (err) {
      stage.replaceChildren(el('p', { className: 'vault-status mono small', textContent: `couldn't open this file (${err.message}).` }));
    }
  }

  const open = async () => {
    if (manifest || await autoUnlock()) renderList(); else renderLock();
    if (!dlg.open) dlg.showModal();
  };
  window.__vault = { open };
  open();
})();
