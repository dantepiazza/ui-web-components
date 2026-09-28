import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  neutral: 'bg-base-50 text-base-900',
  primary: 'bg-base-100 text-base-800',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  pink: 'bg-pink-100 text-pink-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  cyan: 'bg-cyan-100 text-cyan-700',
};

/**
 * `<ui-chip icon="star" avatar="DP" removable variant="primary">` — pill with an
 * optional leading icon or avatar (initials), and an optional dismiss control.
 * Emits `ui-chip-remove` when dismissed. `icon` and `avatar` are mutually exclusive;
 * `avatar` wins if both are set.
 */
export class UiChip extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    icon: { type: String },
    avatar: { type: String },
    removable: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'neutral';
    this.icon = '';
    this.avatar = '';
    this.removable = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  #handleRemove() {
    this.dispatchEvent(new CustomEvent('ui-chip-remove', { bubbles: true, composed: true }));
  }

  render() {
    const variantClass = VARIANTS[this.variant] || VARIANTS.neutral;

    return html`
      <span class="${window.__uiwc.prefix}-chip inline-flex items-center gap-1.5 rounded-full ${this.avatar ? 'pl-1' : 'pl-2.5'} pr-2.5 py-1 text-xs font-medium ${variantClass} ${this.removable ? 'pr-1.5' : ''}">
        ${this.avatar
          ? html`<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-base-900 text-[10px] font-semibold text-white">${this.avatar}</span>`
          : this.icon
            ? html`<uiwc-icon name=${this.icon} size="sm"></uiwc-icon>`
            : ''}
        ${unsafeHTML(this._content || '')}
        ${this.removable
          ? html`
              <button
                type="button"
                class="rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Quitar"
                @click=${this.#handleRemove}
              >
                <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            `
          : ''}
      </span>
    `;
  }
}

window.__uiwc.register('chip', UiChip);
