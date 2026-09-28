import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  neutral: 'bg-base-50 text-base-900 hover:bg-base-200',
  primary: 'bg-base-100 text-base-800 hover:bg-base-200',
  success: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  warning: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  danger: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
  info: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  pink: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  indigo: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
  cyan: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200',
};

/**
 * `<ui-tag variant="primary" removable>` — like a badge, with an optional dismiss control.
 * Emits `ui-tag-remove` (bubbles, composed) when the remove button is clicked.
 */
export class UiTag extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    removable: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'neutral';
    this.removable = false;
  }

  #handleRemove() {
    this.dispatchEvent(new CustomEvent('ui-tag-remove', { bubbles: true, composed: true }));
  }

  // Light DOM has no shadow root, so <slot> can't project children — capture the
  // author-provided markup once and re-inject it with unsafeHTML instead.
  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const variantClass = VARIANTS[this.variant] || VARIANTS.neutral;

    return html`
      <span class="${window.__uiwc.prefix}-tag inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${variantClass}">
        ${unsafeHTML(this._content || '')}
        ${this.removable
          ? html`
              <button
                type="button"
                class="-mr-0.5 ml-0.5 rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
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

window.__uiwc.register('tag', UiTag);
