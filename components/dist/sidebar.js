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
  const arr = Array.isArray(list) ? list : String(list).split(/\s+/).filter(Boolean);
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
  // components/sidebar/sidebar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSidebar = class extends HTMLElement {
    static get observedAttributes() {
      return ["open", "remove-class"];
    }
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const prefix = window.__uiwc.prefix;
      const headerEl = this.querySelector(`:scope > ${prefix}-sidebar-header`);
      const footerEl = this.querySelector(`:scope > ${prefix}-sidebar-footer`);
      const nav = document.createElement("nav");
      nav.className = `flex-1 flex flex-col gap-1 overflow-y-auto p-4
      [&>${prefix}-sidebar-section:first-child]:!pt-0
      [&>a]:flex [&>a]:items-center [&>a]:gap-2.5 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-1 [&>a]:text-sm [&>a]:text-brand-fg/70 [&>a]:no-underline [&>a:hover]:bg-brand-fg/10 [&>a:hover]:text-brand-fg
      [&>a.active]:bg-brand-fg/10 [&>a.active]:font-medium [&>a.active]:text-brand-fg
      [&>hr]:my-2 [&>hr]:border-brand-fg/20`;
      [...this.children].forEach((child) => {
        if (child !== headerEl && child !== footerEl) nav.appendChild(child);
      });
      this.append(nav);
      if (headerEl) this.prepend(headerEl);
      if (footerEl) this.append(footerEl);
      this.#applyClasses();
      this.#syncOpen();
      this.#initGestures();
    }
    disconnectedCallback() {
      this.#removeScrim();
      this._gestureCleanup?.();
    }
    attributeChangedCallback(name) {
      if (!this._built) return;
      if (name === "open") this.#syncOpen();
      if (name === "remove-class") this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-sidebar`,
        "fixed",
        "inset-y-0",
        "left-0",
        "z-40",
        "flex",
        "h-full",
        "w-72",
        "flex-col",
        "bg-brand-800",
        "text-brand-fg",
        "transition-transform",
        "md:static",
        "md:z-auto",
        "md:translate-x-0"
      ]);
    }
    show() {
      this.setAttribute("open", "");
    }
    hide() {
      this.removeAttribute("open");
    }
    toggle() {
      this.hasAttribute("open") ? this.hide() : this.show();
    }
    #syncOpen() {
      const open = this.hasAttribute("open");
      this.classList.toggle("translate-x-0", open);
      this.classList.toggle("-translate-x-full", !open);
      if (open) this.#ensureScrim();
      else this.#removeScrim();
    }
    #ensureScrim() {
      if (this._scrim) return this._scrim;
      const scrim = document.createElement("div");
      scrim.className = "fixed inset-0 z-30 bg-zinc-900/40 transition-opacity md:hidden";
      scrim.addEventListener("click", () => this.hide());
      document.body.appendChild(scrim);
      this._scrim = scrim;
      return scrim;
    }
    #removeScrim() {
      this._scrim?.remove();
      this._scrim = null;
    }
    // Below md: drag in from the left edge to open, drag left (on the panel or the
    // scrim) to close — the panel tracks the finger, then snaps open/closed on release.
    // Touch only; on desktop the sidebar is always visible so there's nothing to do.
    #initGestures() {
      const desktop = window.matchMedia("(min-width: 768px)");
      const EDGE = 24;
      let startX = 0;
      let startY = 0;
      let active = false;
      let claimed = false;
      let opening = false;
      const onStart = (e) => {
        if (desktop.matches || this._built !== true) return;
        const t = e.touches[0];
        const isOpen = this.hasAttribute("open");
        if (!isOpen) {
          if (t.clientX > EDGE) return;
          opening = true;
        } else {
          if (!this.contains(e.target) && e.target !== this._scrim) return;
          opening = false;
        }
        startX = t.clientX;
        startY = t.clientY;
        active = true;
        claimed = false;
      };
      const onMove = (e) => {
        if (!active) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (!claimed) {
          if (Math.abs(dy) > Math.abs(dx)) {
            active = false;
            return;
          }
          if (Math.abs(dx) < 8) return;
          claimed = true;
          this.style.transition = "none";
          this.#ensureScrim();
        }
        e.preventDefault();
        const width = this.offsetWidth || 288;
        const tx = opening ? Math.min(0, -width + Math.max(0, dx)) : Math.max(-width, Math.min(0, dx));
        this.style.transform = `translateX(${tx}px)`;
        if (this._scrim) this._scrim.style.opacity = String((width + tx) / width);
      };
      const onEnd = (e) => {
        if (!active) return;
        active = false;
        if (!claimed) return;
        const width = this.offsetWidth || 288;
        const dx = e.changedTouches[0].clientX - startX;
        const willOpen = opening ? dx > width * 0.35 : dx >= -width * 0.35;
        this.style.transition = "";
        this.style.transform = willOpen ? "translateX(0)" : "translateX(-100%)";
        if (this._scrim) this._scrim.style.opacity = "";
        const cleanup = () => {
          this.style.transform = "";
          this.style.transition = "";
          this.removeEventListener("transitionend", cleanup);
          clearTimeout(timer);
        };
        const timer = setTimeout(cleanup, 300);
        this.addEventListener("transitionend", cleanup);
        willOpen ? this.show() : this.hide();
      };
      document.addEventListener("touchstart", onStart, { passive: true });
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      this._gestureCleanup = () => {
        document.removeEventListener("touchstart", onStart);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };
    }
  };
  window.__uiwc.register("sidebar", UiSidebar);
  window.__uiwc.sidebarToggle = () => {
    document.querySelector(`${window.__uiwc.prefix}-sidebar`)?.toggle();
  };
  document.addEventListener("click", (e) => {
    if (e.target.closest(`[${window.__uiwc.prefix}-sidebar-toggle]`)) {
      window.__uiwc.sidebarToggle();
    }
  });
})();
