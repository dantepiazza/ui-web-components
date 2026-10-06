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
  // components/file-manager-item/file-manager-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var IMAGE_EXT = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);
  var UiFileManagerItem = class extends HTMLElement {
    static get observedAttributes() {
      return ["name", "type", "size", "modified", "ext", "icon", "thumb", "selected", "disabled", "data-view", "remove-class"];
    }
    get itemId() {
      return this.getAttribute("item-id") ?? this.id;
    }
    connectedCallback() {
      this.setAttribute("data-uiwc-fm-item", "");
      this.setAttribute("role", "option");
      if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
      if (!this.hasAttribute("data-view")) {
        const view = this.closest("[data-uiwc-file-manager]")?.getAttribute("view");
        if (view) this.setAttribute("data-view", view);
      }
      this.#apply();
      if (!this._observer) {
        this._observer = new MutationObserver(() => this.#render());
        this._observer.observe(this, { childList: true });
      }
    }
    disconnectedCallback() {
      this._observer?.disconnect();
      this._observer = null;
    }
    attributeChangedCallback() {
      if (this.isConnected) this.#apply();
    }
    #apply() {
      const grid = this.getAttribute("data-view") === "grid";
      const selected = this.hasAttribute("selected");
      this.setAttribute("aria-selected", selected ? "true" : "false");
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-file-manager-item`,
        "relative",
        "block",
        "min-w-0",
        "cursor-pointer",
        "select-none",
        "rounded",
        "outline-none",
        "transition-colors",
        grid ? "p-2" : "px-3 py-2",
        "focus-visible:ring-2",
        "focus-visible:ring-brand-500",
        selected ? "bg-brand-900/10 ring-1 ring-brand-900/30" : "hover:bg-base-100",
        this.hasAttribute("disabled") ? "pointer-events-none opacity-50" : ""
      ]);
      this.#render();
    }
    #iconName() {
      const explicit = this.getAttribute("icon");
      if (explicit) return explicit;
      if (this.getAttribute("type") === "folder") return "folder";
      return IMAGE_EXT.has((this.getAttribute("ext") || "").toLowerCase()) ? "image" : "file";
    }
    #render() {
      if (!this.isConnected) return;
      const grid = this.getAttribute("data-view") === "grid";
      const g = (n) => this.getAttribute(n) || "";
      const key = [grid, g("type"), g("name"), g("size"), g("modified"), g("ext"), g("icon"), g("thumb")].join("");
      let body = this.querySelector(":scope > [data-uiwc-body]");
      if (body && body._key === key) return;
      if (!body) {
        body = document.createElement("div");
        body.setAttribute("data-uiwc-body", "");
        this.prepend(body);
      }
      body._key = key;
      body.replaceChildren();
      const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        n.className = cls;
        if (text != null) n.textContent = text;
        return n;
      };
      const folder = g("type") === "folder";
      const tone = folder ? "text-warning" : IMAGE_EXT.has(g("ext").toLowerCase()) ? "text-info" : "text-base-500";
      const iconBox = el("span", `flex shrink-0 items-center justify-center overflow-hidden bg-base-100 ${tone} ${grid ? "h-16 w-full rounded-lg" : "h-8 w-8 rounded"}`);
      if (grid && g("thumb")) {
        const img = el("img", "h-full w-full object-cover");
        img.src = g("thumb");
        img.alt = "";
        img.loading = "lazy";
        iconBox.appendChild(img);
      } else {
        const icon = document.createElement("uiwc-icon");
        icon.setAttribute("name", this.#iconName());
        icon.setAttribute("size", grid ? "md" : "sm");
        iconBox.appendChild(icon);
      }
      if (grid) {
        body.className = "flex w-full flex-col items-center gap-1.5 text-center";
        body.append(iconBox, el("span", "w-full truncate text-xs font-medium text-base-900", g("name")));
        if (g("size")) body.append(el("span", "text-[11px] text-base-500", g("size")));
      } else {
        body.className = "flex w-full min-w-0 items-center gap-3";
        body.append(
          iconBox,
          el("span", "min-w-0 flex-1 truncate text-sm font-medium text-base-900", g("name")),
          el("span", "hidden w-24 shrink-0 text-right text-xs text-base-500 sm:block", g("size")),
          el("span", "hidden w-36 shrink-0 text-right text-xs text-base-500 md:block", g("modified"))
        );
      }
    }
  };
  window.__uiwc.register("file-manager-item", UiFileManagerItem);
})();
