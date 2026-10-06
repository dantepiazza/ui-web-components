import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

// Search is accent- and case-insensitive ("camion" finds "Camión").
const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * `<ui-multiselect placeholder="Elegí tags">` with `<ui-option value="js">JavaScript</ui-option>`
 * children — like `<ui-select>` but keeps multiple selections (shown as chips in the
 * trigger) and stays open after each pick. Emits `ui-change` with `{ values }`.
 *
 * Set `display="count"` for a "filter chip" look — the trigger shows a fixed `label`
 * plus a count badge instead of the picked-values chips. Handy for filter bars where
 * the field's own name matters more than which values are picked.
 *
 * Add `searchable` to get a search box above the list (for long option lists): it filters
 * the options as you type (accent/case-insensitive) and the list stays open while you
 * pick several; Enter toggles the first match. `search-placeholder` and `empty-label`
 * customize the box's placeholder and the "no results" line.
 */
export class UiMultiselect extends LitElement {
  static properties = {
    placeholder: { type: String },
    label: { type: String },
    display: { type: String },
    disabled: { type: Boolean, reflect: true },
    searchable: { type: Boolean },
    searchPlaceholder: { type: String, attribute: 'search-placeholder' },
    emptyLabel: { type: String, attribute: 'empty-label' },
    _open: { state: true },
    _values: { state: true },
    _query: { state: true },
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
    this.searchable = false;
    this.searchPlaceholder = 'Buscar...';
    this.emptyLabel = 'Sin resultados';
    this._open = false;
    this._values = [];
    this._query = '';
    this._id = `ui-multiselect-${++idCounter}`;
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

  willUpdate(changed) {
    if (changed.has('_open') && !this._open) this._query = '';
  }

  #labels() {
    if (!this._labels) {
      const template = document.createElement('template');
      template.innerHTML = this._content || '';
      this._labels = [...template.content.querySelectorAll(`${window.__uiwc.prefix}-option`)].map((o) => o.textContent.trim());
    }
    return this._labels;
  }

  #visibleOptions() {
    return [...this.querySelectorAll(`-option`)].filter((o) => o.style.display !== 'none');
  }

  #activeOption() {
    const visible = this.#visibleOptions();
    return visible.find((o) => o.hasAttribute('data-active')) || visible[0];
  }

  #moveActive(step) {
    const visible = this.#visibleOptions();
    if (!visible.length) return;
    const i = visible.findIndex((o) => o.hasAttribute('data-active'));
    visible.forEach((o) => o.removeAttribute('data-active'));
    const next = visible[(i + step + visible.length) % visible.length];
    next.setAttribute('data-active', '');
    next.style.background = 'rgba(128,128,128,.15)';
    next.scrollIntoView?.({ block: 'nearest' });
  }

  #matches(label) {
    const q = norm(this._query.trim());
    return !q || norm(label).includes(q);
  }

  #onSearchKey(e) {
    if (!e.target.matches?.('[data-search]')) return;
    if (e.key === 'Escape') {
      this._open = false;
      this.querySelector('button')?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = this.#activeOption();
      if (opt) this.#toggle(opt);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.#moveActive(e.key === 'ArrowDown' ? 1 : -1);
    }
  }

  #toggleOption(e) {
    const option = e.target.closest(`${window.__uiwc.prefix}-option`);
    if (option) this.#toggle(option);
  }

  #toggle(option) {
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

  updated(changed) {
    this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
      option.selected = this._values.includes(option.value);
      option.style.display = this.#matches(option.textContent.trim()) ? '' : 'none';
      if (changed.has('_query')) { option.removeAttribute('data-active'); option.style.background = ''; }
    });
    if (changed.has('_open') && this._open && this.searchable) this.querySelector('[data-search]')?.focus();
  }

  #labelFor(value) {
    return this.querySelector(`ui-option[value="${value}"]`)?.textContent.trim() || value;
  }

  render() {
    const isCount = this.display === 'count';
    const noMatch = this.searchable && this._query.trim() && !this.#labels().some((l) => this.#matches(l));

    return html`
      <div class="${window.__uiwc.prefix}-multiselect relative" @keydown=${this.#onSearchKey}>
        ${this.label && !isCount
          ? html`<label for=${this._id} class="mb-1.5 block text-sm font-medium text-base-900">${this.label}</label>`
          : ''}
        <button
          id=${this._id}
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
                ${this.searchable
                  ? html`
                      <div class="sticky top-0 z-10 -mt-1 border-b border-base-100 bg-surface px-2 pb-1.5 pt-2">
                        <input
                          data-search
                          type="search"
                          autocomplete="off"
                          aria-label=${this.searchPlaceholder}
                          placeholder=${this.searchPlaceholder}
                          class="w-full rounded border border-base-300 bg-surface px-2.5 py-1.5 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900"
                          .value=${this._query}
                          @input=${(e) => (this._query = e.target.value)}
                        />
                      </div>
                    `
                  : ''}
                ${unsafeHTML(this._content || '')}
                ${noMatch ? html`<div class="px-3 py-2 text-sm text-base-500">${this.emptyLabel}</div>` : ''}
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
