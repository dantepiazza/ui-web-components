window.__uiwc = window.__uiwc || { prefix: 'ui' };

const norm = (opts = []) => opts.map((o) => (typeof o === 'object' ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) }));

/**
 * `<ui-filter-bar>` — a row of filter fields built entirely out of existing library
 * components (`ui-input-search`, `ui-switch`, `ui-select`/`ui-multiselect` in
 * `display="count"` mode, `ui-button`) — no styling API of its own, no runtime
 * `classes` override; it's Tailwind-fixed like everything else, only themeable via
 * `tailwind.config`.
 *
 * Set `.fields` as a JS property (structured data, not markup — same reasoning as
 * `ui-data-grid`'s `.rows`):
 * ```js
 * bar.fields = [
 *   { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Buscar producto...' },
 *   { name: 'ready', type: 'switch', label: 'Colores listos para usar' },
 *   { name: 'uso', type: 'select', label: 'Tipo de uso', options: ['Exterior', 'Interior'] },
 *   { name: 'superficie', type: 'select-multiple', label: 'Superficie', options: [...] },
 * ];
 * ```
 * `submit="auto"` (default) applies on every change; `submit="button"` shows an
 * "Aplicar" button and only applies on click (or Enter in a search field).
 * Emits `ui-filter-change` on every edit, `ui-filter-apply` when applied (with the
 * current `values`), and `ui-filter-clear` when cleared. No URL/query-string mode —
 * that's on the consumer, same as `ui-autocomplete` doesn't know your search endpoint.
 *
 * Responsive: below `md:` the fields collapse behind a "Filtros" toggle button (with
 * an active-count badge) that opens them as a bottom sheet with a backdrop — same
 * field elements the whole time, just repositioned via classes, so nothing loses
 * focus or gets rebuilt when you open/close it. Applying or clearing closes it back up.
 */
export class UiFilterBar extends HTMLElement {
  #fields = [];
  #values = {};
  #applied = '{}';
  #mobileOpen = false;

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.className = `${window.__uiwc.prefix}-filter-bar block`;
    // If `bar.fields = [...]` ran before this class was registered (e.g. an inline
    // <script> below a deferred component bundle), it landed as a plain own property
    // shadowing the `fields` accessor below — re-run it through the real setter now
    // that upgrade has happened. Only plain (non-Lit) components need this: Lit's
    // ReactiveElement already handles pre-upgrade property sets on its own.
    this.#upgradeProperty('fields');
    if (this.#fields.length) this.#render();
  }

