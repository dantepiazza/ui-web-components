window.__uiwc = window.__uiwc || { prefix: 'ui' };

const DOTS = {
  base: 'bg-base-400',
  brand: 'bg-brand-500',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

const CARD = '[data-uiwc-kanban-card]';

/**
 * `<ui-kanban-column column-id="3" label="En curso" color="brand" wip-limit="5" progress>`
 * — a column of `<ui-kanban-card>`. Cards are plain direct children, in the order you
 * render them; the column never moves, wraps or captures them, so server/framework
 * re-renders just work. Dragging is handled by the parent `<ui-kanban>`.
 *
 * The only DOM the column adds is a header (dot, label, live card count) and an
 * optional progress bar, as the first children, marked `data-uiwc-*`. If a re-render
 * wipes them they're put back (MutationObserver) — and since they're only chrome, a
 * framework that doesn't know them simply ignores them.
 *
 * A child with `slot="actions"` (e.g. a "+" button) is laid out at the header's right
 * edge by CSS grid — it is NOT moved into the header.
 *
 * `wip-limit`: count turns red above the limit. `progress`: bar of cards marked `done`.
 */
export class UiKanbanColumn extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'color', 'wip-limit', 'progress', 'remove-class'];
  }

  get columnId() {
    return this.getAttribute('column-id') ?? this.id;
  }

  connectedCallback() {
    this.setAttribute('data-uiwc-kanban-column', '');
    this.#classes();
    this.#chrome();
    if (!this._observer) {
      this._observer = new MutationObserver(() => this.#schedule());
      this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['done', 'data-uiwc-kanban-card'] });
    }
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = null;
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.#classes();
    this.#chrome();
  }

  #schedule() {
    if (this._pending) return;
    this._pending = true;
    queueMicrotask(() => {
      this._pending = false;
      if (this.isConnected) this.#chrome();
    });
  }

  #classes() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-kanban-column`,
      'grid', 'grid-cols-[1fr_auto]', 'content-start', 'gap-x-2', 'gap-y-2',
      'w-64', 'shrink-0', 'min-h-32', 'rounded-xl', 'bg-base-50', 'p-3', 'transition-colors',
      '[&[data-over]]:bg-base-100',
      '[&>*]:col-span-2',
      '[&>[data-uiwc-header]]:col-span-1', '[&>[data-uiwc-header]]:col-start-1', '[&>[data-uiwc-header]]:row-start-1',
      '[&>[slot=actions]]:col-span-1', '[&>[slot=actions]]:col-start-2', '[&>[slot=actions]]:row-start-1',
      '[&>[slot=actions]]:justify-self-end', '[&>[slot=actions]]:self-center',
    ]);
  }

  #chrome() {
    let header = this.querySelector(':scope > [data-uiwc-header]');
    if (!header) {
      header = document.createElement('div');
      header.setAttribute('data-uiwc-header', '');
      header.className = 'flex min-w-0 items-center gap-2 text-sm font-semibold text-base-700';
      header.innerHTML =
        '<span data-dot class="h-2 w-2 shrink-0 rounded-full"></span>' +
        '<span data-label class="truncate"></span>' +
        '<span data-count class="ml-auto rounded-full bg-base-100 px-1.5 text-xs font-medium text-base-500"></span>';
    }
    if (this.firstElementChild !== header) this.prepend(header);

    const cards = [...this.children].filter((el) => el.matches(CARD));
    const done = cards.filter((c) => c.hasAttribute('done')).length;
    const limit = parseInt(this.getAttribute('wip-limit'), 10);
    const over = Number.isFinite(limit) && cards.length > limit;

    const set = (sel, text) => {
      const el = header.querySelector(sel);
      if (el.textContent !== text) el.textContent = text;
      return el;
    };
    set('[data-label]', this.getAttribute('label') || '');
    const count = set('[data-count]', Number.isFinite(limit) ? `${cards.length}/${limit}` : String(cards.length));
    count.classList.toggle('bg-danger/10', over);
    count.classList.toggle('text-danger', over);
    count.classList.toggle('bg-base-100', !over);
    count.classList.toggle('text-base-500', !over);

    const dot = header.querySelector('[data-dot]');
    const dotClass = DOTS[this.getAttribute('color')];
    for (const c of Object.values(DOTS)) dot.classList.remove(c);
    if (dotClass) dot.classList.add(dotClass);
    dot.classList.toggle('hidden', !dotClass);

    let bar = this.querySelector(':scope > [data-uiwc-progress]');
    if (this.hasAttribute('progress')) {
      if (!bar) {
        bar = document.createElement('div');
        bar.setAttribute('data-uiwc-progress', '');
        bar.className = 'h-1 overflow-hidden rounded-full bg-base-200';
        bar.innerHTML = '<div class="h-full rounded-full bg-success transition-all"></div>';
      }
      if (header.nextElementSibling !== bar) header.after(bar);
      const pct = cards.length ? Math.round((done / cards.length) * 100) + '%' : '0%';
      const fill = bar.firstElementChild;
      if (fill.style.width !== pct) fill.style.width = pct;
    } else if (bar) {
      bar.remove();
    }
  }
}

window.__uiwc.register('kanban-column', UiKanbanColumn);
