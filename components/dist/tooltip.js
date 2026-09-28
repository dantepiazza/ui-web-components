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
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // components/tooltip/tooltip.js
  var require_tooltip = __commonJS({
    "components/tooltip/tooltip.js"() {
      window.__uiwc = window.__uiwc || { prefix: "ui" };
      (function() {
        let tipEl = null;
        let currentTarget = null;
        let idCounter = 0;
        function attr(name) {
          return `${window.__uiwc.prefix}-${name}`;
        }
        function ensureTip() {
          if (tipEl) return tipEl;
          tipEl = document.createElement("div");
          tipEl.id = `uiwc-tooltip-${++idCounter}`;
          tipEl.setAttribute("role", "tooltip");
          tipEl.className = "pointer-events-none fixed z-50 max-w-xs rounded bg-base-900 px-2 py-1 text-xs text-white shadow-lg";
          tipEl.hidden = true;
          document.body.appendChild(tipEl);
          return tipEl;
        }
        function position(target, placement) {
          const tip = ensureTip();
          const rect = target.getBoundingClientRect();
          const tipRect = tip.getBoundingClientRect();
          const gap = 6;
          let top;
          let left;
          if (placement === "bottom") {
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2 - tipRect.width / 2;
          } else if (placement === "left") {
            top = rect.top + rect.height / 2 - tipRect.height / 2;
            left = rect.left - tipRect.width - gap;
          } else if (placement === "right") {
            top = rect.top + rect.height / 2 - tipRect.height / 2;
            left = rect.right + gap;
          } else {
            top = rect.top - tipRect.height - gap;
            left = rect.left + rect.width / 2 - tipRect.width / 2;
          }
          tip.style.top = `${Math.max(4, top)}px`;
          tip.style.left = `${Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))}px`;
        }
        function show(target) {
          const text = target.getAttribute(attr("tooltip"));
          if (!text) return;
          currentTarget = target;
          const tip = ensureTip();
          tip.textContent = text;
          tip.hidden = false;
          position(target, target.getAttribute(attr("tooltip-placement")) || "top");
          target.setAttribute("aria-describedby", tip.id);
        }
        function hide() {
          if (tipEl) tipEl.hidden = true;
          currentTarget?.removeAttribute("aria-describedby");
          currentTarget = null;
        }
        document.addEventListener("mouseover", (e) => {
          const el = e.target.closest(`[${attr("tooltip")}]`);
          if (el && el !== currentTarget) show(el);
        });
        document.addEventListener("mouseout", (e) => {
          const el = e.target.closest(`[${attr("tooltip")}]`);
          if (el && el === currentTarget) hide();
        });
        document.addEventListener("focusin", (e) => {
          const el = e.target.closest(`[${attr("tooltip")}]`);
          if (el) show(el);
        });
        document.addEventListener("focusout", (e) => {
          const el = e.target.closest(`[${attr("tooltip")}]`);
          if (el && el === currentTarget) hide();
        });
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") hide();
        });
      })();
    }
  });
  require_tooltip();
})();
