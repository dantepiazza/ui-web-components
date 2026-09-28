window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-rail>` — the narrow icon strip next to `<ui-sidebar>` (workspace switcher,
 * theme toggle, logout — one icon-sized control per action). Wraps two children,
 * `<ui-rail-first>` and `<ui-rail-last>`, which split the rail into a group pinned
 * to the start and one pinned to the end.
 *
 * On desktop it's a fixed vertical strip on the left edge. Below 768px it collapses
 * into a horizontal top bar instead — `<ui-rail-first>` becomes the left-aligned
 * group, `<ui-rail-last>` the right-aligned one, same two children, no markup
 * changes needed on your end.
 *
 * No wrapper `<div>`: this element styles itself directly. `remove-class="bg-brand-900"`
 * strips any of its own classes — see `window.__uiwc.classes()` in the core banner.
 */
export class UiRail extends HTMLElement {
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
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-rail`,
      'fixed', 'inset-y-0', 'left-0', 'z-30', 'flex', 'w-16', 'flex-col', 'items-center', 'justify-start',
      'gap-1.5', 'bg-brand-900', 'py-3.5',
      'max-[768px]:static', 'max-[768px]:h-14', 'max-[768px]:w-full', 'max-[768px]:flex-row',
      'max-[768px]:px-3.5', 'max-[768px]:py-0',
    ]);
  }
}

window.__uiwc.register('rail', UiRail);
