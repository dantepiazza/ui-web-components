import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-accordion>` — wraps `<ui-accordion-item>` children as-is (no content
 * capture/reparsing, so nested interactive content keeps working) and, unless
 * `multiple` is set, closes every other item when one opens.
 */
export class UiAccordion extends LitElement {
  static properties = {
    multiple: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.multiple = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add(`${window.__uiwc.prefix}-accordion`, 'block', 'rounded', 'border', 'border-base-200', 'px-4');
    this.addEventListener('ui-accordion-toggle', this.#handleToggle);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('ui-accordion-toggle', this.#handleToggle);
  }

  #handleToggle = (e) => {
    if (this.multiple || !e.detail.open) return;
    this.querySelectorAll(`${window.__uiwc.prefix}-accordion-item`).forEach((item) => {
      if (item !== e.target) item.open = false;
    });
  };

  // No template: this element only coordinates its live ui-accordion-item children,
  // it doesn't own or re-render their DOM.
  render() {
    return html``;
  }
}

window.__uiwc.register('accordion', UiAccordion);
