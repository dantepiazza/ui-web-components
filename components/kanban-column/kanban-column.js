window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-kanban-column label="Por hacer">` wrapping `<ui-kanban-card>` children — a drop
 * target column. Emits `ui-kanban-move` (bubbles from the dropped card) with
 * `{ cardId }` when a card is dropped into this column.
 */
export class UiKanbanColumn extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const label = this.getAttribute('label') || '';
    this.className = `${window.__uiwc.prefix}-kanban-column flex w-64 shrink-0 flex-col rounded-xl bg-base-50 p-3`;

    const header = document.createElement('div');
    header.textContent = label;
    header.className = 'mb-2.5 text-sm font-semibold text-base-700';

    const body = document.createElement('div');
    body.className = 'min-h-8 rounded-lg';
    [...this.children].forEach((child) => body.appendChild(child));

    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.classList.add('bg-base-100');
      this.classList.remove('bg-base-50');
    });
    body.addEventListener('dragleave', () => {
      this.classList.add('bg-base-50');
      this.classList.remove('bg-base-100');
    });
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      this.classList.add('bg-base-50');
      this.classList.remove('bg-base-100');
      const cardId = e.dataTransfer.getData('text/plain');
      const card = document.getElementById(cardId);
      if (card) {
        body.appendChild(card);
        this.dispatchEvent(new CustomEvent('ui-kanban-move', { bubbles: true, composed: true, detail: { cardId } }));
      }
    });

    this.append(header, body);
    this._body = body;
  }
}

window.__uiwc.register('kanban-column', UiKanbanColumn);
