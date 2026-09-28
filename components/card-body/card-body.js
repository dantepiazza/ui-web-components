window.__uiwc = window.__uiwc || { prefix: 'ui' };

const PADDING = { none: 'p-0', sm: 'p-3', md: 'p-5', lg: 'p-7' };

/**
 * `<ui-card-body padding="md">` — the main section of a `<ui-card>`.
 * Supports reactive `padding` attribute (none, sm, md, lg). Defaults to "md" (p-5).
 */
export class UiCardBody extends HTMLElement {
  static get observedAttributes() {
    return ['padding', 'remove-class'];
  }

  connectedCallback() {
    if (!this._built) this._built = true;
    this.#applyClasses();
  }

  attributeChangedCallback() {
    if (this._built) this.#applyClasses();
  }

  #applyClasses() {
    const padding = PADDING[this.getAttribute('padding')] || PADDING.md;
    const wanted = `${window.__uiwc.prefix}-card-body block ${padding}`.split(/\s+/).filter(Boolean);
    const next = window.__uiwc.classes(wanted, this);

    if (this._ownClasses) this.classList.remove(...this._ownClasses);
    this.classList.add(...next);
    this._ownClasses = next;
  }
}

window.__uiwc.register('card-body', UiCardBody);