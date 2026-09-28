window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-tree>` — wraps `<ui-tree-item>` children, applying tree styling and keeping
 * selection single (deselects the previous item when a new one is selected).
 */
export class UiTree extends HTMLElement {
  connectedCallback() {
    this.setAttribute('role', 'tree');
    this.classList.add(`${window.__uiwc.prefix}-tree`, 'block');
    this.addEventListener('ui-tree-select', this.#handleSelect);
  }

  disconnectedCallback() {
    this.removeEventListener('ui-tree-select', this.#handleSelect);
  }

  #handleSelect = (e) => {
    this.querySelectorAll(`${window.__uiwc.prefix}-tree-item`).forEach((item) => {
      if (item !== e.target) item.deselect?.();
    });
  };
}

window.__uiwc.register('tree', UiTree);
