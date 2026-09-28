window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-data-grid-column field="name" label="Nombre" sortable>` — declares one column
 * of a `<ui-data-grid>`. Never rendered directly; `<ui-data-grid>` reads its attributes
 * once at connect time.
 */
export class UiDataGridColumn extends HTMLElement {
  connectedCallback() {
    this.hidden = true;
  }

  get field() {
    return this.getAttribute('field') || '';
  }

  get label() {
    return this.getAttribute('label') || this.field;
  }

  get sortable() {
    return this.hasAttribute('sortable');
  }
}

window.__uiwc.register('data-grid-column', UiDataGridColumn);
