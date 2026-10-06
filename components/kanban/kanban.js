window.__uiwc = window.__uiwc || { prefix: 'ui' };

const CARD = '[data-uiwc-kanban-card]';
const COL = '[data-uiwc-kanban-column]';
const INTERACTIVE = 'a[href],button,input,select,textarea,label,[contenteditable],[data-no-drag]';
const MOUSE_THRESHOLD = 5;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP = 8;
const EDGE = 48;

/**
 * `<ui-kanban>` — board + the whole drag engine. Framework-agnostic by construction:
 *
 *  - **Delegation.** Every listener lives on the board (which a framework doesn't
 *    replace); cards/columns are found at event time, never wired one by one, so
 *    cards added/replaced by Livewire, React, Angular, Vue, HTMX... are draggable
 *    with no re-init.
 *  - **Pointer events**, not HTML5 DnD: mouse, touch (long-press so scrolling still
 *    works) and pen share one path. Keyboard: Space to pick up, arrows to move,
 *    Space/Enter to drop, Escape to cancel (announced via a live region).
 *  - **The real card isn't dragged**: a floating clone follows the pointer and an
 *    absolutely-positioned line marks the insertion point — nothing is reparented
 *    while dragging, so a re-render mid-drag (polling) can't corrupt anything.
 *  - **Events carry data, the app owns the state.** On drop it emits a cancelable
 *    `ui-kanban-move` (card changed column) or `ui-kanban-sort` (reordered inside its
 *    column) with the full resulting order of each affected column.
 *
 * DOM ownership — pick the mode that matches your stack:
 *  - default: the board moves the card node on drop (optimistic). `preventDefault()`
 *    on the event cancels it; `board.revert()` undoes it later (e.g. server said no).
 *    Fits server-rendered stacks (Livewire/morphdom/HTMX/vanilla).
 *  - `controlled`: the board NEVER touches the DOM; it only emits. You update your
 *    state and let the framework re-render. Fits React/Angular/Vue/Svelte, where
 *    moving a framework-owned node behind its back would desync it.
 *
 * `readonly` disables dragging entirely. `draggable="false"` on a card pins it.
 *
 * Events (all bubble, composed, cancelable, dispatched on the board):
 *  `ui-kanban-move` → { cardId, card, fromColumnId, toColumnId, fromOrderedIds, toOrderedIds, index }
 *  `ui-kanban-sort` → { cardId, card, columnId, orderedIds, index }
 * Ids are the raw strings of `card-id` / `column-id` (falling back to `id`).
 */
export class UiKanban extends HTMLElement {
  static get observedAttributes() {
    return ['remove-class'];
  }

  #drag = null;
  #raf = 0;
  #last = null;

  connectedCallback() {
    this.setAttribute('data-uiwc-kanban', '');
    this.#classes();
    if (this._bound) return;
    this._bound = true;
    this.addEventListener('pointerdown', this.#onPointerDown);
    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('dragstart', (e) => e.preventDefault());
    this.addEventListener('contextmenu', (e) => {
      if (this.#drag) e.preventDefault();
    });
    // Non-passive on purpose: after the touch long-press we must be able to stop the
    // browser from scrolling while the card is being dragged.
    this.addEventListener(
      'touchmove',
      (e) => {
        if (this.#drag?.active && e.cancelable) e.preventDefault();
      },
      { passive: false }
    );
  }

  disconnectedCallback() {
    this.#end();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#classes();
  }

  #classes() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-kanban`,
      'relative', 'flex', 'items-start', 'gap-4', 'overflow-x-auto', 'p-1',
      '[&[data-dragging]]:select-none',
      '[&[readonly]_[data-uiwc-kanban-card]]:!cursor-default',
    ]);
  }

  /** Undo the last DOM move this board made (async "the server rejected it" case). */
  revert() {
    const s = this.#last;
    this.#last = null;
    if (!s || !s.card.isConnected || !s.parent?.isConnected) return false;
    s.parent.insertBefore(s.card, s.next && s.next.parentNode === s.parent ? s.next : null);
    return true;
  }

  // ---------- helpers ----------
  #idOf = (el) => el.getAttribute('card-id') ?? el.id;
  #colIdOf = (el) => el.getAttribute('column-id') ?? el.id;
  #cards = (col, exceptId) => [...col.children].filter((el) => el.matches(CARD) && this.#idOf(el) !== exceptId);
  #columns = () => [...this.querySelectorAll(COL)];

