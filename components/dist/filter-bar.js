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
  // components/filter-bar/filter-bar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var norm = (opts = []) => opts.map((o) => typeof o === "object" ? { value: String(o.value), label: String(o.label ?? o.value) } : { value: String(o), label: String(o) });
  var UiFilterBar = class extends HTMLElement {
    #fields = [];
    #values = {};
    #applied = "{}";
    #mobileOpen = false;
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.className = `${window.__uiwc.prefix}-filter-bar block`;
      this.#upgradeProperty("fields");
      if (this.#fields.length) this.#render();
    }
    #upgradeProperty(prop) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        const value = this[prop];
        delete this[prop];
        this[prop] = value;
      }
    }
    get submitMode() {
      return this.getAttribute("submit") === "button" ? "button" : "auto";
    }
    get applyLabel() {
      return this.getAttribute("apply-label") || "Aplicar";
    }
    set fields(list) {
      this.#fields = list || [];
      this.#values = {};
      for (const f of this.#fields) {
        if (f.default != null) this.#values[f.name] = f.default;
        else if (f.type === "select-multiple" || f.type === "checkbox") this.#values[f.name] = [];
        else if (f.type === "switch") this.#values[f.name] = false;
        else this.#values[f.name] = "";
      }
      this.#applied = JSON.stringify(this.#values);
      if (this._built) this.#render();
    }
    get fields() {
      return this.#fields;
    }
    get values() {
      return JSON.parse(JSON.stringify(this.#values));
    }
    get isDirty() {
      return JSON.stringify(this.#values) !== this.#applied;
    }
    apply(changed = null) {
      this.#applied = JSON.stringify(this.#values);
      this.#refresh();
      this.#setMobileOpen(false);
      this.dispatchEvent(new CustomEvent("ui-filter-apply", { bubbles: true, composed: true, detail: { values: this.values, changed } }));
    }
    clear() {
      for (const f of this.#fields) {
        if (f.type === "select-multiple" || f.type === "checkbox") this.#values[f.name] = [];
        else if (f.type === "switch") this.#values[f.name] = false;
        else this.#values[f.name] = "";
      }
      this.#render();
      this.dispatchEvent(new CustomEvent("ui-filter-clear", { bubbles: true, composed: true, detail: { values: this.values } }));
      this.apply(null);
    }
    #activeCount() {
      return this.#fields.filter((f) => {
        const v = this.#values[f.name];
        if (Array.isArray(v)) return v.length > 0;
        if (f.type === "switch") return !!v;
        return v !== "" && v != null;
      }).length;
    }
    #changed(name) {
      this.#refresh();
      this.dispatchEvent(
        new CustomEvent("ui-filter-change", { bubbles: true, composed: true, detail: { values: this.values, changed: name, applied: this.submitMode === "auto" } })
      );
      if (this.submitMode === "auto") this.apply(name);
    }
    #refresh() {
      if (this._applyBtn) this._applyBtn.disabled = !this.isDirty;
      if (this._toggleCount) {
        const n = this.#activeCount();
        this._toggleCount.textContent = n;
        this._toggleCount.hidden = n === 0;
      }
    }
    #setMobileOpen(open) {
      this.#mobileOpen = open;
      if (!this._scrim || !this._fieldsRow) return;
      this._scrim.className = `fixed inset-0 z-40 bg-base-900/40 md:hidden ${open ? "" : "hidden"}`;
      this._toggleBtn?.setAttribute("aria-expanded", String(open));
      this._fieldsRow.className = open ? `${window.__uiwc.prefix}-filter-bar__fields flex max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:rounded-t-2xl max-md:border-0 max-md:bg-surface max-md:p-4 max-md:shadow-2xl max-md:max-h-[85vh] max-md:overflow-y-auto flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-surface p-3` : `${window.__uiwc.prefix}-filter-bar__fields max-md:hidden flex flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-surface p-3`;
    }
    // No template: this only rebuilds the field elements themselves (search/switch/
    // select/etc). The toggle button + scrim + fieldsRow wrapper are built once and
    // toggled via class swaps in #setMobileOpen, so opening/closing the mobile sheet
    // never re-mounts the fields (no lost focus/typed text).
    #render() {
      const prefix = window.__uiwc.prefix;
      this.replaceChildren();
      const scrim = document.createElement("div");
      scrim.addEventListener("click", () => this.#setMobileOpen(false));
      this._scrim = scrim;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "flex w-full items-center justify-center gap-2 rounded-xl border border-base-200 bg-surface px-3.5 py-2.5 text-sm font-medium text-base-700 hover:bg-base-50 md:hidden";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<uiwc-icon name="filter" size="sm"></uiwc-icon><span>Filtros</span>`;
      const countBadge = document.createElement("span");
      countBadge.className = "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white";
      countBadge.hidden = true;
      toggle.appendChild(countBadge);
      toggle.addEventListener("click", () => this.#setMobileOpen(!this.#mobileOpen));
      this._toggleBtn = toggle;
      this._toggleCount = countBadge;
      const fieldsRow = document.createElement("div");
      this._fieldsRow = fieldsRow;
      for (const f of this.#fields) {
        const el = this.#buildField(f, prefix);
        fieldsRow.appendChild(el);
      }
      if (this.submitMode === "button") {
        const applyBtn = document.createElement(`${prefix}-button`);
        applyBtn.setAttribute("size", "sm");
        applyBtn.textContent = this.applyLabel;
        applyBtn.addEventListener("click", () => this.apply(null));
        this._applyBtn = applyBtn;
        fieldsRow.appendChild(applyBtn);
      } else {
        this._applyBtn = null;
      }
      const clearBtn = document.createElement(`${prefix}-button`);
      clearBtn.setAttribute("size", "sm");
      clearBtn.setAttribute("variant", "ghost");
      clearBtn.setAttribute("icon", "x");
      clearBtn.textContent = "Limpiar filtros";
      clearBtn.addEventListener("click", () => this.clear());
      fieldsRow.appendChild(clearBtn);
      this.append(scrim, toggle, fieldsRow);
      this.#setMobileOpen(false);
      this.#refresh();
    }
    #buildOptions(el, prefix, options) {
      norm(options).forEach((o) => {
        const opt = document.createElement(`${prefix}-option`);
        opt.setAttribute("value", o.value);
        opt.textContent = o.label;
        el.appendChild(opt);
      });
    }
    #buildField(f, prefix) {
      if (f.type === "search") {
        const el2 = document.createElement(`${prefix}-input-search`);
        el2.setAttribute("placeholder", f.placeholder || f.label || "Buscar...");
        el2.value = this.#values[f.name] || "";
        let t;
        el2.addEventListener("ui-input", (e) => {
          clearTimeout(t);
          t = setTimeout(() => {
            this.#values[f.name] = e.detail.value.trim();
            this.#changed(f.name);
          }, f.debounce ?? 250);
        });
        return el2;
      }
      if (f.type === "switch") {
        const el2 = document.createElement(`${prefix}-switch`);
        el2.textContent = f.label || "";
        el2.checked = !!this.#values[f.name];
        el2.addEventListener("ui-change", (e) => {
          this.#values[f.name] = e.detail.checked;
          this.#changed(f.name);
        });
        return el2;
      }
      if (f.type === "select-multiple" || f.type === "checkbox") {
        const el2 = document.createElement(`${prefix}-multiselect`);
        el2.setAttribute("display", "count");
        el2.setAttribute("label", f.label || "");
        el2.setAttribute("placeholder", f.label || "Elegir...");
        this.#buildOptions(el2, prefix, f.options);
        el2.addEventListener("ui-change", (e) => {
          this.#values[f.name] = e.detail.values;
          this.#changed(f.name);
        });
        return el2;
      }
      const el = document.createElement(`${prefix}-select`);
      el.setAttribute("display", "count");
      el.setAttribute("label", f.label || "");
      el.setAttribute("placeholder", f.label || "Elegir...");
      this.#buildOptions(el, prefix, f.options);
      if (this.#values[f.name]) el.value = this.#values[f.name];
      el.addEventListener("ui-change", (e) => {
        this.#values[f.name] = e.detail.value;
        this.#changed(f.name);
      });
      return el;
    }
  };
  window.__uiwc.register("filter-bar", UiFilterBar);
})();
