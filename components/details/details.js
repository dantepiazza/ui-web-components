import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-details summary="Ver más">contenido</ui-details>` — styled wrapper around a
 * native `<details>`/`<summary>`, so expand/collapse is handled by the browser with
 * zero JS. Emits native `toggle` (bubbles) from the inner `<details>`.
 */
export class UiDetails extends LitElement {
  static properties = {
    summary: { type: String },
    open: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.summary = '';
    this.open = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    return html`
      <details class="${window.__uiwc.prefix}-details rounded border border-base-200" ?open=${this.open} @toggle=${(e) => (this.open = e.target.open)}>
        <summary class="cursor-pointer select-none list-none px-4 py-3 text-sm font-medium text-base-900 [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
          ${this.summary}
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? 'rotate-180' : ''}"></uiwc-icon>
        </summary>
        <div class="px-4 pb-4 text-sm text-base-500">${unsafeHTML(this._content || '')}</div>
      </details>
    `;
  }
}

window.__uiwc.register('details', UiDetails);
