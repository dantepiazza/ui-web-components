import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-switch checked>Notificaciones por email</ui-switch>` — boolean toggle, built on a
 * real (visually-hidden) `<input type="checkbox">` for native keyboard support.
 * Add `loading` while waiting for an async confirmation (e.g. an AJAX call after
 * toggling) — it shows a small spinner inside the thumb and blocks further input
 * until the response comes back and the consumer clears the prop.
 */
export class UiSwitch extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    name: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.loading = false;
    this.name = '';
    this._id = `ui-switch-${++idCounter}`;
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
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { checked: this.checked } }));
  }

  render() {
    return html`
      <label class="${window.__uiwc.prefix}-switch inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled || this.loading ? 'opacity-50' : 'cursor-pointer'}" for=${this._id}>
        <span class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${this.checked ? 'bg-brand-900' : 'bg-base-300'}">
          <input
            id=${this._id}
            type="checkbox"
            class="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            name=${this.name || ''}
            .checked=${this.checked}
            ?disabled=${this.disabled || this.loading}
            @change=${this.#handleChange}
          />
          <span
            class="pointer-events-none inline-flex h-5 w-5 translate-x-0.5 items-center justify-center rounded-full bg-surface shadow transition-transform peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900 ${this.checked ? 'translate-x-[18px]' : ''}"
          >
            ${this.loading
              ? html`<span class="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-base-300 ${this.checked ? 'border-t-brand-900' : 'border-t-base-500'}"></span>`
              : ''}
          </span>
        </span>
        <span>${unsafeHTML(this._content || '')}</span>
      </label>
    `;
  }
}

window.__uiwc.register('switch', UiSwitch);
