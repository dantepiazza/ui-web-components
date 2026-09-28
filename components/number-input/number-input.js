import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-number-input label="Cantidad" value="1" min="0" max="10">` — number field with
 * +/- stepper buttons, on top of a real `<input type="number">`.
 * Emits `ui-input` with `{ value }`.
 */
export class UiNumberInput extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = 0;
    this.min = -Infinity;
    this.max = Infinity;
    this.step = 1;
    this.disabled = false;
    this.name = '';
    this._id = `ui-number-input-${++idCounter}`;
  }

  #setValue(next) {
    const clamped = Math.min(this.max, Math.max(this.min, next));
    if (clamped === this.value) return;
    this.value = clamped;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  #handleInput(e) {
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) this.#setValue(next);
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-number-input flex flex-col gap-1.5">
        ${this.label ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ''}
        <div class="inline-flex items-stretch divide-x divide-base-300 rounded border border-base-300 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900">
          <button
            type="button"
            class="px-2.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Restar"
            ?disabled=${this.disabled || this.value <= this.min}
            @click=${() => this.#setValue(this.value - this.step)}
          >
            −
          </button>
          <input
            id=${this._id}
            type="number"
            class="w-14 border-0 bg-surface text-center text-sm text-base-900 focus:outline-none disabled:bg-base-50 disabled:opacity-60"
            name=${this.name || ''}
            .value=${String(this.value)}
            min=${this.min === -Infinity ? undefined : this.min}
            max=${this.max === Infinity ? undefined : this.max}
            step=${this.step}
            ?disabled=${this.disabled}
            @input=${this.#handleInput}
          />
          <button
            type="button"
            class="px-2.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Sumar"
            ?disabled=${this.disabled || this.value >= this.max}
            @click=${() => this.#setValue(this.value + this.step)}
          >
            +
          </button>
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('number-input', UiNumberInput);
