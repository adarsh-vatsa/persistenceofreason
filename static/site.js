// The only JavaScript on the site: press "?" for the colophon.
(() => {
  const dlg = document.getElementById('colophon');
  if (!dlg) return;

  const toggle = () => (dlg.open ? dlg.close() : dlg.showModal());

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggle();
    }
  });

  document.querySelectorAll('[data-colophon]').forEach((b) => b.addEventListener('click', toggle));

  // click outside the card closes it
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
})();

(() => {
  const openVault = () => {
    if (window.__vault) return window.__vault.open();
    document.head.append(Object.assign(document.createElement('script'), { src: '/vault.js' }));
  };

  // double-tap the ∴
  const door = document.querySelector('.logo');
  let last = 0;
  door?.addEventListener('click', () => {
    const now = Date.now();
    if (now - last < 600) { last = 0; openVault(); } else last = now;
  });

  // or go straight to /#vault (bookmarkable)
  const fromHash = () => {
    if (location.hash !== '#vault') return;
    history.replaceState(null, '', location.pathname + location.search); // so the link works again
    openVault();
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
})();
