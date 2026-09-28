window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-rail-first>` — the group pinned to the start of `<ui-rail>` (top on desktop,
 * left on mobile). Put icon-only `<ui-button>`s inside.
 */
export class UiRailFirst extends HTMLElement {
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
      `${window.__uiwc.prefix}-rail-first`,
      'flex', 'flex-col', 'items-center', 'gap-2', 'max-[768px]:flex-row',
    ]);
  }
}

window.__uiwc.register('rail-first', UiRailFirst);
