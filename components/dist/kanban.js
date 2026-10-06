// Prepended (via esbuild's `banner` option) to EVERY compiled dist file — both the
// per-component ones and the combined ui-web-components.js — so `window.__uiwc`,
// `defineComponents()` and `window.__uiwc.register()` all exist before any
// component's own top-level code runs, even if that file is loaded completely alone
// (register.js is optional, same guarantee as always).
//
// `register(name, Class)` replaces calling `customElements.define()` directly. It
// solves a real ordering bug: components capture their light-DOM children once on
// connect (`this._content = this.innerHTML; this.innerHTML = ''`) and reinject them
// styled — correct IF the children are still raw when captured. If a "leaf"
// component (button, avatar, icon...) gets defined and upgrades before the
// "container" wrapping it (topbar, sidebar, popover, card...), the leaf renders
// itself first, and the container ends up capturing the leaf's *already-rendered*
// output instead of the original markup — content goes missing or doubles up.
//
// Rather than hand-listing "these components go before those" (fragile — breaks on
// any composition nobody anticipated), `register()` queues every component and, once
// the page has finished parsing (`DOMContentLoaded` — guaranteed to fire after every
// deferred script has run, so this works whether one component or all of them are
// loaded), inspects the REAL DOM to see which component tags actually nest inside
// which other component tags right now, builds a dependency graph from that, and
// topologically sorts before calling the real `customElements.define()` — so
// whatever you actually wrote gets registered outside-in, automatically, for any
// composition, not just the ones already known about.
window.__uiwc = window.__uiwc || { prefix: 'ui' };

// `remove-class` — library-wide convention, not per-component. Any component that
// applies its own classes to its main tag (self-styling host, or an inner wrapper it
// fully controls) MUST run its class list through this before applying it, so a
// consumer can strip a class they don't want WITHOUT the component having to grow a
// dedicated attribute for every possible knob (`padding="none"`, `no-border`, etc.)
// — set `remove-class="border p-4"` (space-separated) instead. Common case: a
// `<ui-table>` nested inside a `<ui-card>` doubles up borders/padding — trim either
// side with `remove-class` rather than the library trying to special-case that
// composition. Doesn't invent a new mental model: it's the same idea as the `class`
// attribute itself, just subtractive instead of additive.
window.__uiwc.classes = window.__uiwc.classes || function classes(list, el) {
  // Tolerant on purpose: entries may hold several space-separated classes or be empty
  // (`condition ? 'a b' : ''`) — classList.add() throws on both.
  const arr = (Array.isArray(list) ? list : [list]).flatMap((c) => String(c || '').split(/\s+/)).filter(Boolean);
  const removeAttr = el && el.getAttribute && el.getAttribute('remove-class');
  if (!removeAttr) return arr;
  const removed = new Set(removeAttr.split(/\s+/).filter(Boolean));
  return arr.filter((c) => !removed.has(c));
};

// Convenience for plain-`HTMLElement` self-styling components (the "no wrapper div"
// family — Rail, Sidebar, Card, Topbar...): filters `wanted` through `classes()`
// above, then removes exactly the classes it added last time before adding the new
// ones — so a `class` the consumer put on the tag themselves is never touched, and
// `remove-class` stays live if the component re-runs this on `attributeChangedCallback`.
window.__uiwc.syncClasses = window.__uiwc.syncClasses || function syncClasses(el, wanted) {
  const next = window.__uiwc.classes(wanted, el);
  if (el._uiwcOwnClasses) el.classList.remove(...el._uiwcOwnClasses);
  el.classList.add(...next);
  el._uiwcOwnClasses = next;
};

window.defineComponents = window.defineComponents || function defineComponents(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('defineComponents(prefix): se espera un string, ej. defineComponents("wc")');
  }
  window.__uiwc.prefix = prefix;
};

