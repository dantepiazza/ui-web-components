import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-slider label="Volumen" value="50" min="0" max="100">` — wraps a native
 * `<input type="range">` for free keyboard support (arrows, Home/End, PageUp/Down).
 * Emits `ui-input` with `{ value }`.
 */
export class UiSlider extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    disabled: { type: Boolean, reflect: true },
    showValue: { type: Boolean, attribute: 'show-value' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.step = 1;
    this.disabled = false;
    this.showValue = false;
    this._id = `ui-slider-${++idCounter}`;
  }

  #handleInput(e) {
    this.value = Number(e.target.value);
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  render() {
    const pct = ((this.value - this.min) / (this.max - this.min)) * 100;

    return html`
      <div class="${window.__uiwc.prefix}-slider flex flex-col gap-1.5">
        ${this.label || this.showValue
          ? html`
              <div class="flex items-center justify-between text-sm">
                ${this.label ? html`<label for=${this._id} class="font-medium text-base-900">${this.label}</label>` : html`<span></span>`}
                ${this.showValue ? html`<span class="text-base-500">${this.value}</span>` : ''}
              </div>
            `
          : ''}
        <div class="relative h-2 w-full">
          <div class="absolute inset-0 rounded-full bg-base-200"></div>
          <div class="absolute inset-y-0 left-0 rounded-full bg-brand-900" style="width:${pct}%"></div>
          <input
            id=${this._id}
            type="range"
            class="absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent accent-brand-900 disabled:opacity-50 disabled:cursor-not-allowed"
            min=${this.min}
            max=${this.max}
            step=${this.step}
            .value=${String(this.value)}
            ?disabled=${this.disabled}
            @input=${this.#handleInput}
          />
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('slider', UiSlider);
