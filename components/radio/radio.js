import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-radio name="plan" value="pro">Plan Pro</ui-radio>` — wraps a real
 * `<input type="radio">`. Group several under `<ui-radio-group name="plan">` to have
 * the group manage `name` and emit a single change event for the selected value.
 */
export class UiRadio extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
    value: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.name = '';
    this.value = '';
    this._id = `ui-radio-${++idCounter}`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  #handleChange(e) {
    this.checked = e.target.checked;
  }

  render() {
    return html`
      <label class="${window.__uiwc.prefix}-radio inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled ? 'opacity-50' : 'cursor-pointer'}" for=${this._id}>
        <span class="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${this.checked ? 'border-brand-900' : 'border-base-300'}">
          <input
            id=${this._id}
            type="radio"
            class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            name=${this.name || ''}
            value=${this.value}
            .checked=${this.checked}
            ?disabled=${this.disabled}
            @change=${this.#handleChange}
          />
          <span class="pointer-events-none h-2.5 w-2.5 rounded-full bg-brand-900 transition-transform ${this.checked ? 'scale-100' : 'scale-0'}"></span>
          <span class="pointer-events-none absolute inset-0 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900"></span>
        </span>
        <span>${unsafeHTML(this._content || '')}</span>
      </label>
    `;
  }
}

window.__uiwc.register('radio', UiRadio);
