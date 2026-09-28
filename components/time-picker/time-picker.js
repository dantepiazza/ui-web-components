import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-time-picker label="Hora de inicio" value="09:00">` — wraps a native
 * `<input type="time">`, so the browser's own time UI and keyboard support apply.
 * Emits `ui-input` with `{ value }`.
 */
export class UiTimePicker extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    name: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.disabled = false;
    this.required = false;
    this.name = '';
    this._id = `ui-time-picker-${++idCounter}`;
  }

  #handleInput(e) {
    this.value = e.target.value;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-time-picker flex flex-col gap-1.5">
        ${this.label
          ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label} ${this.required ? html`<span class="text-danger">*</span>` : ''}</label>`
          : ''}
        <input
          id=${this._id}
          type="time"
          class="rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
          name=${this.name || ''}
          .value=${this.value}
          ?disabled=${this.disabled}
          ?required=${this.required}
          @input=${this.#handleInput}
        />
      </div>
    `;
  }
}

window.__uiwc.register('time-picker', UiTimePicker);
