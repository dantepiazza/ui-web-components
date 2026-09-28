import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-option value="ar">Argentina</ui-option>` — a single row inside
 * `<ui-select>`/`<ui-multiselect>`. Purely presentational; the parent reads `value` and
 * text content via event delegation, since Light DOM can't preserve listeners attached
 * to reparsed markup.
 */
export class UiOption extends LitElement {
  static properties = {
    value: { type: String },
    selected: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.selected = false;
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
      <div class="${window.__uiwc.prefix}-option flex items-center justify-between px-3 py-1.5 text-sm text-base-900 hover:bg-base-50 ${this.selected ? 'bg-base-100 text-base-800' : ''}">
        <span>${unsafeHTML(this._content || '')}</span>
        ${this.selected ? html`<uiwc-icon name="check" size="sm"></uiwc-icon>` : ''}
      </div>
    `;
  }
}

window.__uiwc.register('option', UiOption);
