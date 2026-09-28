window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<button ui-theme-toggle>` — NOT a component: a global attribute, same pattern as
 * `ui-sidebar-toggle` and `ui-tooltip`. Any element, anywhere, with this attribute
 * flips `class="dark"` on the `<html>` element when clicked.
 *
 * The library's colour tokens (`--ui-*`, see the compiled CSS / README) are redefined
 * under `.dark`, so every component re-themes off this one class. The choice is
 * persisted to `localStorage` and re-applied before the first paint on the next load.
 *
 *   <button ui-theme-toggle>🌓</button>
 *
 * Programmatic: `window.__uiwc.themeToggle()` flips it,
 * `window.__uiwc.setTheme('dark' | 'light')` sets it explicitly.
 *
 * Transitions are suppressed for one frame around the switch: Chromium keeps the
 * stale resolved value of a transitioned property whose `rgb(var(--x) / …)` colour
 * changed only because `--x` changed (crbug.com/1226629). If you toggle `.dark`
 * yourself instead of using this, do the same — add a class that sets
 * `transition: none !important`, flip `.dark`, force a reflow, then remove it.
 */
(function () {
  const STORAGE_KEY = 'uiwc-theme';
  const SWITCHING_CLASS = 'uiwc-theme-switching';
  const root = document.documentElement;

  // The rule that kills transitions mid-switch — injected once so it works even
  // with the precompiled CSS (which also ships it) missing or overridden.
  const style = document.createElement('style');
  style.textContent =
    `.${SWITCHING_CLASS} *,.${SWITCHING_CLASS} *::before,.${SWITCHING_CLASS} *::after{transition:none!important}`;
  (document.head || document.documentElement).appendChild(style);

  function setClass(isDark) {
    root.classList.add(SWITCHING_CLASS);
    root.classList.toggle('dark', isDark);
    // Force a style/layout recalc while transitions are off so Chromium re-resolves
    // every `rgb(var(--ui-*) / …)` colour to the new token values.
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  }

  function apply(theme) {
    setClass(theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* storage unavailable (private mode, etc.) — the class still applies */
    }
  }

  function currentTheme() {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }

  window.__uiwc.setTheme = (theme) => apply(theme === 'dark' ? 'dark' : 'light');
  window.__uiwc.themeToggle = () => apply(currentTheme() === 'dark' ? 'light' : 'dark');

  // Restore the saved choice as early as this script runs (before components render,
  // so there's no flash and no stale-transition issue on first paint).
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') root.classList.add('dark');
    else if (saved === 'light') root.classList.remove('dark');
  } catch (e) {
    /* ignore */
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest(`[${window.__uiwc.prefix}-theme-toggle]`)) {
      window.__uiwc.themeToggle();
    }
  });
})();