  // ---------- pointer ----------
  #onPointerDown = (e) => {
    if (this.hasAttribute('readonly') || this.#drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest(CARD);
    if (!card || !this.contains(card) || card.getAttribute('draggable') === 'false') return;
    const interactive = e.target.closest(INTERACTIVE);
    if (interactive && card.contains(interactive)) return;
    const fromColumn = card.closest(COL);
    if (!fromColumn) return;

    this.#drag = {
      card,
      cardId: this.#idOf(card),
      fromColumn,
      pointerId: e.pointerId,
      type: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      target: null,
    };
    document.addEventListener('pointermove', this.#onMove);
    document.addEventListener('pointerup', this.#onUp);
    document.addEventListener('pointercancel', this.#onCancel);
    if (e.pointerType !== 'mouse') {
      this.#drag.timer = setTimeout(() => this.#begin(), TOUCH_HOLD_MS);
    }
  };

  #onMove = (e) => {
    const d = this.#drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.active) {
      const dist = Math.hypot(d.x - d.startX, d.y - d.startY);
      if (d.type === 'mouse') {
        if (dist >= MOUSE_THRESHOLD) this.#begin();
      } else if (dist > TOUCH_SLOP) {
        this.#end(); // finger moved before the hold elapsed → it's a scroll
      }
      return;
    }
    this.#update();
  };

