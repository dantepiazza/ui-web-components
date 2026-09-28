import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-input-search placeholder="Buscar...">` — text input with a leading search icon
 * and a clear button that appears once there's a value. Emits `ui-input` with
 * `{ value }` on every keystroke and on clear.
 */
export class UiInputSearch extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.placeholder = 'Buscar...';
    this.disabled = false;
    this.name = '';
    this._id = `ui-input-search-${++idCounter}`;
  }

  #setValue(value) {
    this.value = value;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  #clear() {
    this.#setValue('');
    this.querySelector('input')?.focus();
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-input-search flex flex-col gap-1.5">
        ${this.label ? html`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ''}
        <div class="relative">
          <uiwc-icon name="search" size="sm" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400"></uiwc-icon>
          <input
            id=${this._id}
            type="search"
            class="w-full rounded border border-base-300 bg-surface py-2 pl-8 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60 [&::-webkit-search-cancel-button]:appearance-none"
            style="padding-right:${this.value ? '2rem' : '0.75rem'}"
            name=${this.name || ''}
            placeholder=${this.placeholder}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${(e) => this.#setValue(e.target.value)}
          />
          ${this.value
            ? html`
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600"
                  aria-label="Borrar búsqueda"
                  @click=${this.#clear}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              `
            : ''}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('input-search', UiInputSearch);
