import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-date-picker label="Fecha de entrega" value="2026-09-04">` — text field that
 * opens a `<ui-calendar>` popup on focus/click. Emits `ui-input` with `{ value }`.
 * With `name` it renders a hidden input (value `Y-m-d`) so it submits with a form;
 * `placeholder` overrides the empty text. Set `el.value = '2026-09-04'` (or '') from JS.
 */
export class UiDatePicker extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    min: { type: String },
    max: { type: String },
    name: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    _open: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.min = '';
    this.max = '';
    this.name = '';
    this.placeholder = 'Elegir fecha';
    this.disabled = false;
    this._open = false;
    this._id = `ui-date-picker-${++idCounter}`;
    this._onDocClick = (e) => {
      if (!this.contains(e.target)) this._open = false;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
  }

  #handleCalendarChange(e) {
    this.value = e.detail.value;
    this._open = false;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-date-picker relative flex flex-col gap-1.5">
        ${this.label ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ''}
        ${this.name ? html`<input type="hidden" name=${this.name} .value=${this.value || ''} ?disabled=${this.disabled} />` : ''}
        <button
          id=${this._id}
          type="button"
          class="flex items-center justify-between gap-2 rounded border border-base-300 bg-surface px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60 ${this.value ? 'text-base-900' : 'text-base-400'}"
          ?disabled=${this.disabled}
          @click=${() => (this._open = !this._open)}
        >
          ${this.value || this.placeholder}
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 text-base-400"></uiwc-icon>
        </button>
        ${this._open
          ? html`
              <div class="absolute z-10 top-full mt-1 rounded border border-base-200 bg-surface p-3 shadow-lg">
                <ui-calendar .value=${this.value} .min=${this.min} .max=${this.max} @ui-change=${this.#handleCalendarChange}></ui-calendar>
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('date-picker', UiDatePicker);
