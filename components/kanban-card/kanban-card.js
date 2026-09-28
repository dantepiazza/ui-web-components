window.__uiwc = window.__uiwc || { prefix: 'ui' };

let cardIdCounter = 0;

/**
 * `<ui-kanban-card>` — a draggable card inside a `<ui-kanban-column>`. Plain custom
 * element built on the native HTML5 Drag and Drop API (`draggable="true"`).
 */
export class UiKanbanCard extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.id = this.id || `ui-kanban-card-${++cardIdCounter}`;
    this.draggable = true;
    this.className = `${window.__uiwc.prefix}-kanban-card mb-2 block cursor-grab rounded-lg border border-base-200 bg-surface px-3 py-2.5 text-sm text-base-700 shadow-sm`;

    this.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', this.id);
      e.dataTransfer.effectAllowed = 'move';
      this.classList.add('opacity-50');
    });
    this.addEventListener('dragend', () => this.classList.remove('opacity-50'));
  }
}

window.__uiwc.register('kanban-card', UiKanbanCard);
