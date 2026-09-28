window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-rail-last>` — the group pinned to the end of `<ui-rail>` (bottom on desktop,
 * right on mobile). Put icon-only `<ui-button>`s inside.
 */
export class UiRailLast extends HTMLElement {
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
      `${window.__uiwc.prefix}-rail-last`,
      'mt-auto', 'flex', 'flex-col', 'items-center', 'gap-2',
      'max-[768px]:mt-0', 'max-[768px]:ml-auto', 'max-[768px]:flex-row',
    ]);
  }
}

window.__uiwc.register('rail-last', UiRailLast);
