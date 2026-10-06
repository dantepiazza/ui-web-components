import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

// Search is accent- and case-insensitive ("camion" finds "Camión").
const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * `<ui-select placeholder="Elegí un país">` with `<ui-option value="ar">Argentina</ui-option>`
 * children — custom dropdown select. Emits `ui-change` with `{ value, label }`.
 *
 * Set `display="count"` for a "filter chip" look — the trigger shows a fixed `label`
 * plus a count badge (0 or 1) instead of the chosen option's text. Handy for filter
 * bars where the field's own name matters more than which value is picked.
 *
 * Add `searchable` to get a search box above the list (for long option lists): it filters
 * the options as you type (accent/case-insensitive), Enter picks the first match.
 * `search-placeholder` and `empty-label` customize the box's placeholder and the
 * "no results" line.
 *
 * Without display="count", a label renders as a field label above the trigger (same
 * look as <ui-input label>).
 */
export class UiSelect extends LitElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    label: { type: String },
    display: { type: String },
    name: { type: String },
    disabled: { type: Boolean, reflect: true },
    searchable: { type: Boolean },
    searchPlaceholder: { type: String, attribute: 'search-placeholder' },
    emptyLabel: { type: String, attribute: 'empty-label' },
    _open: { state: true },
    _query: { state: true },
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
    this.searchable = false;
    this.searchPlaceholder = 'Buscar...';
    this.emptyLabel = 'Sin resultados';
    this._open = false;
    this._query = '';
    this._label = '';
    this._id = `ui-select-${++idCounter}`;
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

  #handleOptionClick(e) {
    const option = e.target.closest(`${window.__uiwc.prefix}-option`);
    if (option) this.#choose(option);
  }

  #choose(option) {
    const label = option.textContent.trim();
    this.value = option.value;
    this._open = false;
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { value: this.value, label } }));
  }

  #handleKeydown(e) {
    if (e.target.matches?.('[data-search]')) {
      if (e.key === 'Escape') {
        this._open = false;
        this.querySelector('button')?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = this.#activeOption();
        if (opt) this.#choose(opt);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.#moveActive(e.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }
    if (e.key === 'Escape') this._open = false;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._open = !this._open;
    }
  }

  updated(changed) {
    this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
      option.selected = option.value === this.value;
      option.style.display = this.#matches(option.textContent.trim()) ? '' : 'none';
      if (changed.has('_query')) { option.removeAttribute('data-active'); option.style.background = ''; }
    });
    if (changed.has('_open') && this._open && this.searchable) this.querySelector('[data-search]')?.focus();
  }

  render() {
    const isCount = this.display === 'count';
    const count = this.value ? 1 : 0;
    const noMatch = this.searchable && this._query.trim() && !this.#labels().some((l) => this.#matches(l));

    return html`
      <div class="${window.__uiwc.prefix}-select relative" @keydown=${this.#handleKeydown}>
        ${this.label && !isCount
          ? html`<label for=${this._id} class="mb-1.5 block text-sm font-medium text-base-900">${this.label}</label>`
          : ''}
        ${this.name
          ? html`<input type="hidden" name=${this.name} .value=${this.value} ?disabled=${this.disabled} />`
          : ''}
        <button
          id=${this._id}
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
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('select', UiSelect);
