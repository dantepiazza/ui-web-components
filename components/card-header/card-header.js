window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-card-header>` — the top section of a `<ui-card>`, separated from what follows
 * by a thin divider. Purely presentational (title/subtitle/actions, whatever you put
 * inside) — the divider and spacing are automatic. No wrapper `<div>`: styles itself
 * directly, children render exactly as authored.
 *
 * Has its own padding, independent of `<ui-card>`'s own `padding` prop — pair with
 * `<ui-card padding="none">` for a divider that runs edge-to-edge instead of stopping
 * short at the outer card's padding.
 *
 * `remove-class="border-b px-5"` strips any of the classes above — see
 * `window.__uiwc.classes()` in the core banner.
 */
export class UiCardHeader extends HTMLElement {
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
    const wanted = [`${window.__uiwc.prefix}-card-header`, 'block', 'border-b', 'border-base-200', 'px-5', 'py-4'];
    const next = window.__uiwc.classes(wanted, this);

    if (this._ownClasses) this.classList.remove(...this._ownClasses);
    this.classList.add(...next);
    this._ownClasses = next;
  }
}

window.__uiwc.register('card-header', UiCardHeader);
