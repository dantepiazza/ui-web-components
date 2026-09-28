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
  // components/dialog/dialog.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var DIALOG_CLASS = "rounded-xl p-6 max-w-md w-[90vw] max-h-[85vh] overflow-y-auto";
  var UiDialog = class extends HTMLElement {
    static get observedAttributes() {
      return ["open"];
    }
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const template = this.querySelector("template");
      const content = template ? template.content.cloneNode(true) : document.createDocumentFragment();
      template?.remove();
      const dialog = document.createElement("dialog");
      dialog.className = `${window.__uiwc.prefix}-dialog-native border-0 bg-surface shadow-2xl backdrop:bg-base-900/40 ${DIALOG_CLASS}`;
      dialog.appendChild(content);
      dialog.addEventListener("close", () => {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("ui-dialog-close", { bubbles: true, composed: true }));
      });
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
      });
      this._dialog = dialog;
      this.appendChild(dialog);
      if (this.hasAttribute("open")) dialog.showModal();
    }
    attributeChangedCallback(name, oldVal, newVal) {
      if (name !== "open" || !this._dialog) return;
      if (newVal !== null && !this._dialog.open) this._dialog.showModal();
      if (newVal === null && this._dialog.open) this._dialog.close();
    }
    show() {
      this.setAttribute("open", "");
    }
    close() {
      this.removeAttribute("open");
    }
    // ---- confirm/prompt convenience API — builds a one-off <ui-dialog> on the fly,
    // appends it to <body>, and resolves a Promise on close. Static methods (not global
    // `window.uiConfirm`-style functions) so the API stays consistent with how the rest
    // of the library works: a class with instance/class methods, not ambient globals.
    // For consumers using the classic (non-module) bundle who can't easily reach the
    // `UiDialog` class, `window.__uiwc.confirm()`/`.prompt()` below call the same code. ----
    static confirm(message, options = {}) {
      const { title = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", variant = "primary" } = options;
      return new Promise((resolve) => {
        const el = document.createElement(`${window.__uiwc.prefix}-dialog`);
        const template = document.createElement("template");
        const wrap = document.createElement("div");
        if (title) {
          const h = document.createElement("h3");
          h.className = "mb-2 text-base font-semibold text-base-900";
          h.textContent = title;
          wrap.appendChild(h);
        }
        const p = document.createElement("p");
        p.className = "mb-5 text-sm text-base-500";
        p.textContent = message;
        wrap.appendChild(p);
        const actions = document.createElement("div");
        actions.className = "flex justify-end gap-2";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.dataset.role = "cancel";
        cancelBtn.className = "rounded bg-base-50 px-3.5 py-2 text-sm font-medium text-base-900 hover:bg-base-200";
        cancelBtn.textContent = cancelLabel;
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.dataset.role = "confirm";
        confirmBtn.className = `rounded px-3.5 py-2 text-sm font-medium text-white ${variant === "danger" ? "bg-danger hover:bg-danger/90" : "bg-base-900 hover:bg-base-800"}`;
        confirmBtn.textContent = confirmLabel;
        actions.append(cancelBtn, confirmBtn);
        wrap.appendChild(actions);
        template.content.appendChild(wrap);
        el.appendChild(template);
        document.body.appendChild(el);
        let result = false;
        el.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-role]");
          if (!btn) return;
          result = btn.dataset.role === "confirm";
          el.close();
        });
        el.addEventListener(
          "ui-dialog-close",
          () => {
            el.remove();
            resolve(result);
          },
          { once: true }
        );
        el.show();
        requestAnimationFrame(() => el.querySelector('[data-role="confirm"]')?.focus());
      });
    }
    static prompt(message, options = {}) {
      const { title = "", placeholder = "", value = "", confirmLabel = "Aceptar", cancelLabel = "Cancelar" } = options;
      return new Promise((resolve) => {
        const el = document.createElement(`${window.__uiwc.prefix}-dialog`);
        const template = document.createElement("template");
        const wrap = document.createElement("div");
        if (title) {
          const h = document.createElement("h3");
          h.className = "mb-2 text-base font-semibold text-base-900";
          h.textContent = title;
          wrap.appendChild(h);
        }
        if (message) {
          const p = document.createElement("p");
          p.className = "mb-3 text-sm text-base-500";
          p.textContent = message;
          wrap.appendChild(p);
        }
        const input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.placeholder = placeholder;
        input.dataset.role = "input";
        input.className = "mb-5 w-full rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900";
        wrap.appendChild(input);
        const actions = document.createElement("div");
        actions.className = "flex justify-end gap-2";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.dataset.role = "cancel";
        cancelBtn.className = "rounded bg-base-50 px-3.5 py-2 text-sm font-medium text-base-900 hover:bg-base-200";
        cancelBtn.textContent = cancelLabel;
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.dataset.role = "confirm";
        confirmBtn.className = "rounded bg-base-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-base-800";
        confirmBtn.textContent = confirmLabel;
        actions.append(cancelBtn, confirmBtn);
        wrap.appendChild(actions);
        template.content.appendChild(wrap);
        el.appendChild(template);
        document.body.appendChild(el);
        const getInput = () => el.querySelector('[data-role="input"]');
        let result = null;
        el.addEventListener("click", (e) => {
          const btn = e.target.closest('[data-role="cancel"], [data-role="confirm"]');
          if (!btn) return;
          result = btn.dataset.role === "confirm" ? getInput().value : null;
          el.close();
        });
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && e.target.dataset.role === "input") {
            result = getInput().value;
            el.close();
          }
        });
        el.addEventListener(
          "ui-dialog-close",
          () => {
            el.remove();
            resolve(result);
          },
          { once: true }
        );
        el.show();
        requestAnimationFrame(() => getInput()?.focus());
      });
    }
  };
  window.__uiwc.register("dialog", UiDialog);
  window.__uiwc.confirm = (message, options) => UiDialog.confirm(message, options);
  window.__uiwc.prompt = (message, options) => UiDialog.prompt(message, options);
})();
