import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-radio-group name="plan" value="pro">` — wraps `<ui-radio>` children, assigning
 * them all the same `name` and syncing which one is checked from `value`. Emits
 * `ui-radio-group-change` with `{ value }` when the selection changes.
 */
export class UiRadioGroup extends LitElement {
  static properties = {
    name: { type: String },
    value: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.name = '';
    this.value = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
    this.addEventListener('change', this.#handleChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('change', this.#handleChange);
  }

  #handleChange = (e) => {
    const radio = e.target.closest(`${window.__uiwc.prefix}-radio`);
    if (!radio) return;
    this.value = radio.value;
    this.dispatchEvent(new CustomEvent('ui-radio-group-change', { bubbles: true, composed: true, detail: { value: this.value } }));
  };

  updated() {
    this.querySelectorAll(`${window.__uiwc.prefix}-radio`).forEach((radio) => {
      radio.name = this.name;
      radio.checked = radio.value === this.value;
    });
  }

  render() {
    return html`<div class="${window.__uiwc.prefix}-radio-group flex flex-col gap-2" role="radiogroup">${unsafeHTML(this._content || '')}</div>`;
  }
}

window.__uiwc.register('radio-group', UiRadioGroup);
