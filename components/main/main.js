window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-main>` — the content column of the app shell: put a `<ui-topbar>` as its first
 * child (sticky, scrolls with the rest) followed by your page content. Pairs with
 * `<ui-sidebar>` — wrap both in a plain `<div class="flex h-screen">` and flexbox
 * handles the side-by-side layout, no fixed positioning or CSS variables needed:
 * ```html
 * <div class="flex h-screen overflow-hidden">
 *   <ui-sidebar>...</ui-sidebar>
 *   <ui-main>
 *     <ui-topbar heading="..."></ui-topbar>
 *     <div class="p-6">...page content...</div>
 *   </ui-main>
 * </div>
 * ```
 * No wrapper `<div>`: styles itself directly. `remove-class="overflow-y-auto"` strips
 * any of its own classes — see `window.__uiwc.classes()` in the core banner.
 */
export class UiMain extends HTMLElement {
  static get observedAttributes() {
    return ['remove-class'];
  }

  connectedCallback() {
    if (!this._built) this._built = true;
    this.#applyClasses();
  }

  attributeChangedCallback() {
    if (this._built) this.#applyClasses();
  }

  #applyClasses() {
    window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-main`, 'flex', 'min-w-0', 'flex-1', 'flex-col', 'overflow-y-auto']);
  }
}

window.__uiwc.register('main', UiMain);
