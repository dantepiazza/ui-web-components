window.__uiwc = window.__uiwc || { prefix: 'ui' };

const PRIORITY = {
  high: 'border-l-4 border-l-danger',
  medium: 'border-l-4 border-l-warning',
  low: 'border-l-4 border-l-info',
};

const DUE_STATE = {
  danger: 'after:bg-danger/10 after:text-danger',
  warning: 'after:bg-warning/15 after:text-warning',
  neutral: 'after:bg-base-100 after:text-base-600',
};

let cardIdCounter = 0;

/**
 * `<ui-kanban-card card-id="42" priority="high" due="2026-10-12" clickable>` — a card
 * in a `<ui-kanban-column>`. PRESENTATION ONLY: it never captures, wraps or moves its
 * children, so whatever the server/framework renders inside stays exactly as rendered
 * and survives any re-render (morphdom, React, Angular, Vue...). Dragging lives in the
 * parent `<ui-kanban>`, which listens by delegation.
 *
 * Content goes in children marked with a `slot` attribute (plain light-DOM slots,
 * styled by position — no shadow DOM, no reparenting): `title`, `labels`, `meta`,
 * `footer`, `assignees`. Unslotted children render as-is.
 *
 * Attributes: `card-id` (falls back to `id`), `priority` (high|medium|low → coloured
 * left border), `done` (struck-through title), `due` (YYYY-MM-DD → badge: danger when
 * overdue and not done, warning within 7 days), `clickable` (emits
 * `ui-kanban-card-click`, also on Enter), `draggable="false"` (pins this card).
 */
export class UiKanbanCard extends HTMLElement {
  static get observedAttributes() {
    return ['priority', 'done', 'due', 'clickable', 'remove-class'];
  }

  get cardId() {
    return this.getAttribute('card-id') ?? this.id;
  }

  connectedCallback() {
    this.setAttribute('data-uiwc-kanban-card', '');
    if (!this.id && !this.hasAttribute('card-id')) this.id = `ui-kanban-card-${++cardIdCounter}`;
    if (!this.hasAttribute('tabindex') && !this.hasAttribute('data-ghost')) this.tabIndex = 0;

    if (!this._bound) {
      this._bound = true;
      this.addEventListener('click', () => this.#click());
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === this) this.#click();
      });
    }
    this.#apply();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#apply();
  }

  #click() {
    if (!this.hasAttribute('clickable')) return;
    if (this.closest('[data-uiwc-kanban]')?._justDragged) return;
    this.dispatchEvent(new CustomEvent('ui-kanban-card-click', { bubbles: true, composed: true, detail: { cardId: this.cardId, card: this } }));
  }

  #apply() {
    const done = this.hasAttribute('done');
    const clickable = this.hasAttribute('clickable');
    const due = this.#due(done);
    if (due) {
      this.setAttribute('data-due-label', due.label);
      this.setAttribute('data-due-state', due.state);
    } else {
      this.removeAttribute('data-due-label');
      this.removeAttribute('data-due-state');
    }

    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-kanban-card`,
      'flex', 'flex-col', 'gap-2', 'rounded-lg', 'border', 'border-base-200', 'bg-surface',
      'px-3', 'py-2.5', 'text-sm', 'text-base-700', 'shadow-sm', 'outline-none',
      'focus-visible:ring-2', 'focus-visible:ring-brand-500',
      clickable ? 'cursor-pointer' : 'cursor-grab',
      'active:cursor-grabbing',
      '[&[data-dragging]]:opacity-40',
      '[&[data-ghost]]:rotate-1', '[&[data-ghost]]:shadow-lg', '[&[data-ghost]]:cursor-grabbing', '[&[data-ghost]]:opacity-95',
      PRIORITY[this.getAttribute('priority')] || '',
      // slot layout (position-styled; nothing is reparented)
      '[&>[slot=labels]]:order-1', '[&>[slot=labels]]:flex', '[&>[slot=labels]]:flex-wrap', '[&>[slot=labels]]:gap-1',
      '[&>[slot=title]]:order-2', '[&>[slot=title]]:font-medium',
      done ? '[&>[slot=title]]:line-through' : '[&>[slot=title]]:text-base-900',
      done ? '[&>[slot=title]]:text-base-400' : '',
      '[&>[slot=meta]]:order-3', '[&>[slot=meta]]:flex', '[&>[slot=meta]]:flex-wrap', '[&>[slot=meta]]:items-center', '[&>[slot=meta]]:gap-1.5',
      '[&>[slot=footer]]:order-4', '[&>[slot=footer]]:flex', '[&>[slot=footer]]:items-center', '[&>[slot=footer]]:gap-2', '[&>[slot=footer]]:text-base-500',
      '[&>[slot=assignees]]:order-5', '[&>[slot=assignees]]:self-end',
      // due badge — drawn with ::after from data-* attributes (no extra DOM node)
      ...(due
        ? [
            'after:order-last', 'after:w-fit', 'after:rounded', 'after:px-1.5', 'after:py-0.5', 'after:text-xs', 'after:font-medium',
            'after:content-[attr(data-due-label)]',
            ...DUE_STATE[due.state].split(' '),
          ]
        : []),
    ]);
  }

  #due(done) {
    const raw = this.getAttribute('due');
    const m = raw && /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return null;
    const date = new Date(+m[1], +m[2] - 1, +m[3]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((date - today) / 86400000);
    const state = done ? 'neutral' : days < 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral';
    return { label: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), state };
  }
}

window.__uiwc.register('kanban-card', UiKanbanCard);
