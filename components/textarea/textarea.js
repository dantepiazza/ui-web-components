import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-textarea label="Comentario" rows="4" error="Requerido">` — multiline text field
 * with label, helper text and error state. Emits native `input`/`change` (bubbles),
 * plus `ui-input` with `{ value }`.
 */
export class UiTextarea extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    placeholder: { type: String },
    rows: { type: Number },
    helpText: { type: String, attribute: 'help-text' },
    error: { type: String },
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
    this.placeholder = '';
    this.rows = 3;
    this.helpText = '';
    this.error = '';
    this.disabled = false;
    this.required = false;
    this.name = '';
    this._id = `ui-textarea-${++idCounter}`;
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
      <div class="${window.__uiwc.prefix}-textarea flex flex-col gap-1.5">
        ${this.label
          ? html`
              <label for=${this._id} class="text-sm font-medium text-base-900">
                ${this.label} ${this.required ? html`<span class="text-danger">*</span>` : ''}
              </label>
            `
          : ''}
        <textarea
          id=${this._id}
          class="rounded border bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass}"
          name=${this.name || ''}
          rows=${this.rows}
          placeholder=${this.placeholder || ''}
          ?disabled=${this.disabled}
          ?required=${this.required}
          aria-invalid=${hasError}
          aria-describedby=${describedBy}
          .value=${this.value}
          @input=${this.#handleInput}
        ></textarea>
        ${hasError
          ? html`<p id="${this._id}-error" class="text-xs text-danger">${this.error}</p>`
          : this.helpText
            ? html`<p id="${this._id}-help" class="text-xs text-base-500">${this.helpText}</p>`
            : ''}
      </div>
    `;
  }
}

window.__uiwc.register('textarea', UiTextarea);
