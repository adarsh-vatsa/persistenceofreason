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
  const door = document.querySelector('.squiggle');
  if (!door) return;
  let taps = [];
  door.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 2500).concat(now);
    if (taps.length < 5) return;
    taps = [];
    if (window.__vault) return window.__vault.open();
    document.head.append(Object.assign(document.createElement('script'), { src: '/vault.js' }));
  });
})();
