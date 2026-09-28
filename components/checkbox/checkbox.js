import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-checkbox name="tos" checked>Acepto los términos</ui-checkbox>` — wraps a real
 * `<input type="checkbox">` so keyboard and form semantics work natively.
 * Emits native `change`/`input` events from the inner control (bubbles).
 */
export class UiCheckbox extends LitElement {
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
    this.value = 'on';
    this._id = `ui-checkbox-${++idCounter}`;
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
      <label class="${window.__uiwc.prefix}-checkbox inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled ? 'opacity-50' : 'cursor-pointer'}" for=${this._id}>
        <span class="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${this.checked ? 'border-brand-900 bg-brand-900' : 'border-base-300 bg-surface'}">
          <input
            id=${this._id}
            type="checkbox"
            class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            name=${this.name || ''}
            value=${this.value}
            .checked=${this.checked}
            ?disabled=${this.disabled}
            @change=${this.#handleChange}
          />
          <svg
            viewBox="0 0 24 24"
            class="pointer-events-none h-3 w-3 text-brand-fg ${this.checked ? '' : 'opacity-0'}"
            fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
          ><path d="M20 6 9 17l-5-5" /></svg>
          <span class="pointer-events-none absolute inset-0 rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900"></span>
        </span>
        <span>${unsafeHTML(this._content || '')}</span>
      </label>
    `;
  }
}

window.__uiwc.register('checkbox', UiCheckbox);
