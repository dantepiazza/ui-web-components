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
  // components/pull-refresh/pull-refresh.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var THRESHOLD = 64;
  var MAX_PULL = 96;
  var RESISTANCE = 0.5;
  var UiPullRefresh = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const prefix = window.__uiwc.prefix;
      this.classList.add(
        `${prefix}-pull-refresh`,
        "relative",
        "block",
        "overflow-y-auto",
        "overscroll-y-contain"
      );
      this._indicator = document.createElement("div");
      this._indicator.className = "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-16 -translate-y-16 items-center justify-center";
      this._indicator.innerHTML = `<uiwc-spinner size="sm"></uiwc-spinner>`;
      this._spinnerEl = this._indicator.firstElementChild;
      this._spinnerEl.style.opacity = "0";
      this.prepend(this._indicator);
      this.#initGestures();
    }
    disconnectedCallback() {
      this._gestureCleanup?.();
    }
    complete() {
      this._refreshing = false;
      this._indicator.style.transition = "transform .2s ease";
      this._indicator.style.transform = "";
      this._spinnerEl.style.opacity = "0";
    }
    #initGestures() {
      let startY = 0;
      let active = false;
      let claimed = false;
      let distance = 0;
      const snapBack = () => {
        this._indicator.style.transition = "transform .2s ease";
        this._indicator.style.transform = "";
        this._spinnerEl.style.opacity = "0";
      };
      const onStart = (e) => {
        if (this._refreshing || this.scrollTop > 0) return;
        startY = e.touches[0].clientY;
        active = true;
        claimed = false;
        distance = 0;
      };
      const onMove = (e) => {
        if (!active) return;
        const dy = e.touches[0].clientY - startY;
        if (!claimed) {
          if (dy < 6) {
            if (dy < -2) active = false;
            return;
          }
          if (this.scrollTop > 0) {
            active = false;
            return;
          }
          claimed = true;
          this._indicator.style.transition = "none";
        }
        if (dy <= 0) {
          active = false;
          snapBack();
          return;
        }
        e.preventDefault();
        distance = Math.min(MAX_PULL, dy * RESISTANCE);
        this._indicator.style.transform = `translateY(${distance}px)`;
        this._spinnerEl.style.opacity = String(Math.min(1, distance / THRESHOLD));
      };
      const onEnd = () => {
        if (!active) return;
        active = false;
        if (!claimed) return;
        if (distance >= THRESHOLD) this.#startRefresh();
        else snapBack();
      };
      this.addEventListener("touchstart", onStart, { passive: true });
      this.addEventListener("touchmove", onMove, { passive: false });
      this.addEventListener("touchend", onEnd);
      this.addEventListener("touchcancel", onEnd);
      this._gestureCleanup = () => {
        this.removeEventListener("touchstart", onStart);
        this.removeEventListener("touchmove", onMove);
        this.removeEventListener("touchend", onEnd);
        this.removeEventListener("touchcancel", onEnd);
      };
    }
    #startRefresh() {
      this._refreshing = true;
      this._indicator.style.transition = "transform .2s ease";
      this._indicator.style.transform = `translateY(${THRESHOLD}px)`;
      this._spinnerEl.style.opacity = "1";
      this.dispatchEvent(new CustomEvent(`${window.__uiwc.prefix}-refresh`, { bubbles: true }));
    }
  };
  window.__uiwc.register("pull-refresh", UiPullRefresh);
})();