  #upgradeProperty(prop) {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  get submitMode() {
    return this.getAttribute('submit') === 'button' ? 'button' : 'auto';
  }

  get applyLabel() {
    return this.getAttribute('apply-label') || 'Aplicar';
  }

  set fields(list) {
    this.#fields = list || [];
    this.#values = {};
    for (const f of this.#fields) {
      if (f.default != null) this.#values[f.name] = f.default;
      else if (f.type === 'select-multiple' || f.type === 'checkbox') this.#values[f.name] = [];
      else if (f.type === 'switch') this.#values[f.name] = false;
      else this.#values[f.name] = '';
    }
    this.#applied = JSON.stringify(this.#values);
    if (this._built) this.#render();
  }

  get fields() {
    return this.#fields;
  }

  get values() {
    return JSON.parse(JSON.stringify(this.#values));
  }

  get isDirty() {
    return JSON.stringify(this.#values) !== this.#applied;
  }

  apply(changed = null) {
    this.#applied = JSON.stringify(this.#values);
    this.#refresh();
    this.#setMobileOpen(false);
    this.dispatchEvent(new CustomEvent('ui-filter-apply', { bubbles: true, composed: true, detail: { values: this.values, changed } }));
  }

  clear() {
    for (const f of this.#fields) {
      if (f.type === 'select-multiple' || f.type === 'checkbox') this.#values[f.name] = [];
      else if (f.type === 'switch') this.#values[f.name] = false;
      else this.#values[f.name] = '';
    }
    this.#render();
    this.dispatchEvent(new CustomEvent('ui-filter-clear', { bubbles: true, composed: true, detail: { values: this.values } }));
    this.apply(null);
  }

  #activeCount() {
    return this.#fields.filter((f) => {
      const v = this.#values[f.name];
      if (Array.isArray(v)) return v.length > 0;
      if (f.type === 'switch') return !!v;
      return v !== '' && v != null;
    }).length;
  }

  #changed(name) {
    this.#refresh();
    this.dispatchEvent(
      new CustomEvent('ui-filter-change', { bubbles: true, composed: true, detail: { values: this.values, changed: name, applied: this.submitMode === 'auto' } })
    );
    if (this.submitMode === 'auto') this.apply(name);
  }

  #refresh() {
    if (this._applyBtn) this._applyBtn.disabled = !this.isDirty;
    if (this._toggleCount) {
      const n = this.#activeCount();
      this._toggleCount.textContent = n;
      this._toggleCount.hidden = n === 0;
    }
  }

  #setMobileOpen(open) {
    this.#mobileOpen = open;
    if (!this._scrim || !this._fieldsRow) return;
    this._scrim.className = `fixed inset-0 z-40 bg-base-900/40 md:hidden ${open ? '' : 'hidden'}`;
    this._toggleBtn?.setAttribute('aria-expanded', String(open));
    this._fieldsRow.className = open
      ? `${window.__uiwc.prefix}-filter-bar__fields flex max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:rounded-t-2xl max-md:border-0 max-md:bg-surface max-md:p-4 max-md:shadow-2xl max-md:max-h-[85vh] max-md:overflow-y-auto flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-surface p-3`
      : `${window.__uiwc.prefix}-filter-bar__fields max-md:hidden flex flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-surface p-3`;
  }

  // No template: this only rebuilds the field elements themselves (search/switch/
  // select/etc). The toggle button + scrim + fieldsRow wrapper are built once and
  // toggled via class swaps in #setMobileOpen, so opening/closing the mobile sheet
  // never re-mounts the fields (no lost focus/typed text).
  #render() {
    const prefix = window.__uiwc.prefix;
    this.replaceChildren();

    const scrim = document.createElement('div');
    scrim.addEventListener('click', () => this.#setMobileOpen(false));
    this._scrim = scrim;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className =
      'flex w-full items-center justify-center gap-2 rounded-xl border border-base-200 bg-surface px-3.5 py-2.5 text-sm font-medium text-base-700 hover:bg-base-50 md:hidden';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `<uiwc-icon name="filter" size="sm"></uiwc-icon><span>Filtros</span>`;
    const countBadge = document.createElement('span');
    countBadge.className = 'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white';
    countBadge.hidden = true;
    toggle.appendChild(countBadge);
    toggle.addEventListener('click', () => this.#setMobileOpen(!this.#mobileOpen));
    this._toggleBtn = toggle;
    this._toggleCount = countBadge;

    const fieldsRow = document.createElement('div');
    this._fieldsRow = fieldsRow;

    for (const f of this.#fields) {
      const el = this.#buildField(f, prefix);
      fieldsRow.appendChild(el);
    }

    if (this.submitMode === 'button') {
      const applyBtn = document.createElement(`${prefix}-button`);
      applyBtn.setAttribute('size', 'sm');
      applyBtn.textContent = this.applyLabel;
      applyBtn.addEventListener('click', () => this.apply(null));
      this._applyBtn = applyBtn;
      fieldsRow.appendChild(applyBtn);
    } else {
      this._applyBtn = null;
    }

    const clearBtn = document.createElement(`${prefix}-button`);
    clearBtn.setAttribute('size', 'sm');
    clearBtn.setAttribute('variant', 'ghost');
    clearBtn.setAttribute('icon', 'x');
    clearBtn.textContent = 'Limpiar filtros';
    clearBtn.addEventListener('click', () => this.clear());
    fieldsRow.appendChild(clearBtn);

    this.append(scrim, toggle, fieldsRow);
    this.#setMobileOpen(false);
    this.#refresh();
  }

  #buildOptions(el, prefix, options) {
    norm(options).forEach((o) => {
      const opt = document.createElement(`${prefix}-option`);
      opt.setAttribute('value', o.value);
      opt.textContent = o.label;
      el.appendChild(opt);
    });
  }

  #buildField(f, prefix) {
    if (f.type === 'search') {
      const el = document.createElement(`${prefix}-input-search`);
      el.setAttribute('placeholder', f.placeholder || f.label || 'Buscar...');
      el.value = this.#values[f.name] || '';
      let t;
      el.addEventListener('ui-input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          this.#values[f.name] = e.detail.value.trim();
          this.#changed(f.name);
        }, f.debounce ?? 250);
      });
      return el;
    }

    if (f.type === 'switch') {
      const el = document.createElement(`${prefix}-switch`);
      el.textContent = f.label || '';
      el.checked = !!this.#values[f.name];
      el.addEventListener('ui-change', (e) => {
        this.#values[f.name] = e.detail.checked;
        this.#changed(f.name);
      });
      return el;
    }

    if (f.type === 'select-multiple' || f.type === 'checkbox') {
      const el = document.createElement(`${prefix}-multiselect`);
      el.setAttribute('display', 'count');
      el.setAttribute('label', f.label || '');
      el.setAttribute('placeholder', f.label || 'Elegir...');
      this.#buildOptions(el, prefix, f.options);
      el.addEventListener('ui-change', (e) => {
        this.#values[f.name] = e.detail.values;
        this.#changed(f.name);
      });
      return el;
    }

    // default: select simple
    const el = document.createElement(`${prefix}-select`);
    el.setAttribute('display', 'count');
    el.setAttribute('label', f.label || '');
    el.setAttribute('placeholder', f.label || 'Elegir...');
    this.#buildOptions(el, prefix, f.options);
    if (this.#values[f.name]) el.value = this.#values[f.name];
    el.addEventListener('ui-change', (e) => {
      this.#values[f.name] = e.detail.value;
      this.#changed(f.name);
    });
    return el;
  }
}

window.__uiwc.register('filter-bar', UiFilterBar);