window.__uiwc.register = window.__uiwc.register || (function () {
  const pending = new Map(); // name -> Class, not yet defined
  let booted = false;

  function defineNow(name, Class) {
    const tag = `${window.__uiwc.prefix}-${name}`;
    if (!customElements.get(tag)) customElements.define(tag, Class);
  }

  function boot() {
    booted = true;
    const names = [...pending.keys()];
    if (!names.length) return;

    const prefix = window.__uiwc.prefix;
    // TAGNAME -> registered name, to recognize ancestors while walking up from each
    // element (tagName is always uppercase on DOM elements, regardless of source case).
    const tagToName = new Map(names.map((n) => [`${prefix}-${n}`.toUpperCase(), n]));

    // For every component actually present in the page right now, walk up from each
    // instance and record "this ancestor's component must be defined before mine".
    const mustComeAfter = new Map(names.map((n) => [n, new Set()])); // name -> names that must be defined AFTER it
    for (const name of names) {
      let els;
      try {
        els = document.querySelectorAll(`${prefix}-${name}`);
      } catch {
        continue;
      }
      els.forEach((el) => {
        let node = el.parentElement;
        while (node) {
          const ancestorName = tagToName.get(node.tagName);
          if (ancestorName && ancestorName !== name) mustComeAfter.get(ancestorName).add(name);
          node = node.parentElement;
        }
      });
    }

    // Kahn's algorithm: components with no unmet "must come after" dependency go
    // first, freeing up whatever they were blocking as each one is placed.
    const indegree = new Map(names.map((n) => [n, 0]));
    mustComeAfter.forEach((afters) => afters.forEach((n) => indegree.set(n, indegree.get(n) + 1)));
    const queue = names.filter((n) => indegree.get(n) === 0);
    const ordered = [];
    while (queue.length) {
      const n = queue.shift();
      ordered.push(n);
      mustComeAfter.get(n).forEach((after) => {
        indegree.set(after, indegree.get(after) - 1);
        if (indegree.get(after) === 0) queue.push(after);
      });
    }
    // Only reachable with a genuine cycle (a real one shouldn't happen from actual
    // DOM nesting) — append whatever's left over rather than silently dropping it.
    if (ordered.length < names.length) names.forEach((n) => ordered.includes(n) || ordered.push(n));

    ordered.forEach((name) => defineNow(name, pending.get(name)));
    pending.clear();
  }

  // NOT `readyState === 'loading'`: a `defer`red script — how every component here
  // is meant to be loaded — never sees "loading". By the time any deferred script
  // runs, parsing has already finished and `readyState` is already "interactive";
  // `DOMContentLoaded` fires only after every deferred script has run. So the only
  // state where that event is guaranteed to have ALREADY fired is "complete" (full
  // page load, i.e. this script was injected dynamically well after the fact).
  if (document.readyState === 'complete') {
    booted = true;
  } else {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  return function register(name, Class) {
    if (booted) defineNow(name, Class);
    else pending.set(name, Class);
  };
})();

(() => {
  // components/kanban/kanban.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var CARD = "[data-uiwc-kanban-card]";
  var COL = "[data-uiwc-kanban-column]";
  var INTERACTIVE = "a[href],button,input,select,textarea,label,[contenteditable],[data-no-drag]";
  var MOUSE_THRESHOLD = 5;
  var TOUCH_HOLD_MS = 220;
  var TOUCH_SLOP = 8;
  var EDGE = 48;
  var UiKanban = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    #drag = null;
    #raf = 0;
    #last = null;
    connectedCallback() {
      this.setAttribute("data-uiwc-kanban", "");
      this.#classes();
      if (this._bound) return;
      this._bound = true;
      this.addEventListener("pointerdown", this.#onPointerDown);
      this.addEventListener("keydown", this.#onKeyDown);
      this.addEventListener("dragstart", (e) => e.preventDefault());
      this.addEventListener("contextmenu", (e) => {
        if (this.#drag) e.preventDefault();
      });
      this.addEventListener(
        "touchmove",
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
        "relative",
        "flex",
        "items-start",
        "gap-4",
        "overflow-x-auto",
        "p-1",
        "[&[data-dragging]]:select-none",
        "[&[readonly]_[data-uiwc-kanban-card]]:!cursor-default"
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
    #idOf = (el) => el.getAttribute("card-id") ?? el.id;
    #colIdOf = (el) => el.getAttribute("column-id") ?? el.id;
    #cards = (col, exceptId) => [...col.children].filter((el) => el.matches(CARD) && this.#idOf(el) !== exceptId);
    #columns = () => [...this.querySelectorAll(COL)];
    // ---------- pointer ----------
    #onPointerDown = (e) => {
      if (this.hasAttribute("readonly") || this.#drag) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const card = e.target.closest(CARD);
      if (!card || !this.contains(card) || card.getAttribute("draggable") === "false") return;
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
        target: null
      };
      document.addEventListener("pointermove", this.#onMove);
      document.addEventListener("pointerup", this.#onUp);
      document.addEventListener("pointercancel", this.#onCancel);
      if (e.pointerType !== "mouse") {
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
        if (d.type === "mouse") {
          if (dist >= MOUSE_THRESHOLD) this.#begin();
        } else if (dist > TOUCH_SLOP) {
          this.#end();
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
        setTimeout(() => this._justDragged = false, 60);
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
      ghost.removeAttribute("id");
      ghost.removeAttribute("card-id");
      ghost.removeAttribute("tabindex");
      ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      ghost.setAttribute("data-ghost", "");
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: rect.width + "px",
        margin: "0",
        pointerEvents: "none",
        zIndex: "2147483647",
        willChange: "transform"
      });
      document.body.appendChild(ghost);
      d.ghost = ghost;
      const line = document.createElement("div");
      line.className = "pointer-events-none absolute z-10 hidden h-0.5 rounded bg-brand-500";
      this.appendChild(line);
      d.line = line;
      d.card.setAttribute("data-dragging", "");
      this.setAttribute("data-dragging", "");
      try {
        d.card.setPointerCapture?.(d.pointerId);
      } catch {
      }
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
        d.card = this.querySelector(`${CARD}[card-id="${CSS.escape(d.cardId)}"],${CARD}#${CSS.escape(d.cardId)}`) || d.card;
      }
      d.ghost.style.transform = `translate3d(${d.x - d.offsetX}px, ${d.y - d.offsetY}px, 0)`;
      const under = document.elementFromPoint(d.x, d.y);
      let column = under?.closest(COL) || null;
      if (column && !this.contains(column)) column = null;
      this.#columns().forEach((c) => c.toggleAttribute("data-over", c === column));
      if (!column) {
        d.target = null;
        d.line.classList.add("hidden");
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
        const header = column.querySelector(":scope > [data-uiwc-header]")?.getBoundingClientRect();
        left = c.left + 12;
        width = c.width - 24;
        top = (header ? header.bottom : c.top) + 8;
      }
      line.style.left = left - board.left + this.scrollLeft + "px";
      line.style.top = top - board.top + this.scrollTop + "px";
      line.style.width = width + "px";
      line.classList.remove("hidden");
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
        name = "ui-kanban-sort";
        detail = { cardId, card, columnId: this.#colIdOf(toColumn), orderedIds: toOrderedIds, index };
      } else {
        name = "ui-kanban-move";
        detail = {
          cardId,
          card,
          fromColumnId: this.#colIdOf(fromColumn),
          toColumnId: this.#colIdOf(toColumn),
          fromOrderedIds: this.#cards(fromColumn, cardId).map(this.#idOf),
          toOrderedIds,
          index
        };
      }
      const snapshot = { card, parent: card.parentNode, next: card.nextElementSibling };
      const ok = this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, cancelable: true, detail }));
      if (!ok || this.hasAttribute("controlled") || !card.isConnected) return;
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
      if (this.hasAttribute("readonly")) return;
      const kb = this.#drag?.kb ? this.#drag : null;
      if (!kb) {
        if (e.key !== " " || e.target !== e.target.closest(CARD)) return;
        const card = e.target;
        if (card.getAttribute("draggable") === "false" || this.#drag) return;
        const fromColumn = card.closest(COL);
        if (!fromColumn) return;
        e.preventDefault();
        const cardId = this.#idOf(card);
        const index2 = this.#cards(fromColumn).findIndex((c) => this.#idOf(c) === cardId);
        const line = document.createElement("div");
        line.className = "pointer-events-none absolute z-10 hidden h-0.5 rounded bg-brand-500";
        this.appendChild(line);
        this.#drag = { kb: true, active: true, card, cardId, fromColumn, line, target: null };
        card.setAttribute("data-dragging", "");
        this.setAttribute("data-dragging", "");
        this.#kbMove(this.#drag, fromColumn, index2);
        return;
      }
      const handled = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, " ": 1, Enter: 1, Escape: 1 };
      if (!handled[e.key]) return;
      e.preventDefault();
      const t = kb.target;
      if (e.key === "Escape") {
        this.#announce("Movimiento cancelado");
        return this.#end();
      }
      if (e.key === " " || e.key === "Enter") {
        this.#commit(kb.card, kb.cardId, kb.fromColumn, t);
        this.#announce("Tarjeta soltada");
        kb.card.focus?.();
        return this.#end();
      }
      const cols = this.#columns();
      let col = t.column;
      let index = t.index;
      if (e.key === "ArrowUp") index = Math.max(0, index - 1);
      if (e.key === "ArrowDown") index = Math.min(this.#cards(col, kb.cardId).length, index + 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const next = cols[cols.indexOf(col) + (e.key === "ArrowLeft" ? -1 : 1)];
        if (!next) return;
        col = next;
        index = Math.min(index, this.#cards(col, kb.cardId).length);
      }
      this.#kbMove(kb, col, index);
    };
    #kbMove(d, column, index) {
      this.#columns().forEach((c) => c.toggleAttribute("data-over", c === column));
      this.#setTarget(d, column, index);
      const total = this.#cards(column, d.cardId).length + 1;
      this.#announce(`${column.getAttribute("label") || "Columna"}, posici\xF3n ${index + 1} de ${total}`);
    }
    #announce(msg) {
      let live = this.querySelector(":scope > [data-uiwc-live]");
      if (!live) {
        live = document.createElement("div");
        live.setAttribute("data-uiwc-live", "");
        live.setAttribute("aria-live", "assertive");
        live.className = "sr-only";
        this.appendChild(live);
      }
      live.textContent = msg;
    }
    // ---------- cleanup ----------
    #end() {
      const d = this.#drag;
      this.#drag = null;
      cancelAnimationFrame(this.#raf);
      document.removeEventListener("pointermove", this.#onMove);
      document.removeEventListener("pointerup", this.#onUp);
      document.removeEventListener("pointercancel", this.#onCancel);
      if (!d) return;
      clearTimeout(d.timer);
      d.ghost?.remove();
      d.line?.remove();
      d.card?.removeAttribute("data-dragging");
      this.removeAttribute("data-dragging");
      this.#columns().forEach((c) => c.removeAttribute("data-over"));
      try {
        d.card?.releasePointerCapture?.(d.pointerId);
      } catch {
      }
    }
  };
  window.__uiwc.register("kanban", UiKanban);
})();
