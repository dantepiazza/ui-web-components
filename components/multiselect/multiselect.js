import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-multiselect placeholder="Elegí tags">` with `<ui-option value="js">JavaScript</ui-option>`
 * children — like `<ui-select>` but keeps multiple selections (shown as chips in the
 * trigger) and stays open after each pick. Emits `ui-change` with `{ values }`.
 *
 * Set `display="count"` for a "filter chip" look — the trigger shows a fixed `label`
 * plus a count badge instead of the picked-values chips. Handy for filter bars where
 * the field's own name matters more than which values are picked.
 */
export class UiMultiselect extends LitElement {
  static properties = {
    placeholder: { type: String },
    label: { type: String },
    display: { type: String },
    disabled: { type: Boolean, reflect: true },
    _open: { state: true },
    _values: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.placeholder = 'Seleccionar...';
    this.label = '';
    this.display = 'value';
    this.disabled = false;
    this._open = false;
    this._values = [];
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

  get values() {
    return this._values;
  }

  #toggleOption(e) {
    const option = e.target.closest(`${window.__uiwc.prefix}-option`);
    if (!option) return;
    this._values = this._values.includes(option.value)
      ? this._values.filter((v) => v !== option.value)
      : [...this._values, option.value];
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { values: this._values } }));
  }

  #removeChip(value, e) {
    e.stopPropagation();
    this._values = this._values.filter((v) => v !== value);
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { values: this._values } }));
  }

  updated() {
    this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
      option.selected = this._values.includes(option.value);
    });
  }

  #labelFor(value) {
    return this.querySelector(`ui-option[value="${value}"]`)?.textContent.trim() || value;
  }

  render() {
    const isCount = this.display === 'count';

    return html`
      <div class="${window.__uiwc.prefix}-multiselect relative">
        <button
          type="button"
          class="flex ${isCount ? 'w-auto items-center' : 'min-h-[2.5rem] w-full flex-wrap items-center'} gap-1.5 rounded border bg-surface px-2.5 py-1.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 disabled:bg-base-50 disabled:opacity-60 ${isCount && this._values.length ? 'border-base-900' : 'border-base-300'}"
          aria-haspopup="listbox"
          aria-expanded=${this._open}
          ?disabled=${this.disabled}
          @click=${() => (this._open = !this._open)}
        >
          ${isCount
            ? html`
                <span class="text-base-700">${this.label || this.placeholder}</span>
                ${this._values.length
                  ? html`<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white">${this._values.length}</span>`
                  : ''}
              `
            : this._values.length
              ? this._values.map(
                  (v) => html`
                    <span class="inline-flex items-center gap-1 rounded bg-base-100 px-1.5 py-0.5 text-xs font-medium text-base-800">
                      ${this.#labelFor(v)}
                      <span
                        role="button"
                        tabindex="0"
                        class="rounded p-0.5 hover:bg-black/10"
                        aria-label="Quitar"
                        @click=${(e) => this.#removeChip(v, e)}
                      >
                        <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </span>
                    </span>
                  `
                )
              : html`<span class="text-base-400">${this.placeholder}</span>`}
        </button>
        ${this._open
          ? html`
              <div
                class="absolute z-10 mt-1 ${isCount ? 'min-w-[220px]' : 'w-full'} max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg"
                role="listbox"
                aria-multiselectable="true"
                @click=${this.#toggleOption}
              >
                ${unsafeHTML(this._content || '')}
                ${this._values.length
                  ? html`
                      <div class="flex justify-end border-t border-base-100 px-1.5 pt-1.5">
                        <button
                          type="button"
                          class="rounded px-1.5 py-1 text-xs font-medium text-base-500 hover:bg-base-50 hover:text-base-900"
                          @click=${(e) => {
                            e.stopPropagation();
                            this._values = [];
                            this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { values: this._values } }));
                          }}
                        >
                          Limpiar
                        </button>
                      </div>
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('multiselect', UiMultiselect);
