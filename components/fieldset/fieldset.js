import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-fieldset legend="Datos de facturación">...</ui-fieldset>` — groups related form
 * controls under a titled panel, using a real `<fieldset>`/`<legend>` pair.
 */
export class UiFieldset extends LitElement {
  static properties = {
    legend: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.legend = '';
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
      <fieldset class="${window.__uiwc.prefix}-fieldset rounded border border-base-200 p-5">
        ${this.legend ? html`<legend class="px-1.5 text-sm font-semibold text-base-900">${this.legend}</legend>` : ''}
        <div class="mt-2 flex flex-col gap-3">${unsafeHTML(this._content || '')}</div>
      </fieldset>
    `;
  }
}

window.__uiwc.register('fieldset', UiFieldset);
