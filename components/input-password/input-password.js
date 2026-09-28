import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-input-password label="Contraseña">` — password field with a show/hide toggle.
 * Emits `ui-input` with `{ value }`.
 */
export class UiInputPassword extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    placeholder: { type: String },
    helpText: { type: String, attribute: 'help-text' },
    error: { type: String },
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    name: { type: String },
    _visible: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.placeholder = '';
    this.helpText = '';
    this.error = '';
    this.disabled = false;
    this.required = false;
    this.name = '';
    this._visible = false;
    this._id = `ui-input-password-${++idCounter}`;
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
      <div class="${window.__uiwc.prefix}-input-password flex flex-col gap-1.5">
        ${this.label
          ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label} ${this.required ? html`<span class="text-danger">*</span>` : ''}</label>`
          : ''}
        <div class="relative">
          <input
            id=${this._id}
            type=${this._visible ? 'text' : 'password'}
            class="w-full rounded border bg-surface py-2 pl-3 pr-9 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass}"
            name=${this.name || ''}
            placeholder=${this.placeholder || ''}
            .value=${this.value}
            ?disabled=${this.disabled}
            ?required=${this.required}
            aria-invalid=${hasError}
            aria-describedby=${describedBy}
            @input=${this.#handleInput}
          />
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600"
            aria-label=${this._visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            ?disabled=${this.disabled}
            @click=${() => (this._visible = !this._visible)}
          >
            <uiwc-icon name=${this._visible ? 'eye-off' : 'eye'} size="sm"></uiwc-icon>
          </button>
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

window.__uiwc.register('input-password', UiInputPassword);
