window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-kanban>` — horizontal-scroll wrapper around `<ui-kanban-column>` children.
 */
export class UiKanban extends HTMLElement {
  connectedCallback() {
    this.classList.add(`${window.__uiwc.prefix}-kanban`, 'flex', 'gap-4', 'overflow-x-auto', 'p-1');
  }
}

window.__uiwc.register('kanban', UiKanban);