  #onUp = (e) => {
    const d = this.#drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.active) {
      this.#commit(d.card, d.cardId, d.fromColumn, d.target);
      this._justDragged = true;
      setTimeout(() => (this._justDragged = false), 60);
    }
    this.#end();
  };

  #onCancel = (e) => {
    if (this.#drag && e.pointerId === this.#drag.pointerId) this.#end();
  };

  #begin() {
    const d = this.#drag;
    if (!d || d.active) return;
    clearTimeout(d.timer);
    d.active = true;

    const rect = d.card.getBoundingClientRect();
    d.offsetX = d.startX - rect.left;
    d.offsetY = d.startY - rect.top;
    const ghost = d.card.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.removeAttribute('card-id');
    ghost.removeAttribute('tabindex');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.setAttribute('data-ghost', '');
    Object.assign(ghost.style, {
      position: 'fixed', left: '0', top: '0', width: rect.width + 'px', margin: '0',
      pointerEvents: 'none', zIndex: '2147483647', willChange: 'transform',
    });
    document.body.appendChild(ghost);
    d.ghost = ghost;

    const line = document.createElement('div');
    line.className = 'pointer-events-none absolute z-10 hidden h-0.5 rounded bg-brand-500';
    this.appendChild(line);
    d.line = line;

    d.card.setAttribute('data-dragging', '');
    this.setAttribute('data-dragging', '');
    try { d.card.setPointerCapture?.(d.pointerId); } catch { /* clone/removed */ }

    const tick = () => {
      if (!this.#drag?.active) return;
      this.#autoscroll();
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
    this.#update();
  }

  #autoscroll() {
    const d = this.#drag;
    const r = this.getBoundingClientRect();
    let dx = 0;
    if (d.x < r.left + EDGE) dx = -Math.ceil((r.left + EDGE - d.x) / 4);
    else if (d.x > r.right - EDGE) dx = Math.ceil((d.x - (r.right - EDGE)) / 4);
    if (dx) {
      this.scrollLeft += dx;
      this.#update();
    }
  }

  #update() {
    const d = this.#drag;
    if (!d?.active) return;
    if (!d.card.isConnected) {
      // the framework replaced the dragged node; keep going using the captured id
      d.card = this.querySelector(`${CARD}[card-id="${CSS.escape(d.cardId)}"],${CARD}#${CSS.escape(d.cardId)}`) || d.card;
    }
    d.ghost.style.transform = `translate3d(${d.x - d.offsetX}px, ${d.y - d.offsetY}px, 0)`;

    const under = document.elementFromPoint(d.x, d.y);
    let column = under?.closest(COL) || null;
    if (column && !this.contains(column)) column = null;
    this.#columns().forEach((c) => c.toggleAttribute('data-over', c === column));
    if (!column) {
      d.target = null;
      d.line.classList.add('hidden');
      return;
    }
    this.#setTarget(d, column, this.#indexAt(column, d.cardId, d.y));
  }

  #indexAt(column, cardId, y) {
    const cards = this.#cards(column, cardId);
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return cards.length;
  }

  #setTarget(d, column, index) {
    const cards = this.#cards(column, d.cardId);
    const ref = cards[index] || null;
    d.target = { column, index, ref };
    this.#showLine(d.line, column, cards, index);
  }

  #showLine(line, column, cards, index) {
    const board = this.getBoundingClientRect();
    let left, width, top;
    if (cards.length) {
      const anchor = cards[index] || cards[cards.length - 1];
      const r = anchor.getBoundingClientRect();
      left = r.left;
      width = r.width;
      top = cards[index] ? r.top - 5 : r.bottom + 3;
    } else {
      const c = column.getBoundingClientRect();
      const header = column.querySelector(':scope > [data-uiwc-header]')?.getBoundingClientRect();
      left = c.left + 12;
      width = c.width - 24;
      top = (header ? header.bottom : c.top) + 8;
    }
    line.style.left = left - board.left + this.scrollLeft + 'px';
    line.style.top = top - board.top + this.scrollTop + 'px';
    line.style.width = width + 'px';
    line.classList.remove('hidden');
  }

  // ---------- commit (shared by pointer + keyboard) ----------
  #commit(card, cardId, fromColumn, target) {
    if (!target) return;
    const { column: toColumn, index, ref } = target;
    const sameColumn = toColumn === fromColumn;
    const toOrderedIds = this.#cards(toColumn, cardId).map(this.#idOf);
    toOrderedIds.splice(index, 0, cardId);

    let name, detail;
    if (sameColumn) {
      const before = this.#cards(fromColumn).map(this.#idOf);
      if (before.length === toOrderedIds.length && before.every((id, i) => id === toOrderedIds[i])) return;
      name = 'ui-kanban-sort';
      detail = { cardId, card, columnId: this.#colIdOf(toColumn), orderedIds: toOrderedIds, index };
    } else {
      name = 'ui-kanban-move';
      detail = {
        cardId,
        card,
        fromColumnId: this.#colIdOf(fromColumn),
        toColumnId: this.#colIdOf(toColumn),
        fromOrderedIds: this.#cards(fromColumn, cardId).map(this.#idOf),
        toOrderedIds,
        index,
      };
    }

    const snapshot = { card, parent: card.parentNode, next: card.nextElementSibling };
    const ok = this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, cancelable: true, detail }));
    if (!ok || this.hasAttribute('controlled') || !card.isConnected) return;

    if (ref && ref.isConnected && ref.parentNode === toColumn) ref.before(card);
    else {
      const last = this.#cards(toColumn, cardId).pop();
      if (last) last.after(card);
      else toColumn.append(card);
    }
    this.#last = snapshot;
  }

  // ---------- keyboard ----------
  #onKeyDown = (e) => {
    if (this.hasAttribute('readonly')) return;
    const kb = this.#drag?.kb ? this.#drag : null;

    if (!kb) {
      if (e.key !== ' ' || e.target !== e.target.closest(CARD)) return;
      const card = e.target;
      if (card.getAttribute('draggable') === 'false' || this.#drag) return;
      const fromColumn = card.closest(COL);
      if (!fromColumn) return;
      e.preventDefault();
      const cardId = this.#idOf(card);
      const index = this.#cards(fromColumn).findIndex((c) => this.#idOf(c) === cardId);
      const line = document.createElement('div');
      line.className = 'pointer-events-none absolute z-10 hidden h-0.5 rounded bg-brand-500';
      this.appendChild(line);
      this.#drag = { kb: true, active: true, card, cardId, fromColumn, line, target: null };
      card.setAttribute('data-dragging', '');
      this.setAttribute('data-dragging', '');
      this.#kbMove(this.#drag, fromColumn, index);
      return;
    }

    const handled = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1, Enter: 1, Escape: 1 };
    if (!handled[e.key]) return;
    e.preventDefault();
    const t = kb.target;
    if (e.key === 'Escape') {
      this.#announce('Movimiento cancelado');
      return this.#end();
    }
    if (e.key === ' ' || e.key === 'Enter') {
      this.#commit(kb.card, kb.cardId, kb.fromColumn, t);
      this.#announce('Tarjeta soltada');
      kb.card.focus?.();
      return this.#end();
    }
    const cols = this.#columns();
    let col = t.column;
    let index = t.index;
    if (e.key === 'ArrowUp') index = Math.max(0, index - 1);
    if (e.key === 'ArrowDown') index = Math.min(this.#cards(col, kb.cardId).length, index + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = cols[cols.indexOf(col) + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!next) return;
      col = next;
      index = Math.min(index, this.#cards(col, kb.cardId).length);
    }
    this.#kbMove(kb, col, index);
  };

  #kbMove(d, column, index) {
    this.#columns().forEach((c) => c.toggleAttribute('data-over', c === column));
    this.#setTarget(d, column, index);
    const total = this.#cards(column, d.cardId).length + 1;
    this.#announce(`${column.getAttribute('label') || 'Columna'}, posición ${index + 1} de ${total}`);
  }

  #announce(msg) {
    let live = this.querySelector(':scope > [data-uiwc-live]');
    if (!live) {
      live = document.createElement('div');
      live.setAttribute('data-uiwc-live', '');
      live.setAttribute('aria-live', 'assertive');
      live.className = 'sr-only';
      this.appendChild(live);
    }
    live.textContent = msg;
  }

  // ---------- cleanup ----------
  #end() {
    const d = this.#drag;
    this.#drag = null;
    cancelAnimationFrame(this.#raf);
    document.removeEventListener('pointermove', this.#onMove);
    document.removeEventListener('pointerup', this.#onUp);
    document.removeEventListener('pointercancel', this.#onCancel);
    if (!d) return;
    clearTimeout(d.timer);
    d.ghost?.remove();
    d.line?.remove();
    d.card?.removeAttribute('data-dragging');
    this.removeAttribute('data-dragging');
    this.#columns().forEach((c) => c.removeAttribute('data-over'));
    try { d.card?.releasePointerCapture?.(d.pointerId); } catch { /* ignore */ }
  }
}

window.__uiwc.register('kanban', UiKanban);
