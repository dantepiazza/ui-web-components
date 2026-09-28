import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-color-picker label="Color de marca" value="#18181b">` — native color swatch
 * paired with a synced hex text input. Emits `ui-input` with `{ value }`.
 */
export class UiColorPicker extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = '#18181b';
    this.disabled = false;
    this.name = '';
    this._id = `ui-color-picker-${++idCounter}`;
  }

  #setValue(next) {
    if (!/^#[0-9a-fA-F]{6}$/.test(next)) return;
    this.value = next;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-color-picker flex flex-col gap-1.5">
        ${this.label ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ''}
        <div class="inline-flex items-center gap-2">
          <input
            id=${this._id}
            type="color"
            class="h-9 w-9 cursor-pointer rounded border border-base-300 p-1 disabled:opacity-60"
            name=${this.name || ''}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${(e) => this.#setValue(e.target.value)}
          />
          <input
            type="text"
            class="w-28 rounded border border-base-300 px-2.5 py-1.5 text-sm uppercase text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
            .value=${this.value}
            ?disabled=${this.disabled}
            aria-label="Valor hexadecimal"
            @change=${(e) => this.#setValue(e.target.value)}
          />
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('color-picker', UiColorPicker);
