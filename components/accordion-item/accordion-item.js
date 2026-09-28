import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-accordion-item label="Sección 1">contenido</ui-accordion-item>` — collapsible
 * panel. Use standalone or grouped inside `<ui-accordion>` (which coordinates
 * single-open mode across siblings). Emits `ui-accordion-toggle` with `{ open }`.
 */
export class UiAccordionItem extends LitElement {
  static properties = {
    label: { type: String },
    open: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.open = false;
    this._id = `ui-accordion-item-${++idCounter}`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  #toggle() {
    this.open = !this.open;
    this.dispatchEvent(new CustomEvent('ui-accordion-toggle', { bubbles: true, composed: true, detail: { open: this.open } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-accordion-item border-b border-base-200 last:border-b-0">
        <h3>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium text-base-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
            aria-expanded=${this.open}
            aria-controls="${this._id}-panel"
            @click=${this.#toggle}
          >
            ${this.label}
            <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? 'rotate-180' : ''}"></uiwc-icon>
          </button>
        </h3>
        <div id="${this._id}-panel" role="region" ?hidden=${!this.open} class="pb-3 text-sm text-base-500">
          ${unsafeHTML(this._content || '')}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('accordion-item', UiAccordionItem);
