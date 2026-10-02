import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-select placeholder="Elegí un país">` with `<ui-option value="ar">Argentina</ui-option>`
 * children — custom dropdown select. Emits `ui-change` with `{ value, label }`.
 *
 * Set `display="count"` for a "filter chip" look — the trigger shows a fixed `label`
 * plus a count badge (0 or 1) instead of the chosen option's text. Handy for filter
 * bars where the field's own name matters more than which value is picked.
 */
export class UiSelect extends LitElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    label: { type: String },
    display: { type: String },
    name: { type: String },
    disabled: { type: Boolean, reflect: true },
    _open: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.placeholder = 'Seleccionar...';
    this.label = '';
    this.display = 'value';
    this.name = '';
    this.disabled = false;
    this._open = false;
    this._label = '';
    this._onDocClick = (e) => {
      if (!this.contains(e.target)) this._open = false;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
  }

  // El texto de una opción se resuelve contra el contenido original (no contra el DOM
  // renderizado): las <ui-option> solo existen en el DOM mientras el dropdown está
  // abierto, así que un `value` inicial/programático no encontraría su opción.
  #labelFor(value) {
    const template = document.createElement('template');
    template.innerHTML = this._content || '';
    const option = [...template.content.querySelectorAll(`${window.__uiwc.prefix}-option`)]
      .find((o) => (o.getAttribute('value') ?? '') === value);
    return option ? option.textContent.trim() : '';
  }

  willUpdate(changed) {
    if (changed.has('value')) this._label = this.#labelFor(this.value);
  }

  #handleOptionClick(e) {
    const option = e.target.closest(`${window.__uiwc.prefix}-option`);
    if (!option) return;
    const label = option.textContent.trim();
    this.value = option.value;
    this._open = false;
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { value: this.value, label } }));
  }

  #handleKeydown(e) {
    if (e.key === 'Escape') this._open = false;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._open = !this._open;
    }
  }

  updated() {
    this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
      option.selected = option.value === this.value;
    });
  }

  render() {
    const isCount = this.display === 'count';
    const count = this.value ? 1 : 0;

    return html`
      <div class="${window.__uiwc.prefix}-select relative" @keydown=${this.#handleKeydown}>
        ${this.name
          ? html`<input type="hidden" name=${this.name} .value=${this.value} ?disabled=${this.disabled} />`
          : ''}
        <button
          type="button"
          class="flex ${isCount ? 'w-auto' : 'w-full'} items-center gap-1.5 rounded border bg-surface px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 disabled:bg-base-50 disabled:opacity-60 ${count > 0 ? 'border-base-900 text-base-900' : 'border-base-300 text-base-400'} ${!isCount && this.value ? 'text-base-900' : ''}"
          aria-haspopup="listbox"
          aria-expanded=${this._open}
          ?disabled=${this.disabled}
          @click=${() => (this._open = !this._open)}
        >
          ${isCount
            ? html`
                <span class="text-base-700">${this.label || this.placeholder}</span>
                ${count > 0
                  ? html`<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white">${count}</span>`
                  : ''}
              `
            : this._label || this.placeholder}
          <uiwc-icon name="chevron-down" size="sm" class="ml-auto shrink-0 text-base-400"></uiwc-icon>
        </button>
        ${this._open
          ? html`
              <div
                class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg"
                role="listbox"
                @click=${this.#handleOptionClick}
              >
                ${unsafeHTML(this._content || '')}
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('select', UiSelect);
