// Persistence of Reason. Everything interactive on the public site lives here.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), attrs);
    n.append(...kids.filter((k) => k != null));
    return n;
  };
  const me = document.currentScript;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const typing = (e) => {
    const t = e.target;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  };
  const ICON = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  if (!isMac) $$('[data-mod]').forEach((k) => (k.textContent = 'Ctrl K'));

  // ---------- toast ----------
  let toastEl, toastTimer;
  const toast = (msg) => {
    toastEl ||= document.body.appendChild(el('div', { className: 'toast', role: 'status' }));
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1600);
  };
  const copy = async (text, msg = 'Copied') => {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Copy failed'); }
  };
  window.__toast = toast;

  // ---------- theme ----------
  const darkNow = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const setTheme = (t) => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    store.set('theme', t);
  };
  const toggleTheme = () => setTheme(darkNow() ? 'light' : 'dark');
  $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));

  // ---------- reading progress ----------
  const bar = $('.progress');
  const prose = $('.is-post .prose');
  const onScroll = () => {
    if (!prose || !bar) return;
    const r = prose.getBoundingClientRect();
    bar.style.setProperty('--p', Math.min(1, Math.max(0, (innerHeight * 0.35 - r.top) / r.height)).toFixed(4));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- table of contents: highlight where you are ----------
  const tocLinks = $$('.toc a');
  if (tocLinks.length) {
    const heads = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const spy = () => {
      let cur = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h;
      tocLinks.forEach((a) => a.classList.toggle('is-active', a.hash === '#' + cur?.id));
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
    if (matchMedia('(max-width: 1299px)').matches && tocLinks.length > 5) $('.toc details')?.removeAttribute('open');
  }

  // ---------- heading anchors copy their link ----------
  $$('.anchor').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    history.replaceState(null, '', a.hash);
    a.parentElement.scrollIntoView({ behavior: 'smooth' });
    copy(location.href, 'Link to section copied');
  }));

  // ---------- copy buttons (code, BibTeX) ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy], [data-copy-text]');
    if (!b) return;
    if (b.dataset.copyText) return copy(b.dataset.copyText, 'BibTeX copied');
    copy(b.closest('.code').querySelector('code').innerText, 'Code copied');
  });

  // ---------- sidenotes: light up the pair you're pointing at ----------
  $$('.sn-ref').forEach((ref) => {
    const note = ref.nextElementSibling?.nextElementSibling;
    if (!note) return;
    const on = (v) => { ref.classList.toggle('is-lit', v); note.classList.toggle('is-lit', v); };
    [ref, note].forEach((n) => { n.addEventListener('mouseenter', () => on(true)); n.addEventListener('mouseleave', () => on(false)); });
  });

  // ---------- conference calendar: countdowns, filters, day highlights ----------
  const confs = $('.confs');
  if (confs) {
    // A deadline "anywhere on earth" ends at 23:59 in UTC-12.
    const OFFSETS = { AoE: -12, UTC: 0, PT: -7, PST: -8, PDT: -7, ET: -4, EST: -5, EDT: -4, CET: 1, CEST: 2 };
    const end = (d, tz) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 23, 59, 59) - (OFFSETS[tz] ?? -12) * 3600e3;
    $$('.agenda--next [data-deadline]', confs).forEach((li) => {
      const days = Math.ceil((end(li.dataset.deadline, li.dataset.tz) - Date.now()) / 86400e3);
      if (days < 0) li.classList.add('is-closed');
      $('.ag__body', li).append(el('span', { className: 'cd',
        textContent: days < 0 ? 'closed' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days` }));
    });
    $$('.ag[data-deadline]', confs).forEach((li) => {
      if (end(li.dataset.deadline, li.dataset.tz) < Date.now()) li.classList.add('is-closed');
    });

    const cells = (li) => li.dataset.days.split(' ').map((d) => $(`.mini [data-day="${d}"]`, confs)).filter(Boolean);
    confs.addEventListener('mouseover', (e) => { const li = e.target.closest('.ag'); if (li) cells(li).forEach((c) => c.classList.add('is-hl')); });
    confs.addEventListener('mouseout', (e) => { const li = e.target.closest('.ag'); if (li) cells(li).forEach((c) => c.classList.remove('is-hl')); });

    const text = $('[data-filter-text]', confs);
    const params = new URLSearchParams(location.search);
    let field = params.get('field') || '';
    let kind = params.get('kind') || '';
    const groups = { field: $('[data-filter-field]', confs), kind: $('[data-filter-kind]', confs) };
    const apply = () => {
      const q = text.value.trim().toLowerCase();
      const match = (r) => (!field || r.dataset.field.split(' ').includes(field)) && (!kind || r.dataset.kind === kind) &&
        (!q || !r.dataset.text || r.dataset.text.includes(q));
      let shown = 0;
      $$('.ag', confs).forEach((r) => { r.hidden = !match(r); if (!r.hidden && !r.closest('.agenda--next')) shown++; });
      $$('.venues li', confs).forEach((r) => (r.hidden = !match(r)));
      // Redraw the marks in each small month from what is still listed.
      $$('.mini .d', confs).forEach((c) => c.classList.remove('has-dl', 'has-ev', 'has-nt'));
      $$('.cn-month .ag:not([hidden])', confs).forEach((li) => {
        const mark = li.classList.contains('ag--dl') ? 'has-dl' : li.classList.contains('ag--ev') ? 'has-ev' : 'has-nt';
        cells(li).forEach((c) => c.classList.add(mark));
      });
      $$('.cn-month', confs).forEach((m) => m.classList.toggle('is-empty', !$$('.ag:not([hidden])', m).length));
      $('[data-empty]', confs).hidden = shown > 0;
      $$('.chip', groups.field).forEach((c) => c.classList.toggle('is-on', c.dataset.v === field));
      $$('.chip', groups.kind).forEach((c) => c.classList.toggle('is-on', c.dataset.v === kind));
      const u = new URL(location.href);
      field ? u.searchParams.set('field', field) : u.searchParams.delete('field');
      kind ? u.searchParams.set('kind', kind) : u.searchParams.delete('kind');
      history.replaceState(null, '', u);
    };
    groups.field.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { field = c.dataset.v; apply(); } });
    groups.kind.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { kind = c.dataset.v; apply(); } });
    text.addEventListener('input', apply);
    apply();
  }

  // ---------- writing archive filters ----------
  const archive = $('.archive');
  if (archive) {
    const text = $('[data-filter-text]');
    const params = new URLSearchParams(location.search);
    let status = params.get('status') || '';
    let tag = params.get('tag') || '';
    const groups = { status: $('[data-filter-status]'), tag: $('[data-filter-tag]') };
    const apply = () => {
      const q = text.value.trim().toLowerCase();
      let shown = 0;
      $$('.row', archive).forEach((r) => {
        const ok = (!status || r.dataset.status === status) &&
          (!tag || r.dataset.tags.split(' ').includes(tag)) &&
          (!q || r.dataset.text.includes(q));
        r.hidden = !ok;
        if (ok) shown++;
      });
      $$('[data-year]', archive).forEach((y) => (y.hidden = !$$('.row:not([hidden])', y).length));
      $('[data-empty]', archive).hidden = shown > 0;
      groups.status && $$('.chip', groups.status).forEach((c) => c.classList.toggle('is-on', c.dataset.v === status));
      groups.tag && $$('.chip', groups.tag).forEach((c) => c.classList.toggle('is-on', c.dataset.v === tag));
      const u = new URL(location.href);
      status ? u.searchParams.set('status', status) : u.searchParams.delete('status');
      tag ? u.searchParams.set('tag', tag) : u.searchParams.delete('tag');
      history.replaceState(null, '', u);
    };
    groups.status?.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { status = c.dataset.v; apply(); } });
    groups.tag?.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { tag = tag === c.dataset.v ? '' : c.dataset.v; apply(); } });
    text.addEventListener('input', apply);
    apply();
  }

  // ---------- search index (shared by palette + previews) ----------
  let indexP;
  const loadIndex = () => (indexP ||= fetch('/search.json').then((r) => r.json()).catch(() => []));

  // ---------- link previews ----------
  if (matchMedia('(hover: hover)').matches) {
    let card, timer, current;
    const hide = () => { clearTimeout(timer); card?.classList.remove('is-on'); current = null; };
    document.addEventListener('mouseover', (e) => {
      const a = e.target.closest('a[href^="/writing/"]');
      if (!a || a === current || a.closest('.top, .toc, .sheet, .toclist, .post-foot')) return;
      const path = new URL(a.href).pathname;
      if (path === '/writing/' || path === location.pathname) return;
      current = a;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const item = (await loadIndex()).find((i) => i.url === path);
        if (!item || current !== a) return;
        card ||= document.body.appendChild(el('div', { className: 'preview', role: 'tooltip' }));
        card.innerHTML = '';
        card.append(
          el('div', { className: 'preview__meta' },
            el('span', { textContent: [item.date, item.statusLabel, `${item.minutes} min`].filter(Boolean).join(' · ') })),
          el('div', { className: 'preview__title', textContent: item.title }),
          item.summary ? el('p', { className: 'preview__summary', textContent: item.summary }) : null);
        const r = a.getBoundingClientRect();
        const w = Math.min(352, innerWidth - 32);
        card.style.left = `${Math.max(16, Math.min(r.left + scrollX, scrollX + innerWidth - w - 16))}px`;
        card.style.top = `${r.bottom + scrollY + 10}px`;
        card.classList.add('is-on');
      }, 280);
    });
    document.addEventListener('mouseout', (e) => { if (current && !current.contains(e.relatedTarget)) hide(); });
    addEventListener('scroll', hide, { passive: true });
  }

  // ---------- the vault door ----------
  const openVault = (route = '') => {
    if (window.__vault) return window.__vault.open(route);
    window.__vaultRoute = route;
    if (!$('link[data-vault-css]')) {
      const l = el('link', { rel: 'stylesheet', href: me.dataset.vaultCss });
      l.dataset.vaultCss = '';
      document.head.append(l);
    }
    document.head.append(el('script', { src: me.dataset.vault }));
  };
  window.__openVault = openVault;
  // your name in the corner is a link home, and a double-click on it opens the vault
  $$('[data-door]').forEach((door) => {
    let tapTimer = null;
    door.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; openVault(); return; }
      tapTimer = setTimeout(() => { tapTimer = null; if (door.href) location.href = door.href; }, 320);
    });
  });
  const fromHash = () => { if (location.hash.startsWith('#vault')) openVault(location.hash.slice(1)); };
  fromHash();
  addEventListener('hashchange', fromHash);

  // ---------- command palette ----------
  let pal, input, list, items = [], active = 0;
  const PAGE_ICON = ICON('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>');
  const ACTIONS = () => [
    { kind: 'action', title: darkNow() ? 'Switch to light mode' : 'Switch to dark mode', ico: '◐', run: toggleTheme, keys: 'theme dark light mode' },
    { kind: 'action', title: 'Use the system theme', ico: '◑', run: () => setTheme(null), keys: 'theme system auto' },
    { kind: 'action', title: 'Copy link to this page', ico: ICON('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'), run: () => copy(location.href, 'Link copied'), keys: 'copy link share url' },
    { kind: 'action', title: 'Subscribe with RSS', ico: ICON('<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>'), url: '/feed.xml', keys: 'rss feed subscribe' },
    { kind: 'action', title: 'Keyboard shortcuts', ico: '⌨', run: () => setTimeout(showKeys, 50), keys: 'keyboard shortcuts help keys' },
  ];
  const norm = (s) => (s || '').toLowerCase();
  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hl = (s, q) => {
    if (!q) return escH(s);
    const i = norm(s).indexOf(q);
    return i < 0 ? escH(s) : escH(s.slice(0, i)) + '<mark>' + escH(s.slice(i, i + q.length)) + '</mark>' + escH(s.slice(i + q.length));
  };
  const snippet = (text, q) => {
    const i = norm(text).indexOf(q);
    if (i < 0) return '';
    const start = Math.max(0, i - 40);
    return (start ? '…' : '') + text.slice(start, i + q.length + 70);
  };

  async function search(q) {
    const idx = await loadIndex();
    q = norm(q.trim());
    const out = [];
    if (!q) {
      out.push(...idx.filter((i) => i.kind === 'post').slice(0, 5).map((i) => ({ ...i, group: 'Recent writing' })));
      out.push(...idx.filter((i) => i.kind === 'page').map((i) => ({ ...i, group: 'Pages' })));
      out.push(...ACTIONS().slice(0, 2).map((a) => ({ ...a, group: 'Actions' })));
      return out;
    }
    if (q === 'vault' || q === 'open vault') {
      out.push({ kind: 'action', group: 'Private', title: 'Open the vault', ico: '', run: () => openVault() });
    }
    const scored = [];
    for (const i of idx) {
      const t = norm(i.title);
      let s = 0, snip = '', url = i.url;
      if (t === q) s = 100;
      else if (t.startsWith(q)) s = 80;
      else if (t.split(/\W+/).some((w) => w.startsWith(q))) s = 60;
      else if (t.includes(q)) s = 50;
      const h = (i.headings || []).find((x) => norm(x.text).includes(q));
      if (!s && h) { s = 40; snip = '§ ' + h.text; url = `${i.url}#${h.id}`; }
      if (!s && (norm(i.summary).includes(q) || (i.tags || []).some((tg) => tg.includes(q)))) { s = 30; snip = i.summary; }
      if (!s && norm(i.text).includes(q)) { s = 20; snip = snippet(i.text, q); }
      if (s) scored.push({ ...i, url, s, snip: snip || i.summary });
    }
    scored.sort((a, b) => b.s - a.s);
    const label = { post: 'Writing', page: 'Pages', paper: 'Papers' };
    for (const k of ['post', 'paper', 'page']) out.push(...scored.filter((r) => r.kind === k).slice(0, 8).map((r) => ({ ...r, group: label[k] })));
    out.push(...ACTIONS().filter((a) => norm(a.title + ' ' + a.keys).includes(q)).map((a) => ({ ...a, group: 'Actions' })));
    return out;
  }

  function render(results, q) {
    items = results;
    active = 0;
    list.innerHTML = '';
    if (!results.length) {
      list.append(el('li', { className: 'palette__empty', textContent: `Nothing found for “${q}”. Nothing follows.` }));
      return;
    }
    let group = '';
    const nq = norm(q.trim());
    results.forEach((r, n) => {
      if (r.group !== group) { group = r.group; list.append(el('li', { className: 'palette__group', textContent: group, role: 'presentation' })); }
      const ico = r.kind === 'post' ? (r.mark || '¶') : r.kind === 'paper' ? '§' : r.kind === 'page' ? PAGE_ICON : r.ico;
      const li = el('li', { className: 'palette__item', role: 'option', id: `pi-${n}` });
      const snip = r.snip || r.summary;
      li.innerHTML = `<span class="palette__ico">${ico}</span><span><div class="palette__title">${hl(r.title, nq)}</div>${snip ? `<div class="palette__snip">${hl(snip, nq)}</div>` : ''}</span><span class="palette__hint">${r.kind === 'action' ? 'Run' : r.kind === 'paper' ? 'Paper' : r.minutes ? r.minutes + ' min' : ''}</span>`;
      li.addEventListener('mousemove', () => setActive(n));
      li.addEventListener('click', () => choose(n));
      list.append(li);
    });
    setActive(0);
  }
  function setActive(n) {
    const opts = $$('.palette__item', list);
    if (!opts.length) return;
    active = (n + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('is-active', i === active));
    opts[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[active].id);
  }
  function choose(n) {
    const r = items[n];
    if (!r) return;
    pal.close();
    if (r.run) r.run();
    else if (r.url) location.href = r.url;
  }
  function buildPalette() {
    input = el('input', { type: 'text', placeholder: 'Search writing, papers, pages…', autocomplete: 'off', spellcheck: false });
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', 'palette-list');
    input.setAttribute('aria-label', 'Search');
    list = el('ul', { className: 'palette__results', id: 'palette-list', role: 'listbox' });
    const field = el('label', { className: 'palette__field' });
    field.innerHTML = ICON('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
    field.append(input);
    const foot = el('div', { className: 'palette__foot' });
    foot.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>';
    pal = el('dialog', { className: 'sheet palette' }, field, list, foot);
    pal.setAttribute('aria-label', 'Search');
    document.body.append(pal);
    let seq = 0;
    input.addEventListener('input', async () => { const my = ++seq; const r = await search(input.value); if (my === seq) render(r, input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    });
    pal.addEventListener('click', (e) => { if (e.target === pal) pal.close(); });
  }
  async function openPalette(prefill = '') {
    if (!pal) buildPalette();
    if (pal.open) return;
    input.value = prefill;
    pal.showModal();
    input.focus();
    render(await search(prefill), prefill);
  }
  window.__openPalette = openPalette;
  $$('[data-palette]').forEach((b) => b.addEventListener('click', () => openPalette()));

  // ---------- keyboard shortcuts ----------
  let keys;
  function showKeys() {
    if (!keys) {
      const row = (k, d) => `<dt>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</dt><dd>${d}</dd>`;
      keys = el('dialog', { className: 'sheet' });
      keys.innerHTML = `<div class="keys"><h2>Getting around</h2><dl>
        ${row(isMac ? '⌘ K' : 'Ctrl K', 'Search everything')}
        ${row('/', 'Search, too')}
        ${row('g h', 'Go home')}
        ${row('g w', 'Go to writing')}
        ${row('g r', 'Go to research')}
        ${row('g a', 'Go to about')}
        ${row('j k', 'Next or previous section of a piece')}
        ${row('t', 'Switch light and dark')}
        ${row('?', 'This list')}
        ${row('esc', 'Close whatever is open')}
      </dl></div>`;
      keys.addEventListener('click', (e) => { if (e.target === keys) keys.close(); });
      document.body.append(keys);
    }
    if (!keys.open) keys.showModal();
  }

  let gPending = 0;
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === '/') { e.preventDefault(); return openPalette(); }
    if (k === '?') { e.preventDefault(); return showKeys(); }
    if (k === 't') return toggleTheme();
    if (k === 'g') { gPending = Date.now(); return; }
    if (Date.now() - gPending < 900) {
      gPending = 0;
      const go = { h: '/', w: '/writing/', r: '/research/', a: '/about/' }[k];
      if (go) location.href = go;
      return;
    }
    if ((k === 'j' || k === 'k') && prose) {
      const hs = $$('.prose h2, .prose h3');
      if (!hs.length) return;
      const y = 90;
      const next = k === 'j'
        ? hs.find((h) => h.getBoundingClientRect().top > y + 4)
        : [...hs].reverse().find((h) => h.getBoundingClientRect().top < y - 4);
      if (next) next.scrollIntoView({ behavior: 'smooth' });
      else if (k === 'k') scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
