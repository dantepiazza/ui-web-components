// Shared behavior across the doc site. Loaded by both docs/index.html (the shell)
// and every component page (rendered inside the shell's iframe) — each block only
// does something if its target elements exist in the current document.

// Framework tabs (Angular/Livewire) inside a component page.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-framework-tab]');
  if (!btn) return;
  const group = btn.closest('.doc-framework-tabs');
  const framework = btn.dataset.frameworkTab;

  group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));

  const panelWrap = group.nextElementSibling;
  panelWrap.querySelectorAll('[data-framework-panel]').forEach((p) => {
    p.hidden = p.dataset.frameworkPanel !== framework;
  });
});

// Sidebar nav active-state, in the shell (docs/index.html) only.
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-nav]');
  if (!link) return;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a === link));
});

// ── Dark-mode toggle for the doc site (shell + every component iframe) ───────────
// Persisted in localStorage under the same `uiwc-theme` key the library's
// `ui-theme-toggle` uses; the `storage` event keeps the shell and the iframe in sync.
(function () {
  const KEY = 'uiwc-theme';
  const root = document.documentElement;
  const read = () => {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  };

  function paint(dark, animate) {
    if (animate) {
      root.classList.add('uiwc-theme-switching');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('uiwc-theme-switching')));
    }
    root.classList.toggle('dark', dark);
    void root.offsetHeight;
  }

  paint(read() === 'dark', false);

  function toggle() {
    const dark = !root.classList.contains('dark');
    paint(dark, true);
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  }

  // Sync when the *other* document (shell ↔ iframe) changes the preference.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) paint(e.newValue === 'dark', true);
  });

  // Floating button — only in the top-level shell, not inside the iframe.
  if (window.top === window) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Cambiar tema');
    btn.className = 'doc-theme-toggle';
    btn.textContent = '◐';
    btn.addEventListener('click', toggle);
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
    if (document.readyState !== 'loading') document.body.appendChild(btn);
  }
})();
