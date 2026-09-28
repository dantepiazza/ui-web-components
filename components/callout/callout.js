import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  info: { box: 'bg-base-100 border-base-200 text-base-900', icon: 'info', iconClass: 'text-base-900' },
  success: { box: 'bg-success/15 border-success/25 text-success', icon: 'check', iconClass: 'text-success' },
  warning: { box: 'bg-warning/15 border-warning/25 text-warning', icon: 'info', iconClass: 'text-warning' },
  danger: { box: 'bg-danger/15 border-danger/25 text-danger', icon: 'x', iconClass: 'text-danger' },
};

/**
 * `<ui-callout variant="warning" title="Atención" dismissible>` — inline message box.
 * Emits `ui-callout-dismiss` when the close button is clicked.
 */
export class UiCallout extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    title: { type: String },
    dismissible: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'info';
    this.title = '';
    this.dismissible = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  #handleDismiss() {
    this.dispatchEvent(new CustomEvent('ui-callout-dismiss', { bubbles: true, composed: true }));
  }

  render() {
    const cfg = VARIANTS[this.variant] || VARIANTS.info;
    const role = this.variant === 'danger' || this.variant === 'warning' ? 'alert' : 'status';

    return html`
      <div class="${window.__uiwc.prefix}-callout flex gap-3 rounded border p-4 text-sm ${cfg.box}" role=${role}>
        <uiwc-icon name=${cfg.icon} class="${cfg.iconClass} shrink-0 mt-0.5"></uiwc-icon>
        <div class="flex-1">
          ${this.title ? html`<div class="font-semibold mb-0.5">${this.title}</div>` : ''}
          <div>${unsafeHTML(this._content || '')}</div>
        </div>
        ${this.dismissible
          ? html`
              <button
                type="button"
                class="shrink-0 self-start rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Cerrar"
                @click=${this.#handleDismiss}
              >
                <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('callout', UiCallout);
