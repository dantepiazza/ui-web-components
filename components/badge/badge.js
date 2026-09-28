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
 * `<ui-badge variant="success">` — small status/count indicator. Purely presentational.
 */
export class UiBadge extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'neutral';
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
      <span class="${window.__uiwc.prefix}-badge inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${variantClass}">
        ${unsafeHTML(this._content || '')}
      </span>
    `;
  }
}

window.__uiwc.register('badge', UiBadge);
