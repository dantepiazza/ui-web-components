import { LitElement, html, nothing } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-input label="Email" type="email" placeholder="vos@ejemplo.com" error="Requerido"
 * icon="mail">` — text input with label, helper text and error state. Set `icon` for a
 * decorative leading icon (or `icon-position="end"` for trailing) — a plain hint like a
 * unit or a search glyph, not an interactive control; replaces the old standalone
 * `<ui-input-icon>`. Emits native `input`/`change` events from the inner control
 * (bubbles), plus `ui-input` with `{ value }` on input.
 */
export class UiInput extends LitElement {
  static properties = {
    label: { type: String },
    type: { type: String },
    value: { type: String },
    placeholder: { type: String },
    helpText: { type: String, attribute: 'help-text' },
    error: { type: String },
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    name: { type: String },
    icon: { type: String },
    iconPosition: { type: String, attribute: 'icon-position' },
    step: { type: String },
    min: { type: String },
    max: { type: String },
    inputmode: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.type = 'text';
    this.value = '';
    this.placeholder = '';
    this.helpText = '';
    this.error = '';
    this.disabled = false;
    this.required = false;
    this.name = '';
    this.icon = '';
    this.iconPosition = 'start';
    this.step = '';
    this.min = '';
    this.max = '';
    this.inputmode = '';
    this._id = `ui-input-${++idCounter}`;
  }

  #handleInput(e) {
    this.value = e.target.value;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  render() {
    const hasError = Boolean(this.error);
    const borderClass = hasError
      ? 'border-danger focus:border-danger focus:ring-danger'
      : 'border-base-300 focus:border-brand-900 focus:ring-brand-900';
    const describedBy = hasError ? `${this._id}-error` : this.helpText ? `${this._id}-help` : undefined;

    return html`
      <div class="${window.__uiwc.prefix}-input flex flex-col gap-1.5">
        ${this.label
          ? html`
              <label for=${this._id} class="text-sm font-medium text-base-900">
                ${this.label} ${this.required ? html`<span class="text-danger">*</span>` : ''}
              </label>
            `
          : ''}
        <div class="relative">
          ${this.icon
            ? html`<uiwc-icon
                name=${this.icon}
                size="sm"
                class="pointer-events-none absolute top-1/2 -translate-y-1/2 text-base-400 ${this.iconPosition === 'end' ? 'right-2.5' : 'left-2.5'}"
              ></uiwc-icon>`
            : ''}
          <input
            id=${this._id}
            type=${this.type}
            class="w-full rounded border bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass} ${this.icon && this.iconPosition === 'end' ? 'pr-8' : ''} ${this.icon && this.iconPosition !== 'end' ? 'pl-8' : ''}"
            name=${this.name || ''}
            .value=${this.value}
            placeholder=${this.placeholder || ''}
            step=${this.step || nothing}
            min=${this.min || nothing}
            max=${this.max || nothing}
            inputmode=${this.inputmode || nothing}
            ?disabled=${this.disabled}
            ?required=${this.required}
            aria-invalid=${hasError}
            aria-describedby=${describedBy}
            @input=${this.#handleInput}
          />
        </div>
        ${hasError
          ? html`<p id="${this._id}-error" class="text-xs text-danger">${this.error}</p>`
          : this.helpText
            ? html`<p id="${this._id}-help" class="text-xs text-base-500">${this.helpText}</p>`
            : ''}
      </div>
    `;
  }
}

window.__uiwc.register('input', UiInput);
