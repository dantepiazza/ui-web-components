import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-data-grid>` with `<ui-data-grid-column field="name" label="Nombre" sortable>`
 * children — columns are declared in HTML, but rows are set as a JS property
 * (`grid.rows = [...]`) since tabular data normally comes from an API/backend, not
 * markup. v1: client-side column sort. No pagination/virtualization/cell editing yet —
 * pair it with `<ui-pagination>` externally for large datasets.
 */
export class UiDataGrid extends LitElement {
  static properties = {
    rows: { type: Array },
    _sortField: { state: true },
    _sortDir: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.rows = [];
    this._columns = [];
    this._sortField = '';
    this._sortDir = 'asc';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._columns.length === 0) {
      this._columns = [...this.querySelectorAll(`${window.__uiwc.prefix}-data-grid-column`)].map((col) => ({
        field: col.getAttribute('field') || '',
        label: col.getAttribute('label') || col.getAttribute('field') || '',
        sortable: col.hasAttribute('sortable'),
      }));
    }
  }

  #toggleSort(field, sortable) {
    if (!sortable) return;
    if (this._sortField === field) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortField = field;
      this._sortDir = 'asc';
    }
  }

  get #sortedRows() {
    if (!this._sortField) return this.rows;
    const dir = this._sortDir === 'asc' ? 1 : -1;
    return [...this.rows].sort((a, b) => {
      const av = a[this._sortField];
      const bv = b[this._sortField];
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }

  render() {
    const rows = this.#sortedRows;

    return html`
      <div class="${window.__uiwc.prefix}-data-grid overflow-x-auto rounded border border-base-200">
        <table class="w-full border-collapse text-sm">
          <thead class="border-b border-base-200 bg-base-50">
            <tr>
              ${this._columns.map(
                (col) => html`
                  <th
                    class="px-4 py-2.5 text-left font-semibold text-base-500 ${col.sortable ? 'cursor-pointer select-none' : ''}"
                    @click=${() => this.#toggleSort(col.field, col.sortable)}
                  >
                    <span class="inline-flex items-center gap-1">
                      ${col.label}
                      ${col.sortable && this._sortField === col.field
                        ? html`<uiwc-icon name="chevron-down" size="sm" style="transform:${this._sortDir === 'asc' ? 'rotate(180deg)' : 'none'}"></uiwc-icon>`
                        : ''}
                    </span>
                  </th>
                `
              )}
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (row) => html`
                <tr class="border-b border-base-50 last:border-b-0 hover:bg-base-50">
                  ${this._columns.map((col) => html`<td class="px-4 py-2.5 text-base-900">${row[col.field]}</td>`)}
                </tr>
              `
            )}
          </tbody>
        </table>
        ${rows.length === 0 ? html`<div class="px-4 py-8 text-center text-sm text-base-400">Sin datos</div>` : ''}
      </div>
    `;
  }
}

window.__uiwc.register('data-grid', UiDataGrid);
