/**
 * Runtime registration bootstrap. Load this ONE script (deferred, first — script order
 * among deferred scripts is preserved) before any other component `<script>` tag, then
 * call `defineComponents('wc')` to have every component after it register itself as
 * `<wc-button>`, `<wc-badge>`, etc. instead of the `ui-*` default — and its CSS
 * extension class follows the same prefix (`wc-button`, not `ui-button`).
 *
 * Every component file also carries the same idempotent line this sets up, so the
 * library defaults to `ui-*` correctly even if this file is never loaded at all.
 *
 *   <script src=".../dist/register.js" defer></script>
 *   <script>defineComponents('wc');</script>
 *   <script src=".../dist/button.js" defer></script>  <!-- registers as <wc-button> -->
 */
window.__uiwc = window.__uiwc || { prefix: 'ui' };

window.defineComponents = function defineComponents(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('defineComponents(prefix): se espera un string, ej. defineComponents("wc")');
  }
  window.__uiwc.prefix = prefix;
};
