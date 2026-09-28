import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-autocomplete placeholder="Buscar país...">` with `<ui-option value="ar">Argentina</ui-option>`
 * children — text input that filters the option list as you type (client-side substring
 * match). Options are parsed into a plain array at connect time, so filtering re-renders
 * a Lit template instead of reparsing HTML on every keystroke.
 * Emits `ui-input` while typing and `ui-change` with `{ value, label }` on selection.
 */
export class UiAutocomplete extends LitElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    _query: { state: true },
    _open: { state: true },
    _activeIndex: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.placeholder = 'Buscar...';
    this.disabled = false;
    this._options = [];
    this._query = '';
    this._open = false;
    this._activeIndex = -1;
    this._id = `ui-autocomplete-${++idCounter}`;
    this._onDocClick = (e) => {
      if (!this.contains(e.target)) this._open = false;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._options.length === 0) {
      const template = document.createElement('template');
      template.innerHTML = this.innerHTML;
      this._options = [...template.content.children].map((el) => ({
        value: el.getAttribute('value') || el.textContent.trim(),
        label: el.textContent.trim(),
      }));
      this.innerHTML = '';
      const selected = this._options.find((o) => o.value === this.value);
      this._query = selected?.label || '';
    }
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
  }

  get #filtered() {
    const q = this._query.trim().toLowerCase();
    if (!q) return this._options;
    return this._options.filter((o) => o.label.toLowerCase().includes(q));
  }

  #handleInput(e) {
    this._query = e.target.value;
    this._open = true;
    this._activeIndex = -1;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this._query } }));
  }

  #select(option) {
    this.value = option.value;
    this._query = option.label;
    this._open = false;
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { value: option.value, label: option.label } }));
  }

  #handleKeydown(e) {
    const results = this.#filtered;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._open = true;
      this._activeIndex = Math.min(results.length - 1, this._activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._activeIndex = Math.max(0, this._activeIndex - 1);
    } else if (e.key === 'Enter' && this._activeIndex >= 0) {
      e.preventDefault();
      this.#select(results[this._activeIndex]);
    } else if (e.key === 'Escape') {
      this._open = false;
    }
  }

  render() {
    const results = this.#filtered;

    return html`
      <div class="${window.__uiwc.prefix}-autocomplete relative">
        <input
          id=${this._id}
          type="text"
          role="combobox"
          aria-expanded=${this._open}
          aria-autocomplete="list"
          class="w-full rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
          placeholder=${this.placeholder}
          .value=${this._query}
          ?disabled=${this.disabled}
          @input=${this.#handleInput}
          @focus=${() => (this._open = true)}
          @keydown=${this.#handleKeydown}
        />
        ${this._open && results.length
          ? html`
              <div class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg" role="listbox">
                ${results.map(
                  (o, i) => html`
                    <div
                      role="option"
                      aria-selected=${i === this._activeIndex}
                      class="px-3 py-1.5 text-sm cursor-pointer ${i === this._activeIndex ? 'bg-base-100 text-base-800' : 'text-base-900 hover:bg-base-50'}"
                      @mousedown=${(e) => e.preventDefault()}
                      @click=${() => this.#select(o)}
                    >
                      ${o.label}
                    </div>
                  `
                )}
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('autocomplete', UiAutocomplete);
