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
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e6) {
      throw mod = 0, e6;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // components/theme-toggle/theme-toggle.js
  var require_theme_toggle = __commonJS({
    "components/theme-toggle/theme-toggle.js"() {
      window.__uiwc = window.__uiwc || { prefix: "ui" };
      (function() {
        const STORAGE_KEY = "uiwc-theme";
        const SWITCHING_CLASS = "uiwc-theme-switching";
        const root = document.documentElement;
        const style = document.createElement("style");
        style.textContent = `.${SWITCHING_CLASS} *,.${SWITCHING_CLASS} *::before,.${SWITCHING_CLASS} *::after{transition:none!important}`;
        (document.head || document.documentElement).appendChild(style);
        function setClass(isDark) {
          root.classList.add(SWITCHING_CLASS);
          root.classList.toggle("dark", isDark);
          void root.offsetHeight;
          requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
        }
        function apply(theme) {
          setClass(theme === "dark");
          try {
            localStorage.setItem(STORAGE_KEY, theme);
          } catch (e6) {
          }
        }
        function currentTheme() {
          return root.classList.contains("dark") ? "dark" : "light";
        }
        window.__uiwc.setTheme = (theme) => apply(theme === "dark" ? "dark" : "light");
        window.__uiwc.themeToggle = () => apply(currentTheme() === "dark" ? "light" : "dark");
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved === "dark") root.classList.add("dark");
          else if (saved === "light") root.classList.remove("dark");
        } catch (e6) {
        }
        document.addEventListener("click", (e6) => {
          if (e6.target.closest(`[${window.__uiwc.prefix}-theme-toggle]`)) {
            window.__uiwc.themeToggle();
          }
        });
      })();
    }
  });

  // components/tooltip/tooltip.js
  var require_tooltip = __commonJS({
    "components/tooltip/tooltip.js"() {
      window.__uiwc = window.__uiwc || { prefix: "ui" };
      (function() {
        let tipEl = null;
        let currentTarget = null;
        let idCounter21 = 0;
        function attr(name) {
          return `${window.__uiwc.prefix}-${name}`;
        }
        function ensureTip() {
          if (tipEl) return tipEl;
          tipEl = document.createElement("div");
          tipEl.id = `uiwc-tooltip-${++idCounter21}`;
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
        document.addEventListener("mouseover", (e6) => {
          const el = e6.target.closest(`[${attr("tooltip")}]`);
          if (el && el !== currentTarget) show(el);
        });
        document.addEventListener("mouseout", (e6) => {
          const el = e6.target.closest(`[${attr("tooltip")}]`);
          if (el && el === currentTarget) hide();
        });
        document.addEventListener("focusin", (e6) => {
          const el = e6.target.closest(`[${attr("tooltip")}]`);
          if (el) show(el);
        });
        document.addEventListener("focusout", (e6) => {
          const el = e6.target.closest(`[${attr("tooltip")}]`);
          if (el && el === currentTarget) hide();
        });
        document.addEventListener("keydown", (e6) => {
          if (e6.key === "Escape") hide();
        });
      })();
    }
  });

  // node_modules/@lit/reactive-element/css-tag.js
  var t = globalThis;
  var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
  var s = /* @__PURE__ */ Symbol();
  var o = /* @__PURE__ */ new WeakMap();
  var n = class {
    constructor(t4, e6, o7) {
      if (this._$cssResult$ = true, o7 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
      this.cssText = t4, this.t = e6;
    }
    get styleSheet() {
      let t4 = this.o;
      const s4 = this.t;
      if (e && void 0 === t4) {
        const e6 = void 0 !== s4 && 1 === s4.length;
        e6 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s4, t4));
      }
      return t4;
    }
    toString() {
      return this.cssText;
    }
  };
  var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
  var S = (s4, o7) => {
    if (e) s4.adoptedStyleSheets = o7.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
    else for (const e6 of o7) {
      const o8 = document.createElement("style"), n5 = t.litNonce;
      void 0 !== n5 && o8.setAttribute("nonce", n5), o8.textContent = e6.cssText, s4.appendChild(o8);
    }
  };
  var c = e ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
    let e6 = "";
    for (const s4 of t5.cssRules) e6 += s4.cssText;
    return r(e6);
  })(t4) : t4;

  // node_modules/@lit/reactive-element/reactive-element.js
  var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
  var a = globalThis;
  var c2 = a.trustedTypes;
  var l = c2 ? c2.emptyScript : "";
  var p = a.reactiveElementPolyfillSupport;
  var d = (t4, s4) => t4;
  var u = { toAttribute(t4, s4) {
    switch (s4) {
      case Boolean:
        t4 = t4 ? l : null;
        break;
      case Object:
      case Array:
        t4 = null == t4 ? t4 : JSON.stringify(t4);
    }
    return t4;
  }, fromAttribute(t4, s4) {
    let i7 = t4;
    switch (s4) {
      case Boolean:
        i7 = null !== t4;
        break;
      case Number:
        i7 = null === t4 ? null : Number(t4);
        break;
      case Object:
      case Array:
        try {
          i7 = JSON.parse(t4);
        } catch (t5) {
          i7 = null;
        }
    }
    return i7;
  } };
  var f = (t4, s4) => !i2(t4, s4);
  var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
  Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
  var y = class extends HTMLElement {
    static addInitializer(t4) {
      this._$Ei(), (this.l ??= []).push(t4);
    }
    static get observedAttributes() {
      return this.finalize(), this._$Eh && [...this._$Eh.keys()];
    }
    static createProperty(t4, s4 = b) {
      if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t4) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t4, s4), !s4.noAccessor) {
        const i7 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t4, i7, s4);
        void 0 !== h3 && e2(this.prototype, t4, h3);
      }
    }
    static getPropertyDescriptor(t4, s4, i7) {
      const { get: e6, set: r4 } = h(this.prototype, t4) ?? { get() {
        return this[s4];
      }, set(t5) {
        this[s4] = t5;
      } };
      return { get: e6, set(s5) {
        const h3 = e6?.call(this);
        r4?.call(this, s5), this.requestUpdate(t4, h3, i7);
      }, configurable: true, enumerable: true };
    }
    static getPropertyOptions(t4) {
      return this.elementProperties.get(t4) ?? b;
    }
    static _$Ei() {
      if (this.hasOwnProperty(d("elementProperties"))) return;
      const t4 = n2(this);
      t4.finalize(), void 0 !== t4.l && (this.l = [...t4.l]), this.elementProperties = new Map(t4.elementProperties);
    }
    static finalize() {
      if (this.hasOwnProperty(d("finalized"))) return;
      if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
        const t5 = this.properties, s4 = [...r2(t5), ...o2(t5)];
        for (const i7 of s4) this.createProperty(i7, t5[i7]);
      }
      const t4 = this[Symbol.metadata];
      if (null !== t4) {
        const s4 = litPropertyMetadata.get(t4);
        if (void 0 !== s4) for (const [t5, i7] of s4) this.elementProperties.set(t5, i7);
      }
      this._$Eh = /* @__PURE__ */ new Map();
      for (const [t5, s4] of this.elementProperties) {
        const i7 = this._$Eu(t5, s4);
        void 0 !== i7 && this._$Eh.set(i7, t5);
      }
      this.elementStyles = this.finalizeStyles(this.styles);
    }
    static finalizeStyles(s4) {
      const i7 = [];
      if (Array.isArray(s4)) {
        const e6 = new Set(s4.flat(1 / 0).reverse());
        for (const s5 of e6) i7.unshift(c(s5));
      } else void 0 !== s4 && i7.push(c(s4));
      return i7;
    }
    static _$Eu(t4, s4) {
      const i7 = s4.attribute;
      return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t4 ? t4.toLowerCase() : void 0;
    }
    constructor() {
      super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
    }
    _$Ev() {
      this._$ES = new Promise((t4) => this.enableUpdating = t4), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t4) => t4(this));
    }
    addController(t4) {
      (this._$EO ??= /* @__PURE__ */ new Set()).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
    }
    removeController(t4) {
      this._$EO?.delete(t4);
    }
    _$E_() {
      const t4 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
      for (const i7 of s4.keys()) this.hasOwnProperty(i7) && (t4.set(i7, this[i7]), delete this[i7]);
      t4.size > 0 && (this._$Ep = t4);
    }
    createRenderRoot() {
      const t4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
      return S(t4, this.constructor.elementStyles), t4;
    }
    connectedCallback() {
      this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
    }
    enableUpdating(t4) {
    }
    disconnectedCallback() {
      this._$EO?.forEach((t4) => t4.hostDisconnected?.());
    }
    attributeChangedCallback(t4, s4, i7) {
      this._$AK(t4, i7);
    }
    _$ET(t4, s4) {
      const i7 = this.constructor.elementProperties.get(t4), e6 = this.constructor._$Eu(t4, i7);
      if (void 0 !== e6 && true === i7.reflect) {
        const h3 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s4, i7.type);
        this._$Em = t4, null == h3 ? this.removeAttribute(e6) : this.setAttribute(e6, h3), this._$Em = null;
      }
    }
    _$AK(t4, s4) {
      const i7 = this.constructor, e6 = i7._$Eh.get(t4);
      if (void 0 !== e6 && this._$Em !== e6) {
        const t5 = i7.getPropertyOptions(e6), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : u;
        this._$Em = e6;
        const r4 = h3.fromAttribute(s4, t5.type);
        this[e6] = r4 ?? this._$Ej?.get(e6) ?? r4, this._$Em = null;
      }
    }
    requestUpdate(t4, s4, i7, e6 = false, h3) {
      if (void 0 !== t4) {
        const r4 = this.constructor;
        if (false === e6 && (h3 = this[t4]), i7 ??= r4.getPropertyOptions(t4), !((i7.hasChanged ?? f)(h3, s4) || i7.useDefault && i7.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r4._$Eu(t4, i7)))) return;
        this.C(t4, s4, i7);
      }
      false === this.isUpdatePending && (this._$ES = this._$EP());
    }
    C(t4, s4, { useDefault: i7, reflect: e6, wrapped: h3 }, r4) {
      i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t4) && (this._$Ej.set(t4, r4 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r4) || (this._$AL.has(t4) || (this.hasUpdated || i7 || (s4 = void 0), this._$AL.set(t4, s4)), true === e6 && this._$Em !== t4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t4));
    }
    async _$EP() {
      this.isUpdatePending = true;
      try {
        await this._$ES;
      } catch (t5) {
        Promise.reject(t5);
      }
      const t4 = this.scheduleUpdate();
      return null != t4 && await t4, !this.isUpdatePending;
    }
    scheduleUpdate() {
      return this.performUpdate();
    }
    performUpdate() {
      if (!this.isUpdatePending) return;
      if (!this.hasUpdated) {
        if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
          for (const [t6, s5] of this._$Ep) this[t6] = s5;
          this._$Ep = void 0;
        }
        const t5 = this.constructor.elementProperties;
        if (t5.size > 0) for (const [s5, i7] of t5) {
          const { wrapped: t6 } = i7, e6 = this[s5];
          true !== t6 || this._$AL.has(s5) || void 0 === e6 || this.C(s5, void 0, i7, e6);
        }
      }
      let t4 = false;
      const s4 = this._$AL;
      try {
        t4 = this.shouldUpdate(s4), t4 ? (this.willUpdate(s4), this._$EO?.forEach((t5) => t5.hostUpdate?.()), this.update(s4)) : this._$EM();
      } catch (s5) {
        throw t4 = false, this._$EM(), s5;
      }
      t4 && this._$AE(s4);
    }
    willUpdate(t4) {
    }
    _$AE(t4) {
      this._$EO?.forEach((t5) => t5.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t4)), this.updated(t4);
    }
    _$EM() {
      this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
    }
    get updateComplete() {
      return this.getUpdateComplete();
    }
    getUpdateComplete() {
      return this._$ES;
    }
    shouldUpdate(t4) {
      return true;
    }
    update(t4) {
      this._$Eq &&= this._$Eq.forEach((t5) => this._$ET(t5, this[t5])), this._$EM();
    }
    updated(t4) {
    }
    firstUpdated(t4) {
    }
  };
  y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

  // node_modules/lit-html/lit-html.js
  var t2 = globalThis;
  var i3 = (t4) => t4;
  var s2 = t2.trustedTypes;
  var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
  var h2 = "$lit$";
  var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
  var n3 = "?" + o3;
  var r3 = `<${n3}>`;
  var l2 = document;
  var c3 = () => l2.createComment("");
  var a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
  var u2 = Array.isArray;
  var d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
  var f2 = "[ 	\n\f\r]";
  var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
  var _ = /-->/g;
  var m = />/g;
  var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
  var g = /'/g;
  var $ = /"/g;
  var y2 = /^(?:script|style|textarea|title)$/i;
  var x = (t4) => (i7, ...s4) => ({ _$litType$: t4, strings: i7, values: s4 });
  var b2 = x(1);
  var w = x(2);
  var T = x(3);
  var E = /* @__PURE__ */ Symbol.for("lit-noChange");
  var A = /* @__PURE__ */ Symbol.for("lit-nothing");
  var C = /* @__PURE__ */ new WeakMap();
  var P = l2.createTreeWalker(l2, 129);
  function V(t4, i7) {
    if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
    return void 0 !== e3 ? e3.createHTML(i7) : i7;
  }
  var N = (t4, i7) => {
    const s4 = t4.length - 1, e6 = [];
    let n5, l4 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
    for (let i8 = 0; i8 < s4; i8++) {
      const s5 = t4[i8];
      let a4, u4, d3 = -1, f3 = 0;
      for (; f3 < s5.length && (c5.lastIndex = f3, u4 = c5.exec(s5), null !== u4); ) f3 = c5.lastIndex, c5 === v ? "!--" === u4[1] ? c5 = _ : void 0 !== u4[1] ? c5 = m : void 0 !== u4[2] ? (y2.test(u4[2]) && (n5 = RegExp("</" + u4[2], "g")), c5 = p2) : void 0 !== u4[3] && (c5 = p2) : c5 === p2 ? ">" === u4[0] ? (c5 = n5 ?? v, d3 = -1) : void 0 === u4[1] ? d3 = -2 : (d3 = c5.lastIndex - u4[2].length, a4 = u4[1], c5 = void 0 === u4[3] ? p2 : '"' === u4[3] ? $ : g) : c5 === $ || c5 === g ? c5 = p2 : c5 === _ || c5 === m ? c5 = v : (c5 = p2, n5 = void 0);
      const x2 = c5 === p2 && t4[i8 + 1].startsWith("/>") ? " " : "";
      l4 += c5 === v ? s5 + r3 : d3 >= 0 ? (e6.push(a4), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i8 : x2);
    }
    return [V(t4, l4 + (t4[s4] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e6];
  };
  var S2 = class _S {
    constructor({ strings: t4, _$litType$: i7 }, e6) {
      let r4;
      this.parts = [];
      let l4 = 0, a4 = 0;
      const u4 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i7);
      if (this.el = _S.createElement(f3, e6), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
        const t5 = this.el.content.firstChild;
        t5.replaceWith(...t5.childNodes);
      }
      for (; null !== (r4 = P.nextNode()) && d3.length < u4; ) {
        if (1 === r4.nodeType) {
          if (r4.hasAttributes()) for (const t5 of r4.getAttributeNames()) if (t5.endsWith(h2)) {
            const i8 = v2[a4++], s4 = r4.getAttribute(t5).split(o3), e7 = /([.?@])?(.*)/.exec(i8);
            d3.push({ type: 1, index: l4, name: e7[2], strings: s4, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r4.removeAttribute(t5);
          } else t5.startsWith(o3) && (d3.push({ type: 6, index: l4 }), r4.removeAttribute(t5));
          if (y2.test(r4.tagName)) {
            const t5 = r4.textContent.split(o3), i8 = t5.length - 1;
            if (i8 > 0) {
              r4.textContent = s2 ? s2.emptyScript : "";
              for (let s4 = 0; s4 < i8; s4++) r4.append(t5[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l4 });
              r4.append(t5[i8], c3());
            }
          }
        } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l4 });
        else {
          let t5 = -1;
          for (; -1 !== (t5 = r4.data.indexOf(o3, t5 + 1)); ) d3.push({ type: 7, index: l4 }), t5 += o3.length - 1;
        }
        l4++;
      }
    }
    static createElement(t4, i7) {
      const s4 = l2.createElement("template");
      return s4.innerHTML = t4, s4;
    }
  };
  function M(t4, i7, s4 = t4, e6) {
    if (i7 === E) return i7;
    let h3 = void 0 !== e6 ? s4._$Co?.[e6] : s4._$Cl;
    const o7 = a2(i7) ? void 0 : i7._$litDirective$;
    return h3?.constructor !== o7 && (h3?._$AO?.(false), void 0 === o7 ? h3 = void 0 : (h3 = new o7(t4), h3._$AT(t4, s4, e6)), void 0 !== e6 ? (s4._$Co ??= [])[e6] = h3 : s4._$Cl = h3), void 0 !== h3 && (i7 = M(t4, h3._$AS(t4, i7.values), h3, e6)), i7;
  }
  var R = class {
    constructor(t4, i7) {
      this._$AV = [], this._$AN = void 0, this._$AD = t4, this._$AM = i7;
    }
    get parentNode() {
      return this._$AM.parentNode;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    u(t4) {
      const { el: { content: i7 }, parts: s4 } = this._$AD, e6 = (t4?.creationScope ?? l2).importNode(i7, true);
      P.currentNode = e6;
      let h3 = P.nextNode(), o7 = 0, n5 = 0, r4 = s4[0];
      for (; void 0 !== r4; ) {
        if (o7 === r4.index) {
          let i8;
          2 === r4.type ? i8 = new k(h3, h3.nextSibling, this, t4) : 1 === r4.type ? i8 = new r4.ctor(h3, r4.name, r4.strings, this, t4) : 6 === r4.type && (i8 = new Z(h3, this, t4)), this._$AV.push(i8), r4 = s4[++n5];
        }
        o7 !== r4?.index && (h3 = P.nextNode(), o7++);
      }
      return P.currentNode = l2, e6;
    }
    p(t4) {
      let i7 = 0;
      for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i7), i7 += s4.strings.length - 2) : s4._$AI(t4[i7])), i7++;
    }
  };
  var k = class _k {
    get _$AU() {
      return this._$AM?._$AU ?? this._$Cv;
    }
    constructor(t4, i7, s4, e6) {
      this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i7, this._$AM = s4, this.options = e6, this._$Cv = e6?.isConnected ?? true;
    }
    get parentNode() {
      let t4 = this._$AA.parentNode;
      const i7 = this._$AM;
      return void 0 !== i7 && 11 === t4?.nodeType && (t4 = i7.parentNode), t4;
    }
    get startNode() {
      return this._$AA;
    }
    get endNode() {
      return this._$AB;
    }
    _$AI(t4, i7 = this) {
      t4 = M(this, t4, i7), a2(t4) ? t4 === A || null == t4 || "" === t4 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t4 !== this._$AH && t4 !== E && this._(t4) : void 0 !== t4._$litType$ ? this.$(t4) : void 0 !== t4.nodeType ? this.T(t4) : d2(t4) ? this.k(t4) : this._(t4);
    }
    O(t4) {
      return this._$AA.parentNode.insertBefore(t4, this._$AB);
    }
    T(t4) {
      this._$AH !== t4 && (this._$AR(), this._$AH = this.O(t4));
    }
    _(t4) {
      this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t4 : this.T(l2.createTextNode(t4)), this._$AH = t4;
    }
    $(t4) {
      const { values: i7, _$litType$: s4 } = t4, e6 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
      if (this._$AH?._$AD === e6) this._$AH.p(i7);
      else {
        const t5 = new R(e6, this), s5 = t5.u(this.options);
        t5.p(i7), this.T(s5), this._$AH = t5;
      }
    }
    _$AC(t4) {
      let i7 = C.get(t4.strings);
      return void 0 === i7 && C.set(t4.strings, i7 = new S2(t4)), i7;
    }
    k(t4) {
      u2(this._$AH) || (this._$AH = [], this._$AR());
      const i7 = this._$AH;
      let s4, e6 = 0;
      for (const h3 of t4) e6 === i7.length ? i7.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i7[e6], s4._$AI(h3), e6++;
      e6 < i7.length && (this._$AR(s4 && s4._$AB.nextSibling, e6), i7.length = e6);
    }
    _$AR(t4 = this._$AA.nextSibling, s4) {
      for (this._$AP?.(false, true, s4); t4 !== this._$AB; ) {
        const s5 = i3(t4).nextSibling;
        i3(t4).remove(), t4 = s5;
      }
    }
    setConnected(t4) {
      void 0 === this._$AM && (this._$Cv = t4, this._$AP?.(t4));
    }
  };
  var H = class {
    get tagName() {
      return this.element.tagName;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    constructor(t4, i7, s4, e6, h3) {
      this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i7, this._$AM = e6, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
    }
    _$AI(t4, i7 = this, s4, e6) {
      const h3 = this.strings;
      let o7 = false;
      if (void 0 === h3) t4 = M(this, t4, i7, 0), o7 = !a2(t4) || t4 !== this._$AH && t4 !== E, o7 && (this._$AH = t4);
      else {
        const e7 = t4;
        let n5, r4;
        for (t4 = h3[0], n5 = 0; n5 < h3.length - 1; n5++) r4 = M(this, e7[s4 + n5], i7, n5), r4 === E && (r4 = this._$AH[n5]), o7 ||= !a2(r4) || r4 !== this._$AH[n5], r4 === A ? t4 = A : t4 !== A && (t4 += (r4 ?? "") + h3[n5 + 1]), this._$AH[n5] = r4;
      }
      o7 && !e6 && this.j(t4);
    }
    j(t4) {
      t4 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t4 ?? "");
    }
  };
  var I = class extends H {
    constructor() {
      super(...arguments), this.type = 3;
    }
    j(t4) {
      this.element[this.name] = t4 === A ? void 0 : t4;
    }
  };
  var L = class extends H {
    constructor() {
      super(...arguments), this.type = 4;
    }
    j(t4) {
      this.element.toggleAttribute(this.name, !!t4 && t4 !== A);
    }
  };
  var z = class extends H {
    constructor(t4, i7, s4, e6, h3) {
      super(t4, i7, s4, e6, h3), this.type = 5;
    }
    _$AI(t4, i7 = this) {
      if ((t4 = M(this, t4, i7, 0) ?? A) === E) return;
      const s4 = this._$AH, e6 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e6);
      e6 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
    }
    handleEvent(t4) {
      "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
    }
  };
  var Z = class {
    constructor(t4, i7, s4) {
      this.element = t4, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s4;
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AI(t4) {
      M(this, t4);
    }
  };
  var B = t2.litHtmlPolyfillSupport;
  B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
  var D = (t4, i7, s4) => {
    const e6 = s4?.renderBefore ?? i7;
    let h3 = e6._$litPart$;
    if (void 0 === h3) {
      const t5 = s4?.renderBefore ?? null;
      e6._$litPart$ = h3 = new k(i7.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
    }
    return h3._$AI(t4), h3;
  };

  // node_modules/lit-element/lit-element.js
  var s3 = globalThis;
  var i4 = class extends y {
    constructor() {
      super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
    }
    createRenderRoot() {
      const t4 = super.createRenderRoot();
      return this.renderOptions.renderBefore ??= t4.firstChild, t4;
    }
    update(t4) {
      const r4 = this.render();
      this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t4), this._$Do = D(r4, this.renderRoot, this.renderOptions);
    }
    connectedCallback() {
      super.connectedCallback(), this._$Do?.setConnected(true);
    }
    disconnectedCallback() {
      super.disconnectedCallback(), this._$Do?.setConnected(false);
    }
    render() {
      return E;
    }
  };
  i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
  var o4 = s3.litElementPolyfillSupport;
  o4?.({ LitElement: i4 });
  (s3.litElementVersions ??= []).push("4.2.2");

  // components/accordion/accordion.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiAccordion = class extends i4 {
    static properties = {
      multiple: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.multiple = false;
    }
    connectedCallback() {
      super.connectedCallback();
      this.classList.add(`${window.__uiwc.prefix}-accordion`, "block", "rounded", "border", "border-base-200", "px-4");
      this.addEventListener("ui-accordion-toggle", this.#handleToggle);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener("ui-accordion-toggle", this.#handleToggle);
    }
    #handleToggle = (e6) => {
      if (this.multiple || !e6.detail.open) return;
      this.querySelectorAll(`${window.__uiwc.prefix}-accordion-item`).forEach((item) => {
        if (item !== e6.target) item.open = false;
      });
    };
    // No template: this element only coordinates its live ui-accordion-item children,
    // it doesn't own or re-render their DOM.
    render() {
      return b2``;
    }
  };
  window.__uiwc.register("accordion", UiAccordion);

  // node_modules/lit-html/directive.js
  var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
  var e4 = (t4) => (...e6) => ({ _$litDirective$: t4, values: e6 });
  var i5 = class {
    constructor(t4) {
    }
    get _$AU() {
      return this._$AM._$AU;
    }
    _$AT(t4, e6, i7) {
      this._$Ct = t4, this._$AM = e6, this._$Ci = i7;
    }
    _$AS(t4, e6) {
      return this.update(t4, e6);
    }
    update(t4, e6) {
      return this.render(...e6);
    }
  };

  // node_modules/lit-html/directives/unsafe-html.js
  var e5 = class extends i5 {
    constructor(i7) {
      if (super(i7), this.it = A, i7.type !== t3.CHILD) throw Error(this.constructor.directiveName + "() can only be used in child bindings");
    }
    render(r4) {
      if (r4 === A || null == r4) return this._t = void 0, this.it = r4;
      if (r4 === E) return r4;
      if ("string" != typeof r4) throw Error(this.constructor.directiveName + "() called with a non-string value");
      if (r4 === this.it) return this._t;
      this.it = r4;
      const s4 = [r4];
      return s4.raw = s4, this._t = { _$litType$: this.constructor.resultType, strings: s4, values: [] };
    }
  };
  e5.directiveName = "unsafeHTML", e5.resultType = 1;
  var o5 = e4(e5);

  // components/accordion-item/accordion-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter = 0;
  var UiAccordionItem = class extends i4 {
    static properties = {
      label: { type: String },
      open: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.open = false;
      this._id = `ui-accordion-item-${++idCounter}`;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #toggle() {
      this.open = !this.open;
      this.dispatchEvent(new CustomEvent("ui-accordion-toggle", { bubbles: true, composed: true, detail: { open: this.open } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-accordion-item border-b border-base-200 last:border-b-0">
        <h3>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-medium text-base-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
            aria-expanded=${this.open}
            aria-controls="${this._id}-panel"
            @click=${this.#toggle}
          >
            ${this.label}
            <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? "rotate-180" : ""}"></uiwc-icon>
          </button>
        </h3>
        <div id="${this._id}-panel" role="region" ?hidden=${!this.open} class="pb-3 text-sm text-base-500">
          ${o5(this._content || "")}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("accordion-item", UiAccordionItem);

  // components/autocomplete/autocomplete.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter2 = 0;
  var UiAutocomplete = class extends i4 {
    static properties = {
      value: { type: String },
      placeholder: { type: String },
      disabled: { type: Boolean, reflect: true },
      name: { type: String },
      clearOnSelect: { type: Boolean, attribute: "clear-on-select" },
      _query: { state: true },
      _open: { state: true },
      _activeIndex: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.placeholder = "Buscar...";
      this.disabled = false;
      this.name = "";
      this.clearOnSelect = false;
      this._options = [];
      this._query = "";
      this._open = false;
      this._activeIndex = -1;
      this._id = `ui-autocomplete-${++idCounter2}`;
      this._onDocClick = (e6) => {
        if (!this.contains(e6.target)) this._open = false;
      };
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._options.length === 0) {
        const template = document.createElement("template");
        template.innerHTML = this.innerHTML;
        this._options = [...template.content.children].map((el) => ({
          value: el.getAttribute("value") || el.textContent.trim(),
          label: el.textContent.trim()
        }));
        this.innerHTML = "";
        const selected = this._options.find((o7) => o7.value === this.value);
        this._query = selected?.label || "";
      }
      document.addEventListener("click", this._onDocClick);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("click", this._onDocClick);
    }
    get #filtered() {
      const q = this._query.trim().toLowerCase();
      if (!q) return this._options;
      return this._options.filter((o7) => o7.label.toLowerCase().includes(q));
    }
    #handleInput(e6) {
      this._query = e6.target.value;
      this._open = true;
      this._activeIndex = -1;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this._query } }));
    }
    #select(option) {
      this.value = option.value;
      this._query = this.clearOnSelect ? "" : option.label;
      this._open = false;
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { value: option.value, label: option.label } }));
      if (this.clearOnSelect) this.value = "";
    }
    #handleKeydown(e6) {
      const results = this.#filtered;
      if (e6.key === "ArrowDown") {
        e6.preventDefault();
        this._open = true;
        this._activeIndex = Math.min(results.length - 1, this._activeIndex + 1);
      } else if (e6.key === "ArrowUp") {
        e6.preventDefault();
        this._activeIndex = Math.max(0, this._activeIndex - 1);
      } else if (e6.key === "Enter" && this._activeIndex >= 0) {
        e6.preventDefault();
        this.#select(results[this._activeIndex]);
      } else if (e6.key === "Escape") {
        this._open = false;
      }
    }
    render() {
      const results = this.#filtered;
      return b2`
      <div class="${window.__uiwc.prefix}-autocomplete relative">
        ${this.name ? b2`<input type="hidden" name=${this.name} .value=${this.value} />` : ""}
        <input
          id=${this._id}
          type="text"
          role="combobox"
          aria-expanded=${this._open}
          aria-autocomplete="list"
          class="w-full rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
          placeholder=${this.placeholder}
          .value=${this._query}
          ?disabled=${this.disabled}
          @input=${this.#handleInput}
          @focus=${() => this._open = true}
          @keydown=${this.#handleKeydown}
        />
        ${this._open && results.length ? b2`
              <div class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg" role="listbox">
                ${results.map(
        (o7, i7) => b2`
                    <div
                      role="option"
                      aria-selected=${i7 === this._activeIndex}
                      class="px-3 py-1.5 text-sm cursor-pointer ${i7 === this._activeIndex ? "bg-base-100 text-base-800" : "text-base-900 hover:bg-base-50"}"
                      @mousedown=${(e6) => e6.preventDefault()}
                      @click=${() => this.#select(o7)}
                    >
                      ${o7.label}
                    </div>
                  `
      )}
              </div>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("autocomplete", UiAutocomplete);

  // components/avatar/avatar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var SIZES = { sm: "w-6 h-6 text-xs", md: "w-9 h-9 text-sm", lg: "w-12 h-12 text-base" };
  var UiAvatar = class extends i4 {
    static properties = {
      src: { type: String },
      name: { type: String },
      size: { type: String, reflect: true },
      shape: { type: String, reflect: true },
      _imgFailed: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.src = "";
      this.name = "";
      this.size = "md";
      this.shape = "circle";
      this._imgFailed = false;
    }
    get #initials() {
      return this.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    }
    render() {
      const sizeClass = SIZES[this.size] || SIZES.md;
      const shapeClass = this.shape === "square" ? "rounded" : "rounded-full";
      const showImage = this.src && !this._imgFailed;
      return b2`
      <span
        class="${window.__uiwc.prefix}-avatar inline-flex items-center justify-center shrink-0 overflow-hidden bg-base-100 text-base-800 font-medium ${sizeClass} ${shapeClass}"
        role="img"
        aria-label=${this.name || "Avatar"}
      >
        ${showImage ? b2`<img
              class="w-full h-full object-cover"
              src=${this.src}
              alt=${this.name || ""}
              @error=${() => this._imgFailed = true}
            />` : b2`${this.#initials || ""}`}
      </span>
    `;
    }
  };
  window.__uiwc.register("avatar", UiAvatar);
  if (!customElements.get("uiwc-avatar")) {
    customElements.define("uiwc-avatar", class extends UiAvatar {
    });
  }

  // components/avatar-group/avatar-group.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var OVERLAP = { sm: "-space-x-1.5", md: "-space-x-2", lg: "-space-x-3" };
  var UiAvatarGroup = class extends HTMLElement {
    static get observedAttributes() {
      return ["size", "remove-class"];
    }
    connectedCallback() {
      this._built = true;
      this.#apply();
    }
    attributeChangedCallback() {
      if (this._built) this.#apply();
    }
    #apply() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-avatar-group`,
        "inline-flex",
        "items-center",
        OVERLAP[this.getAttribute("size")] || OVERLAP.md,
        "[&>*]:ring-2",
        "[&>*]:ring-surface",
        "[&>*]:shrink-0"
      ]);
    }
  };
  window.__uiwc.register("avatar-group", UiAvatarGroup);

  // components/badge/badge.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS = {
    neutral: "bg-base-50 text-base-900",
    primary: "bg-base-100 text-base-800",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    pink: "bg-pink-100 text-pink-700",
    indigo: "bg-indigo-100 text-indigo-700",
    cyan: "bg-cyan-100 text-cyan-700"
  };
  var UiBadge = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "neutral";
    }
    // Light DOM has no shadow root, so <slot> can't project children — capture the
    // author-provided markup once and re-inject it with unsafeHTML instead.
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const variantClass = VARIANTS[this.variant] || VARIANTS.neutral;
      return b2`
      <span class="${window.__uiwc.prefix}-badge inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${variantClass}">
        ${o5(this._content || "")}
      </span>
    `;
    }
  };
  window.__uiwc.register("badge", UiBadge);

  // components/banner-card/banner-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiBannerCard = class extends i4 {
    static properties = {
      icon: { type: String },
      heading: { type: String },
      text: { type: String },
      buttonLabel: { type: String, attribute: "button-label" },
      href: { type: String },
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.icon = "";
      this.heading = "";
      this.text = "";
      this.buttonLabel = "";
      this.href = "";
      this.removeClass = "";
    }
    #action() {
      this.dispatchEvent(new CustomEvent("ui-banner-action", { bubbles: true, composed: true }));
    }
    render() {
      const wanted = [
        `${window.__uiwc.prefix}-banner-card`,
        "flex",
        "items-center",
        "gap-4",
        "rounded",
        "border",
        "border-base-900",
        "bg-gradient-to-br",
        "from-base-900",
        "to-base-800",
        "p-5"
      ];
      const cls = window.__uiwc.classes(wanted, this).join(" ");
      const btnClass = "shrink-0 whitespace-nowrap rounded border-0 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-base-900 cursor-pointer no-underline";
      return b2`
      <div class="${cls}">
        ${this.icon ? b2`<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-white/10 text-white">
              <uiwc-icon name=${this.icon} size="md"></uiwc-icon>
            </span>` : ""}
        <div class="min-w-0 flex-1">
          <strong class="block text-[14.5px] font-bold text-white">${this.heading}</strong>
          ${this.text ? b2`<span class="mt-0.5 block text-[12.5px] text-white/65">${this.text}</span>` : ""}
        </div>
        ${this.buttonLabel ? this.href ? b2`<a href=${this.href} class="${btnClass}">${this.buttonLabel}</a>` : b2`<button type="button" @click=${this.#action} class="${btnClass}">${this.buttonLabel}</button>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("banner-card", UiBannerCard);

  // components/breadcrumb/breadcrumb.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiBreadcrumb = class extends i4 {
    createRenderRoot() {
      return this;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <nav class="${window.__uiwc.prefix}-breadcrumb" aria-label="Breadcrumb">
        <ol class="flex flex-wrap items-center gap-1.5 text-sm text-base-500 [&_a]:text-base-500 [&_a]:hover:text-base-900 [&_a]:no-underline [&_li:last-child]:text-base-900 [&_li:last-child]:font-medium">
          ${o5(this.#wrapItems(this._content || ""))}
        </ol>
      </nav>
    `;
    }
    // One <uiwc-icon chevron-right> between items instead of a CSS ::after "/" —
    // matches the icon-separator pattern most host design systems already use.
    #wrapItems(html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      const children = [...template.content.children];
      return children.map((child, i7) => {
        const separator = i7 < children.length - 1 ? '<uiwc-icon name="chevron-right" size="sm" class="text-base-300"></uiwc-icon>' : "";
        return `<li class="flex items-center gap-1.5">${child.outerHTML}${separator}</li>`;
      }).join("");
    }
  };
  window.__uiwc.register("breadcrumb", UiBreadcrumb);

  // components/button/button.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS2 = {
    primary: "bg-brand-900 text-brand-fg hover:bg-brand-800 focus-visible:outline-brand-900",
    secondary: "bg-base-100 text-base-900 hover:bg-base-200 focus-visible:outline-brand-500",
    ghost: "bg-transparent text-base-900 hover:bg-base-100 focus-visible:outline-brand-500",
    outlined: "bg-transparent border border-brand-900 text-brand-900 hover:bg-brand-900 hover:text-brand-fg focus-visible:outline-brand-900"
  };
  var COLOR_VARIANTS = {
    brand: {
      primary: "bg-brand-900 text-brand-fg hover:bg-brand-800 focus-visible:outline-brand-900",
      secondary: "bg-brand-100 text-brand-900 hover:bg-brand-200 focus-visible:outline-brand-500",
      ghost: "bg-transparent text-brand-900 hover:bg-brand-100 focus-visible:outline-brand-500",
      outlined: "bg-transparent border border-brand-900 text-brand-900 hover:bg-brand-900 hover:text-brand-fg focus-visible:outline-brand-900"
    },
    base: {
      primary: "bg-base-900 text-white hover:bg-base-800 focus-visible:outline-base-900",
      secondary: "bg-base-100 text-base-900 hover:bg-base-200 focus-visible:outline-base-500",
      ghost: "bg-transparent text-base-900 hover:bg-base-100 focus-visible:outline-base-500",
      outlined: "bg-transparent border border-base-300 text-base-900 hover:bg-base-900 hover:text-white focus-visible:outline-base-500"
    },
    success: {
      primary: "bg-success text-success-fg hover:bg-success/90 focus-visible:outline-success",
      secondary: "bg-success/10 text-success hover:bg-success/20 focus-visible:outline-success",
      ghost: "bg-transparent text-success hover:bg-success/10 focus-visible:outline-success",
      outlined: "bg-transparent border border-success text-success hover:bg-success hover:text-success-fg focus-visible:outline-success"
    },
    warning: {
      primary: "bg-warning text-warning-fg hover:bg-warning/90 focus-visible:outline-warning",
      secondary: "bg-warning/10 text-warning hover:bg-warning/20 focus-visible:outline-warning",
      ghost: "bg-transparent text-warning hover:bg-warning/10 focus-visible:outline-warning",
      outlined: "bg-transparent border border-warning text-warning hover:bg-warning hover:text-warning-fg focus-visible:outline-warning"
    },
    danger: {
      primary: "bg-danger text-danger-fg hover:bg-danger/90 focus-visible:outline-danger",
      secondary: "bg-danger/10 text-danger hover:bg-danger/20 focus-visible:outline-danger",
      ghost: "bg-transparent text-danger hover:bg-danger/10 focus-visible:outline-danger",
      outlined: "bg-transparent border border-danger text-danger hover:bg-danger hover:text-danger-fg focus-visible:outline-danger"
    },
    info: {
      primary: "bg-info text-info-fg hover:bg-info/90 focus-visible:outline-info",
      secondary: "bg-info/10 text-info hover:bg-info/20 focus-visible:outline-info",
      ghost: "bg-transparent text-info hover:bg-info/10 focus-visible:outline-info",
      outlined: "bg-transparent border border-info text-info hover:bg-info hover:text-info-fg focus-visible:outline-info"
    }
  };
  var VARIANTS_INVERTED = {
    primary: "bg-white text-zinc-900 hover:bg-zinc-200 focus-visible:outline-white",
    secondary: "bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white/70",
    ghost: "bg-transparent text-white hover:bg-white/10 focus-visible:outline-white/70",
    outlined: "bg-transparent border border-white text-white hover:bg-white hover:text-zinc-900 focus-visible:outline-white"
  };
  var INVERTED_COLOR_VARIANTS = {
    danger: {
      primary: "bg-rose-500 text-white hover:bg-rose-400 focus-visible:outline-rose-400",
      secondary: "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 focus-visible:outline-rose-400",
      ghost: "bg-transparent text-rose-300 hover:bg-rose-500/10 focus-visible:outline-rose-400",
      outlined: "bg-transparent border border-rose-400 text-rose-300 hover:bg-rose-500 hover:text-white focus-visible:outline-rose-400"
    },
    success: {
      primary: "bg-emerald-500 text-white hover:bg-emerald-400 focus-visible:outline-emerald-400",
      secondary: "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 focus-visible:outline-emerald-400",
      ghost: "bg-transparent text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-emerald-400",
      outlined: "bg-transparent border border-emerald-400 text-emerald-300 hover:bg-emerald-500 hover:text-white focus-visible:outline-emerald-400"
    },
    warning: {
      primary: "bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:outline-amber-400",
      secondary: "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 focus-visible:outline-amber-400",
      ghost: "bg-transparent text-amber-300 hover:bg-amber-500/10 focus-visible:outline-amber-400",
      outlined: "bg-transparent border border-amber-400 text-amber-300 hover:bg-amber-500 hover:text-amber-950 focus-visible:outline-amber-400"
    },
    info: {
      primary: "bg-sky-500 text-white hover:bg-sky-400 focus-visible:outline-sky-400",
      secondary: "bg-sky-500/20 text-sky-200 hover:bg-sky-500/30 focus-visible:outline-sky-400",
      ghost: "bg-transparent text-sky-300 hover:bg-sky-500/10 focus-visible:outline-sky-400",
      outlined: "bg-transparent border border-sky-400 text-sky-300 hover:bg-sky-500 hover:text-white focus-visible:outline-sky-400"
    }
  };
  var SIZES2 = {
    sm: "text-xs px-2.5 py-1.5 gap-1.5",
    md: "text-sm px-3.5 py-2 gap-2",
    lg: "text-base px-5 py-2.5 gap-2"
  };
  var ICON_ONLY_SIZES = { sm: "p-1.5", md: "p-2", lg: "p-2.5" };
  var ICON_SIZES = { sm: "sm", md: "sm", lg: "md" };
  var UiButton = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      size: { type: String, reflect: true },
      type: { type: String },
      disabled: { type: Boolean, reflect: true },
      loading: { type: Boolean, reflect: true },
      inverted: { type: Boolean, reflect: true },
      icon: { type: String },
      iconPosition: { type: String, attribute: "icon-position" },
      label: { type: String },
      href: { type: String },
      target: { type: String },
      color: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "primary";
      this.size = "md";
      this.type = "button";
      this.disabled = false;
      this.loading = false;
      this.inverted = false;
      this.icon = "";
      this.iconPosition = "start";
      this.label = "";
      this.href = "";
      this.target = "";
      this.color = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const shape = this.variant === "danger" ? "primary" : VARIANTS2[this.variant] ? this.variant : "primary";
      const color = this.color || (this.variant === "danger" ? "danger" : "");
      let variantClass;
      if (color && this.inverted && INVERTED_COLOR_VARIANTS[color]) {
        variantClass = INVERTED_COLOR_VARIANTS[color][shape] || INVERTED_COLOR_VARIANTS[color].primary;
      } else if (color && COLOR_VARIANTS[color]) {
        variantClass = COLOR_VARIANTS[color][shape] || COLOR_VARIANTS[color].primary;
      } else if (this.inverted) {
        variantClass = VARIANTS_INVERTED[shape] || VARIANTS_INVERTED.primary;
      } else {
        variantClass = VARIANTS2[shape] || VARIANTS2.primary;
      }
      const isDisabled = this.disabled || this.loading;
      const hasText = Boolean(this._content && this._content.trim());
      const iconOnly = Boolean(this.icon) && !hasText;
      if (iconOnly && !this.label) {
        console.warn('ui-button: icono sin texto visible \u2014 falta el atributo "label" para el nombre accesible');
      }
      const sizeClass = iconOnly ? ICON_ONLY_SIZES[this.size] || ICON_ONLY_SIZES.md : SIZES2[this.size] || SIZES2.md;
      const iconSize = iconOnly ? this.size : ICON_SIZES[this.size] || "sm";
      const icon = this.icon ? b2`<uiwc-icon name=${this.icon} size=${iconSize} class="w-[1.5em] h-[1.5em] aspect-square flex items-center justify-center"></uiwc-icon>` : "";
      const classes = `${window.__uiwc.prefix}-button inline-flex items-center justify-center rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variantClass} ${sizeClass}`;
      const inner = b2`
      ${this.loading ? b2`<uiwc-spinner size="sm" label="Cargando"></uiwc-spinner>` : this.iconPosition === "end" ? "" : icon}
      ${o5(this._content || "")}
      ${!this.loading && this.iconPosition === "end" ? icon : ""}
    `;
      if (this.href) {
        return b2`
        <a
          href=${isDisabled ? void 0 : this.href}
          target=${this.target || void 0}
          rel=${this.target === "_blank" ? "noopener noreferrer" : void 0}
          class="${classes} ${isDisabled ? "opacity-50 pointer-events-none" : ""}"
          aria-label=${iconOnly ? this.label : void 0}
          aria-disabled=${isDisabled ? "true" : void 0}
          tabindex=${isDisabled ? "-1" : void 0}
        >
          ${inner}
        </a>
      `;
      }
      return b2`
      <button
        type=${this.type}
        class="${classes}"
        ?disabled=${isDisabled}
        aria-label=${iconOnly ? this.label : void 0}
      >
        ${inner}
      </button>
    `;
    }
  };
  window.__uiwc.register("button", UiButton);

  // components/button-copy/button-copy.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiButtonCopy = class extends i4 {
    static properties = {
      value: { type: String },
      label: { type: String },
      _copied: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.label = "Copiar";
      this._copied = false;
    }
    async #handleClick() {
      try {
        await navigator.clipboard.writeText(this.value);
        this._copied = true;
        this.dispatchEvent(new CustomEvent("ui-copy", { bubbles: true, composed: true, detail: { value: this.value } }));
        setTimeout(() => this._copied = false, 1500);
      } catch {
        console.warn("ui-button-copy: no se pudo escribir al portapapeles");
      }
    }
    render() {
      return b2`
      <button
        type="button"
        class="${window.__uiwc.prefix}-button-copy inline-flex items-center gap-1.5 rounded border border-base-200 bg-surface px-2.5 py-1.5 text-xs font-medium text-base-900 hover:bg-base-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
        @click=${this.#handleClick}
        aria-label=${this.label}
      >
        <uiwc-icon name=${this._copied ? "check" : "copy"} size="sm" class=${this._copied ? "text-success" : ""}></uiwc-icon>
        ${this._copied ? "Copiado" : this.label}
      </button>
    `;
    }
  };
  window.__uiwc.register("button-copy", UiButtonCopy);

  // components/button-group/button-group.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiButtonGroup = class extends i4 {
    createRenderRoot() {
      return this;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-button-group inline-flex items-center gap-1 rounded border border-base-200 bg-surface p-1" role="group">
        ${o5(this._content || "")}
      </div>
    `;
    }
  };
  window.__uiwc.register("button-group", UiButtonGroup);

  // components/calendar/calendar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "S\xE1", "Do"];
  function toISODate(date) {
    return date.toISOString().slice(0, 10);
  }
  var UiCalendar = class extends i4 {
    static properties = {
      value: { type: String },
      min: { type: String },
      max: { type: String },
      _viewYear: { state: true },
      _viewMonth: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.min = "";
      this.max = "";
      const base = this.value ? /* @__PURE__ */ new Date(`${this.value}T00:00:00`) : /* @__PURE__ */ new Date();
      this._viewYear = base.getFullYear();
      this._viewMonth = base.getMonth();
    }
    #changeMonth(delta) {
      let month = this._viewMonth + delta;
      let year = this._viewYear;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      this._viewMonth = month;
      this._viewYear = year;
    }
    #select(date) {
      this.value = toISODate(date);
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    #isDisabled(iso) {
      return this.min && iso < this.min || this.max && iso > this.max;
    }
    render() {
      const first = new Date(this._viewYear, this._viewMonth, 1);
      const startOffset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(this._viewYear, this._viewMonth + 1, 0).getDate();
      const todayISO = toISODate(/* @__PURE__ */ new Date());
      const cells2 = [];
      for (let i7 = 0; i7 < startOffset; i7++) cells2.push(null);
      for (let d3 = 1; d3 <= daysInMonth; d3++) cells2.push(new Date(this._viewYear, this._viewMonth, d3));
      return b2`
      <div class="${window.__uiwc.prefix}-calendar w-64 select-none">
        <div class="flex items-center justify-between mb-2">
          <button type="button" class="rounded p-1 text-base-500 hover:bg-base-50" aria-label="Mes anterior" @click=${() => this.#changeMonth(-1)}>
            <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(90deg)"></uiwc-icon>
          </button>
          <span class="text-sm font-medium text-base-900 capitalize">${MONTHS[this._viewMonth]} ${this._viewYear}</span>
          <button type="button" class="rounded p-1 text-base-500 hover:bg-base-50" aria-label="Mes siguiente" @click=${() => this.#changeMonth(1)}>
            <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(-90deg)"></uiwc-icon>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-y-1 text-center text-xs text-base-400 mb-1">
          ${WEEKDAYS.map((w2) => b2`<span>${w2}</span>`)}
        </div>
        <div class="grid grid-cols-7 gap-y-1 text-center">
          ${cells2.map((date) => {
        if (!date) return b2`<span></span>`;
        const iso = toISODate(date);
        const disabled = this.#isDisabled(iso);
        const selected = iso === this.value;
        const isToday = iso === todayISO;
        return b2`
              <button
                type="button"
                class="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm disabled:opacity-30 disabled:pointer-events-none
                  ${selected ? "bg-base-900 text-white" : isToday ? "text-base-900 font-semibold" : "text-base-900 hover:bg-base-50"}"
                ?disabled=${disabled}
                @click=${() => this.#select(date)}
              >
                ${date.getDate()}
              </button>
            `;
      })}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("calendar", UiCalendar);

  // components/callout/callout.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS3 = {
    info: { box: "bg-base-100 border-base-200 text-base-900", icon: "info", iconClass: "text-base-900" },
    success: { box: "bg-success/15 border-success/25 text-success", icon: "check", iconClass: "text-success" },
    warning: { box: "bg-warning/15 border-warning/25 text-warning", icon: "info", iconClass: "text-warning" },
    danger: { box: "bg-danger/15 border-danger/25 text-danger", icon: "x", iconClass: "text-danger" }
  };
  var UiCallout = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      title: { type: String },
      dismissible: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "info";
      this.title = "";
      this.dismissible = false;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #handleDismiss() {
      this.dispatchEvent(new CustomEvent("ui-callout-dismiss", { bubbles: true, composed: true }));
    }
    render() {
      const cfg = VARIANTS3[this.variant] || VARIANTS3.info;
      const role = this.variant === "danger" || this.variant === "warning" ? "alert" : "status";
      return b2`
      <div class="${window.__uiwc.prefix}-callout flex gap-3 rounded border p-4 text-sm ${cfg.box}" role=${role}>
        <uiwc-icon name=${cfg.icon} class="${cfg.iconClass} shrink-0 mt-0.5"></uiwc-icon>
        <div class="flex-1">
          ${this.title ? b2`<div class="font-semibold mb-0.5">${this.title}</div>` : ""}
          <div>${o5(this._content || "")}</div>
        </div>
        ${this.dismissible ? b2`
              <button
                type="button"
                class="shrink-0 self-start rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Cerrar"
                @click=${this.#handleDismiss}
              >
                <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("callout", UiCallout);

  // components/card/card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var PADDING = { none: "p-0", sm: "p-3", md: "p-5", lg: "p-7" };
  var UiCard = class extends HTMLElement {
    static get observedAttributes() {
      return ["padding", "no-border", "remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      const padding = PADDING[this.getAttribute("padding")] || PADDING.md;
      const borderClass = this.hasAttribute("no-border") ? "" : "border border-base-200";
      const wanted = `${window.__uiwc.prefix}-card block rounded bg-surface ${borderClass} ${padding}`.split(/\s+/).filter(Boolean);
      const next = window.__uiwc.classes(wanted, this);
      if (this._ownClasses) this.classList.remove(...this._ownClasses);
      this.classList.add(...next);
      this._ownClasses = next;
    }
  };
  window.__uiwc.register("card", UiCard);

  // components/card-body/card-body.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var PADDING2 = { none: "p-0", sm: "p-3", md: "p-5", lg: "p-7" };
  var UiCardBody = class extends HTMLElement {
    static get observedAttributes() {
      return ["padding", "remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      const padding = PADDING2[this.getAttribute("padding")] || PADDING2.md;
      const wanted = `${window.__uiwc.prefix}-card-body block ${padding}`.split(/\s+/).filter(Boolean);
      const next = window.__uiwc.classes(wanted, this);
      if (this._ownClasses) this.classList.remove(...this._ownClasses);
      this.classList.add(...next);
      this._ownClasses = next;
    }
  };
  window.__uiwc.register("card-body", UiCardBody);

  // components/card-footer/card-footer.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCardFooter = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      const wanted = [`${window.__uiwc.prefix}-card-footer`, "block", "border-t", "border-base-200", "px-5", "py-4"];
      const next = window.__uiwc.classes(wanted, this);
      if (this._ownClasses) this.classList.remove(...this._ownClasses);
      this.classList.add(...next);
      this._ownClasses = next;
    }
  };
  window.__uiwc.register("card-footer", UiCardFooter);

  // components/card-header/card-header.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCardHeader = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      const wanted = [`${window.__uiwc.prefix}-card-header`, "block", "border-b", "border-base-200", "px-5", "py-4"];
      const next = window.__uiwc.classes(wanted, this);
      if (this._ownClasses) this.classList.remove(...this._ownClasses);
      this.classList.add(...next);
      this._ownClasses = next;
    }
  };
  window.__uiwc.register("card-header", UiCardHeader);

  // components/carousel/carousel.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCarousel = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const slides = [...this.querySelectorAll(`${window.__uiwc.prefix}-carousel-slide`)];
      if (!slides.length) return;
      this._slides = slides;
      const track = document.createElement("div");
      track.className = "flex overflow-x-auto rounded-xl snap-x snap-mandatory scroll-smooth";
      slides.forEach((slide) => track.appendChild(slide));
      track.addEventListener("scroll", () => this.#syncFromScroll());
      this._track = track;
      const prevBtn = this.#navButton("\u2039", () => this.goTo(this._index - 1));
      const nextBtn = this.#navButton("\u203A", () => this.goTo(this._index + 1));
      prevBtn.classList.add("left-2");
      nextBtn.classList.add("right-2");
      const dots = document.createElement("div");
      dots.className = "mt-3 flex justify-center gap-1.5";
      this._dots = slides.map((_2, i7) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", `Ir a slide ${i7 + 1}`);
        dot.className = "h-2 w-2 shrink-0 cursor-pointer rounded-full border-0 bg-base-300 p-0";
        dot.addEventListener("click", () => this.goTo(i7));
        dots.appendChild(dot);
        return dot;
      });
      const stage = document.createElement("div");
      stage.className = "relative";
      stage.append(track, prevBtn, nextBtn);
      this.append(stage, dots);
      this._index = 0;
      this.#updateDots();
    }
    #navButton(symbol, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = symbol;
      btn.className = "absolute top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-surface/90 text-xl leading-none text-base-900 shadow shadow-base-950/20";
      btn.addEventListener("click", onClick);
      return btn;
    }
    goTo(index) {
      const clamped = Math.max(0, Math.min(this._slides.length - 1, index));
      this._slides[clamped].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
    #syncFromScroll() {
      const trackRect = this._track.getBoundingClientRect();
      let closest = 0;
      let closestDist = Infinity;
      this._slides.forEach((slide, i7) => {
        const dist = Math.abs(slide.getBoundingClientRect().left - trackRect.left);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i7;
        }
      });
      if (closest !== this._index) {
        this._index = closest;
        this.#updateDots();
        this.dispatchEvent(new CustomEvent("ui-carousel-change", { bubbles: true, composed: true, detail: { index: closest } }));
      }
    }
    #updateDots() {
      this._dots.forEach((dot, i7) => {
        dot.classList.toggle("bg-brand-900", i7 === this._index);
        dot.classList.toggle("bg-base-300", i7 !== this._index);
      });
    }
  };
  window.__uiwc.register("carousel", UiCarousel);

  // components/carousel-slide/carousel-slide.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCarouselSlide = class extends HTMLElement {
    connectedCallback() {
      this.classList.add("shrink-0", "grow-0", "basis-full", "snap-start");
    }
  };
  window.__uiwc.register("carousel-slide", UiCarouselSlide);

  // components/chart/chart.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiChart = class extends i4 {
    static properties = {
      type: { type: String, reflect: true },
      data: { type: Array },
      height: { type: Number },
      color: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.type = "bar";
      this.data = [];
      this.height = 200;
      this.color = "";
    }
    render() {
      if (!this.data.length) {
        return b2`<div class="${window.__uiwc.prefix}-chart flex items-center justify-center text-sm text-base-400" style="height:${this.height}px">Sin datos</div>`;
      }
      const width = 400;
      const padding = 24;
      const max = Math.max(...this.data.map((d3) => d3.value), 1);
      const innerW = width - padding * 2;
      const innerH = this.height - padding * 2;
      const stepX = innerW / Math.max(1, this.data.length - (this.type === "line" ? 1 : 0));
      const paint = this.color || "currentColor";
      let body;
      if (this.type === "line") {
        const points = this.data.map((d3, i7) => {
          const x2 = padding + i7 * stepX;
          const y3 = padding + innerH - d3.value / max * innerH;
          return [x2, y3];
        });
        const path = points.map(([x2, y3], i7) => `${i7 === 0 ? "M" : "L"}${x2},${y3}`).join(" ");
        body = w`
        <path d="${path}" fill="none" stroke="${paint}" stroke-width="2" />
        ${points.map(([x2, y3]) => w`<circle cx="${x2}" cy="${y3}" r="3" fill="${paint}" />`)}
      `;
      } else {
        const barW = innerW / this.data.length * 0.6;
        body = w`
        ${this.data.map((d3, i7) => {
          const barH = d3.value / max * innerH;
          const x2 = padding + i7 * stepX + (stepX - barW) / 2;
          const y3 = padding + innerH - barH;
          return w`<rect x="${x2}" y="${y3}" width="${barW}" height="${barH}" rx="3" fill="${paint}" />`;
        })}
      `;
      }
      return b2`
      <div class="${window.__uiwc.prefix}-chart text-brand-900">
        <svg viewBox="0 0 ${width} ${this.height}" style="width:100%;height:${this.height}px" role="img" aria-label="Gráfico de ${this.type === "line" ? "l\xEDnea" : "barras"}">
          <line x1="${padding}" y1="${padding + innerH}" x2="${width - padding}" y2="${padding + innerH}" class="stroke-base-200" />
          ${body}
        </svg>
        <div class="flex justify-between px-1 text-[10px] text-base-400">
          ${this.data.map((d3) => b2`<span>${d3.label}</span>`)}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("chart", UiChart);

  // components/checkbox/checkbox.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter3 = 0;
  var UiCheckbox = class extends i4 {
    static properties = {
      checked: { type: Boolean, reflect: true },
      disabled: { type: Boolean, reflect: true },
      name: { type: String },
      value: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.checked = false;
      this.disabled = false;
      this.name = "";
      this.value = "on";
      this._id = `ui-checkbox-${++idCounter3}`;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #handleChange(e6) {
      this.checked = e6.target.checked;
    }
    render() {
      return b2`
      <label class="${window.__uiwc.prefix}-checkbox inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled ? "opacity-50" : "cursor-pointer"}" for=${this._id}>
        <span class="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${this.checked ? "border-brand-900 bg-brand-900" : "border-base-300 bg-surface"}">
          <input
            id=${this._id}
            type="checkbox"
            class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            name=${this.name || ""}
            value=${this.value}
            .checked=${this.checked}
            ?disabled=${this.disabled}
            @change=${this.#handleChange}
          />
          <svg
            viewBox="0 0 24 24"
            class="pointer-events-none h-3 w-3 text-brand-fg ${this.checked ? "" : "opacity-0"}"
            fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
          ><path d="M20 6 9 17l-5-5" /></svg>
          <span class="pointer-events-none absolute inset-0 rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900"></span>
        </span>
        <span>${o5(this._content || "")}</span>
      </label>
    `;
    }
  };
  window.__uiwc.register("checkbox", UiCheckbox);

  // components/chip/chip.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS4 = {
    neutral: "bg-base-50 text-base-900",
    primary: "bg-base-100 text-base-800",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    pink: "bg-pink-100 text-pink-700",
    indigo: "bg-indigo-100 text-indigo-700",
    cyan: "bg-cyan-100 text-cyan-700"
  };
  var UiChip = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      icon: { type: String },
      avatar: { type: String },
      removable: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "neutral";
      this.icon = "";
      this.avatar = "";
      this.removable = false;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #handleRemove() {
      this.dispatchEvent(new CustomEvent("ui-chip-remove", { bubbles: true, composed: true }));
    }
    render() {
      const variantClass = VARIANTS4[this.variant] || VARIANTS4.neutral;
      return b2`
      <span class="${window.__uiwc.prefix}-chip inline-flex items-center gap-1.5 rounded-full ${this.avatar ? "pl-1" : "pl-2.5"} pr-2.5 py-1 text-xs font-medium ${variantClass} ${this.removable ? "pr-1.5" : ""}">
        ${this.avatar ? b2`<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-base-900 text-[10px] font-semibold text-white">${this.avatar}</span>` : this.icon ? b2`<uiwc-icon name=${this.icon} size="sm"></uiwc-icon>` : ""}
        ${o5(this._content || "")}
        ${this.removable ? b2`
              <button
                type="button"
                class="rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Quitar"
                @click=${this.#handleRemove}
              >
                <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ` : ""}
      </span>
    `;
    }
  };
  window.__uiwc.register("chip", UiChip);

  // components/color-picker/color-picker.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter4 = 0;
  var UiColorPicker = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      disabled: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "#18181b";
      this.disabled = false;
      this.name = "";
      this._id = `ui-color-picker-${++idCounter4}`;
    }
    #setValue(next) {
      if (!/^#[0-9a-fA-F]{6}$/.test(next)) return;
      this.value = next;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-color-picker flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ""}
        <div class="inline-flex items-center gap-2">
          <input
            id=${this._id}
            type="color"
            class="h-9 w-9 cursor-pointer rounded border border-base-300 p-1 disabled:opacity-60"
            name=${this.name || ""}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${(e6) => this.#setValue(e6.target.value)}
          />
          <input
            type="text"
            class="w-28 rounded border border-base-300 px-2.5 py-1.5 text-sm uppercase text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
            .value=${this.value}
            ?disabled=${this.disabled}
            aria-label="Valor hexadecimal"
            @change=${(e6) => this.#setValue(e6.target.value)}
          />
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("color-picker", UiColorPicker);

  // components/command-palette/command-palette.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCommandPalette = class extends i4 {
    static properties = {
      _open: { state: true },
      _query: { state: true },
      _activeIndex: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this._commands = [];
      this._open = false;
      this._query = "";
      this._activeIndex = 0;
      this._onGlobalKeydown = (e6) => {
        const isMac = navigator.platform.toUpperCase().includes("MAC");
        const modifier = isMac ? e6.metaKey : e6.ctrlKey;
        if (modifier && e6.key.toLowerCase() === "k") {
          e6.preventDefault();
          this._open ? this.#close() : this.#open();
        } else if (this._open && e6.key === "Escape") {
          this.#close();
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._commands.length === 0) {
        const template = document.createElement("template");
        template.innerHTML = this.innerHTML;
        this._commands = [...template.content.children].map((el) => ({
          value: el.getAttribute("value") || el.textContent.trim(),
          label: el.textContent.trim()
        }));
        this.innerHTML = "";
      }
      document.addEventListener("keydown", this._onGlobalKeydown);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("keydown", this._onGlobalKeydown);
    }
    #open() {
      this._open = true;
      this._query = "";
      this._activeIndex = 0;
    }
    #close() {
      this._open = false;
    }
    get #filtered() {
      const q = this._query.trim().toLowerCase();
      if (!q) return this._commands;
      return this._commands.filter((c5) => c5.label.toLowerCase().includes(q));
    }
    #select(command) {
      this.dispatchEvent(new CustomEvent("ui-command-select", { bubbles: true, composed: true, detail: command }));
      this.#close();
    }
    #handleKeydown(e6) {
      const results = this.#filtered;
      if (e6.key === "ArrowDown") {
        e6.preventDefault();
        this._activeIndex = Math.min(results.length - 1, this._activeIndex + 1);
      } else if (e6.key === "ArrowUp") {
        e6.preventDefault();
        this._activeIndex = Math.max(0, this._activeIndex - 1);
      } else if (e6.key === "Enter" && results[this._activeIndex]) {
        this.#select(results[this._activeIndex]);
      }
    }
    render() {
      if (!this._open) return b2``;
      const results = this.#filtered;
      return b2`
      <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" @click=${(e6) => e6.target === e6.currentTarget && this.#close()}>
        <div class="w-full max-w-lg rounded border border-base-200 bg-surface shadow-2xl">
          <input
            type="text"
            autofocus
            class="w-full border-b border-base-200 px-4 py-3 text-sm text-base-900 placeholder:text-base-400 focus:outline-none"
            placeholder="Buscar comando... (Escape para cerrar)"
            .value=${this._query}
            @input=${(e6) => {
        this._query = e6.target.value;
        this._activeIndex = 0;
      }}
            @keydown=${this.#handleKeydown}
          />
          <div class="max-h-72 overflow-y-auto py-1">
            ${results.length === 0 ? b2`<div class="px-4 py-6 text-center text-sm text-base-400">Sin resultados</div>` : results.map(
        (c5, i7) => b2`
                    <div
                      class="px-4 py-2 text-sm cursor-pointer ${i7 === this._activeIndex ? "bg-base-100 text-base-800" : "text-base-900 hover:bg-base-50"}"
                      @mousedown=${(e6) => e6.preventDefault()}
                      @click=${() => this.#select(c5)}
                    >
                      ${c5.label}
                    </div>
                  `
      )}
          </div>
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("command-palette", UiCommandPalette);

  // components/composer/composer.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiComposer = class extends i4 {
    static properties = {
      value: { type: String },
      placeholder: { type: String },
      disabled: { type: Boolean, reflect: true },
      allowAttach: { type: Boolean, attribute: "allow-attach" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.placeholder = "Escrib\xED un mensaje...";
      this.disabled = false;
      this.allowAttach = false;
    }
    #handleInput(e6) {
      this.value = e6.target.value;
      e6.target.style.height = "auto";
      e6.target.style.height = `${Math.min(160, e6.target.scrollHeight)}px`;
    }
    #submit() {
      const trimmed = this.value.trim();
      if (!trimmed) return;
      this.dispatchEvent(new CustomEvent("ui-composer-submit", { bubbles: true, composed: true, detail: { value: trimmed } }));
      this.value = "";
      const textarea = this.querySelector("textarea");
      if (textarea) {
        textarea.value = "";
        textarea.style.height = "auto";
      }
    }
    #handleKeydown(e6) {
      if (e6.key === "Enter" && !e6.shiftKey) {
        e6.preventDefault();
        this.#submit();
      }
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-composer flex items-end gap-2 rounded border border-base-300 bg-surface p-2 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900">
        ${this.allowAttach ? b2`
              <button type="button" class="shrink-0 rounded p-2 text-base-400 hover:bg-base-50 hover:text-base-500" aria-label="Adjuntar archivo">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.83 17.44a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            ` : ""}
        <textarea
          rows="1"
          class="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm text-base-900 placeholder:text-base-400 focus:outline-none disabled:opacity-60"
          placeholder=${this.placeholder}
          .value=${this.value}
          ?disabled=${this.disabled}
          @input=${this.#handleInput}
          @keydown=${this.#handleKeydown}
        ></textarea>
        <button
          type="button"
          class="shrink-0 rounded bg-base-900 p-2 text-white hover:bg-base-800 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Enviar"
          ?disabled=${this.disabled || !this.value.trim()}
          @click=${this.#submit}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
    `;
    }
  };
  window.__uiwc.register("composer", UiComposer);

  // components/context-menu/context-menu.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiContextMenu = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const template = this.querySelector("template[data-menu-items]");
      this._itemsTemplate = template ? template.content : document.createDocumentFragment();
      template?.remove();
      this.addEventListener("contextmenu", (e6) => {
        e6.preventDefault();
        this.#open(e6.clientX, e6.clientY);
      });
      this._onDocClick = () => this.#close();
      this._onKeydown = (e6) => {
        if (e6.key === "Escape") this.#close();
      };
    }
    disconnectedCallback() {
      document.removeEventListener("click", this._onDocClick);
      document.removeEventListener("keydown", this._onKeydown);
    }
    #open(x2, y3) {
      this.#close();
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.className = `${window.__uiwc.prefix}-context-menu fixed z-50 min-w-40 rounded-lg border border-base-200 bg-surface py-1 shadow-lg shadow-base-950/15`;
      menu.style.top = `${y3}px`;
      menu.style.left = `${x2}px`;
      menu.appendChild(this._itemsTemplate.cloneNode(true));
      menu.querySelectorAll("a, button").forEach((el) => {
        el.className = `block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-sm ` + `text-base-700 no-underline hover:bg-base-100 ${el.className}`.trim();
      });
      menu.addEventListener("click", (e6) => {
        const item = e6.target.closest("[data-value], a, button");
        if (!item) return;
        this.dispatchEvent(
          new CustomEvent("ui-context-menu-select", {
            bubbles: true,
            composed: true,
            detail: { value: item.dataset.value ?? item.textContent.trim(), label: item.textContent.trim() }
          })
        );
        this.#close();
      });
      document.body.appendChild(menu);
      this._menu = menu;
      setTimeout(() => {
        document.addEventListener("click", this._onDocClick);
        document.addEventListener("keydown", this._onKeydown);
      });
    }
    #close() {
      this._menu?.remove();
      this._menu = null;
      document.removeEventListener("click", this._onDocClick);
      document.removeEventListener("keydown", this._onKeydown);
    }
  };
  window.__uiwc.register("context-menu", UiContextMenu);

  // components/cropper/cropper.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiCropper = class extends i4 {
    static properties = {
      aspectRatio: { type: Number, attribute: "aspect-ratio" },
      outputSize: { type: Number, attribute: "output-size" },
      _imgSrc: { state: true },
      _zoom: { state: true },
      _offsetX: { state: true },
      _offsetY: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.aspectRatio = 1;
      this.outputSize = 400;
      this._imgSrc = "";
      this._zoom = 1;
      this._offsetX = 0;
      this._offsetY = 0;
      this._dragging = false;
    }
    #handleFile(e6) {
      const file = e6.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this._imgSrc = reader.result;
        this._zoom = 1;
        this._offsetX = 0;
        this._offsetY = 0;
      };
      reader.readAsDataURL(file);
    }
    #handleWheel(e6) {
      e6.preventDefault();
      this._zoom = Math.max(1, Math.min(4, this._zoom - e6.deltaY * 1e-3));
      this.#emitChange();
    }
    #handlePointerDown(e6) {
      this._dragging = true;
      this._lastX = e6.clientX;
      this._lastY = e6.clientY;
      e6.currentTarget.setPointerCapture(e6.pointerId);
    }
    #handlePointerMove(e6) {
      if (!this._dragging) return;
      this._offsetX += e6.clientX - this._lastX;
      this._offsetY += e6.clientY - this._lastY;
      this._lastX = e6.clientX;
      this._lastY = e6.clientY;
      this.#emitChange();
    }
    #handlePointerUp() {
      this._dragging = false;
    }
    #emitChange() {
      this.dispatchEvent(
        new CustomEvent("ui-cropper-change", {
          bubbles: true,
          composed: true,
          detail: { zoom: this._zoom, offsetX: this._offsetX, offsetY: this._offsetY }
        })
      );
    }
    /** Renders the current crop onto an offscreen canvas and returns a data: URL (PNG). */
    getCroppedDataURL() {
      const img = this.querySelector(".ui-cropper-img");
      const frame = this.querySelector(".ui-cropper-frame");
      if (!img || !frame || !this._imgSrc) return null;
      const frameRect = frame.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = this.outputSize;
      canvas.height = this.outputSize / this.aspectRatio;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        (frameRect.left - imgRect.left) * (img.naturalWidth / imgRect.width),
        (frameRect.top - imgRect.top) * (img.naturalHeight / imgRect.height),
        frameRect.width * (img.naturalWidth / imgRect.width),
        frameRect.height * (img.naturalHeight / imgRect.height),
        0,
        0,
        canvas.width,
        canvas.height
      );
      return canvas.toDataURL("image/png");
    }
    #handleApply() {
      const dataURL = this.getCroppedDataURL();
      this.dispatchEvent(new CustomEvent("ui-cropper-apply", { bubbles: true, composed: true, detail: { dataURL } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-cropper flex flex-col gap-3" style="width:16rem">
        <div
          class="ui-cropper-frame relative overflow-hidden rounded bg-base-900 touch-none"
          style="aspect-ratio:${this.aspectRatio};cursor:${this._imgSrc ? this._dragging ? "grabbing" : "grab" : "default"}"
          @wheel=${this._imgSrc ? this.#handleWheel : null}
          @pointerdown=${this._imgSrc ? this.#handlePointerDown : null}
          @pointermove=${this._imgSrc ? this.#handlePointerMove : null}
          @pointerup=${this._imgSrc ? this.#handlePointerUp : null}
        >
          ${this._imgSrc ? b2`
                <img
                  class="ui-cropper-img absolute left-1/2 top-1/2 max-w-none select-none"
                  src=${this._imgSrc}
                  style="transform:translate(-50%,-50%) translate(${this._offsetX}px,${this._offsetY}px) scale(${this._zoom});width:100%"
                  draggable="false"
                  alt="Imagen a recortar"
                />
              ` : ""}
          <input
            id="${this._id || (this._id = `ui-cropper-file-${Math.random().toString(36).slice(2)}`)}"
            type="file"
            accept="image/*"
            class="sr-only"
            @change=${this.#handleFile}
          />
          <label
            for=${this._id}
            class="absolute bottom-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-surface text-base-700 shadow hover:bg-base-50"
            title="Elegir imagen"
          >
            <uiwc-icon name="upload" size="sm"></uiwc-icon>
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            .value=${String(this._zoom)}
            class="flex-1 accent-base-900 disabled:opacity-40"
            aria-label="Zoom"
            ?disabled=${!this._imgSrc}
            @input=${(e6) => {
        this._zoom = Number(e6.target.value);
        this.#emitChange();
      }}
          />
          <button
            type="button"
            class="shrink-0 rounded bg-base-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-base-800 disabled:opacity-40 disabled:pointer-events-none"
            ?disabled=${!this._imgSrc}
            @click=${this.#handleApply}
          >
            Recortar
          </button>
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("cropper", UiCropper);

  // components/data-grid/data-grid.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiDataGrid = class extends i4 {
    static properties = {
      rows: { type: Array },
      _sortField: { state: true },
      _sortDir: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.rows = [];
      this._columns = [];
      this._sortField = "";
      this._sortDir = "asc";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._columns.length === 0) {
        this._columns = [...this.querySelectorAll(`${window.__uiwc.prefix}-data-grid-column`)].map((col) => ({
          field: col.getAttribute("field") || "",
          label: col.getAttribute("label") || col.getAttribute("field") || "",
          sortable: col.hasAttribute("sortable")
        }));
      }
    }
    #toggleSort(field, sortable) {
      if (!sortable) return;
      if (this._sortField === field) {
        this._sortDir = this._sortDir === "asc" ? "desc" : "asc";
      } else {
        this._sortField = field;
        this._sortDir = "asc";
      }
    }
    get #sortedRows() {
      if (!this._sortField) return this.rows;
      const dir = this._sortDir === "asc" ? 1 : -1;
      return [...this.rows].sort((a4, b3) => {
        const av = a4[this._sortField];
        const bv = b3[this._sortField];
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
    }
    render() {
      const rows = this.#sortedRows;
      return b2`
      <div class="${window.__uiwc.prefix}-data-grid overflow-x-auto rounded border border-base-200">
        <table class="w-full border-collapse text-sm">
          <thead class="border-b border-base-200 bg-base-50">
            <tr>
              ${this._columns.map(
        (col) => b2`
                  <th
                    class="px-4 py-2.5 text-left font-semibold text-base-500 ${col.sortable ? "cursor-pointer select-none" : ""}"
                    @click=${() => this.#toggleSort(col.field, col.sortable)}
                  >
                    <span class="inline-flex items-center gap-1">
                      ${col.label}
                      ${col.sortable && this._sortField === col.field ? b2`<uiwc-icon name="chevron-down" size="sm" style="transform:${this._sortDir === "asc" ? "rotate(180deg)" : "none"}"></uiwc-icon>` : ""}
                    </span>
                  </th>
                `
      )}
            </tr>
          </thead>
          <tbody>
            ${rows.map(
        (row) => b2`
                <tr class="border-b border-base-50 last:border-b-0 hover:bg-base-50">
                  ${this._columns.map((col) => b2`<td class="px-4 py-2.5 text-base-900">${row[col.field]}</td>`)}
                </tr>
              `
      )}
          </tbody>
        </table>
        ${rows.length === 0 ? b2`<div class="px-4 py-8 text-center text-sm text-base-400">Sin datos</div>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("data-grid", UiDataGrid);

  // components/data-grid-column/data-grid-column.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiDataGridColumn = class extends HTMLElement {
    connectedCallback() {
      this.hidden = true;
    }
    get field() {
      return this.getAttribute("field") || "";
    }
    get label() {
      return this.getAttribute("label") || this.field;
    }
    get sortable() {
      return this.hasAttribute("sortable");
    }
  };
  window.__uiwc.register("data-grid-column", UiDataGridColumn);

  // components/date-picker/date-picker.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter5 = 0;
  var UiDatePicker = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      min: { type: String },
      max: { type: String },
      name: { type: String },
      placeholder: { type: String },
      disabled: { type: Boolean, reflect: true },
      _open: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "";
      this.min = "";
      this.max = "";
      this.name = "";
      this.placeholder = "Elegir fecha";
      this.disabled = false;
      this._open = false;
      this._id = `ui-date-picker-${++idCounter5}`;
      this._onDocClick = (e6) => {
        if (!this.contains(e6.target)) this._open = false;
      };
    }
    connectedCallback() {
      super.connectedCallback();
      document.addEventListener("click", this._onDocClick);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("click", this._onDocClick);
    }
    #handleCalendarChange(e6) {
      this.value = e6.detail.value;
      this._open = false;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-date-picker relative flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ""}
        ${this.name ? b2`<input type="hidden" name=${this.name} .value=${this.value || ""} ?disabled=${this.disabled} />` : ""}
        <button
          id=${this._id}
          type="button"
          class="flex items-center justify-between gap-2 rounded border border-base-300 bg-surface px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60 ${this.value ? "text-base-900" : "text-base-400"}"
          ?disabled=${this.disabled}
          @click=${() => this._open = !this._open}
        >
          ${this.value || this.placeholder}
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 text-base-400"></uiwc-icon>
        </button>
        ${this._open ? b2`
              <div class="absolute z-10 top-full mt-1 rounded border border-base-200 bg-surface p-3 shadow-lg">
                <ui-calendar .value=${this.value} .min=${this.min} .max=${this.max} @ui-change=${this.#handleCalendarChange}></ui-calendar>
              </div>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("date-picker", UiDatePicker);

  // components/details/details.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiDetails = class extends i4 {
    static properties = {
      summary: { type: String },
      open: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.summary = "";
      this.open = false;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <details class="${window.__uiwc.prefix}-details rounded border border-base-200" ?open=${this.open} @toggle=${(e6) => this.open = e6.target.open}>
        <summary class="cursor-pointer select-none list-none px-4 py-3 text-sm font-medium text-base-900 [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
          ${this.summary}
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? "rotate-180" : ""}"></uiwc-icon>
        </summary>
        <div class="px-4 pb-4 text-sm text-base-500">${o5(this._content || "")}</div>
      </details>
    `;
    }
  };
  window.__uiwc.register("details", UiDetails);

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
      dialog.addEventListener("click", (e6) => {
        if (e6.target === dialog) dialog.close();
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
          const h3 = document.createElement("h3");
          h3.className = "mb-2 text-base font-semibold text-base-900";
          h3.textContent = title;
          wrap.appendChild(h3);
        }
        const p3 = document.createElement("p");
        p3.className = "mb-5 text-sm text-base-500";
        p3.textContent = message;
        wrap.appendChild(p3);
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
        el.addEventListener("click", (e6) => {
          const btn = e6.target.closest("[data-role]");
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
          const h3 = document.createElement("h3");
          h3.className = "mb-2 text-base font-semibold text-base-900";
          h3.textContent = title;
          wrap.appendChild(h3);
        }
        if (message) {
          const p3 = document.createElement("p");
          p3.className = "mb-3 text-sm text-base-500";
          p3.textContent = message;
          wrap.appendChild(p3);
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
        el.addEventListener("click", (e6) => {
          const btn = e6.target.closest('[data-role="cancel"], [data-role="confirm"]');
          if (!btn) return;
          result = btn.dataset.role === "confirm" ? getInput().value : null;
          el.close();
        });
        el.addEventListener("keydown", (e6) => {
          if (e6.key === "Enter" && e6.target.dataset.role === "input") {
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

  // components/divider/divider.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiDivider = class extends i4 {
    static properties = {
      orientation: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.orientation = "horizontal";
    }
    // Light DOM has no shadow root, so <slot> can't project children — capture the
    // author-provided label once and re-inject it with unsafeHTML instead.
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const hasLabel = (this._content || "").trim().length > 0;
      if (this.orientation === "vertical") {
        return b2`<span class="${window.__uiwc.prefix}-divider inline-block w-px self-stretch bg-base-200" role="separator" aria-orientation="vertical"></span>`;
      }
      if (hasLabel) {
        return b2`
        <div class="${window.__uiwc.prefix}-divider flex items-center gap-3 text-sm text-base-500" role="separator">
          <span class="h-px flex-1 bg-base-200"></span>
          <span>${o5(this._content)}</span>
          <span class="h-px flex-1 bg-base-200"></span>
        </div>
      `;
      }
      return b2`<hr class="${window.__uiwc.prefix}-divider border-0 border-t border-base-200" role="separator" aria-orientation="horizontal" />`;
    }
  };
  window.__uiwc.register("divider", UiDivider);

  // components/empty-state/empty-state.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiEmptyState = class extends i4 {
    static properties = {
      icon: { type: String },
      title: { type: String },
      desc: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.icon = "folder";
      this.title = "";
      this.desc = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML.trim();
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-empty-state flex flex-col items-center gap-2 py-10 text-center">
        <span class="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-base-100 text-base-400">
          <uiwc-icon name=${this.icon} size="lg"></uiwc-icon>
        </span>
        ${this.title ? b2`<div class="text-sm font-semibold text-base-900">${this.title}</div>` : ""}
        ${this.desc ? b2`<div class="max-w-xs text-sm text-base-500">${this.desc}</div>` : ""}
        ${this._content ? b2`<div class="mt-2">${o5(this._content)}</div>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("empty-state", UiEmptyState);

  // components/fieldset/fieldset.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiFieldset = class extends i4 {
    static properties = {
      legend: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.legend = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <fieldset class="${window.__uiwc.prefix}-fieldset rounded border border-base-200 p-5">
        ${this.legend ? b2`<legend class="px-1.5 text-sm font-semibold text-base-900">${this.legend}</legend>` : ""}
        <div class="mt-2 flex flex-col gap-3">${o5(this._content || "")}</div>
      </fieldset>
    `;
    }
  };
  window.__uiwc.register("fieldset", UiFieldset);

  // components/file-manager/markdown.js
  var esc = (s4) => s4.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var safeUrl = (u4) => /^[a-z][a-z0-9+.-]*:/i.test(u4) && !/^(https?|mailto):/i.test(u4) ? "#" : u4;
  function inline(src) {
    const codes = [];
    let s4 = src.replace(/`([^`]+)`/g, (_2, c5) => {
      codes.push(c5);
      return `\0${codes.length - 1}\0`;
    });
    s4 = esc(s4);
    s4 = s4.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_2, alt, u4) => `<img src="${safeUrl(u4)}" alt="${alt}">`);
    s4 = s4.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_2, t4, u4) => `<a href="${safeUrl(u4)}" target="_blank" rel="noopener noreferrer">${t4}</a>`);
    s4 = s4.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_2, a4, b3) => `<strong>${a4 ?? b3}</strong>`);
    s4 = s4.replace(/\*(?!\s)(.+?)(?<!\s)\*|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g, (_2, a4, b3) => `<em>${a4 ?? b3}</em>`);
    s4 = s4.replace(/~~(.+?)~~/g, "<del>$1</del>");
    s4 = s4.replace(/ {2,}$/, "<br>");
    return s4.replace(/\u0000(\d+)\u0000/g, (_2, i7) => `<code>${esc(codes[+i7])}</code>`);
  }
  var LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var isBlockStart = (l4) => /^(#{1,6}\s|```|>|\s*([-*_])(\s*\2){2,}\s*$)/.test(l4) || LIST.test(l4);
  function renderList(lines) {
    const items = lines.map((l4) => {
      const m2 = LIST.exec(l4);
      return { indent: m2[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m2[2]), text: m2[3] };
    });
    let i7 = 0;
    const build = (indent) => {
      const ordered = items[i7].ordered;
      let out = ordered ? "<ol>" : "<ul>";
      while (i7 < items.length && items[i7].indent >= indent) {
        if (items[i7].indent > indent) {
          out += build(items[i7].indent);
          continue;
        }
        const task = /^\[([ xX])\]\s+(.*)$/.exec(items[i7].text);
        const body = task ? `<input type="checkbox" disabled ${task[1] !== " " ? "checked" : ""} class="mr-1.5">${inline(task[2])}` : inline(items[i7].text);
        i7++;
        let nested = "";
        if (i7 < items.length && items[i7].indent > indent) nested = build(items[i7].indent);
        out += `<li${task ? ' class="list-none -ml-6"' : ""}>${body}${nested}</li>`;
      }
      return out + (ordered ? "</ol>" : "</ul>");
    };
    return build(items[0].indent);
  }
  var cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c5) => c5.trim());
  function renderMarkdown(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i7 = 0;
    while (i7 < lines.length) {
      const line = lines[i7];
      if (!line.trim()) {
        i7++;
        continue;
      }
      const fence = /^```\s*(\S*)/.exec(line);
      if (fence) {
        const buf = [];
        i7++;
        while (i7 < lines.length && !/^```\s*$/.test(lines[i7])) buf.push(lines[i7++]);
        i7++;
        out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      const h3 = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h3) {
        out.push(`<h${h3[1].length}>${inline(h3[2])}</h${h3[1].length}>`);
        i7++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        out.push("<hr>");
        i7++;
        continue;
      }
      if (line.startsWith(">")) {
        const buf = [];
        while (i7 < lines.length && lines[i7].startsWith(">")) buf.push(lines[i7++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
        continue;
      }
      if (line.includes("|") && i7 + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i7 + 1])) {
        const head = cells(line);
        i7 += 2;
        const rows = [];
        while (i7 < lines.length && lines[i7].includes("|") && lines[i7].trim()) rows.push(cells(lines[i7++]));
        out.push(
          `<table><thead><tr>${head.map((c5) => `<th>${inline(c5)}</th>`).join("")}</tr></thead><tbody>` + rows.map((r4) => `<tr>${r4.map((c5) => `<td>${inline(c5)}</td>`).join("")}</tr>`).join("") + "</tbody></table>"
        );
        continue;
      }
      if (LIST.test(line)) {
        const buf = [];
        while (i7 < lines.length && lines[i7].trim() && LIST.test(lines[i7])) buf.push(lines[i7++]);
        out.push(renderList(buf));
        continue;
      }
      const para = [];
      while (i7 < lines.length && lines[i7].trim() && (!para.length || !isBlockStart(lines[i7]))) para.push(lines[i7++]);
      out.push(`<p>${para.map((l4) => inline(l4.replace(/\s+$/, (m2) => m2.length >= 2 ? "  " : ""))).join(" ")}</p>`);
    }
    return out.join("\n");
  }

  // components/file-manager/file-manager.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var ITEM = "[data-uiwc-fm-item]";
  var FOLDER = "[data-uiwc-fm-folder]";
  var ACTION = "[data-uiwc-fm-action]";
  var LONG_PRESS_MS = 450;
  var TEXT_PREVIEW_MAX = 3e5;
  var KINDS = {
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"],
    pdf: ["pdf"],
    video: ["mp4", "webm", "ogv", "mov", "m4v"],
    audio: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"],
    md: ["md", "markdown"],
    text: ["txt", "log", "json", "xml", "csv", "tsv", "yml", "yaml", "ini", "conf", "env", "js", "ts", "css", "html", "htm", "php", "py", "sql", "sh"]
  };
  var PROSE = "[&_h1]:mb-4 [&_h1]:border-b [&_h1]:border-base-200 [&_h1]:pb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-base-200 [&_h2]:pb-1 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:font-semibold [&_h5]:mt-4 [&_h5]:font-semibold [&_h6]:mt-4 [&_h6]:font-semibold [&_h6]:text-base-500 [&_p]:my-3 [&_p]:leading-7 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-brand-900 [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-base-300 [&_blockquote]:pl-4 [&_blockquote]:text-base-600 [&_code]:rounded [&_code]:bg-base-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-base-950 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-base-50 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:my-6 [&_hr]:border-base-200 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-base-200 [&_th]:bg-base-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-base-200 [&_td]:px-3 [&_td]:py-1.5 [&_img]:max-w-full [&_img]:rounded [&_del]:text-base-400";
  var UiFileManager = class extends HTMLElement {
    static get observedAttributes() {
      return ["path", "root-label", "view", "loading", "empty-label", "remove-class"];
    }
    #anchor = null;
    #press = null;
    #open = /* @__PURE__ */ new Set();
    // expanded tree paths
    #menu = null;
    #dialog = null;
    connectedCallback() {
      this.setAttribute("data-uiwc-file-manager", "");
      this.setAttribute("role", "listbox");
      this.setAttribute("aria-multiselectable", this.hasAttribute("single") ? "false" : "true");
      this.#apply();
      if (!this._observer) {
        this._observer = new MutationObserver(() => this.#schedule());
        this._observer.observe(this, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["selected", "path", "name", "has-children", "label", "value", "for", "danger", "icon"]
        });
      }
      if (this._bound) return;
      this._bound = true;
      this.addEventListener("click", this.#onClick);
      this.addEventListener("dblclick", this.#onDblClick);
      this.addEventListener("keydown", this.#onKeyDown);
      this.addEventListener("focusin", this.#onFocusIn);
      this.addEventListener("contextmenu", this.#onContextMenu);
      this.addEventListener("pointerdown", this.#onPointerDown);
      this.addEventListener("pointerup", this.#onPointerEnd);
      this.addEventListener("pointercancel", this.#onPointerEnd);
    }
    disconnectedCallback() {
      this._observer?.disconnect();
      this._observer = null;
      this.#closeMenu();
      this.#dropDialog();
    }
    attributeChangedCallback(name) {
      if (!this.isConnected) return;
      if (name === "view") this.#items().forEach((i7) => i7.setAttribute("data-view", this.#view));
      this.#apply();
    }
    // ---------- public API ----------
    getSelection() {
      return this.#items().filter((i7) => i7.hasAttribute("selected")).map(this.#idOf);
    }
    select(ids) {
      const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
      this.#setSelection(this.#items().filter((i7) => set.has(this.#idOf(i7))));
    }
    clearSelection() {
      this.#setSelection([]);
    }
    // ---------- helpers ----------
    get #view() {
      return this.getAttribute("view") === "grid" ? "grid" : "list";
    }
    #idOf = (el) => el.getAttribute("item-id") ?? el.id;
    #items = () => [...this.children].filter((el) => el.matches(ITEM));
    #emit(name, detail, cancelable = false) {
      return this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, cancelable, detail }));
    }
    #schedule() {
      if (this._pending) return;
      this._pending = true;
      queueMicrotask(() => {
        this._pending = false;
        if (this.isConnected) this.#apply();
      });
    }
    #extOf(item) {
      const ext = item.getAttribute("ext") || (item.getAttribute("name") || "").split(".").slice(1).pop() || "";
      return ext.toLowerCase();
    }
    #kindOf(item) {
      if (item.getAttribute("type") === "folder" || !item.getAttribute("href")) return null;
      const ext = this.#extOf(item);
      return Object.keys(KINDS).find((k2) => KINDS[k2].includes(ext)) || null;
    }
    // ---------- chrome ----------
    #folders() {
      return [...this.children].filter((el) => el.matches(FOLDER));
    }
    #apply() {
      const grid = this.#view === "grid";
      const tree = this.#folders().length > 0;
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-file-manager`,
        "relative",
        "grid",
        "content-start",
        "min-h-48",
        "overflow-hidden",
        "rounded-lg",
        "border",
        "border-base-200",
        "bg-surface",
        "outline-none",
        grid ? "grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-2" : "grid-cols-1 gap-px",
        tree ? grid ? "md:pl-[calc(14rem+0.5rem)]" : "md:pl-56" : "",
        this.hasAttribute("loading") ? "pointer-events-none opacity-60" : ""
      ]);
      this.toggleAttribute("aria-busy", this.hasAttribute("loading"));
      this.#chrome(grid, tree);
    }
    #chrome(grid, tree) {
      const items = this.#items();
      items.forEach((i7) => {
        if (i7.getAttribute("data-view") !== this.#view) i7.setAttribute("data-view", this.#view);
      });
      const selected = items.filter((i7) => i7.hasAttribute("selected")).length;
      const path = this.getAttribute("path") || "";
      const crumbs = path.split("/").filter(Boolean);
      crumbs.forEach((_2, i7) => this.#open.add(crumbs.slice(0, i7 + 1).join("/")));
      const hkey = [grid, tree, this.getAttribute("root-label") || "", path, selected, this.#view].join("");
      let header = this.querySelector(":scope > [data-uiwc-header]");
      if (!header || header._key !== hkey) {
        const fresh = this.#buildHeader(grid, tree, crumbs, selected);
        fresh._key = hkey;
        if (header) header.replaceWith(fresh);
        else this.prepend(fresh);
        header = fresh;
      }
      if (this.firstElementChild !== header) this.prepend(header);
      let bar = this.querySelector(":scope > [data-uiwc-tree]");
      if (tree) {
        const nodes = this.#treeNodes();
        const tkey = [path, this.getAttribute("root-label") || "", [...this.#open].sort().join("|"), nodes.map((n5) => `${n5.path}:${n5.name}:${n5.lazy}`).join("|")].join("");
        if (!bar || bar._key !== tkey) {
          const fresh = this.#buildTree(nodes, path);
          fresh._key = tkey;
          if (bar) bar.replaceWith(fresh);
          else header.after(fresh);
          bar = fresh;
        }
      } else if (bar) {
        bar.remove();
      }
      let empty = this.querySelector(":scope > [data-uiwc-empty]");
      if (!items.length && !this.hasAttribute("loading")) {
        if (!empty) {
          empty = document.createElement("div");
          empty.setAttribute("data-uiwc-empty", "");
          empty.className = "col-span-full py-12 text-center text-sm text-base-500";
          (bar || header).after(empty);
        }
        const label = this.getAttribute("empty-label") || "Esta carpeta est\xE1 vac\xEDa";
        if (empty.textContent !== label) empty.textContent = label;
      } else if (empty) {
        empty.remove();
      }
      if (items.length && !items.some((i7) => i7.tabIndex === 0)) {
        (items.find((i7) => i7.hasAttribute("selected")) || items[0]).tabIndex = 0;
      }
    }
    #el(tag, cls, text) {
      const n5 = document.createElement(tag);
      n5.className = cls;
      if (text != null) n5.textContent = text;
      return n5;
    }
    #icon(name, size = "sm", cls = "") {
      const i7 = document.createElement("uiwc-icon");
      i7.setAttribute("name", name);
      i7.setAttribute("size", size);
      if (cls) i7.className = cls;
      return i7;
    }
    #buildHeader(grid, tree, crumbs, selected) {
      const margin = grid ? `-mx-2 -mt-2 mb-0 ${tree ? "md:-ml-[calc(14rem+0.5rem)]" : ""}` : tree ? "md:-ml-56" : "";
      const header = this.#el("div", `col-span-full flex h-11 items-center gap-2 border-b border-base-200 px-3 text-sm ${margin}`);
      header.setAttribute("data-uiwc-header", "");
      const nav = this.#el("nav", "flex min-w-0 flex-1 items-center gap-1 overflow-hidden");
      nav.setAttribute("aria-label", "Ruta");
      const parts = [{ label: this.getAttribute("root-label") || "Inicio", path: "" }];
      crumbs.forEach((c5, i7) => parts.push({ label: c5, path: crumbs.slice(0, i7 + 1).join("/") }));
      parts.forEach((p3, i7) => {
        const last = i7 === parts.length - 1;
        if (i7) nav.appendChild(this.#icon("chevron-right", "sm", "shrink-0 text-base-300"));
        if (last) nav.appendChild(this.#el("span", "truncate font-medium text-base-900", p3.label));
        else {
          const b3 = this.#el("button", "truncate rounded px-1 text-base-500 hover:bg-base-100 hover:text-base-900", p3.label);
          b3.type = "button";
          b3.setAttribute("data-path", p3.path);
          nav.appendChild(b3);
        }
      });
      header.appendChild(nav);
      if (selected) header.appendChild(this.#el("span", "shrink-0 text-xs text-base-500", `${selected} seleccionado${selected === 1 ? "" : "s"}`));
      const toggle = this.#el("div", "flex shrink-0 rounded border border-base-200 p-0.5");
      for (const v2 of ["list", "grid"]) {
        const b3 = this.#el("button", `rounded p-1 ${this.#view === v2 ? "bg-base-100 text-base-900" : "text-base-500 hover:text-base-900"}`);
        b3.type = "button";
        b3.setAttribute("data-view-btn", v2);
        b3.setAttribute("aria-pressed", String(this.#view === v2));
        b3.setAttribute("aria-label", v2 === "list" ? "Vista de lista" : "Vista de cuadr\xEDcula");
        b3.appendChild(this.#icon(v2));
        toggle.appendChild(b3);
      }
      header.appendChild(toggle);
      return header;
    }
    // ---------- folder tree ----------
    #treeNodes() {
      const map = /* @__PURE__ */ new Map();
      this.#folders().forEach((f3, order) => {
        const path = (f3.getAttribute("path") || "").split("/").filter(Boolean).join("/");
        if (!path) return;
        const parts = path.split("/");
        parts.forEach((seg, i7) => {
          const p3 = parts.slice(0, i7 + 1).join("/");
          if (!map.has(p3)) map.set(p3, { path: p3, name: seg, lazy: false, order: order + i7 / 100 });
        });
        const n5 = map.get(path);
        n5.name = f3.getAttribute("name") || n5.name;
        n5.lazy = f3.hasAttribute("has-children");
        n5.order = order;
      });
      return [...map.values()];
    }
    #buildTree(nodes, current) {
      const bar = this.#el("nav", "absolute bottom-0 left-0 top-11 w-56 overflow-y-auto border-r border-base-200 bg-base-50 p-2 max-md:hidden");
      bar.setAttribute("data-uiwc-tree", "");
      bar.setAttribute("role", "tree");
      bar.setAttribute("aria-label", "Carpetas");
      const childrenOf = (parent) => nodes.filter((n5) => (n5.path.includes("/") ? n5.path.slice(0, n5.path.lastIndexOf("/")) : "") === parent).sort((a4, b3) => a4.order - b3.order);
      const row = (label, path, depth, hasKids, lazy) => {
        const active = path === current;
        const open = this.#open.has(path);
        const r4 = this.#el("div", `flex items-center gap-1 rounded text-sm ${active ? "bg-brand-900/10 font-medium text-brand-900" : "text-base-700 hover:bg-base-100"}`);
        r4.style.paddingLeft = `${depth * 12 + 4}px`;
        r4.setAttribute("role", "treeitem");
        r4.setAttribute("aria-level", String(depth + 1));
        if (hasKids || lazy) r4.setAttribute("aria-expanded", String(open));
        if (active) r4.setAttribute("aria-current", "page");
        const tog = this.#el("button", "flex h-6 w-5 shrink-0 items-center justify-center rounded text-base-400 hover:text-base-900");
        tog.type = "button";
        if (hasKids || lazy) {
          tog.setAttribute("data-toggle", path);
          tog.setAttribute("data-lazy", String(lazy && !hasKids));
          tog.setAttribute("aria-label", open ? "Contraer" : "Expandir");
          tog.appendChild(this.#icon(open ? "chevron-down" : "chevron-right", "sm"));
        } else {
          tog.tabIndex = -1;
          tog.disabled = true;
        }
        const go = this.#el("button", "flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left");
        go.type = "button";
        go.setAttribute("data-path", path);
        go.append(this.#icon(depth === 0 && !path ? "home" : "folder", "sm", "shrink-0 text-warning"), this.#el("span", "truncate", label));
        r4.append(tog, go);
        return r4;
      };
      const walk = (parent, depth) => {
        for (const n5 of childrenOf(parent)) {
          const kids = childrenOf(n5.path);
          bar.appendChild(row(n5.name, n5.path, depth, kids.length > 0, n5.lazy));
          if (kids.length && this.#open.has(n5.path)) walk(n5.path, depth + 1);
        }
      };
      bar.appendChild(row(this.getAttribute("root-label") || "Inicio", "", 0, false, false));
      walk("", 1);
      return bar;
    }
    // ---------- selection ----------
    #setSelection(next) {
      const ids = next.map(this.#idOf);
      const cur = this.getSelection();
      if (cur.length === ids.length && cur.every((id) => ids.includes(id))) return;
      if (!this.#emit("ui-fm-select", { ids, items: next }, true)) return;
      const set = new Set(next);
      this.#items().forEach((i7) => i7.toggleAttribute("selected", set.has(i7)));
      this.#apply();
    }
    #focus(item) {
      this.#items().forEach((i7) => i7.tabIndex = i7 === item ? 0 : -1);
      item.focus();
    }
    #onFocusIn = (e6) => {
      const item = e6.target.closest?.(ITEM);
      if (item && this.contains(item)) this.#items().forEach((i7) => i7.tabIndex = i7 === item ? 0 : -1);
    };
    #pick(item, { toggle = false, range = false } = {}) {
      const items = this.#items();
      const multiple = !this.hasAttribute("single");
      if (range && multiple && this.#anchor && items.includes(this.#anchor)) {
        const [a4, b3] = [items.indexOf(this.#anchor), items.indexOf(item)].sort((x2, y3) => x2 - y3);
        this.#setSelection(items.slice(a4, b3 + 1));
      } else if (toggle && multiple) {
        const cur = new Set(items.filter((i7) => i7.hasAttribute("selected")));
        cur.has(item) ? cur.delete(item) : cur.add(item);
        this.#setSelection(items.filter((i7) => cur.has(i7)));
        this.#anchor = item;
      } else {
        this.#setSelection([item]);
        this.#anchor = item;
      }
    }
    // ---------- pointer / mouse ----------
    #onClick = (e6) => {
      const view = e6.target.closest("[data-view-btn]");
      if (view && this.contains(view)) {
        this.setAttribute("view", view.getAttribute("data-view-btn"));
        this.#emit("ui-fm-view", { view: this.#view });
        return;
      }
      const toggle = e6.target.closest("[data-toggle]");
      if (toggle && this.contains(toggle)) {
        const p3 = toggle.getAttribute("data-toggle");
        if (this.#open.has(p3)) this.#open.delete(p3);
        else {
          this.#open.add(p3);
          if (toggle.getAttribute("data-lazy") === "true") this.#emit("ui-fm-expand", { path: p3 });
        }
        this.#apply();
        return;
      }
      const crumb = e6.target.closest("[data-path]");
      if (crumb && this.contains(crumb)) {
        this.#emit("ui-fm-navigate", { path: crumb.getAttribute("data-path") });
        return;
      }
      const item = e6.target.closest(ITEM);
      if (!item || !this.contains(item)) {
        if (!e6.target.closest("[data-uiwc-header],[data-uiwc-tree]")) this.clearSelection();
        return;
      }
      if (this._touchHandled) return;
      this.#pick(item, { toggle: e6.ctrlKey || e6.metaKey, range: e6.shiftKey });
      this.#focus(item);
    };
    #onDblClick = (e6) => {
      const item = e6.target.closest(ITEM);
      if (item && this.contains(item)) this.#openItem(item);
    };
    #openItem(item) {
      const detail = { itemId: this.#idOf(item), type: item.getAttribute("type") || "file", name: item.getAttribute("name") || "", item };
      if (!this.#emit("ui-fm-open", detail, true)) return;
      if (!this.hasAttribute("no-preview") && this.#kindOf(item)) this.#preview(item);
    }
    // ---------- context menu ----------
    #onContextMenu = (e6) => {
      const item = e6.target.closest(ITEM);
      if (!item || !this.contains(item)) return;
      e6.preventDefault();
      if (!item.hasAttribute("selected")) this.#pick(item);
      let { clientX: x2, clientY: y3 } = e6;
      if (!x2 && !y3) {
        const r4 = item.getBoundingClientRect();
        x2 = r4.left + 24;
        y3 = r4.top + r4.height / 2;
      }
      const ids = this.getSelection();
      if (!this.#emit("ui-fm-contextmenu", { itemId: this.#idOf(item), ids, x: x2, y: y3 }, true)) return;
      this.#showMenu(item, x2, y3);
    };
    #showMenu(item, x2, y3) {
      this.#closeMenu();
      const sel = this.#items().filter((i7) => i7.hasAttribute("selected"));
      const multiple = sel.length > 1;
      const kind = multiple ? "multiple" : item.getAttribute("type") === "folder" ? "folder" : "file";
      const entries = [];
      const previewable = !multiple && !this.hasAttribute("no-preview") && this.#kindOf(item);
      entries.push({ value: "__open", label: previewable ? "Vista previa" : "Abrir", icon: previewable ? "image" : "folder", show: !multiple });
      const downloadable = sel.length > 0 && sel.every((i7) => i7.getAttribute("type") !== "folder" && i7.getAttribute("href"));
      entries.push({ value: "__download", label: multiple ? "Descargar selecci\xF3n" : "Descargar", icon: "download", show: downloadable });
      const custom = [...this.children].filter((el) => el.matches(ACTION)).filter((a4) => {
        const f3 = (a4.getAttribute("for") || "").split(/\s+/).filter(Boolean);
        return !f3.length || f3.includes(kind);
      });
      const shown = entries.filter((e6) => e6.show);
      if (!shown.length && !custom.length) return;
      const menu = this.#el("div", "fixed z-[100] min-w-48 rounded-lg border border-base-200 bg-surface py-1 text-sm shadow-lg");
      menu.setAttribute("role", "menu");
      menu.setAttribute("data-uiwc-fm-menu", "");
      const add = (value, label, icon, danger) => {
        const b3 = this.#el("button", `flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-base-100 focus:bg-base-100 focus:outline-none ${danger ? "text-danger" : "text-base-700"}`);
        b3.type = "button";
        b3.setAttribute("role", "menuitem");
        b3.setAttribute("data-value", value);
        if (icon) b3.appendChild(this.#icon(icon, "sm", "shrink-0"));
        b3.appendChild(this.#el("span", "", label));
        menu.appendChild(b3);
      };
      shown.forEach((e6) => add(e6.value, e6.label, e6.icon, false));
      if (shown.length && custom.length) menu.appendChild(this.#el("div", "my-1 border-t border-base-200"));
      custom.forEach((a4) => add(a4.getAttribute("value") || "", a4.getAttribute("label") || "", a4.getAttribute("icon") || "", a4.hasAttribute("danger")));
      menu.addEventListener("click", (e6) => {
        const b3 = e6.target.closest("[data-value]");
        if (!b3) return;
        const value = b3.getAttribute("data-value");
        this.#closeMenu();
        if (value === "__open") this.#openItem(item);
        else if (value === "__download") this.#download(sel);
        else this.#emit("ui-fm-action", { value, ids: sel.map(this.#idOf), itemId: this.#idOf(item) });
      });
      menu.addEventListener("keydown", (e6) => {
        const btns = [...menu.querySelectorAll("button")];
        const i7 = btns.indexOf(document.activeElement);
        if (e6.key === "ArrowDown") {
          e6.preventDefault();
          btns[(i7 + 1) % btns.length].focus();
        } else if (e6.key === "ArrowUp") {
          e6.preventDefault();
          btns[(i7 - 1 + btns.length) % btns.length].focus();
        } else if (e6.key === "Escape" || e6.key === "Tab") {
          e6.preventDefault();
          this.#closeMenu();
          item.focus();
        }
      });
      document.body.appendChild(menu);
      const r4 = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(x2, innerWidth - r4.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y3, innerHeight - r4.height - 4))}px`;
      menu.querySelector("button")?.focus();
      this.#menu = menu;
      this._offMenu = (ev) => {
        if (ev.type === "pointerdown" && menu.contains(ev.target)) return;
        this.#closeMenu();
      };
      setTimeout(() => {
        document.addEventListener("pointerdown", this._offMenu, true);
        document.addEventListener("scroll", this._offMenu, true);
        window.addEventListener("resize", this._offMenu);
      });
    }
    #closeMenu() {
      this.#menu?.remove();
      this.#menu = null;
      document.removeEventListener("pointerdown", this._offMenu, true);
      document.removeEventListener("scroll", this._offMenu, true);
      window.removeEventListener("resize", this._offMenu);
    }
    #download(items) {
      const files = items.filter((i7) => i7.getAttribute("href"));
      if (!files.length) return;
      if (!this.#emit("ui-fm-download", { ids: files.map(this.#idOf), items: files }, true)) return;
      files.forEach(
        (f3, n5) => setTimeout(() => {
          const a4 = document.createElement("a");
          a4.href = f3.getAttribute("href");
          a4.download = f3.getAttribute("name") || "";
          document.body.appendChild(a4);
          a4.click();
          a4.remove();
        }, n5 * 200)
      );
    }
    // ---------- preview ----------
    #dropDialog() {
      const d3 = this.#dialog;
      this.#dialog = null;
      if (!d3) return;
      if (d3.open) d3.close();
      d3.remove();
    }
    #preview(item) {
      const list = this.#items().filter((i7) => this.#kindOf(i7));
      let index = list.indexOf(item);
      if (index < 0) return;
      this.#dropDialog();
      const dialog = this.#el(
        "dialog",
        "m-auto flex h-[min(88vh,52rem)] w-[min(94vw,64rem)] flex-col overflow-hidden rounded-xl border border-base-200 bg-surface p-0 text-base-900 shadow-2xl backdrop:bg-base-950/60 backdrop:backdrop-blur-sm"
      );
      dialog.setAttribute("data-uiwc-fm-preview", "");
      const title = this.#el("span", "min-w-0 flex-1 truncate font-medium");
      const btn = (label, icon, extra = "") => {
        const b3 = this.#el("button", `flex h-8 w-8 shrink-0 items-center justify-center rounded text-base-500 hover:bg-base-100 hover:text-base-900 ${extra}`);
        b3.type = "button";
        b3.setAttribute("aria-label", label);
        b3.appendChild(this.#icon(icon));
        return b3;
      };
      const prev = btn("Anterior", "chevron-left");
      const next = btn("Siguiente", "chevron-right");
      const dl = this.#el("a", "flex h-8 w-8 shrink-0 items-center justify-center rounded text-base-500 hover:bg-base-100 hover:text-base-900");
      dl.setAttribute("aria-label", "Descargar");
      dl.appendChild(this.#icon("download"));
      const close = btn("Cerrar", "x");
      const header = this.#el("div", "flex shrink-0 items-center gap-1 border-b border-base-200 px-4 py-2");
      header.append(title, prev, next, dl, close);
      const body = this.#el("div", "relative min-h-0 flex-1 overflow-auto bg-base-50");
      dialog.append(header, body);
      let token = 0;
      const show = async () => {
        const it = list[index];
        const kind = this.#kindOf(it);
        const href = it.getAttribute("href");
        const name = it.getAttribute("name") || "";
        const my = ++token;
        title.textContent = name;
        dl.href = href;
        dl.download = name;
        prev.disabled = next.disabled = list.length < 2;
        body.replaceChildren();
        body.className = "relative min-h-0 flex-1 overflow-auto bg-base-50";
        this.#emit("ui-fm-preview", { itemId: this.#idOf(it), name, kind });
        const centered = (node) => {
          body.className = "relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-base-50 p-4";
          body.appendChild(node);
        };
        const message = (text) => body.appendChild(this.#el("p", "p-6 text-center text-sm text-base-500", text));
        if (kind === "image") {
          const img = this.#el("img", "max-h-full max-w-full object-contain");
          img.src = href;
          img.alt = name;
          centered(img);
        } else if (kind === "pdf") {
          const f3 = this.#el("iframe", "h-full w-full border-0");
          f3.src = href;
          f3.title = name;
          body.appendChild(f3);
        } else if (kind === "video") {
          const v2 = this.#el("video", "max-h-full max-w-full");
          v2.src = href;
          v2.controls = true;
          v2.autoplay = true;
          centered(v2);
        } else if (kind === "audio") {
          const a4 = this.#el("audio", "w-full max-w-md");
          a4.src = href;
          a4.controls = true;
          centered(a4);
        } else {
          message("Cargando\u2026");
          try {
            const res = await fetch(href);
            if (!res.ok) throw new Error(res.status);
            let text = await res.text();
            if (my !== token) return;
            const cut = text.length > TEXT_PREVIEW_MAX;
            if (cut) text = text.slice(0, TEXT_PREVIEW_MAX);
            body.replaceChildren();
            if (kind === "md") {
              const card = this.#el("article", `mx-auto my-6 w-[min(92%,48rem)] rounded-xl border border-base-200 bg-surface p-8 text-base-800 shadow-sm ${PROSE}`);
              card.innerHTML = renderMarkdown(text);
              body.appendChild(card);
            } else {
              body.appendChild(this.#el("pre", "m-0 whitespace-pre-wrap break-words p-5 font-mono text-sm text-base-800", text));
            }
            if (cut) body.appendChild(this.#el("p", "px-5 pb-5 text-xs text-base-500", "Vista parcial \u2014 descarg\xE1 el archivo para verlo completo."));
          } catch {
            if (my !== token) return;
            body.replaceChildren();
            message("No se pudo cargar el archivo.");
          }
        }
      };
      const step = (d3) => {
        index = (index + d3 + list.length) % list.length;
        show();
      };
      const opener = document.activeElement;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        token++;
        dialog.remove();
        if (this.#dialog === dialog) this.#dialog = null;
        (list[index]?.isConnected ? list[index] : opener)?.focus?.();
      };
      const dismiss = () => {
        if (dialog.open) dialog.close();
        finish();
      };
      prev.addEventListener("click", () => step(-1));
      next.addEventListener("click", () => step(1));
      close.addEventListener("click", dismiss);
      dialog.addEventListener("click", (e6) => {
        if (e6.target === dialog) dismiss();
      });
      dialog.addEventListener("cancel", () => setTimeout(finish, 0));
      dialog.addEventListener("close", finish);
      dialog.addEventListener("keydown", (e6) => {
        if (list.length > 1 && (e6.key === "ArrowLeft" || e6.key === "ArrowRight") && !e6.target.closest("video,audio")) {
          e6.preventDefault();
          step(e6.key === "ArrowLeft" ? -1 : 1);
        }
      });
      document.body.appendChild(dialog);
      this.#dialog = dialog;
      dialog.showModal();
      show();
    }
    // ---------- touch ----------
    #onPointerDown = (e6) => {
      if (e6.pointerType !== "touch") return;
      const item = e6.target.closest(ITEM);
      if (!item || !this.contains(item)) return;
      this.#press = {
        item,
        id: e6.pointerId,
        x: e6.clientX,
        y: e6.clientY,
        long: false,
        timer: setTimeout(() => {
          this.#press.long = true;
          this.#pick(item, { toggle: true });
        }, LONG_PRESS_MS)
      };
    };
    #onPointerEnd = (e6) => {
      const p3 = this.#press;
      if (!p3 || e6.pointerId !== p3.id) return;
      clearTimeout(p3.timer);
      this.#press = null;
      if (e6.type !== "pointerup") return;
      const moved = Math.hypot(e6.clientX - p3.x, e6.clientY - p3.y) > 10;
      this._touchHandled = true;
      setTimeout(() => this._touchHandled = false, 400);
      if (moved || p3.long) return;
      if (this.getSelection().length) this.#pick(p3.item, { toggle: true });
      else this.#openItem(p3.item);
    };
    // ---------- keyboard ----------
    #columns(items) {
      if (this.#view !== "grid" || !items.length) return 1;
      const top = items[0].offsetTop;
      return Math.max(1, items.filter((i7) => i7.offsetTop === top).length);
    }
    #onKeyDown = (e6) => {
      const item = e6.target.closest?.(ITEM);
      if (!item || !this.contains(item) || e6.target !== item) return;
      if (e6.key === "ContextMenu" || e6.key === "F10" && e6.shiftKey) {
        e6.preventDefault();
        const r4 = item.getBoundingClientRect();
        return void item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r4.left + 24, clientY: r4.top + r4.height / 2 }));
      }
      const items = this.#items();
      const i7 = items.indexOf(item);
      const cols = this.#columns(items);
      const grid = this.#view === "grid";
      let to = null;
      switch (e6.key) {
        case "ArrowDown":
          to = i7 + cols;
          break;
        case "ArrowUp":
          to = i7 - cols;
          break;
        case "ArrowRight":
          if (grid) to = i7 + 1;
          break;
        case "ArrowLeft":
          if (grid) to = i7 - 1;
          break;
        case "Home":
          to = 0;
          break;
        case "End":
          to = items.length - 1;
          break;
        case "Enter":
          e6.preventDefault();
          return this.#openItem(item);
        case " ":
          e6.preventDefault();
          return this.#pick(item, { toggle: true });
        case "Escape":
          return this.clearSelection();
        case "Delete": {
          const ids = this.getSelection();
          return void this.#emit("ui-fm-delete-request", { ids: ids.length ? ids : [this.#idOf(item)] });
        }
        case "F2":
          e6.preventDefault();
          return void this.#emit("ui-fm-rename-request", { itemId: this.#idOf(item) });
        case "a":
        case "A":
          if (!(e6.ctrlKey || e6.metaKey) || this.hasAttribute("single")) return;
          e6.preventDefault();
          return this.#setSelection(items);
        default:
          return;
      }
      if (to == null || to < 0 || to >= items.length) {
        if (to != null) e6.preventDefault();
        return;
      }
      e6.preventDefault();
      const target = items[to];
      if (e6.shiftKey) {
        if (!this.#anchor || !items.includes(this.#anchor)) this.#anchor = item;
        this.#pick(target, { range: true });
      } else {
        this.#anchor = target;
      }
      this.#focus(target);
    };
  };
  window.__uiwc.register("file-manager", UiFileManager);

  // components/file-manager-action/file-manager-action.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiFileManagerAction = class extends HTMLElement {
    connectedCallback() {
      this.setAttribute("data-uiwc-fm-action", "");
      window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-file-manager-action`, "hidden"]);
    }
  };
  window.__uiwc.register("file-manager-action", UiFileManagerAction);

  // components/file-manager-folder/file-manager-folder.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiFileManagerFolder = class extends HTMLElement {
    connectedCallback() {
      this.setAttribute("data-uiwc-fm-folder", "");
      window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-file-manager-folder`, "hidden"]);
    }
  };
  window.__uiwc.register("file-manager-folder", UiFileManagerFolder);

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
      const g2 = (n5) => this.getAttribute(n5) || "";
      const key = [grid, g2("type"), g2("name"), g2("size"), g2("modified"), g2("ext"), g2("icon"), g2("thumb")].join("");
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
        const n5 = document.createElement(tag);
        n5.className = cls;
        if (text != null) n5.textContent = text;
        return n5;
      };
      const folder = g2("type") === "folder";
      const tone = folder ? "text-warning" : IMAGE_EXT.has(g2("ext").toLowerCase()) ? "text-info" : "text-base-500";
      const iconBox = el("span", `flex shrink-0 items-center justify-center overflow-hidden bg-base-100 ${tone} ${grid ? "h-16 w-full rounded-lg" : "h-8 w-8 rounded"}`);
      if (grid && g2("thumb")) {
        const img = el("img", "h-full w-full object-cover");
        img.src = g2("thumb");
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
        body.append(iconBox, el("span", "w-full truncate text-xs font-medium text-base-900", g2("name")));
        if (g2("size")) body.append(el("span", "text-[11px] text-base-500", g2("size")));
      } else {
        body.className = "flex w-full min-w-0 items-center gap-3";
        body.append(
          iconBox,
          el("span", "min-w-0 flex-1 truncate text-sm font-medium text-base-900", g2("name")),
          el("span", "hidden w-24 shrink-0 text-right text-xs text-base-500 sm:block", g2("size")),
          el("span", "hidden w-36 shrink-0 text-right text-xs text-base-500 md:block", g2("modified"))
        );
      }
    }
  };
  window.__uiwc.register("file-manager-item", UiFileManagerItem);

  // components/file-upload/file-upload.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter6 = 0;
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  var UiFileUpload = class extends i4 {
    static properties = {
      accept: { type: String },
      multiple: { type: Boolean, reflect: true },
      disabled: { type: Boolean, reflect: true },
      label: { type: String },
      _files: { state: true },
      _dragOver: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.accept = "";
      this.multiple = false;
      this.disabled = false;
      this.label = "Arrastr\xE1 archivos ac\xE1, o hac\xE9 click para elegir";
      this._files = [];
      this._dragOver = false;
      this._id = `ui-file-upload-${++idCounter6}`;
    }
    #setFiles(fileList) {
      const incoming = [...fileList];
      this._files = this.multiple ? [...this._files, ...incoming] : incoming.slice(0, 1);
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { files: this._files } }));
    }
    #removeAt(index) {
      this._files = this._files.filter((_2, i7) => i7 !== index);
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { files: this._files } }));
    }
    #handleDrop(e6) {
      e6.preventDefault();
      this._dragOver = false;
      if (!this.disabled) this.#setFiles(e6.dataTransfer.files);
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-file-upload flex flex-col gap-2">
        <label
          for=${this._id}
          class="flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-8 text-center cursor-pointer
            ${this._dragOver ? "border-base-900 bg-base-100" : "border-base-300 hover:border-base-400"}
            ${this.disabled ? "opacity-50 pointer-events-none" : ""}"
          @dragover=${(e6) => {
        e6.preventDefault();
        this._dragOver = true;
      }}
          @dragleave=${() => this._dragOver = false}
          @drop=${this.#handleDrop}
        >
          <uiwc-icon name="copy" size="lg" class="text-base-400"></uiwc-icon>
          <span class="text-sm text-base-500">${this.label}</span>
          <input
            id=${this._id}
            type="file"
            class="sr-only"
            accept=${this.accept || void 0}
            ?multiple=${this.multiple}
            ?disabled=${this.disabled}
            @change=${(e6) => this.#setFiles(e6.target.files)}
          />
        </label>
        ${this._files.length ? b2`
              <ul class="flex flex-col gap-1.5">
                ${this._files.map(
        (file, i7) => b2`
                    <li class="flex items-center justify-between gap-2 rounded border border-base-200 px-3 py-1.5 text-sm">
                      <span class="truncate text-base-900">${file.name}</span>
                      <span class="shrink-0 text-xs text-base-400">${formatSize(file.size)}</span>
                      <button
                        type="button"
                        class="shrink-0 rounded p-0.5 text-base-400 hover:bg-base-50 hover:text-base-500"
                        aria-label="Quitar ${file.name}"
                        @click=${() => this.#removeAt(i7)}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </li>
                  `
      )}
              </ul>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("file-upload", UiFileUpload);

  // components/filter-bar/filter-bar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var norm = (opts = []) => opts.map((o7) => typeof o7 === "object" ? { value: String(o7.value), label: String(o7.label ?? o7.value) } : { value: String(o7), label: String(o7) });
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
      for (const f3 of this.#fields) {
        if (f3.default != null) this.#values[f3.name] = f3.default;
        else if (f3.type === "select-multiple" || f3.type === "checkbox") this.#values[f3.name] = [];
        else if (f3.type === "switch") this.#values[f3.name] = false;
        else this.#values[f3.name] = "";
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
      for (const f3 of this.#fields) {
        if (f3.type === "select-multiple" || f3.type === "checkbox") this.#values[f3.name] = [];
        else if (f3.type === "switch") this.#values[f3.name] = false;
        else this.#values[f3.name] = "";
      }
      this.#render();
      this.dispatchEvent(new CustomEvent("ui-filter-clear", { bubbles: true, composed: true, detail: { values: this.values } }));
      this.apply(null);
    }
    #activeCount() {
      return this.#fields.filter((f3) => {
        const v2 = this.#values[f3.name];
        if (Array.isArray(v2)) return v2.length > 0;
        if (f3.type === "switch") return !!v2;
        return v2 !== "" && v2 != null;
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
        const n5 = this.#activeCount();
        this._toggleCount.textContent = n5;
        this._toggleCount.hidden = n5 === 0;
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
      for (const f3 of this.#fields) {
        const el = this.#buildField(f3, prefix);
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
      norm(options).forEach((o7) => {
        const opt = document.createElement(`${prefix}-option`);
        opt.setAttribute("value", o7.value);
        opt.textContent = o7.label;
        el.appendChild(opt);
      });
    }
    #buildField(f3, prefix) {
      if (f3.type === "search") {
        const el2 = document.createElement(`${prefix}-input-search`);
        el2.setAttribute("placeholder", f3.placeholder || f3.label || "Buscar...");
        el2.value = this.#values[f3.name] || "";
        let t4;
        el2.addEventListener("ui-input", (e6) => {
          clearTimeout(t4);
          t4 = setTimeout(() => {
            this.#values[f3.name] = e6.detail.value.trim();
            this.#changed(f3.name);
          }, f3.debounce ?? 250);
        });
        return el2;
      }
      if (f3.type === "switch") {
        const el2 = document.createElement(`${prefix}-switch`);
        el2.textContent = f3.label || "";
        el2.checked = !!this.#values[f3.name];
        el2.addEventListener("ui-change", (e6) => {
          this.#values[f3.name] = e6.detail.checked;
          this.#changed(f3.name);
        });
        return el2;
      }
      if (f3.type === "select-multiple" || f3.type === "checkbox") {
        const el2 = document.createElement(`${prefix}-multiselect`);
        el2.setAttribute("display", "count");
        el2.setAttribute("label", f3.label || "");
        el2.setAttribute("placeholder", f3.label || "Elegir...");
        this.#buildOptions(el2, prefix, f3.options);
        el2.addEventListener("ui-change", (e6) => {
          this.#values[f3.name] = e6.detail.values;
          this.#changed(f3.name);
        });
        return el2;
      }
      const el = document.createElement(`${prefix}-select`);
      el.setAttribute("display", "count");
      el.setAttribute("label", f3.label || "");
      el.setAttribute("placeholder", f3.label || "Elegir...");
      this.#buildOptions(el, prefix, f3.options);
      if (this.#values[f3.name]) el.value = this.#values[f3.name];
      el.addEventListener("ui-change", (e6) => {
        this.#values[f3.name] = e6.detail.value;
        this.#changed(f3.name);
      });
      return el;
    }
  };
  window.__uiwc.register("filter-bar", UiFilterBar);

  // components/flag/flag.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var SIZES3 = { sm: "h-4 w-5", md: "h-5 w-7", lg: "h-7 w-10" };
  var FLAGS = {
    AR: w`
    <rect width="24" height="16" fill="#74acdf" />
    <rect y="5.33" width="24" height="5.33" fill="#fff" />
    <circle cx="12" cy="8" r="2" fill="#f6b40e" stroke="#85340a" stroke-width="0.3" />
  `
  };
  function toFlagEmoji(countryCode) {
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "";
    const base = 127462;
    return [...code].map((c5) => String.fromCodePoint(base + (c5.charCodeAt(0) - 65))).join("");
  }
  var UiFlag = class extends i4 {
    static properties = {
      country: { type: String, reflect: true },
      size: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.country = "";
      this.size = "md";
    }
    render() {
      const code = this.country.trim().toUpperCase();
      const sizeClass = SIZES3[this.size] || SIZES3.md;
      const svgFlag = FLAGS[code];
      if (svgFlag) {
        return b2`
        <svg
          class="${window.__uiwc.prefix}-flag ${sizeClass} inline-block shrink-0 rounded-sm"
          viewBox="0 0 24 16"
          role="img"
          aria-label="Bandera de ${code}"
        >
          ${svgFlag}
        </svg>
      `;
      }
      const emoji = toFlagEmoji(this.country);
      if (!emoji) {
        console.warn(`ui-flag: "${this.country}" no es un c\xF3digo ISO 3166-1 alpha-2 v\xE1lido`);
        return b2``;
      }
      const emojiSizeClass = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[this.size] || "text-xl";
      return b2`<span class="${window.__uiwc.prefix}-flag ${emojiSizeClass} leading-none" role="img" aria-label="Bandera de ${code}">${emoji}</span>`;
    }
  };
  window.__uiwc.register("flag", UiFlag);

  // components/hero-card/hero-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var TONES = {
    indigo: {
      card: "from-slate-900 via-indigo-950 to-slate-900 border-slate-800 dark:from-indigo-50 dark:via-white dark:to-indigo-50 dark:border-indigo-200",
      glow: "bg-indigo-500/20 dark:bg-indigo-400/30",
      icon: "bg-blue-500/20 border-blue-400/30 text-indigo-300 dark:bg-indigo-600/10 dark:border-indigo-300 dark:text-indigo-700",
      heading: "text-white dark:text-indigo-950",
      text: "text-slate-300 dark:text-indigo-900/70",
      button: "bg-white text-slate-900 dark:bg-indigo-950 dark:text-white"
    },
    emerald: {
      card: "from-emerald-950 via-slate-900 to-emerald-950 border-emerald-900 dark:from-emerald-50 dark:via-white dark:to-emerald-50 dark:border-emerald-200",
      glow: "bg-emerald-500/20 dark:bg-emerald-400/30",
      icon: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300 dark:bg-emerald-600/10 dark:border-emerald-300 dark:text-emerald-700",
      heading: "text-white dark:text-emerald-950",
      text: "text-slate-300 dark:text-emerald-900/70",
      button: "bg-white text-slate-900 dark:bg-emerald-950 dark:text-white"
    },
    amber: {
      card: "from-amber-950 via-slate-900 to-amber-950 border-amber-900 dark:from-amber-50 dark:via-white dark:to-amber-50 dark:border-amber-200",
      glow: "bg-amber-500/20 dark:bg-amber-400/30",
      icon: "bg-amber-500/20 border-amber-400/30 text-amber-300 dark:bg-amber-600/10 dark:border-amber-300 dark:text-amber-700",
      heading: "text-white dark:text-amber-950",
      text: "text-slate-300 dark:text-amber-900/70",
      button: "bg-white text-slate-900 dark:bg-amber-950 dark:text-white"
    },
    rose: {
      card: "from-rose-950 via-slate-900 to-rose-950 border-rose-900 dark:from-rose-50 dark:via-white dark:to-rose-50 dark:border-rose-200",
      glow: "bg-rose-500/20 dark:bg-rose-400/30",
      icon: "bg-rose-500/20 border-rose-400/30 text-rose-300 dark:bg-rose-600/10 dark:border-rose-300 dark:text-rose-700",
      heading: "text-white dark:text-rose-950",
      text: "text-slate-300 dark:text-rose-900/70",
      button: "bg-white text-slate-900 dark:bg-rose-950 dark:text-white"
    }
  };
  var UiHeroCard = class extends i4 {
    static properties = {
      icon: { type: String },
      heading: { type: String },
      text: { type: String },
      buttonLabel: { type: String, attribute: "button-label" },
      href: { type: String },
      tone: { type: String, reflect: true },
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.icon = "";
      this.heading = "";
      this.text = "";
      this.buttonLabel = "";
      this.href = "";
      this.tone = "indigo";
      this.removeClass = "";
    }
    render() {
      const t4 = TONES[this.tone] || TONES.indigo;
      const wanted = [
        `${window.__uiwc.prefix}-hero-card`,
        "group",
        "relative",
        "block",
        "overflow-hidden",
        "no-underline",
        "rounded",
        "border",
        "p-6",
        "shadow-md",
        "min-h-[220px]",
        "flex",
        "flex-col",
        "justify-between",
        "bg-gradient-to-br",
        ...t4.card.split(" ")
      ];
      const cls = window.__uiwc.classes(wanted, this).join(" ");
      const content = b2`
      <div
        class="absolute -bottom-6 -right-6 h-36 w-36 rounded-full blur-2xl transition-transform duration-300 group-hover:scale-110 ${t4.glow}"
      ></div>
      <div class="relative z-10 flex flex-col gap-3">
        ${this.icon ? b2`<span class="flex h-10 w-10 items-center justify-center rounded border ${t4.icon}">
              <uiwc-icon name=${this.icon} size="md"></uiwc-icon>
            </span>` : ""}
        <h3 class="text-[17px] font-bold ${t4.heading}">${this.heading}</h3>
        ${this.text ? b2`<p class="text-[13px] leading-relaxed ${t4.text}">${this.text}</p>` : ""}
      </div>
      ${this.buttonLabel ? b2`<span class="relative z-10 mt-5 inline-flex w-fit rounded px-4 py-2 text-[12.5px] font-semibold ${t4.button}"
            >${this.buttonLabel}</span
          >` : ""}
    `;
      return this.href ? b2`<a href=${this.href} class="${cls}">${content}</a>` : b2`<div class="${cls}">${content}</div>`;
    }
  };
  window.__uiwc.register("hero-card", UiHeroCard);

  // components/icon/icon.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var ICONS = {
    check: w`<path d="M20 6 9 17l-5-5" />`,
    x: w`<path d="M18 6 6 18M6 6l12 12" />`,
    "chevron-down": w`<path d="m6 9 6 6 6-6" />`,
    "chevron-up": w`<path d="m18 15-6-6-6 6" />`,
    "chevron-left": w`<path d="m15 18-6-6 6-6" />`,
    "chevron-right": w`<path d="m9 18 6-6-6-6" />`,
    info: w`<path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="9" />`,
    star: w`<path d="m12 3 2.9 6.1 6.6.7-5 4.5 1.4 6.5L12 17.6 5.9 20.8l1.5-6.5-5-4.5 6.6-.7Z" />`,
    heart: w`<path d="M12 20.5S3.5 15 3.5 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.5 2.8c0 6.2-8.5 11.7-8.5 11.7Z" />`,
    spinner: w`<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />`,
    copy: w`<rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
    search: w`<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />`,
    eye: w`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />`,
    "eye-off": w`<path d="M9.9 4.24A9.4 9.4 0 0 1 12 4c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.16 3.19M6.6 6.6C3.7 8.5 2 11 2 11s3.5 7 10 7a9.5 9.5 0 0 0 5.4-1.6M2 2l20 20" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />`,
    upload: w`<path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" />`,
    download: w`<path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />`,
    home: w`<path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" />`,
    user: w`<circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />`,
    users: w`<circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4" /><path d="M16.5 8.6a2.6 2.6 0 1 1 0 5.1" /><path d="M21.5 21c0-2.6-1.8-4.4-4.5-5" />`,
    settings: w`<circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V19a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0A1.7 1.7 0 0 0 10.2 3V3a2 2 0 1 1 4 0v.2c0 .7.4 1.3 1 1.6h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.3.6.9 1 1.6 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" />`,
    trash: w`<path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" />`,
    edit: w`<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />`,
    plus: w`<path d="M12 5v14" /><path d="M5 12h14" />`,
    minus: w`<path d="M5 12h14" />`,
    menu: w`<path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />`,
    bell: w`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />`,
    calendar: w`<rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />`,
    clock: w`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />`,
    mail: w`<rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 6 10 7 10-7" />`,
    phone: w`<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z" />`,
    lock: w`<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
    unlock: w`<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />`,
    filter: w`<path d="M3 4h18l-7 8v6l-4 2v-8Z" />`,
    "arrow-up": w`<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />`,
    "arrow-down": w`<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />`,
    "arrow-left": w`<path d="M19 12H5" /><path d="m12 19-7-7 7-7" />`,
    "arrow-right": w`<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />`,
    "external-link": w`<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" />`,
    refresh: w`<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />`,
    warning: w`<path d="M12 3 2 20h20Z" /><path d="M12 9v5" /><path d="M12 17h.01" />`,
    folder: w`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />`,
    file: w`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />`,
    image: w`<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />`,
    link: w`<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />`,
    "more-horizontal": w`<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />`,
    "more-vertical": w`<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />`,
    "map-pin": w`<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" />`,
    briefcase: w`<rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M2 13h20" />`,
    tag: w`<path d="M20.6 12.6 12 21.2a2 2 0 0 1-2.8 0l-7.4-7.4a2 2 0 0 1 0-2.8L10.4 2.4A2 2 0 0 1 12 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-.6 1.4Z" /><circle cx="16.5" cy="7.5" r="1.5" />`,
    bookmark: w`<path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />`,
    globe: w`<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />`,
    grid: w`<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />`,
    list: w`<path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />`,
    "credit-card": w`<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />`,
    "log-out": w`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />`,
    "log-in": w`<path d="M15 21h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4" /><path d="m8 7-5 5 5 5" /><path d="M3 12h12" />`,
    share: w`<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-3.9" /><path d="m8.6 13.5 6.8 3.9" />`,
    bold: w`<path d="M6 4h6a3.5 3.5 0 0 1 0 7H6z" /><path d="M6 11h7a3.5 3.5 0 0 1 0 7H6z" />`,
    italic: w`<path d="M10 4h6" /><path d="M8 20h6" /><path d="M13 4 9 20" />`,
    underline: w`<path d="M6 4v6a6 6 0 0 0 12 0V4" /><path d="M4 20h16" />`
  };
  var UiIcon = class extends i4 {
    static properties = {
      name: { type: String, reflect: true },
      size: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.name = "info";
      this.size = "md";
    }
    render() {
      const path = ICONS[this.name];
      if (path) {
        const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" }[this.size] || "w-5 h-5";
        return b2`
        <svg
          class="${window.__uiwc.prefix}-icon ${sizeClass} shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${path}
        </svg>
      `;
      }
      if (!this.name) {
        console.warn('ui-icon: unknown icon name ""');
        return b2``;
      }
      const fontSizeClass = { sm: "text-base", md: "text-lg", lg: "text-xl" }[this.size] || "text-lg";
      return b2`<i class="${window.__uiwc.prefix}-icon ${this.name} ${fontSizeClass}" aria-hidden="true"></i>`;
    }
  };
  window.__uiwc.register("icon", UiIcon);
  if (!customElements.get("uiwc-icon")) {
    customElements.define("uiwc-icon", class extends UiIcon {
    });
  }

  // components/input/input.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter7 = 0;
  var UiInput = class extends i4 {
    static properties = {
      label: { type: String },
      type: { type: String },
      value: { type: String },
      placeholder: { type: String },
      helpText: { type: String, attribute: "help-text" },
      error: { type: String },
      disabled: { type: Boolean, reflect: true },
      required: { type: Boolean, reflect: true },
      name: { type: String },
      icon: { type: String },
      iconPosition: { type: String, attribute: "icon-position" },
      step: { type: String },
      min: { type: String },
      max: { type: String },
      inputmode: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.type = "text";
      this.value = "";
      this.placeholder = "";
      this.helpText = "";
      this.error = "";
      this.disabled = false;
      this.required = false;
      this.name = "";
      this.icon = "";
      this.iconPosition = "start";
      this.step = "";
      this.min = "";
      this.max = "";
      this.inputmode = "";
      this._id = `ui-input-${++idCounter7}`;
    }
    #handleInput(e6) {
      this.value = e6.target.value;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      const hasError = Boolean(this.error);
      const borderClass = hasError ? "border-danger focus:border-danger focus:ring-danger" : "border-base-300 focus:border-brand-900 focus:ring-brand-900";
      const describedBy = hasError ? `${this._id}-error` : this.helpText ? `${this._id}-help` : void 0;
      return b2`
      <div class="${window.__uiwc.prefix}-input flex flex-col gap-1.5">
        ${this.label ? b2`
              <label for=${this._id} class="text-sm font-medium text-base-900">
                ${this.label} ${this.required ? b2`<span class="text-danger">*</span>` : ""}
              </label>
            ` : ""}
        <div class="relative">
          ${this.icon ? b2`<uiwc-icon
                name=${this.icon}
                size="sm"
                class="pointer-events-none absolute top-1/2 -translate-y-1/2 text-base-400 ${this.iconPosition === "end" ? "right-2.5" : "left-2.5"}"
              ></uiwc-icon>` : ""}
          <input
            id=${this._id}
            type=${this.type}
            class="w-full rounded border bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass} ${this.icon && this.iconPosition === "end" ? "pr-8" : ""} ${this.icon && this.iconPosition !== "end" ? "pl-8" : ""}"
            name=${this.name || ""}
            .value=${this.value}
            placeholder=${this.placeholder || ""}
            step=${this.step || A}
            min=${this.min || A}
            max=${this.max || A}
            inputmode=${this.inputmode || A}
            ?disabled=${this.disabled}
            ?required=${this.required}
            aria-invalid=${hasError}
            aria-describedby=${describedBy}
            @input=${this.#handleInput}
          />
        </div>
        ${hasError ? b2`<p id="${this._id}-error" class="text-xs text-danger">${this.error}</p>` : this.helpText ? b2`<p id="${this._id}-help" class="text-xs text-base-500">${this.helpText}</p>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("input", UiInput);

  // components/input-file/input-file.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter8 = 0;
  var UiInputFile = class extends i4 {
    static properties = {
      label: { type: String },
      accept: { type: String },
      disabled: { type: Boolean, reflect: true },
      name: { type: String },
      _fileName: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.accept = "";
      this.disabled = false;
      this.name = "";
      this._fileName = "";
      this._id = `ui-input-file-${++idCounter8}`;
    }
    #handleChange(e6) {
      const file = e6.target.files?.[0] || null;
      this._fileName = file?.name || "";
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { file } }));
    }
    #clear() {
      const input = this.querySelector("input");
      if (input) input.value = "";
      this._fileName = "";
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { file: null } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-input-file flex flex-col gap-1.5">
        ${this.label ? b2`<label class="text-sm font-medium text-base-900">${this.label}</label>` : ""}
        <div class="flex items-center gap-2">
          <label
            for=${this._id}
            class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-base-300 bg-surface px-3 py-1.5 text-sm font-medium text-base-700 hover:bg-base-50 ${this.disabled ? "pointer-events-none opacity-50" : ""}"
          >
            <uiwc-icon name="upload" size="sm"></uiwc-icon>
            Elegir archivo
          </label>
          <input id=${this._id} type="file" class="sr-only" accept=${this.accept || void 0} name=${this.name || ""} ?disabled=${this.disabled} @change=${this.#handleChange} />
          <span class="truncate text-sm text-base-500">${this._fileName || "Sin archivo seleccionado"}</span>
          ${this._fileName ? b2`
                <button type="button" class="shrink-0 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600" aria-label="Quitar archivo" @click=${this.#clear}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              ` : ""}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("input-file", UiInputFile);

  // components/input-password/input-password.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter9 = 0;
  var UiInputPassword = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      placeholder: { type: String },
      helpText: { type: String, attribute: "help-text" },
      error: { type: String },
      disabled: { type: Boolean, reflect: true },
      required: { type: Boolean, reflect: true },
      name: { type: String },
      _visible: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "";
      this.placeholder = "";
      this.helpText = "";
      this.error = "";
      this.disabled = false;
      this.required = false;
      this.name = "";
      this._visible = false;
      this._id = `ui-input-password-${++idCounter9}`;
    }
    #handleInput(e6) {
      this.value = e6.target.value;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      const hasError = Boolean(this.error);
      const borderClass = hasError ? "border-danger focus:border-danger focus:ring-danger" : "border-base-300 focus:border-brand-900 focus:ring-brand-900";
      const describedBy = hasError ? `${this._id}-error` : this.helpText ? `${this._id}-help` : void 0;
      return b2`
      <div class="${window.__uiwc.prefix}-input-password flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label} ${this.required ? b2`<span class="text-danger">*</span>` : ""}</label>` : ""}
        <div class="relative">
          <input
            id=${this._id}
            type=${this._visible ? "text" : "password"}
            class="w-full rounded border bg-surface py-2 pl-3 pr-9 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass}"
            name=${this.name || ""}
            placeholder=${this.placeholder || ""}
            .value=${this.value}
            ?disabled=${this.disabled}
            ?required=${this.required}
            aria-invalid=${hasError}
            aria-describedby=${describedBy}
            @input=${this.#handleInput}
          />
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600"
            aria-label=${this._visible ? "Ocultar contrase\xF1a" : "Mostrar contrase\xF1a"}
            ?disabled=${this.disabled}
            @click=${() => this._visible = !this._visible}
          >
            <uiwc-icon name=${this._visible ? "eye-off" : "eye"} size="sm"></uiwc-icon>
          </button>
        </div>
        ${hasError ? b2`<p id="${this._id}-error" class="text-xs text-danger">${this.error}</p>` : this.helpText ? b2`<p id="${this._id}-help" class="text-xs text-base-500">${this.helpText}</p>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("input-password", UiInputPassword);

  // components/input-search/input-search.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter10 = 0;
  var UiInputSearch = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      placeholder: { type: String },
      disabled: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "";
      this.placeholder = "Buscar...";
      this.disabled = false;
      this.name = "";
      this._id = `ui-input-search-${++idCounter10}`;
    }
    #setValue(value) {
      this.value = value;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    #clear() {
      this.#setValue("");
      this.querySelector("input")?.focus();
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-input-search flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ""}
        <div class="relative">
          <uiwc-icon name="search" size="sm" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400"></uiwc-icon>
          <input
            id=${this._id}
            type="search"
            class="w-full rounded border border-base-300 bg-surface py-2 pl-8 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60 [&::-webkit-search-cancel-button]:appearance-none"
            style="padding-right:${this.value ? "2rem" : "0.75rem"}"
            name=${this.name || ""}
            placeholder=${this.placeholder}
            .value=${this.value}
            ?disabled=${this.disabled}
            @input=${(e6) => this.#setValue(e6.target.value)}
          />
          ${this.value ? b2`
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600"
                  aria-label="Borrar búsqueda"
                  @click=${this.#clear}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              ` : ""}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("input-search", UiInputSearch);

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
      this.addEventListener("dragstart", (e6) => e6.preventDefault());
      this.addEventListener("contextmenu", (e6) => {
        if (this.#drag) e6.preventDefault();
      });
      this.addEventListener(
        "touchmove",
        (e6) => {
          if (this.#drag?.active && e6.cancelable) e6.preventDefault();
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
      const s4 = this.#last;
      this.#last = null;
      if (!s4 || !s4.card.isConnected || !s4.parent?.isConnected) return false;
      s4.parent.insertBefore(s4.card, s4.next && s4.next.parentNode === s4.parent ? s4.next : null);
      return true;
    }
    // ---------- helpers ----------
    #idOf = (el) => el.getAttribute("card-id") ?? el.id;
    #colIdOf = (el) => el.getAttribute("column-id") ?? el.id;
    #cards = (col, exceptId) => [...col.children].filter((el) => el.matches(CARD) && this.#idOf(el) !== exceptId);
    #columns = () => [...this.querySelectorAll(COL)];
    // ---------- pointer ----------
    #onPointerDown = (e6) => {
      if (this.hasAttribute("readonly") || this.#drag) return;
      if (e6.pointerType === "mouse" && e6.button !== 0) return;
      const card = e6.target.closest(CARD);
      if (!card || !this.contains(card) || card.getAttribute("draggable") === "false") return;
      const interactive = e6.target.closest(INTERACTIVE);
      if (interactive && card.contains(interactive)) return;
      const fromColumn = card.closest(COL);
      if (!fromColumn) return;
      this.#drag = {
        card,
        cardId: this.#idOf(card),
        fromColumn,
        pointerId: e6.pointerId,
        type: e6.pointerType,
        startX: e6.clientX,
        startY: e6.clientY,
        x: e6.clientX,
        y: e6.clientY,
        active: false,
        target: null
      };
      document.addEventListener("pointermove", this.#onMove);
      document.addEventListener("pointerup", this.#onUp);
      document.addEventListener("pointercancel", this.#onCancel);
      if (e6.pointerType !== "mouse") {
        this.#drag.timer = setTimeout(() => this.#begin(), TOUCH_HOLD_MS);
      }
    };
    #onMove = (e6) => {
      const d3 = this.#drag;
      if (!d3 || e6.pointerId !== d3.pointerId) return;
      d3.x = e6.clientX;
      d3.y = e6.clientY;
      if (!d3.active) {
        const dist = Math.hypot(d3.x - d3.startX, d3.y - d3.startY);
        if (d3.type === "mouse") {
          if (dist >= MOUSE_THRESHOLD) this.#begin();
        } else if (dist > TOUCH_SLOP) {
          this.#end();
        }
        return;
      }
      this.#update();
    };
    #onUp = (e6) => {
      const d3 = this.#drag;
      if (!d3 || e6.pointerId !== d3.pointerId) return;
      if (d3.active) {
        this.#commit(d3.card, d3.cardId, d3.fromColumn, d3.target);
        this._justDragged = true;
        setTimeout(() => this._justDragged = false, 60);
      }
      this.#end();
    };
    #onCancel = (e6) => {
      if (this.#drag && e6.pointerId === this.#drag.pointerId) this.#end();
    };
    #begin() {
      const d3 = this.#drag;
      if (!d3 || d3.active) return;
      clearTimeout(d3.timer);
      d3.active = true;
      const rect = d3.card.getBoundingClientRect();
      d3.offsetX = d3.startX - rect.left;
      d3.offsetY = d3.startY - rect.top;
      const ghost = d3.card.cloneNode(true);
      ghost.removeAttribute("id");
      ghost.removeAttribute("card-id");
      ghost.removeAttribute("tabindex");
      ghost.querySelectorAll("[id]").forEach((n5) => n5.removeAttribute("id"));
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
      d3.ghost = ghost;
      const line = document.createElement("div");
      line.className = "pointer-events-none absolute z-10 hidden h-0.5 rounded bg-brand-500";
      this.appendChild(line);
      d3.line = line;
      d3.card.setAttribute("data-dragging", "");
      this.setAttribute("data-dragging", "");
      try {
        d3.card.setPointerCapture?.(d3.pointerId);
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
      const d3 = this.#drag;
      const r4 = this.getBoundingClientRect();
      let dx = 0;
      if (d3.x < r4.left + EDGE) dx = -Math.ceil((r4.left + EDGE - d3.x) / 4);
      else if (d3.x > r4.right - EDGE) dx = Math.ceil((d3.x - (r4.right - EDGE)) / 4);
      if (dx) {
        this.scrollLeft += dx;
        this.#update();
      }
    }
    #update() {
      const d3 = this.#drag;
      if (!d3?.active) return;
      if (!d3.card.isConnected) {
        d3.card = this.querySelector(`${CARD}[card-id="${CSS.escape(d3.cardId)}"],${CARD}#${CSS.escape(d3.cardId)}`) || d3.card;
      }
      d3.ghost.style.transform = `translate3d(${d3.x - d3.offsetX}px, ${d3.y - d3.offsetY}px, 0)`;
      const under = document.elementFromPoint(d3.x, d3.y);
      let column = under?.closest(COL) || null;
      if (column && !this.contains(column)) column = null;
      this.#columns().forEach((c5) => c5.toggleAttribute("data-over", c5 === column));
      if (!column) {
        d3.target = null;
        d3.line.classList.add("hidden");
        return;
      }
      this.#setTarget(d3, column, this.#indexAt(column, d3.cardId, d3.y));
    }
    #indexAt(column, cardId, y3) {
      const cards = this.#cards(column, cardId);
      for (let i7 = 0; i7 < cards.length; i7++) {
        const r4 = cards[i7].getBoundingClientRect();
        if (y3 < r4.top + r4.height / 2) return i7;
      }
      return cards.length;
    }
    #setTarget(d3, column, index) {
      const cards = this.#cards(column, d3.cardId);
      const ref = cards[index] || null;
      d3.target = { column, index, ref };
      this.#showLine(d3.line, column, cards, index);
    }
    #showLine(line, column, cards, index) {
      const board = this.getBoundingClientRect();
      let left, width, top;
      if (cards.length) {
        const anchor = cards[index] || cards[cards.length - 1];
        const r4 = anchor.getBoundingClientRect();
        left = r4.left;
        width = r4.width;
        top = cards[index] ? r4.top - 5 : r4.bottom + 3;
      } else {
        const c5 = column.getBoundingClientRect();
        const header = column.querySelector(":scope > [data-uiwc-header]")?.getBoundingClientRect();
        left = c5.left + 12;
        width = c5.width - 24;
        top = (header ? header.bottom : c5.top) + 8;
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
        if (before.length === toOrderedIds.length && before.every((id, i7) => id === toOrderedIds[i7])) return;
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
    #onKeyDown = (e6) => {
      if (this.hasAttribute("readonly")) return;
      const kb = this.#drag?.kb ? this.#drag : null;
      if (!kb) {
        if (e6.key !== " " || e6.target !== e6.target.closest(CARD)) return;
        const card = e6.target;
        if (card.getAttribute("draggable") === "false" || this.#drag) return;
        const fromColumn = card.closest(COL);
        if (!fromColumn) return;
        e6.preventDefault();
        const cardId = this.#idOf(card);
        const index2 = this.#cards(fromColumn).findIndex((c5) => this.#idOf(c5) === cardId);
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
      if (!handled[e6.key]) return;
      e6.preventDefault();
      const t4 = kb.target;
      if (e6.key === "Escape") {
        this.#announce("Movimiento cancelado");
        return this.#end();
      }
      if (e6.key === " " || e6.key === "Enter") {
        this.#commit(kb.card, kb.cardId, kb.fromColumn, t4);
        this.#announce("Tarjeta soltada");
        kb.card.focus?.();
        return this.#end();
      }
      const cols = this.#columns();
      let col = t4.column;
      let index = t4.index;
      if (e6.key === "ArrowUp") index = Math.max(0, index - 1);
      if (e6.key === "ArrowDown") index = Math.min(this.#cards(col, kb.cardId).length, index + 1);
      if (e6.key === "ArrowLeft" || e6.key === "ArrowRight") {
        const next = cols[cols.indexOf(col) + (e6.key === "ArrowLeft" ? -1 : 1)];
        if (!next) return;
        col = next;
        index = Math.min(index, this.#cards(col, kb.cardId).length);
      }
      this.#kbMove(kb, col, index);
    };
    #kbMove(d3, column, index) {
      this.#columns().forEach((c5) => c5.toggleAttribute("data-over", c5 === column));
      this.#setTarget(d3, column, index);
      const total = this.#cards(column, d3.cardId).length + 1;
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
      const d3 = this.#drag;
      this.#drag = null;
      cancelAnimationFrame(this.#raf);
      document.removeEventListener("pointermove", this.#onMove);
      document.removeEventListener("pointerup", this.#onUp);
      document.removeEventListener("pointercancel", this.#onCancel);
      if (!d3) return;
      clearTimeout(d3.timer);
      d3.ghost?.remove();
      d3.line?.remove();
      d3.card?.removeAttribute("data-dragging");
      this.removeAttribute("data-dragging");
      this.#columns().forEach((c5) => c5.removeAttribute("data-over"));
      try {
        d3.card?.releasePointerCapture?.(d3.pointerId);
      } catch {
      }
    }
  };
  window.__uiwc.register("kanban", UiKanban);

  // components/kanban-card/kanban-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var PRIORITY = {
    high: "border-l-4 border-l-danger",
    medium: "border-l-4 border-l-warning",
    low: "border-l-4 border-l-info"
  };
  var DUE_STATE = {
    danger: "after:bg-danger/10 after:text-danger",
    warning: "after:bg-warning/15 after:text-warning",
    neutral: "after:bg-base-100 after:text-base-600"
  };
  var cardIdCounter = 0;
  var UiKanbanCard = class extends HTMLElement {
    static get observedAttributes() {
      return ["priority", "done", "due", "clickable", "remove-class"];
    }
    get cardId() {
      return this.getAttribute("card-id") ?? this.id;
    }
    connectedCallback() {
      this.setAttribute("data-uiwc-kanban-card", "");
      if (!this.id && !this.hasAttribute("card-id")) this.id = `ui-kanban-card-${++cardIdCounter}`;
      if (!this.hasAttribute("tabindex") && !this.hasAttribute("data-ghost")) this.tabIndex = 0;
      if (!this._bound) {
        this._bound = true;
        this.addEventListener("click", () => this.#click());
        this.addEventListener("keydown", (e6) => {
          if (e6.key === "Enter" && e6.target === this) this.#click();
        });
      }
      this.#apply();
    }
    attributeChangedCallback() {
      if (this.isConnected) this.#apply();
    }
    #click() {
      if (!this.hasAttribute("clickable")) return;
      if (this.closest("[data-uiwc-kanban]")?._justDragged) return;
      this.dispatchEvent(new CustomEvent("ui-kanban-card-click", { bubbles: true, composed: true, detail: { cardId: this.cardId, card: this } }));
    }
    #apply() {
      const done = this.hasAttribute("done");
      const clickable = this.hasAttribute("clickable");
      const due = this.#due(done);
      if (due) {
        this.setAttribute("data-due-label", due.label);
        this.setAttribute("data-due-state", due.state);
      } else {
        this.removeAttribute("data-due-label");
        this.removeAttribute("data-due-state");
      }
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-kanban-card`,
        "flex",
        "flex-col",
        "gap-2",
        "rounded-lg",
        "border",
        "border-base-200",
        "bg-surface",
        "px-3",
        "py-2.5",
        "text-sm",
        "text-base-700",
        "shadow-sm",
        "outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-brand-500",
        clickable ? "cursor-pointer" : "cursor-grab",
        "active:cursor-grabbing",
        "[&[data-dragging]]:opacity-40",
        "[&[data-ghost]]:rotate-1",
        "[&[data-ghost]]:shadow-lg",
        "[&[data-ghost]]:cursor-grabbing",
        "[&[data-ghost]]:opacity-95",
        PRIORITY[this.getAttribute("priority")] || "",
        // slot layout (position-styled; nothing is reparented)
        "[&>[slot=labels]]:order-1",
        "[&>[slot=labels]]:flex",
        "[&>[slot=labels]]:flex-wrap",
        "[&>[slot=labels]]:gap-1",
        "[&>[slot=title]]:order-2",
        "[&>[slot=title]]:font-medium",
        done ? "[&>[slot=title]]:line-through" : "[&>[slot=title]]:text-base-900",
        done ? "[&>[slot=title]]:text-base-400" : "",
        "[&>[slot=meta]]:order-3",
        "[&>[slot=meta]]:flex",
        "[&>[slot=meta]]:flex-wrap",
        "[&>[slot=meta]]:items-center",
        "[&>[slot=meta]]:gap-1.5",
        "[&>[slot=footer]]:order-4",
        "[&>[slot=footer]]:flex",
        "[&>[slot=footer]]:items-center",
        "[&>[slot=footer]]:gap-2",
        "[&>[slot=footer]]:text-base-500",
        "[&>[slot=assignees]]:order-5",
        "[&>[slot=assignees]]:self-end",
        // due badge — drawn with ::after from data-* attributes (no extra DOM node)
        ...due ? [
          "after:order-last",
          "after:w-fit",
          "after:rounded",
          "after:px-1.5",
          "after:py-0.5",
          "after:text-xs",
          "after:font-medium",
          "after:content-[attr(data-due-label)]",
          ...DUE_STATE[due.state].split(" ")
        ] : []
      ]);
    }
    #due(done) {
      const raw = this.getAttribute("due");
      const m2 = raw && /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
      if (!m2) return null;
      const date = new Date(+m2[1], +m2[2] - 1, +m2[3]);
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((date - today) / 864e5);
      const state = done ? "neutral" : days < 0 ? "danger" : days <= 7 ? "warning" : "neutral";
      return { label: date.toLocaleDateString(void 0, { day: "numeric", month: "short" }), state };
    }
  };
  window.__uiwc.register("kanban-card", UiKanbanCard);

  // components/kanban-column/kanban-column.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var DOTS = {
    base: "bg-base-400",
    brand: "bg-brand-500",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info"
  };
  var CARD2 = "[data-uiwc-kanban-card]";
  var UiKanbanColumn = class extends HTMLElement {
    static get observedAttributes() {
      return ["label", "color", "wip-limit", "progress", "remove-class"];
    }
    get columnId() {
      return this.getAttribute("column-id") ?? this.id;
    }
    connectedCallback() {
      this.setAttribute("data-uiwc-kanban-column", "");
      this.#classes();
      this.#chrome();
      if (!this._observer) {
        this._observer = new MutationObserver(() => this.#schedule());
        this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ["done", "data-uiwc-kanban-card"] });
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
        "grid",
        "grid-cols-[1fr_auto]",
        "content-start",
        "gap-x-2",
        "gap-y-2",
        "w-64",
        "shrink-0",
        "min-h-32",
        "rounded-xl",
        "bg-base-50",
        "p-3",
        "transition-colors",
        "[&[data-over]]:bg-base-100",
        "[&>*]:col-span-2",
        "[&>[data-uiwc-header]]:col-span-1",
        "[&>[data-uiwc-header]]:col-start-1",
        "[&>[data-uiwc-header]]:row-start-1",
        "[&>[slot=actions]]:col-span-1",
        "[&>[slot=actions]]:col-start-2",
        "[&>[slot=actions]]:row-start-1",
        "[&>[slot=actions]]:justify-self-end",
        "[&>[slot=actions]]:self-center"
      ]);
    }
    #chrome() {
      let header = this.querySelector(":scope > [data-uiwc-header]");
      if (!header) {
        header = document.createElement("div");
        header.setAttribute("data-uiwc-header", "");
        header.className = "flex min-w-0 items-center gap-2 text-sm font-semibold text-base-700";
        header.innerHTML = '<span data-dot class="h-2 w-2 shrink-0 rounded-full"></span><span data-label class="truncate"></span><span data-count class="ml-auto rounded-full bg-base-100 px-1.5 text-xs font-medium text-base-500"></span>';
      }
      if (this.firstElementChild !== header) this.prepend(header);
      const cards = [...this.children].filter((el) => el.matches(CARD2));
      const done = cards.filter((c5) => c5.hasAttribute("done")).length;
      const limit = parseInt(this.getAttribute("wip-limit"), 10);
      const over = Number.isFinite(limit) && cards.length > limit;
      const set = (sel, text) => {
        const el = header.querySelector(sel);
        if (el.textContent !== text) el.textContent = text;
        return el;
      };
      set("[data-label]", this.getAttribute("label") || "");
      const count = set("[data-count]", Number.isFinite(limit) ? `${cards.length}/${limit}` : String(cards.length));
      count.classList.toggle("bg-danger/10", over);
      count.classList.toggle("text-danger", over);
      count.classList.toggle("bg-base-100", !over);
      count.classList.toggle("text-base-500", !over);
      const dot = header.querySelector("[data-dot]");
      const dotClass = DOTS[this.getAttribute("color")];
      for (const c5 of Object.values(DOTS)) dot.classList.remove(c5);
      if (dotClass) dot.classList.add(dotClass);
      dot.classList.toggle("hidden", !dotClass);
      let bar = this.querySelector(":scope > [data-uiwc-progress]");
      if (this.hasAttribute("progress")) {
        if (!bar) {
          bar = document.createElement("div");
          bar.setAttribute("data-uiwc-progress", "");
          bar.className = "h-1 overflow-hidden rounded-full bg-base-200";
          bar.innerHTML = '<div class="h-full rounded-full bg-success transition-all"></div>';
        }
        if (header.nextElementSibling !== bar) header.after(bar);
        const pct = cards.length ? Math.round(done / cards.length * 100) + "%" : "0%";
        const fill = bar.firstElementChild;
        if (fill.style.width !== pct) fill.style.width = pct;
      } else if (bar) {
        bar.remove();
      }
    }
  };
  window.__uiwc.register("kanban-column", UiKanbanColumn);

  // components/kanban-label/kanban-label.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiKanbanLabel = class extends HTMLElement {
    static get observedAttributes() {
      return ["color", "remove-class"];
    }
    connectedCallback() {
      this._built = true;
      this.#apply();
    }
    attributeChangedCallback() {
      if (this._built) this.#apply();
    }
    #apply() {
      const color = this.getAttribute("color");
      if (color) this.style.setProperty("--uiwc-c", color);
      else this.style.removeProperty("--uiwc-c");
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-kanban-label`,
        "inline-flex",
        "items-center",
        "rounded",
        "px-1.5",
        "py-0.5",
        "text-xs",
        "font-medium",
        "leading-none",
        "bg-[color-mix(in_srgb,var(--uiwc-c,rgb(var(--ui-base-500,113_113_122)))_13%,transparent)]",
        "text-[color:var(--uiwc-c,rgb(var(--ui-base-600,82_82_91)))]"
      ]);
    }
  };
  window.__uiwc.register("kanban-label", UiKanbanLabel);

  // components/knob/knob.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter11 = 0;
  var UiKnob = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: Number },
      min: { type: Number },
      max: { type: Number },
      size: { type: Number },
      disabled: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = 0;
      this.min = 0;
      this.max = 100;
      this.size = 80;
      this.disabled = false;
      this._id = `ui-knob-${++idCounter11}`;
    }
    #setFromPercent(pct) {
      const clamped = Math.min(1, Math.max(0, pct));
      const next = Math.round(this.min + clamped * (this.max - this.min));
      if (next === this.value) return;
      this.value = next;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    #handlePointerDown(e6) {
      if (this.disabled) return;
      e6.preventDefault();
      const track = e6.currentTarget;
      track.setPointerCapture(e6.pointerId);
      const update = (evt) => {
        const rect = track.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let angle = Math.atan2(evt.clientX - cx, cy - evt.clientY) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        const sweep = 270;
        const startOffset = -135;
        let normalized = angle + 180 - (startOffset + 180);
        normalized = (normalized % 360 + 360) % 360;
        this.#setFromPercent(normalized / sweep);
      };
      update(e6);
      const onMove = (evt) => update(evt);
      const onUp = () => {
        track.removeEventListener("pointermove", onMove);
        track.removeEventListener("pointerup", onUp);
      };
      track.addEventListener("pointermove", onMove);
      track.addEventListener("pointerup", onUp);
    }
    #handleKeydown(e6) {
      if (this.disabled) return;
      const step = (this.max - this.min) / 100 || 1;
      if (e6.key === "ArrowUp" || e6.key === "ArrowRight") {
        e6.preventDefault();
        this.value = Math.min(this.max, this.value + step);
        this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
      } else if (e6.key === "ArrowDown" || e6.key === "ArrowLeft") {
        e6.preventDefault();
        this.value = Math.max(this.min, this.value - step);
        this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
      } else if (e6.key === "Home") {
        this.value = this.min;
      } else if (e6.key === "End") {
        this.value = this.max;
      }
    }
    render() {
      const pct = (this.value - this.min) / (this.max - this.min);
      const sweep = 270;
      const startAngle = -225;
      const r4 = 40;
      const circumference = 2 * Math.PI * r4 * (sweep / 360);
      const dashOffset = circumference * (1 - pct);
      return b2`
      <div class="${window.__uiwc.prefix}-knob inline-flex flex-col items-center gap-1.5">
        <div
          class="relative cursor-pointer touch-none"
          style="width:${this.size}px;height:${this.size}px"
          role="slider"
          tabindex=${this.disabled ? -1 : 0}
          aria-label=${this.label || "Knob"}
          aria-valuemin=${this.min}
          aria-valuemax=${this.max}
          aria-valuenow=${this.value}
          @pointerdown=${this.#handlePointerDown}
          @keydown=${this.#handleKeydown}
        >
          <svg viewBox="0 0 100 100" class="${this.disabled ? "opacity-50" : ""}">
            ${w`<circle cx="50" cy="50" r="${r4}" fill="none" class="stroke-base-200" stroke-width="8"
              stroke-dasharray="${circumference} 999"
              stroke-dashoffset="0"
              transform="rotate(${startAngle} 50 50)"
              stroke-linecap="round" />
            <circle cx="50" cy="50" r="${r4}" fill="none" class="stroke-base-900" stroke-width="8"
              stroke-dasharray="${circumference} 999"
              stroke-dashoffset="${dashOffset}"
              transform="rotate(${startAngle} 50 50)"
              stroke-linecap="round" />`}
          </svg>
          <div class="absolute inset-0 flex items-center justify-center text-sm font-semibold text-base-900">${this.value}</div>
        </div>
        ${this.label ? b2`<span class="text-xs text-base-500">${this.label}</span>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("knob", UiKnob);

  // components/list/list.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var SIZES4 = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };
  var ICON_SIZES2 = { sm: "sm", md: "sm", lg: "md" };
  var COLORS = {
    base: { border: "border-base-200", dot: "bg-base-400", icon: "text-base-500" },
    brand: { border: "border-brand-200", dot: "bg-brand-500", icon: "text-brand-600" },
    success: { border: "border-success/20", dot: "bg-success", icon: "text-success" },
    warning: { border: "border-warning/20", dot: "bg-warning", icon: "text-warning" },
    danger: { border: "border-danger/20", dot: "bg-danger", icon: "text-danger" },
    info: { border: "border-info/20", dot: "bg-info", icon: "text-info" }
  };
  var UiList = class extends i4 {
    static properties = {
      title: { type: String },
      size: { type: String, reflect: true },
      color: { type: String, reflect: true },
      variant: { type: String, reflect: true },
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.title = "";
      this.size = "md";
      this.color = "base";
      this.variant = "left";
      this.removeClass = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    // Reads the raw <li icon="..." title="...">text</li> children captured before
    // Lit took over, same parsing approach as `ui-breadcrumb`.
    #items() {
      const template = document.createElement("template");
      template.innerHTML = this._content || "";
      return [...template.content.children].filter((el) => el.tagName === "LI").map((li) => ({
        icon: li.getAttribute("icon") || "",
        title: li.getAttribute("title") || "",
        text: li.innerHTML.trim()
      }));
    }
    render() {
      const tone = COLORS[this.color] || COLORS.base;
      const sizeClass = SIZES4[this.size] || SIZES4.md;
      const iconSize = ICON_SIZES2[this.size] || "sm";
      const isRight = this.variant === "right";
      const wanted = [`${window.__uiwc.prefix}-list`, sizeClass, "text-base-700"];
      const cls = window.__uiwc.classes(wanted, this).join(" ");
      const rows = this.#items().map(
        ({ icon, title, text }) => b2`
        <li class="flex items-center gap-2.5 py-1 ${isRight ? "justify-between" : ""}">
          ${icon ? b2`<uiwc-icon name=${icon} size=${iconSize} class="shrink-0 ${tone.icon}"></uiwc-icon>` : b2`<span class="shrink-0 w-1.5 h-1.5 rounded-full ${tone.dot}"></span>`}
          ${isRight ? b2`
                <span class="flex-1">${o5(text)}</span>
                ${title ? b2`<strong class="shrink-0 font-medium text-base-900">${title}</strong>` : ""}
              ` : b2`<span>${title ? b2`<strong class="mr-1 font-medium text-base-900">${title}</strong>` : ""}${o5(text)}</span>`}
        </li>
      `
      );
      return b2`
      ${this.title ? b2`<h2 class="block mb-2 text-base font-medium text-base-900">${this.title}</h2>` : ""}
      <ul class="${cls}">
        ${rows}
      </ul>
    `;
    }
  };
  window.__uiwc.register("list", UiList);

  // components/main/main.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiMain = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-main`, "flex", "min-w-0", "flex-1", "flex-col", "overflow-y-auto"]);
    }
  };
  window.__uiwc.register("main", UiMain);

  // components/menu/menu.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiMenu = class extends i4 {
    createRenderRoot() {
      return this;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <nav
        class="${window.__uiwc.prefix}-menu flex flex-col gap-0.5 rounded border border-base-200 bg-surface p-1.5
          [&>.menu-section]:px-2.5 [&>.menu-section]:pb-1 [&>.menu-section]:pt-2 [&>.menu-section]:text-xs [&>.menu-section]:font-semibold [&>.menu-section]:uppercase [&>.menu-section]:tracking-wide [&>.menu-section]:text-base-400
          [&>a]:flex [&>a]:items-center [&>a]:gap-2 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-1.5 [&>a]:text-sm [&>a]:text-base-700 [&>a]:no-underline [&>a:hover]:bg-base-50
          [&>a.active]:bg-base-100 [&>a.active]:font-medium [&>a.active]:text-base-900
          [&>hr]:my-1 [&>hr]:border-base-100"
      >
        ${o5(this._content || "")}
      </nav>
    `;
    }
  };
  window.__uiwc.register("menu", UiMenu);

  // components/menu-item/menu-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiMenuItem = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const label = this.getAttribute("label") || "";
      const href = this.getAttribute("href");
      const submenuItems = [...this.children].filter((el) => el.tagName === `${window.__uiwc.prefix}-menu-item`.toUpperCase());
      const hasSubmenu = submenuItems.length > 0;
      this.classList.add("relative", "inline-block");
      const trigger = document.createElement(href && !hasSubmenu ? "a" : "button");
      if (href && !hasSubmenu) trigger.href = href;
      if (trigger.tagName === "BUTTON") trigger.type = "button";
      trigger.textContent = label;
      trigger.className = "inline-flex items-center gap-1 border-0 bg-transparent px-1 py-2 font-inherit text-sm font-medium text-base-700 no-underline cursor-pointer";
      if (hasSubmenu) {
        const chevron = document.createElement("span");
        chevron.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
        trigger.appendChild(chevron);
        const submenu = document.createElement("div");
        submenu.setAttribute("role", "menu");
        submenu.className = "absolute top-full left-0 z-20 hidden min-w-[12rem] flex-col gap-0.5 rounded-lg border border-base-200 bg-surface p-2 shadow-xl";
        submenuItems.forEach((item) => submenu.appendChild(item));
        this.appendChild(submenu);
        this._submenu = submenu;
        trigger.addEventListener("click", (e6) => {
          e6.stopPropagation();
          this.#toggle();
        });
        this._onDocClick = () => this.#close();
        this._onKeydown = (e6) => {
          if (e6.key === "Escape") this.#close();
        };
      }
      this.prepend(trigger);
    }
    #toggle() {
      this._open ? this.#close() : this.#open();
    }
    #open() {
      this._open = true;
      this._submenu.style.display = "flex";
      document.addEventListener("click", this._onDocClick);
      document.addEventListener("keydown", this._onKeydown);
    }
    #close() {
      this._open = false;
      if (this._submenu) this._submenu.style.display = "none";
      document.removeEventListener("click", this._onDocClick);
      document.removeEventListener("keydown", this._onKeydown);
    }
  };
  window.__uiwc.register("menu-item", UiMenuItem);

  // components/metergroup/metergroup.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS5 = {
    neutral: { bar: "bg-base-400", dot: "bg-base-400" },
    primary: { bar: "bg-base-900", dot: "bg-base-900" },
    success: { bar: "bg-emerald-500", dot: "bg-emerald-500" },
    warning: { bar: "bg-amber-500", dot: "bg-amber-500" },
    danger: { bar: "bg-rose-500", dot: "bg-rose-500" },
    info: { bar: "bg-blue-500", dot: "bg-blue-500" },
    purple: { bar: "bg-purple-500", dot: "bg-purple-500" }
  };
  var UiMetergroup = class extends i4 {
    static properties = {
      segments: { type: Array }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.segments = [];
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-metergroup flex flex-col gap-2.5">
        <div class="flex h-2 w-full overflow-hidden rounded-full bg-base-100">
          ${this.segments.map((s4) => {
        const v2 = VARIANTS5[s4.variant] || VARIANTS5.neutral;
        return b2`<span class="${v2.bar} h-full" style="width:${s4.value}%"></span>`;
      })}
        </div>
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-600">
          ${this.segments.map((s4) => {
        const v2 = VARIANTS5[s4.variant] || VARIANTS5.neutral;
        return b2`
              <li class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full ${v2.dot}"></span>
                ${s4.label} ${s4.value}%
              </li>
            `;
      })}
        </ul>
      </div>
    `;
    }
  };
  window.__uiwc.register("metergroup", UiMetergroup);

  // components/modal/modal.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var POSITION_CLASSES = {
    center: "rounded-md max-w-lg w-[90vw] max-md:fixed max-md:inset-0 max-md:m-0 max-md:h-full max-md:max-h-full max-md:w-full max-md:max-w-none max-md:rounded-none",
    left: "fixed inset-y-0 left-0 m-0 h-full w-96 max-w-[90vw] rounded-none max-md:w-full max-md:max-w-none",
    right: "fixed inset-y-0 right-0 m-0 h-full w-96 max-w-[90vw] rounded-none max-md:w-full max-md:max-w-none"
  };
  var UiModal = class extends HTMLElement {
    static get observedAttributes() {
      return ["open"];
    }
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.data = null;
      const template = this.querySelector("template");
      const content = template ? template.content.cloneNode(true) : document.createDocumentFragment();
      template?.remove();
      const position = POSITION_CLASSES[this.getAttribute("position")] ? this.getAttribute("position") : "center";
      const dialog = document.createElement("dialog");
      dialog.className = `${window.__uiwc.prefix}-modal-native border-0 bg-surface shadow-2xl backdrop:bg-base-900/40 ${POSITION_CLASSES[position]}`;
      dialog.appendChild(content);
      dialog.addEventListener("close", () => {
        this.removeAttribute("open");
        this.dispatchEvent(
          new CustomEvent("ui-modal-close", { bubbles: true, composed: true, detail: { result: this._result } })
        );
        this._result = void 0;
      });
      dialog.addEventListener("click", (e6) => {
        if (e6.target === dialog) dialog.close();
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
    show(data) {
      this.data = data ?? null;
      this.setAttribute("open", "");
    }
    close(result) {
      this._result = result;
      this.removeAttribute("open");
    }
  };
  window.__uiwc.register("modal", UiModal);

  // components/multiselect/multiselect.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter12 = 0;
  var norm2 = (s4) => String(s4).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  var UiMultiselect = class extends i4 {
    static properties = {
      placeholder: { type: String },
      label: { type: String },
      display: { type: String },
      disabled: { type: Boolean, reflect: true },
      searchable: { type: Boolean },
      searchPlaceholder: { type: String, attribute: "search-placeholder" },
      emptyLabel: { type: String, attribute: "empty-label" },
      _open: { state: true },
      _values: { state: true },
      _query: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.placeholder = "Seleccionar...";
      this.label = "";
      this.display = "value";
      this.disabled = false;
      this.searchable = false;
      this.searchPlaceholder = "Buscar...";
      this.emptyLabel = "Sin resultados";
      this._open = false;
      this._values = [];
      this._query = "";
      this._id = `ui-multiselect-${++idCounter12}`;
      this._onDocClick = (e6) => {
        if (!this.contains(e6.target)) this._open = false;
      };
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
      document.addEventListener("click", this._onDocClick);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("click", this._onDocClick);
    }
    get values() {
      return this._values;
    }
    willUpdate(changed) {
      if (changed.has("_open") && !this._open) this._query = "";
    }
    #labels() {
      if (!this._labels) {
        const template = document.createElement("template");
        template.innerHTML = this._content || "";
        this._labels = [...template.content.querySelectorAll(`${window.__uiwc.prefix}-option`)].map((o7) => o7.textContent.trim());
      }
      return this._labels;
    }
    #visibleOptions() {
      return [...this.querySelectorAll(`-option`)].filter((o7) => o7.style.display !== "none");
    }
    #activeOption() {
      const visible = this.#visibleOptions();
      return visible.find((o7) => o7.hasAttribute("data-active")) || visible[0];
    }
    #moveActive(step) {
      const visible = this.#visibleOptions();
      if (!visible.length) return;
      const i7 = visible.findIndex((o7) => o7.hasAttribute("data-active"));
      visible.forEach((o7) => o7.removeAttribute("data-active"));
      const next = visible[(i7 + step + visible.length) % visible.length];
      next.setAttribute("data-active", "");
      next.style.background = "rgba(128,128,128,.15)";
      next.scrollIntoView?.({ block: "nearest" });
    }
    #matches(label) {
      const q = norm2(this._query.trim());
      return !q || norm2(label).includes(q);
    }
    #onSearchKey(e6) {
      if (!e6.target.matches?.("[data-search]")) return;
      if (e6.key === "Escape") {
        this._open = false;
        this.querySelector("button")?.focus();
      } else if (e6.key === "Enter") {
        e6.preventDefault();
        const opt = this.#activeOption();
        if (opt) this.#toggle(opt);
      } else if (e6.key === "ArrowDown" || e6.key === "ArrowUp") {
        e6.preventDefault();
        this.#moveActive(e6.key === "ArrowDown" ? 1 : -1);
      }
    }
    #toggleOption(e6) {
      const option = e6.target.closest(`${window.__uiwc.prefix}-option`);
      if (option) this.#toggle(option);
    }
    #toggle(option) {
      this._values = this._values.includes(option.value) ? this._values.filter((v2) => v2 !== option.value) : [...this._values, option.value];
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { values: this._values } }));
    }
    #removeChip(value, e6) {
      e6.stopPropagation();
      this._values = this._values.filter((v2) => v2 !== value);
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { values: this._values } }));
    }
    updated(changed) {
      this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
        option.selected = this._values.includes(option.value);
        option.style.display = this.#matches(option.textContent.trim()) ? "" : "none";
        if (changed.has("_query")) {
          option.removeAttribute("data-active");
          option.style.background = "";
        }
      });
      if (changed.has("_open") && this._open && this.searchable) this.querySelector("[data-search]")?.focus();
    }
    #labelFor(value) {
      return this.querySelector(`ui-option[value="${value}"]`)?.textContent.trim() || value;
    }
    render() {
      const isCount = this.display === "count";
      const noMatch = this.searchable && this._query.trim() && !this.#labels().some((l4) => this.#matches(l4));
      return b2`
      <div class="${window.__uiwc.prefix}-multiselect relative" @keydown=${this.#onSearchKey}>
        ${this.label && !isCount ? b2`<label for=${this._id} class="mb-1.5 block text-sm font-medium text-base-900">${this.label}</label>` : ""}
        <button
          id=${this._id}
          type="button"
          class="flex ${isCount ? "w-auto items-center" : "min-h-[2.5rem] w-full flex-wrap items-center"} gap-1.5 rounded border bg-surface px-2.5 py-1.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 disabled:bg-base-50 disabled:opacity-60 ${isCount && this._values.length ? "border-base-900" : "border-base-300"}"
          aria-haspopup="listbox"
          aria-expanded=${this._open}
          ?disabled=${this.disabled}
          @click=${() => this._open = !this._open}
        >
          ${isCount ? b2`
                <span class="text-base-700">${this.label || this.placeholder}</span>
                ${this._values.length ? b2`<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white">${this._values.length}</span>` : ""}
              ` : this._values.length ? this._values.map(
        (v2) => b2`
                    <span class="inline-flex items-center gap-1 rounded bg-base-100 px-1.5 py-0.5 text-xs font-medium text-base-800">
                      ${this.#labelFor(v2)}
                      <span
                        role="button"
                        tabindex="0"
                        class="rounded p-0.5 hover:bg-black/10"
                        aria-label="Quitar"
                        @click=${(e6) => this.#removeChip(v2, e6)}
                      >
                        <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </span>
                    </span>
                  `
      ) : b2`<span class="text-base-400">${this.placeholder}</span>`}
        </button>
        ${this._open ? b2`
              <div
                class="absolute z-10 mt-1 ${isCount ? "min-w-[220px]" : "w-full"} max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg"
                role="listbox"
                aria-multiselectable="true"
                @click=${this.#toggleOption}
              >
                ${this.searchable ? b2`
                      <div class="sticky top-0 z-10 -mt-1 border-b border-base-100 bg-surface px-2 pb-1.5 pt-2">
                        <input
                          data-search
                          type="search"
                          autocomplete="off"
                          aria-label=${this.searchPlaceholder}
                          placeholder=${this.searchPlaceholder}
                          class="w-full rounded border border-base-300 bg-surface px-2.5 py-1.5 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900"
                          .value=${this._query}
                          @input=${(e6) => this._query = e6.target.value}
                        />
                      </div>
                    ` : ""}
                ${o5(this._content || "")}
                ${noMatch ? b2`<div class="px-3 py-2 text-sm text-base-500">${this.emptyLabel}</div>` : ""}
                ${this._values.length ? b2`
                      <div class="flex justify-end border-t border-base-100 px-1.5 pt-1.5">
                        <button
                          type="button"
                          class="rounded px-1.5 py-1 text-xs font-medium text-base-500 hover:bg-base-50 hover:text-base-900"
                          @click=${(e6) => {
        e6.stopPropagation();
        this._values = [];
        this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { values: this._values } }));
      }}
                        >
                          Limpiar
                        </button>
                      </div>
                    ` : ""}
              </div>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("multiselect", UiMultiselect);

  // components/nav-card/nav-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var TONES2 = {
    base: "bg-base-100 text-base-700",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    info: "bg-info/10 text-info",
    violet: "bg-violet-100 text-violet-700",
    rose: "bg-rose-100 text-rose-700"
  };
  var ACCENT_BORDER = {
    base: "border-l-base-900",
    success: "border-l-success",
    warning: "border-l-warning",
    danger: "border-l-danger",
    info: "border-l-info",
    violet: "border-l-violet-500",
    rose: "border-l-rose-500"
  };
  var UiNavCard = class extends i4 {
    static properties = {
      icon: { type: String },
      heading: { type: String },
      text: { type: String },
      href: { type: String },
      layout: { type: String, reflect: true },
      tone: { type: String, reflect: true },
      cta: { type: String },
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.icon = "";
      this.heading = "";
      this.text = "";
      this.href = "";
      this.layout = "row";
      this.tone = "base";
      this.cta = "Ver m\xE1s";
      this.removeClass = "";
    }
    #action() {
      if (this.href) return;
      this.dispatchEvent(new CustomEvent("ui-nav-card-action", { bubbles: true, composed: true }));
    }
    #iconBox(size) {
      if (!this.icon) return "";
      const toneClass = TONES2[this.tone] || TONES2.base;
      return b2`
      <span class="flex shrink-0 items-center justify-center rounded ${toneClass} ${size}">
        <uiwc-icon name=${this.icon} size="sm"></uiwc-icon>
      </span>
    `;
    }
    #content() {
      if (this.layout === "center") {
        return b2`
        <div class="flex flex-col items-center gap-3 p-6 text-center">
          ${this.#iconBox("h-11 w-11")}
          <div>
            <h3 class="text-[14.5px] font-bold text-base-900">${this.heading}</h3>
            ${this.text ? b2`<p class="mt-1 text-[12.5px] leading-relaxed text-base-500">${this.text}</p>` : ""}
          </div>
        </div>
      `;
      }
      if (this.layout === "inline") {
        return b2`
        <div class="p-4">
          <div class="mb-1.5 flex items-center gap-2.5">
            ${this.#iconBox("h-7 w-7")}
            <h3 class="text-[13.5px] font-bold text-base-900">${this.heading}</h3>
          </div>
          ${this.text ? b2`<p class="mb-3 text-xs leading-relaxed text-base-500">${this.text}</p>` : ""}
          <span class="inline-flex items-center gap-1 text-xs font-semibold text-base-900">
            ${this.cta}
            <uiwc-icon name="chevron-right" size="sm" class="transition-transform group-hover:translate-x-1"></uiwc-icon>
          </span>
        </div>
      `;
      }
      if (this.layout === "tile") {
        return b2`
        <div class="flex flex-col items-center gap-2.5 p-4 text-center">
          ${this.#iconBox("h-9 w-9")}
          <strong class="text-[12.5px] font-semibold text-base-900">${this.heading}</strong>
        </div>
      `;
      }
      if (this.layout === "accent") {
        return b2`
        <div class="flex gap-3.5 p-4">
          ${this.#iconBox("h-9 w-9")}
          <div class="min-w-0">
            <strong class="block text-[13.5px] font-bold text-base-900">${this.heading}</strong>
            ${this.text ? b2`<span class="text-xs text-base-500">${this.text}</span>` : ""}
          </div>
        </div>
      `;
      }
      return b2`
      <div class="flex items-center gap-3.5 p-4">
        ${this.#iconBox("h-10 w-10")}
        <div class="min-w-0 flex-1">
          <strong class="block text-[13.5px] font-bold text-base-900">${this.heading}</strong>
          ${this.text ? b2`<span class="text-xs text-base-500">${this.text}</span>` : ""}
        </div>
        <uiwc-icon
          name="chevron-right"
          size="sm"
          class="shrink-0 text-base-300 transition-transform group-hover:translate-x-1 group-hover:text-base-900"
        ></uiwc-icon>
      </div>
    `;
    }
    render() {
      const wanted = [
        `${window.__uiwc.prefix}-nav-card`,
        "group",
        "block",
        "w-full",
        "appearance-none",
        "text-left",
        "no-underline",
        "rounded",
        "border",
        "border-base-200",
        "bg-surface",
        "text-base-900",
        "transition-colors",
        "hover:border-base-300",
        "hover:bg-base-50",
        this.layout === "accent" ? `border-l-[3px] ${ACCENT_BORDER[this.tone] || ACCENT_BORDER.base}` : "",
        this.layout === "center" ? "transition-transform hover:-translate-y-0.5 hover:shadow-md" : ""
      ];
      const cls = window.__uiwc.classes(wanted, this).join(" ");
      const content = this.#content();
      return this.href ? b2`<a href=${this.href} class="${cls}">${content}</a>` : b2`<button type="button" @click=${this.#action} class="${cls} cursor-pointer">${content}</button>`;
    }
  };
  window.__uiwc.register("nav-card", UiNavCard);

  // components/navbar/navbar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiNavbar = class extends i4 {
    createRenderRoot() {
      return this;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <nav class="${window.__uiwc.prefix}-navbar flex items-center justify-between gap-4 border-b border-base-200 bg-surface px-4 py-3">
        ${o5(this._content || "")}
      </nav>
    `;
    }
  };
  window.__uiwc.register("navbar", UiNavbar);

  // components/number-input/number-input.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter13 = 0;
  var UiNumberInput = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: Number },
      min: { type: Number },
      max: { type: Number },
      step: { type: Number },
      disabled: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = 0;
      this.min = -Infinity;
      this.max = Infinity;
      this.step = 1;
      this.disabled = false;
      this.name = "";
      this._id = `ui-number-input-${++idCounter13}`;
    }
    #setValue(next) {
      const clamped = Math.min(this.max, Math.max(this.min, next));
      if (clamped === this.value) return;
      this.value = clamped;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    #handleInput(e6) {
      const next = Number(e6.target.value);
      if (!Number.isNaN(next)) this.#setValue(next);
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-number-input flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label}</label>` : ""}
        <div class="inline-flex items-stretch divide-x divide-base-300 rounded border border-base-300 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900">
          <button
            type="button"
            class="px-2.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Restar"
            ?disabled=${this.disabled || this.value <= this.min}
            @click=${() => this.#setValue(this.value - this.step)}
          >
            −
          </button>
          <input
            id=${this._id}
            type="number"
            class="w-14 border-0 bg-surface text-center text-sm text-base-900 focus:outline-none disabled:bg-base-50 disabled:opacity-60"
            name=${this.name || ""}
            .value=${String(this.value)}
            min=${this.min === -Infinity ? void 0 : this.min}
            max=${this.max === Infinity ? void 0 : this.max}
            step=${this.step}
            ?disabled=${this.disabled}
            @input=${this.#handleInput}
          />
          <button
            type="button"
            class="px-2.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Sumar"
            ?disabled=${this.disabled || this.value >= this.max}
            @click=${() => this.#setValue(this.value + this.step)}
          >
            +
          </button>
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("number-input", UiNumberInput);

  // components/option/option.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiOption = class extends i4 {
    static properties = {
      value: { type: String },
      selected: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.selected = false;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-option flex items-center justify-between px-3 py-1.5 text-sm text-base-900 hover:bg-base-50 ${this.selected ? "bg-base-100 text-base-800" : ""}">
        <span>${o5(this._content || "")}</span>
        ${this.selected ? b2`<uiwc-icon name="check" size="sm"></uiwc-icon>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("option", UiOption);

  // components/otp-input/otp-input.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiOtpInput = class extends i4 {
    static properties = {
      length: { type: Number },
      disabled: { type: Boolean, reflect: true },
      _digits: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.length = 6;
      this.disabled = false;
      this._digits = [];
    }
    connectedCallback() {
      super.connectedCallback();
      this._digits = Array(this.length).fill("");
    }
    get value() {
      return this._digits.join("");
    }
    #emit() {
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
      if (this._digits.every((d3) => d3 !== "")) {
        this.dispatchEvent(new CustomEvent("ui-otp-complete", { bubbles: true, composed: true, detail: { value: this.value } }));
      }
    }
    #focusBox(index) {
      this.renderRoot.querySelector(`input[data-index="${index}"]`)?.focus();
    }
    #handleInput(index, e6) {
      const char = e6.target.value.replace(/[^0-9]/g, "").slice(-1);
      this._digits = this._digits.map((d3, i7) => i7 === index ? char : d3);
      e6.target.value = char;
      if (char && index < this.length - 1) this.#focusBox(index + 1);
      this.#emit();
    }
    #handleKeydown(index, e6) {
      if (e6.key === "Backspace" && !e6.target.value && index > 0) {
        this.#focusBox(index - 1);
      }
    }
    #handlePaste(e6) {
      const text = e6.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, this.length);
      if (!text) return;
      e6.preventDefault();
      this._digits = Array(this.length).fill("").map((_2, i7) => text[i7] || "");
      this.#emit();
      this.#focusBox(Math.min(text.length, this.length - 1));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-otp-input flex gap-2" @paste=${this.#handlePaste}>
        ${this._digits.map(
        (digit, i7) => b2`
            <input
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="1"
              data-index=${i7}
              .value=${digit}
              ?disabled=${this.disabled}
              class="h-11 w-9 rounded border border-base-300 text-center text-lg font-medium focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
              aria-label="Dígito ${i7 + 1} de ${this.length}"
              @input=${(e6) => this.#handleInput(i7, e6)}
              @keydown=${(e6) => this.#handleKeydown(i7, e6)}
            />
          `
      )}
      </div>
    `;
    }
  };
  window.__uiwc.register("otp-input", UiOtpInput);

  // components/pagination/pagination.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiPagination = class extends i4 {
    static properties = {
      page: { type: Number },
      totalPages: { type: Number, attribute: "total-pages" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.page = 1;
      this.totalPages = 1;
    }
    #goTo(page) {
      if (page < 1 || page > this.totalPages || page === this.page) return;
      this.page = page;
      this.dispatchEvent(new CustomEvent("ui-page-change", { bubbles: true, composed: true, detail: { page } }));
    }
    #buttonClass(active) {
      return active ? "bg-brand-900 text-brand-fg" : "text-base-900 hover:bg-base-100";
    }
    #pages() {
      const total = this.totalPages;
      const current = this.page;
      const pages = /* @__PURE__ */ new Set([1, total, current, current - 1, current + 1]);
      return [...pages].filter((p3) => p3 >= 1 && p3 <= total).sort((a4, b3) => a4 - b3);
    }
    render() {
      const pages = this.#pages();
      let prev = 0;
      const items = [];
      for (const p3 of pages) {
        if (p3 - prev > 1) items.push(b2`<span class="px-1.5 text-base-400">…</span>`);
        items.push(b2`
        <button
          type="button"
          class="min-w-[2rem] rounded px-2 py-1 text-sm ${this.#buttonClass(p3 === this.page)}"
          aria-current=${p3 === this.page ? "page" : void 0}
          @click=${() => this.#goTo(p3)}
        >
          ${p3}
        </button>
      `);
        prev = p3;
      }
      return b2`
      <nav class="${window.__uiwc.prefix}-pagination flex items-center gap-1" aria-label="Paginación">
        <button
          type="button"
          class="rounded p-1.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Página anterior"
          ?disabled=${this.page <= 1}
          @click=${() => this.#goTo(this.page - 1)}
        >
          <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(90deg)"></uiwc-icon>
        </button>
        ${items}
        <button
          type="button"
          class="rounded p-1.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Página siguiente"
          ?disabled=${this.page >= this.totalPages}
          @click=${() => this.#goTo(this.page + 1)}
        >
          <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(-90deg)"></uiwc-icon>
        </button>
      </nav>
    `;
    }
  };
  window.__uiwc.register("pagination", UiPagination);

  // components/pillbox/pillbox.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiPillbox = class extends i4 {
    static properties = {
      placeholder: { type: String },
      disabled: { type: Boolean, reflect: true },
      _values: { state: true },
      _draft: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.placeholder = "Agregar...";
      this.disabled = false;
      this._values = [];
      this._draft = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._initialized === void 0) {
        const initial = this.getAttribute("value");
        this._values = initial ? initial.split(",").filter(Boolean) : [];
        this._initialized = true;
      }
    }
    get values() {
      return this._values;
    }
    #emit() {
      this.dispatchEvent(new CustomEvent("ui-pillbox-change", { bubbles: true, composed: true, detail: { values: this._values } }));
    }
    #addFromDraft() {
      const text = this._draft.trim();
      if (!text) return;
      this._values = [...this._values, text];
      this._draft = "";
      this.#emit();
    }
    #removeAt(index) {
      this._values = this._values.filter((_2, i7) => i7 !== index);
      this.#emit();
    }
    #handleKeydown(e6) {
      if (e6.key === "Enter" || e6.key === ",") {
        e6.preventDefault();
        this.#addFromDraft();
      } else if (e6.key === "Backspace" && !this._draft && this._values.length) {
        this.#removeAt(this._values.length - 1);
      }
    }
    render() {
      return b2`
      <div
        class="${window.__uiwc.prefix}-pillbox flex flex-wrap items-center gap-1.5 rounded border border-base-300 bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900 ${this.disabled ? "opacity-60" : ""}"
      >
        ${this._values.map(
        (v2, i7) => b2`
            <span class="inline-flex items-center gap-1 rounded bg-base-100 px-2 py-0.5 text-xs font-medium text-base-800">
              ${v2}
              <button
                type="button"
                class="rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Quitar ${v2}"
                ?disabled=${this.disabled}
                @click=${() => this.#removeAt(i7)}
              >
                <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          `
      )}
        <input
          type="text"
          class="min-w-[6rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-base-900 placeholder:text-base-400 focus:outline-none disabled:cursor-not-allowed"
          placeholder=${this._values.length ? "" : this.placeholder}
          .value=${this._draft}
          ?disabled=${this.disabled}
          @input=${(e6) => this._draft = e6.target.value}
          @keydown=${this.#handleKeydown}
          @blur=${() => this.#addFromDraft()}
        />
      </div>
    `;
    }
  };
  window.__uiwc.register("pillbox", UiPillbox);

  // components/popover/popover.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiPopover = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const template = this.querySelector("template[data-popover-content]");
      this._trigger = [...this.children].find((el) => el !== template);
      this._templateContent = template ? template.content : document.createDocumentFragment();
      template?.remove();
      if (!this._trigger) {
        console.warn("ui-popover: falta un elemento trigger (primer hijo, antes del <template>)");
        return;
      }
      this.classList.add("relative", "inline-block");
      this._trigger.addEventListener("click", () => this.toggle());
      this._onDocClick = (e6) => {
        if (this._open && !this.contains(e6.target)) this.close();
      };
      this._onKeydown = (e6) => {
        if (this._open && e6.key === "Escape") this.close();
      };
      document.addEventListener("click", this._onDocClick);
      document.addEventListener("keydown", this._onKeydown);
    }
    disconnectedCallback() {
      document.removeEventListener("click", this._onDocClick);
      document.removeEventListener("keydown", this._onKeydown);
    }
    get open() {
      return Boolean(this._open);
    }
    toggle() {
      this._open ? this.close() : this.show();
    }
    show() {
      if (this._open) return;
      this._open = true;
      const placement = this.getAttribute("placement") || "bottom";
      const panel = document.createElement("div");
      const wanted = [
        `${window.__uiwc.prefix}-popover-panel`,
        "absolute",
        "z-10",
        "min-w-48",
        "rounded-xl",
        "border",
        "border-base-200",
        "bg-surface",
        "p-3",
        "shadow-lg",
        "shadow-base-950/10",
        ...this.#placementClass(placement).split(" ")
      ];
      panel.className = window.__uiwc.classes(wanted, this).join(" ");
      panel.appendChild(this._templateContent.cloneNode(true));
      this.appendChild(panel);
      this._panel = panel;
      this.dispatchEvent(new CustomEvent("ui-popover-open", { bubbles: true, composed: true }));
    }
    close() {
      if (!this._open) return;
      this._open = false;
      this._panel?.remove();
      this._panel = null;
      this.dispatchEvent(new CustomEvent("ui-popover-close", { bubbles: true, composed: true }));
    }
    #placementClass(placement) {
      const map = {
        bottom: "top-full left-0 mt-1.5",
        top: "bottom-full left-0 mb-1.5",
        "bottom-end": "top-full right-0 mt-1.5",
        "top-end": "bottom-full right-0 mb-1.5"
      };
      return map[placement] || map.bottom;
    }
  };
  window.__uiwc.register("popover", UiPopover);

  // components/profile-card/profile-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiProfileCard = class extends i4 {
    static properties = {
      avatarSrc: { type: String, attribute: "avatar-src" },
      avatarText: { type: String, attribute: "avatar-text" },
      title: { type: String },
      subtitle: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.avatarSrc = "";
      this.avatarText = "";
      this.title = "";
      this.subtitle = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML.trim();
        this.innerHTML = "";
      }
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-profile-card flex items-start gap-3 rounded border border-base-200 bg-surface p-4">
        <uiwc-avatar src=${this.avatarSrc || void 0} name=${this.avatarText || this.title} size="md"></uiwc-avatar>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate font-semibold text-base-900">${this.title}</span>
          </div>
          ${this.subtitle ? b2`<div class="text-sm text-base-500">${this.subtitle}</div>` : ""}
          ${this._content ? b2`<div class="mt-2">${o5(this._content)}</div>` : ""}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("profile-card", UiProfileCard);

  // components/progress-bar/progress-bar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS6 = {
    primary: "bg-brand-900",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger"
  };
  var UiProgressBar = class extends i4 {
    static properties = {
      value: { type: Number },
      max: { type: Number },
      variant: { type: String, reflect: true },
      indeterminate: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = 0;
      this.max = 100;
      this.variant = "primary";
      this.indeterminate = false;
    }
    render() {
      const variantClass = VARIANTS6[this.variant] || VARIANTS6.primary;
      const pct = Math.max(0, Math.min(100, this.value / this.max * 100));
      return b2`
      <div
        class="${window.__uiwc.prefix}-progress-bar w-full h-2 rounded-full bg-base-50 overflow-hidden"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax=${this.max}
        aria-valuenow=${this.indeterminate ? void 0 : this.value}
      >
        <div
          class="h-full rounded-full ${variantClass} ${this.indeterminate ? "w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]" : "transition-[width] duration-300"}"
          style=${this.indeterminate ? "" : `width:${pct}%`}
        ></div>
      </div>
      <style>
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      </style>
    `;
    }
  };
  window.__uiwc.register("progress-bar", UiProgressBar);

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
      const onStart = (e6) => {
        if (this._refreshing || this.scrollTop > 0) return;
        startY = e6.touches[0].clientY;
        active = true;
        claimed = false;
        distance = 0;
      };
      const onMove = (e6) => {
        if (!active) return;
        const dy = e6.touches[0].clientY - startY;
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
        e6.preventDefault();
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

  // components/radio/radio.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter14 = 0;
  var UiRadio = class extends i4 {
    static properties = {
      checked: { type: Boolean, reflect: true },
      disabled: { type: Boolean, reflect: true },
      name: { type: String },
      value: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.checked = false;
      this.disabled = false;
      this.name = "";
      this.value = "";
      this._id = `ui-radio-${++idCounter14}`;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #handleChange(e6) {
      this.checked = e6.target.checked;
    }
    render() {
      return b2`
      <label class="${window.__uiwc.prefix}-radio inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled ? "opacity-50" : "cursor-pointer"}" for=${this._id}>
        <span class="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${this.checked ? "border-brand-900" : "border-base-300"}">
          <input
            id=${this._id}
            type="radio"
            class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            name=${this.name || ""}
            value=${this.value}
            .checked=${this.checked}
            ?disabled=${this.disabled}
            @change=${this.#handleChange}
          />
          <span class="pointer-events-none h-2.5 w-2.5 rounded-full bg-brand-900 transition-transform ${this.checked ? "scale-100" : "scale-0"}"></span>
          <span class="pointer-events-none absolute inset-0 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900"></span>
        </span>
        <span>${o5(this._content || "")}</span>
      </label>
    `;
    }
  };
  window.__uiwc.register("radio", UiRadio);

  // components/radio-group/radio-group.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRadioGroup = class extends i4 {
    static properties = {
      name: { type: String },
      value: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.name = "";
      this.value = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
      this.addEventListener("change", this.#handleChange);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener("change", this.#handleChange);
    }
    #handleChange = (e6) => {
      const radio = e6.target.closest(`${window.__uiwc.prefix}-radio`);
      if (!radio) return;
      this.value = radio.value;
      this.dispatchEvent(new CustomEvent("ui-radio-group-change", { bubbles: true, composed: true, detail: { value: this.value } }));
    };
    updated() {
      this.querySelectorAll(`${window.__uiwc.prefix}-radio`).forEach((radio) => {
        radio.name = this.name;
        radio.checked = radio.value === this.value;
      });
    }
    render() {
      return b2`<div class="${window.__uiwc.prefix}-radio-group flex flex-col gap-2" role="radiogroup">${o5(this._content || "")}</div>`;
    }
  };
  window.__uiwc.register("radio-group", UiRadioGroup);

  // components/rail/rail.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRail = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-rail`,
        "fixed",
        "inset-y-0",
        "left-0",
        "z-30",
        "flex",
        "w-16",
        "flex-col",
        "items-center",
        "justify-start",
        "gap-1.5",
        "bg-rail",
        "py-3.5",
        "max-[768px]:static",
        "max-[768px]:h-14",
        "max-[768px]:w-full",
        "max-[768px]:flex-row",
        "max-[768px]:px-3.5",
        "max-[768px]:py-0"
      ]);
    }
  };
  window.__uiwc.register("rail", UiRail);

  // components/rail-first/rail-first.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRailFirst = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-rail-first`,
        "flex",
        "flex-col",
        "items-center",
        "gap-2",
        "max-[768px]:flex-row"
      ]);
    }
  };
  window.__uiwc.register("rail-first", UiRailFirst);

  // components/rail-last/rail-last.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRailLast = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-rail-last`,
        "mt-auto",
        "flex",
        "flex-col",
        "items-center",
        "gap-2",
        "max-[768px]:mt-0",
        "max-[768px]:ml-auto",
        "max-[768px]:flex-row"
      ]);
    }
  };
  window.__uiwc.register("rail-last", UiRailLast);

  // components/rating/rating.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRating = class extends i4 {
    static properties = {
      value: { type: Number },
      max: { type: Number },
      readonly: { type: Boolean, reflect: true },
      _hover: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = 0;
      this.max = 5;
      this.readonly = false;
      this._hover = 0;
    }
    #setValue(next) {
      if (this.readonly) return;
      this.value = next;
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    #handleKeydown(e6) {
      if (this.readonly) return;
      if (e6.key === "ArrowRight" || e6.key === "ArrowUp") {
        e6.preventDefault();
        this.#setValue(Math.min(this.max, this.value + 1));
      } else if (e6.key === "ArrowLeft" || e6.key === "ArrowDown") {
        e6.preventDefault();
        this.#setValue(Math.max(0, this.value - 1));
      }
    }
    render() {
      const display = this._hover || this.value;
      return b2`
      <div
        class="${window.__uiwc.prefix}-rating inline-flex gap-0.5"
        role="slider"
        aria-label="Calificación"
        aria-valuemin="0"
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        tabindex=${this.readonly ? -1 : 0}
        @keydown=${this.#handleKeydown}
        @mouseleave=${() => this._hover = 0}
      >
        ${Array.from({ length: this.max }, (_2, i7) => i7 + 1).map(
        (n5) => b2`
            <button
              type="button"
              class="${this.readonly ? "cursor-default" : "cursor-pointer"} ${n5 <= display ? "text-amber-400" : "text-base-200"}"
              tabindex="-1"
              aria-hidden="true"
              @click=${() => this.#setValue(n5)}
              @mouseenter=${() => !this.readonly && (this._hover = n5)}
            >
              <uiwc-icon name="star" size="md"></uiwc-icon>
            </button>
          `
      )}
      </div>
    `;
    }
  };
  window.__uiwc.register("rating", UiRating);

  // components/rich-text-editor/rich-text-editor.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiRichTextEditor = class extends i4 {
    static properties = {
      placeholder: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.placeholder = "Escrib\xED ac\xE1...";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML.trim();
        this.innerHTML = "";
      }
    }
    get value() {
      return this.querySelector("[contenteditable]")?.innerHTML ?? "";
    }
    #exec(command, value) {
      if (command === "createLink") {
        const url = window.prompt("URL del link:");
        if (!url) return;
        document.execCommand(command, false, url);
      } else {
        document.execCommand(command, false, value);
      }
      this.querySelector("[contenteditable]")?.focus();
    }
    #handleInput(e6) {
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: e6.target.innerHTML } }));
    }
    render() {
      const toolbarBtn = (icon, label, command, value) => b2`
      <button
        type="button"
        class="rounded p-1.5 text-base-500 hover:bg-base-100 hover:text-base-900"
        @mousedown=${(e6) => e6.preventDefault()}
        @click=${() => this.#exec(command, value)}
        aria-label=${label}
        title=${label}
      >
        <uiwc-icon name=${icon} size="sm"></uiwc-icon>
      </button>
    `;
      return b2`
      <div class="${window.__uiwc.prefix}-rich-text-editor rounded border border-base-300">
        <div class="flex items-center gap-0.5 border-b border-base-200 px-1 py-1">
          ${toolbarBtn("bold", "Negrita", "bold")}
          ${toolbarBtn("italic", "Cursiva", "italic")}
          ${toolbarBtn("underline", "Subrayado", "underline")}
          <span class="mx-1 h-4 w-px bg-base-200"></span>
          ${toolbarBtn("list", "Lista", "insertUnorderedList")}
          ${toolbarBtn("list", "Lista numerada", "insertOrderedList")}
          <span class="mx-1 h-4 w-px bg-base-200"></span>
          ${toolbarBtn("link", "Insertar link", "createLink")}
        </div>
        <div
          contenteditable="true"
          data-placeholder=${this.placeholder}
          class="ui-rte-content min-h-[8rem] px-3 py-2 text-sm text-base-900 focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-base-400"
          @input=${this.#handleInput}
        >${o5(this._content || "")}</div>
      </div>
    `;
    }
  };
  window.__uiwc.register("rich-text-editor", UiRichTextEditor);

  // components/select/select.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter15 = 0;
  var norm3 = (s4) => String(s4).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  var UiSelect = class extends i4 {
    static properties = {
      value: { type: String },
      placeholder: { type: String },
      label: { type: String },
      display: { type: String },
      name: { type: String },
      disabled: { type: Boolean, reflect: true },
      searchable: { type: Boolean },
      searchPlaceholder: { type: String, attribute: "search-placeholder" },
      emptyLabel: { type: String, attribute: "empty-label" },
      _open: { state: true },
      _query: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.value = "";
      this.placeholder = "Seleccionar...";
      this.label = "";
      this.display = "value";
      this.name = "";
      this.disabled = false;
      this.searchable = false;
      this.searchPlaceholder = "Buscar...";
      this.emptyLabel = "Sin resultados";
      this._open = false;
      this._query = "";
      this._label = "";
      this._id = `ui-select-${++idCounter15}`;
      this._onDocClick = (e6) => {
        if (!this.contains(e6.target)) this._open = false;
      };
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
      document.addEventListener("click", this._onDocClick);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("click", this._onDocClick);
    }
    // El texto de una opción se resuelve contra el contenido original (no contra el DOM
    // renderizado): las <ui-option> solo existen en el DOM mientras el dropdown está
    // abierto, así que un `value` inicial/programático no encontraría su opción.
    #labelFor(value) {
      const template = document.createElement("template");
      template.innerHTML = this._content || "";
      const option = [...template.content.querySelectorAll(`${window.__uiwc.prefix}-option`)].find((o7) => (o7.getAttribute("value") ?? "") === value);
      return option ? option.textContent.trim() : "";
    }
    willUpdate(changed) {
      if (changed.has("value")) this._label = this.#labelFor(this.value);
      if (changed.has("_open") && !this._open) this._query = "";
    }
    #labels() {
      if (!this._labels) {
        const template = document.createElement("template");
        template.innerHTML = this._content || "";
        this._labels = [...template.content.querySelectorAll(`${window.__uiwc.prefix}-option`)].map((o7) => o7.textContent.trim());
      }
      return this._labels;
    }
    #visibleOptions() {
      return [...this.querySelectorAll(`-option`)].filter((o7) => o7.style.display !== "none");
    }
    #activeOption() {
      const visible = this.#visibleOptions();
      return visible.find((o7) => o7.hasAttribute("data-active")) || visible[0];
    }
    #moveActive(step) {
      const visible = this.#visibleOptions();
      if (!visible.length) return;
      const i7 = visible.findIndex((o7) => o7.hasAttribute("data-active"));
      visible.forEach((o7) => o7.removeAttribute("data-active"));
      const next = visible[(i7 + step + visible.length) % visible.length];
      next.setAttribute("data-active", "");
      next.style.background = "rgba(128,128,128,.15)";
      next.scrollIntoView?.({ block: "nearest" });
    }
    #matches(label) {
      const q = norm3(this._query.trim());
      return !q || norm3(label).includes(q);
    }
    #handleOptionClick(e6) {
      const option = e6.target.closest(`${window.__uiwc.prefix}-option`);
      if (option) this.#choose(option);
    }
    #choose(option) {
      const label = option.textContent.trim();
      this.value = option.value;
      this._open = false;
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { value: this.value, label } }));
    }
    #handleKeydown(e6) {
      if (e6.target.matches?.("[data-search]")) {
        if (e6.key === "Escape") {
          this._open = false;
          this.querySelector("button")?.focus();
        } else if (e6.key === "Enter") {
          e6.preventDefault();
          const opt = this.#activeOption();
          if (opt) this.#choose(opt);
        } else if (e6.key === "ArrowDown" || e6.key === "ArrowUp") {
          e6.preventDefault();
          this.#moveActive(e6.key === "ArrowDown" ? 1 : -1);
        }
        return;
      }
      if (e6.key === "Escape") this._open = false;
      if (e6.key === "Enter" || e6.key === " ") {
        e6.preventDefault();
        this._open = !this._open;
      }
    }
    updated(changed) {
      this.querySelectorAll(`${window.__uiwc.prefix}-option`).forEach((option) => {
        option.selected = option.value === this.value;
        option.style.display = this.#matches(option.textContent.trim()) ? "" : "none";
        if (changed.has("_query")) {
          option.removeAttribute("data-active");
          option.style.background = "";
        }
      });
      if (changed.has("_open") && this._open && this.searchable) this.querySelector("[data-search]")?.focus();
    }
    render() {
      const isCount = this.display === "count";
      const count = this.value ? 1 : 0;
      const noMatch = this.searchable && this._query.trim() && !this.#labels().some((l4) => this.#matches(l4));
      return b2`
      <div class="${window.__uiwc.prefix}-select relative" @keydown=${this.#handleKeydown}>
        ${this.label && !isCount ? b2`<label for=${this._id} class="mb-1.5 block text-sm font-medium text-base-900">${this.label}</label>` : ""}
        ${this.name ? b2`<input type="hidden" name=${this.name} .value=${this.value} ?disabled=${this.disabled} />` : ""}
        <button
          id=${this._id}
          type="button"
          class="flex ${isCount ? "w-auto" : "w-full"} items-center gap-1.5 rounded border bg-surface px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand-900 disabled:bg-base-50 disabled:opacity-60 ${count > 0 ? "border-base-900 text-base-900" : "border-base-300 text-base-400"} ${!isCount && this.value ? "text-base-900" : ""}"
          aria-haspopup="listbox"
          aria-expanded=${this._open}
          ?disabled=${this.disabled}
          @click=${() => this._open = !this._open}
        >
          ${isCount ? b2`
                <span class="text-base-700">${this.label || this.placeholder}</span>
                ${count > 0 ? b2`<span class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-base-900 px-1 text-[11px] font-semibold text-white">${count}</span>` : ""}
              ` : this._label || this.placeholder}
          <uiwc-icon name="chevron-down" size="sm" class="ml-auto shrink-0 text-base-400"></uiwc-icon>
        </button>
        ${this._open ? b2`
              <div
                class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded border border-base-200 bg-surface py-1 shadow-lg"
                role="listbox"
                @click=${this.#handleOptionClick}
              >
                ${this.searchable ? b2`
                      <div class="sticky top-0 z-10 -mt-1 border-b border-base-100 bg-surface px-2 pb-1.5 pt-2">
                        <input
                          data-search
                          type="search"
                          autocomplete="off"
                          aria-label=${this.searchPlaceholder}
                          placeholder=${this.searchPlaceholder}
                          class="w-full rounded border border-base-300 bg-surface px-2.5 py-1.5 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900"
                          .value=${this._query}
                          @input=${(e6) => this._query = e6.target.value}
                        />
                      </div>
                    ` : ""}
                ${o5(this._content || "")}
                ${noMatch ? b2`<div class="px-3 py-2 text-sm text-base-500">${this.emptyLabel}</div>` : ""}
              </div>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("select", UiSelect);

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
      [&>a]:flex [&>a]:items-center [&>a]:gap-2.5 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-1 [&>a]:text-sm [&>a]:text-sidebar-fg/70 [&>a]:no-underline [&>a:hover]:bg-sidebar-fg/10 [&>a:hover]:text-sidebar-fg
      [&>a.active]:bg-sidebar-fg/10 [&>a.active]:font-medium [&>a.active]:text-sidebar-fg
      [&>hr]:my-2 [&>hr]:border-sidebar-fg/20`;
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
        "bg-sidebar",
        "text-sidebar-fg",
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
      const EDGE2 = 24;
      let startX = 0;
      let startY = 0;
      let active = false;
      let claimed = false;
      let opening = false;
      const onStart = (e6) => {
        if (desktop.matches || this._built !== true) return;
        const t4 = e6.touches[0];
        const isOpen = this.hasAttribute("open");
        if (!isOpen) {
          if (t4.clientX > EDGE2) return;
          opening = true;
        } else {
          if (!this.contains(e6.target) && e6.target !== this._scrim) return;
          opening = false;
        }
        startX = t4.clientX;
        startY = t4.clientY;
        active = true;
        claimed = false;
      };
      const onMove = (e6) => {
        if (!active) return;
        const t4 = e6.touches[0];
        const dx = t4.clientX - startX;
        const dy = t4.clientY - startY;
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
        e6.preventDefault();
        const width = this.offsetWidth || 288;
        const tx = opening ? Math.min(0, -width + Math.max(0, dx)) : Math.max(-width, Math.min(0, dx));
        this.style.transform = `translateX(${tx}px)`;
        if (this._scrim) this._scrim.style.opacity = String((width + tx) / width);
      };
      const onEnd = (e6) => {
        if (!active) return;
        active = false;
        if (!claimed) return;
        const width = this.offsetWidth || 288;
        const dx = e6.changedTouches[0].clientX - startX;
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
  document.addEventListener("click", (e6) => {
    if (e6.target.closest(`[${window.__uiwc.prefix}-sidebar-toggle]`)) {
      window.__uiwc.sidebarToggle();
    }
  });

  // components/sidebar-footer/sidebar-footer.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSidebarFooter = class extends i4 {
    static properties = {
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.removeClass = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const cls = window.__uiwc.classes([`${window.__uiwc.prefix}-sidebar-footer`, "shrink-0", "border-t", "border-sidebar-fg/15", "p-4"], this).join(" ");
      return b2`
      <div class="${cls}">
        ${o5(this._content || "")}
      </div>
    `;
    }
  };
  window.__uiwc.register("sidebar-footer", UiSidebarFooter);

  // components/sidebar-group/sidebar-group.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter16 = 0;
  var UiSidebarGroup = class extends i4 {
    static properties = {
      label: { type: String },
      icon: { type: String },
      open: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.icon = "";
      this.open = false;
      this._id = `ui-sidebar-group-${++idCounter16}`;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #toggle() {
      this.open = !this.open;
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-sidebar-group">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm text-sidebar-fg/80 hover:bg-sidebar-fg/10 hover:text-sidebar-fg"
          aria-expanded=${this.open}
          aria-controls="${this._id}-panel"
          @click=${this.#toggle}
        >
          ${this.icon ? b2`<uiwc-icon name=${this.icon} size="sm" class="shrink-0"></uiwc-icon>` : ""}
          <span class="flex-1">${this.label}</span>
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? "rotate-180" : ""}"></uiwc-icon>
        </button>
        <div
          id="${this._id}-panel"
          ?hidden=${!this.open}
          class="ml-2.5 border-l border-sidebar-fg/20 pl-2.5
            [&>a]:flex [&>a]:items-center [&>a]:gap-2.5 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-2 [&>a]:text-sm [&>a]:text-sidebar-fg/60 [&>a]:no-underline [&>a:hover]:bg-sidebar-fg/10 [&>a:hover]:text-sidebar-fg
            [&>a.active]:bg-white/10 [&>a.active]:font-medium [&>a.active]:text-white
            [&>hr]:my-2 [&>hr]:border-sidebar-fg/20"
        >
          ${o5(this._content || "")}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("sidebar-group", UiSidebarGroup);

  // components/sidebar-header/sidebar-header.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSidebarHeader = class extends i4 {
    static properties = {
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.removeClass = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const cls = window.__uiwc.classes([`${window.__uiwc.prefix}-sidebar-header`, "shrink-0", "border-b", "border-sidebar-fg/15", "p-4"], this).join(" ");
      return b2`
      <div class="${cls}">
        ${o5(this._content || "")}
      </div>
    `;
    }
  };
  window.__uiwc.register("sidebar-header", UiSidebarHeader);

  // components/sidebar-section/sidebar-section.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSidebarSection = class extends HTMLElement {
    static get observedAttributes() {
      return ["remove-class"];
    }
    connectedCallback() {
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this.isConnected) this.#applyClasses();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-sidebar-section`,
        "block",
        "pb-1",
        "pt-4",
        "text-[12px]",
        "font-semibold",
        "text-sidebar-fg/50"
      ]);
    }
  };
  window.__uiwc.register("sidebar-section", UiSidebarSection);

  // components/skeleton/skeleton.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS7 = {
    text: "rounded h-4 w-full",
    circle: "rounded-full",
    rect: "rounded"
  };
  var UiSkeleton = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      width: { type: String },
      height: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "text";
      this.width = "";
      this.height = "";
    }
    render() {
      const variantClass = VARIANTS7[this.variant] || VARIANTS7.text;
      const style = [this.width ? `width:${this.width}` : "", this.height ? `height:${this.height}` : ""].filter(Boolean).join(";");
      return b2`
      <span
        class="${window.__uiwc.prefix}-skeleton block animate-pulse bg-base-200 ${variantClass}"
        style=${style}
        role="presentation"
        aria-hidden="true"
      ></span>
    `;
    }
  };
  window.__uiwc.register("skeleton", UiSkeleton);

  // components/slider/slider.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter17 = 0;
  var UiSlider = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: Number },
      min: { type: Number },
      max: { type: Number },
      step: { type: Number },
      disabled: { type: Boolean, reflect: true },
      showValue: { type: Boolean, attribute: "show-value" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = 0;
      this.min = 0;
      this.max = 100;
      this.step = 1;
      this.disabled = false;
      this.showValue = false;
      this._id = `ui-slider-${++idCounter17}`;
    }
    #handleInput(e6) {
      this.value = Number(e6.target.value);
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      const pct = (this.value - this.min) / (this.max - this.min) * 100;
      return b2`
      <div class="${window.__uiwc.prefix}-slider flex flex-col gap-1.5">
        ${this.label || this.showValue ? b2`
              <div class="flex items-center justify-between text-sm">
                ${this.label ? b2`<label for=${this._id} class="font-medium text-base-900">${this.label}</label>` : b2`<span></span>`}
                ${this.showValue ? b2`<span class="text-base-500">${this.value}</span>` : ""}
              </div>
            ` : ""}
        <div class="relative h-2 w-full">
          <div class="absolute inset-0 rounded-full bg-base-200"></div>
          <div class="absolute inset-y-0 left-0 rounded-full bg-brand-900" style="width:${pct}%"></div>
          <input
            id=${this._id}
            type="range"
            class="absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent accent-brand-900 disabled:opacity-50 disabled:cursor-not-allowed"
            min=${this.min}
            max=${this.max}
            step=${this.step}
            .value=${String(this.value)}
            ?disabled=${this.disabled}
            @input=${this.#handleInput}
          />
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("slider", UiSlider);

  // components/speeddial/speeddial.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSpeeddial = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const items = [...this.querySelectorAll(`${window.__uiwc.prefix}-speeddial-item`)];
      const isInline = this.hasAttribute("inline");
      this.className = `${window.__uiwc.prefix}-speeddial ${isInline ? "relative" : "fixed bottom-6 right-6 z-50"} flex flex-col items-end gap-2`;
      const list = document.createElement("div");
      list.className = "flex flex-col items-end gap-2";
      this._buttons = items.map((item, i7) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = item.getAttribute("label") || "";
        btn.setAttribute("aria-label", item.getAttribute("label") || "");
        btn.className = "flex h-10 w-10 scale-90 items-center justify-center rounded-full border border-base-200 bg-surface text-base-700 opacity-0 shadow transition-all pointer-events-none hover:bg-base-50";
        btn.innerHTML = `<uiwc-icon name="${item.getAttribute("icon") || "star"}" size="sm"></uiwc-icon>`;
        btn.addEventListener("click", () => {
          this.dispatchEvent(new CustomEvent("ui-speeddial-select", { bubbles: true, composed: true, detail: { index: i7 } }));
          this.#close();
        });
        list.appendChild(btn);
        return btn;
      });
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.setAttribute("aria-label", "Abrir acciones");
      toggle.setAttribute("aria-expanded", "false");
      toggle.className = "flex h-12 w-12 items-center justify-center rounded-full bg-base-900 text-white shadow-lg transition-transform hover:bg-base-800";
      toggle.innerHTML = `<uiwc-icon name="plus" size="md"></uiwc-icon>`;
      toggle.addEventListener("click", () => this._open ? this.#close() : this.#open());
      this.replaceChildren(list, toggle);
      this._toggle = toggle;
      this._open = false;
    }
    #open() {
      this._open = true;
      this._toggle.style.transform = "rotate(45deg)";
      this._toggle.setAttribute("aria-expanded", "true");
      this._buttons.forEach((btn) => {
        btn.classList.remove("opacity-0", "scale-90", "pointer-events-none");
      });
    }
    #close() {
      this._open = false;
      this._toggle.style.transform = "";
      this._toggle.setAttribute("aria-expanded", "false");
      this._buttons.forEach((btn) => {
        btn.classList.add("opacity-0", "scale-90", "pointer-events-none");
      });
    }
  };
  window.__uiwc.register("speeddial", UiSpeeddial);

  // components/speeddial-item/speeddial-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSpeeddialItem = class extends HTMLElement {
    connectedCallback() {
      this.hidden = true;
    }
  };
  window.__uiwc.register("speeddial-item", UiSpeeddialItem);

  // components/spinner/spinner.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var SIZES5 = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-9 h-9 border-[3px]" };
  var UiSpinner = class extends i4 {
    static properties = {
      size: { type: String, reflect: true },
      label: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.size = "md";
      this.label = "Cargando";
    }
    render() {
      const sizeClass = SIZES5[this.size] || SIZES5.md;
      return b2`
      <span
        class="${window.__uiwc.prefix}-spinner inline-block rounded-full animate-spin border-base-200 border-t-base-900 ${sizeClass}"
        role="status"
        aria-live="polite"
      >
        <span class="sr-only">${this.label}</span>
      </span>
    `;
    }
  };
  window.__uiwc.register("spinner", UiSpinner);
  if (!customElements.get("uiwc-spinner")) {
    customElements.define("uiwc-spinner", class extends UiSpinner {
    });
  }

  // components/split-pane/split-pane.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSplitPane = class extends HTMLElement {
    connectedCallback() {
      this.style.overflow = "auto";
      this.style.minWidth = "0";
      this.style.minHeight = "0";
    }
  };
  window.__uiwc.register("split-pane", UiSplitPane);

  // components/split-panel/split-panel.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSplitPanel = class extends HTMLElement {
    static get observedAttributes() {
      return ["split"];
    }
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const panes = [...this.querySelectorAll(`${window.__uiwc.prefix}-split-pane`)];
      if (panes.length !== 2) {
        console.warn("ui-split-panel: se esperan exactamente dos <ui-split-pane> hijos");
        return;
      }
      this._panes = panes;
      const vertical = this.getAttribute("orientation") === "vertical";
      this._vertical = vertical;
      this.classList.add("flex", vertical ? "flex-col" : "flex-row", "w-full");
      if (!this.style.height) this.classList.add("h-96");
      const divider = document.createElement("div");
      divider.className = `${window.__uiwc.prefix}-split-divider shrink-0 bg-base-200 hover:bg-base-400 transition-colors ` + (vertical ? "h-1 cursor-row-resize" : "w-1 cursor-col-resize");
      divider.setAttribute("role", "separator");
      divider.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
      divider.tabIndex = 0;
      divider.addEventListener("mousedown", (e6) => this.#startDrag(e6));
      divider.addEventListener("keydown", (e6) => this.#handleKeydown(e6));
      this._divider = divider;
      panes[0].after(divider);
      this.#applySplit(Number(this.getAttribute("split")) || 50);
    }
    attributeChangedCallback(name, oldVal, newVal) {
      if (name === "split" && this._panes && oldVal !== null) this.#applySplit(Number(newVal) || 50);
    }
    #applySplit(percent) {
      const clamped = Math.min(90, Math.max(10, percent));
      this._panes[0].style.flex = `0 0 ${clamped}%`;
      this._panes[1].style.flex = "1 1 0%";
      this._split = clamped;
    }
    #startDrag(e6) {
      e6.preventDefault();
      this._dragging = true;
      this._divider.classList.add("!bg-base-500");
      const onMove = (moveEvent) => {
        const rect = this.getBoundingClientRect();
        const pos = this._vertical ? moveEvent.clientY - rect.top : moveEvent.clientX - rect.left;
        const size = this._vertical ? rect.height : rect.width;
        const percent = pos / size * 100;
        this.#applySplit(percent);
        this.dispatchEvent(new CustomEvent("ui-split-resize", { bubbles: true, composed: true, detail: { split: this._split } }));
      };
      const onUp = () => {
        this._dragging = false;
        this._divider.classList.remove("!bg-base-500");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
    #handleKeydown(e6) {
      const step = 5;
      if (!this._vertical && e6.key === "ArrowLeft" || this._vertical && e6.key === "ArrowUp") {
        e6.preventDefault();
        this.#applySplit(this._split - step);
      } else if (!this._vertical && e6.key === "ArrowRight" || this._vertical && e6.key === "ArrowDown") {
        e6.preventDefault();
        this.#applySplit(this._split + step);
      }
    }
  };
  window.__uiwc.register("split-panel", UiSplitPanel);

  // components/splitbutton/splitbutton.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiSplitbutton = class extends i4 {
    static properties = {
      label: { type: String },
      variant: { type: String, reflect: true },
      disabled: { type: Boolean, reflect: true },
      _open: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.variant = "primary";
      this.disabled = false;
      this._open = false;
      this._onDocClick = (e6) => {
        if (!this.contains(e6.target)) this._open = false;
      };
      this._onKeydown = (e6) => {
        if (e6.key === "Escape") this._open = false;
      };
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
      document.addEventListener("click", this._onDocClick);
      document.addEventListener("keydown", this._onKeydown);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener("click", this._onDocClick);
      document.removeEventListener("keydown", this._onKeydown);
    }
    #handleMain() {
      this.dispatchEvent(new CustomEvent("ui-splitbutton-action", { bubbles: true, composed: true }));
    }
    #handleMenuClick(e6) {
      const item = e6.target.closest("[data-value], a, button");
      if (!item) return;
      this._open = false;
      this.dispatchEvent(
        new CustomEvent("ui-splitbutton-select", {
          bubbles: true,
          composed: true,
          detail: { value: item.dataset.value ?? item.textContent.trim(), label: item.textContent.trim() }
        })
      );
    }
    render() {
      const isPrimary = this.variant !== "secondary";
      const base = isPrimary ? "bg-base-900 text-white hover:bg-base-800" : "bg-base-50 text-base-900 hover:bg-base-200";
      const divider = isPrimary ? "border-base-900" : "border-base-300";
      return b2`
      <div class="${window.__uiwc.prefix}-splitbutton relative inline-flex">
        <button
          type="button"
          class="inline-flex items-center rounded-l-lg pl-3.5 pr-3 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${base}"
          ?disabled=${this.disabled}
          @click=${this.#handleMain}
        >
          ${this.label}
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-r-lg border-l pl-2 pr-2.5 py-2 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${base} ${divider}"
          ?disabled=${this.disabled}
          aria-haspopup="menu"
          aria-expanded=${this._open}
          aria-label="Más acciones"
          @click=${() => this._open = !this._open}
        >
          <uiwc-icon name="chevron-down" size="sm"></uiwc-icon>
        </button>
        ${this._open ? b2`
              <div
                class="absolute right-0 top-full mt-1 min-w-[10rem] rounded border border-base-200 bg-surface py-1 shadow-lg [&_a]:block [&_a]:px-3 [&_a]:py-1.5 [&_a]:text-sm [&_a]:text-base-900 [&_a]:hover:bg-base-50 [&_button]:block [&_button]:w-full [&_button]:text-left [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-sm [&_button]:text-base-900 [&_button]:hover:bg-base-50"
                role="menu"
                @click=${this.#handleMenuClick}
              >
                ${o5(this._content || "")}
              </div>
            ` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("splitbutton", UiSplitbutton);

  // components/stat-card/stat-card.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var TONES3 = {
    neutral: "bg-base-100 text-base-700",
    accent: "bg-brand-900 text-brand-fg",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    info: "bg-info/15 text-info"
  };
  var UiStatCard = class extends i4 {
    static properties = {
      icon: { type: String },
      label: { type: String },
      value: { type: String },
      trend: { type: String },
      trendDir: { type: String, attribute: "trend-dir" },
      tone: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.icon = "";
      this.label = "";
      this.value = "";
      this.trend = "";
      this.trendDir = "up";
      this.tone = "neutral";
    }
    render() {
      const toneClass = TONES3[this.tone] || TONES3.neutral;
      const trendClass = this.trendDir === "down" ? "text-danger" : "text-success";
      return b2`
      <div class="${window.__uiwc.prefix}-stat-card rounded border border-base-200 bg-surface p-4">
        <div class="mb-3 flex items-center justify-between">
          ${this.icon ? b2`<span class="flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}"><uiwc-icon name=${this.icon} size="sm"></uiwc-icon></span>` : b2`<span></span>`}
          ${this.trend ? b2`<span class="text-xs font-semibold ${trendClass}">${this.trend}</span>` : ""}
        </div>
        <div class="text-2xl font-semibold text-base-900">${this.value}</div>
        <div class="text-sm text-base-500">${this.label}</div>
      </div>
    `;
    }
  };
  window.__uiwc.register("stat-card", UiStatCard);

  // components/step/step.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiStep = class extends HTMLElement {
    static get observedAttributes() {
      return ["active"];
    }
    connectedCallback() {
      this.hidden = !this.hasAttribute("active");
    }
    attributeChangedCallback(name) {
      if (name === "active") this.hidden = !this.hasAttribute("active");
    }
    get label() {
      return this.getAttribute("label") || "";
    }
  };
  window.__uiwc.register("step", UiStep);

  // components/stepper/stepper.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiStepper = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const steps = [...this.querySelectorAll(`${window.__uiwc.prefix}-step`)];
      if (!steps.length) return;
      this._steps = steps;
      const activeIndex = Math.max(0, steps.findIndex((s4) => s4.hasAttribute("active")));
      const header = document.createElement("div");
      header.className = `${window.__uiwc.prefix}-stepper-header mb-6 flex items-center`;
      this._circles = steps.map((step, i7) => {
        const wrap = document.createElement("div");
        wrap.className = `flex items-center ${i7 === steps.length - 1 ? "flex-none" : "flex-1"}`;
        const circleBtn = document.createElement("button");
        circleBtn.type = "button";
        circleBtn.className = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 text-sm font-semibold cursor-pointer";
        circleBtn.addEventListener("click", () => this.#select(i7));
        const label = document.createElement("span");
        label.textContent = step.getAttribute("label") || "";
        label.className = "ml-2 mr-3 whitespace-nowrap text-sm";
        const line = document.createElement("span");
        line.className = "h-0.5 flex-1 bg-base-200";
        wrap.append(circleBtn, label);
        if (i7 < steps.length - 1) wrap.appendChild(line);
        header.appendChild(wrap);
        return { circleBtn, label, line };
      });
      this.prepend(header);
      this.#select(activeIndex, false);
    }
    #select(index, emit = true) {
      this._activeIndex = index;
      this._steps.forEach((step, i7) => step.toggleAttribute("active", i7 === index));
      this._circles.forEach(({ circleBtn, label, line }, i7) => {
        const state = i7 < index ? "done" : i7 === index ? "active" : "upcoming";
        circleBtn.className = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 text-sm font-semibold cursor-pointer ${state === "upcoming" ? "bg-base-100 text-base-500" : "bg-brand-900 text-brand-fg"}`;
        circleBtn.innerHTML = state === "done" ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : String(i7 + 1);
        label.className = `ml-2 mr-3 whitespace-nowrap text-sm ${state === "upcoming" ? "text-base-400" : "text-base-900"} ${state === "active" ? "font-semibold" : "font-medium"}`;
        if (line) line.className = `h-0.5 flex-1 ${i7 < index ? "bg-brand-900" : "bg-base-200"}`;
      });
      if (emit) this.dispatchEvent(new CustomEvent("ui-stepper-change", { bubbles: true, composed: true, detail: { index } }));
    }
    next() {
      if (this._activeIndex < this._steps.length - 1) this.#select(this._activeIndex + 1);
    }
    back() {
      if (this._activeIndex > 0) this.#select(this._activeIndex - 1);
    }
  };
  window.__uiwc.register("stepper", UiStepper);

  // components/switch/switch.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter18 = 0;
  var UiSwitch = class extends i4 {
    static properties = {
      checked: { type: Boolean, reflect: true },
      disabled: { type: Boolean, reflect: true },
      loading: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.checked = false;
      this.disabled = false;
      this.loading = false;
      this.name = "";
      this._id = `ui-switch-${++idCounter18}`;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    #handleChange(e6) {
      this.checked = e6.target.checked;
      this.dispatchEvent(new CustomEvent("ui-change", { bubbles: true, composed: true, detail: { checked: this.checked } }));
    }
    render() {
      return b2`
      <label class="${window.__uiwc.prefix}-switch inline-flex items-center gap-2 text-sm text-base-900 ${this.disabled || this.loading ? "opacity-50" : "cursor-pointer"}" for=${this._id}>
        <span class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${this.checked ? "bg-brand-900" : "bg-base-300"}">
          <input
            id=${this._id}
            type="checkbox"
            class="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            name=${this.name || ""}
            .checked=${this.checked}
            ?disabled=${this.disabled || this.loading}
            @change=${this.#handleChange}
          />
          <span
            class="pointer-events-none inline-flex h-5 w-5 translate-x-0.5 items-center justify-center rounded-full bg-surface shadow transition-transform peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-900 ${this.checked ? "translate-x-[18px]" : ""}"
          >
            ${this.loading ? b2`<span class="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-base-300 ${this.checked ? "border-t-brand-900" : "border-t-base-500"}"></span>` : ""}
          </span>
        </span>
        <span>${o5(this._content || "")}</span>
      </label>
    `;
    }
  };
  window.__uiwc.register("switch", UiSwitch);

  // components/tab-panel/tab-panel.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTabPanel = class extends HTMLElement {
    static get observedAttributes() {
      return ["active"];
    }
    connectedCallback() {
      this.setAttribute("role", "tabpanel");
      this.hidden = !this.hasAttribute("active");
    }
    attributeChangedCallback(name) {
      if (name === "active") this.hidden = !this.hasAttribute("active");
    }
    get label() {
      return this.getAttribute("label") || "";
    }
  };
  window.__uiwc.register("tab-panel", UiTabPanel);

  // components/table/table.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTable = class extends i4 {
    static properties = {
      striped: { type: Boolean, reflect: true },
      compact: { type: Boolean, reflect: true },
      removeClass: { type: String, attribute: "remove-class" }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.striped = false;
      this.compact = false;
      this.removeClass = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const pad = this.compact ? "[&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2" : "[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3";
      const striped = this.striped ? "[&_tbody_tr:nth-child(even)]:bg-base-50" : "";
      const wanted = [
        `${window.__uiwc.prefix}-table`,
        "overflow-x-auto",
        "rounded",
        "border",
        "border-base-200",
        "[&_table]:w-full",
        "[&_table]:border-collapse",
        "[&_table]:text-sm",
        "[&_thead]:border-b",
        "[&_thead]:border-base-200",
        "[&_thead]:bg-base-50",
        "[&_th]:text-left",
        "[&_th]:font-semibold",
        "[&_th]:text-base-600",
        "[&_td]:border-b",
        "[&_td]:border-base-100",
        "[&_td]:text-base-900",
        "[&_tbody_tr:last-child_td]:border-b-0",
        ...pad.split(" "),
        ...striped ? [striped] : []
      ];
      const wrapperClass = window.__uiwc.classes(wanted, this).join(" ");
      return b2`
      <div class="${wrapperClass}">
        ${o5(this._content || "")}
      </div>
    `;
    }
  };
  window.__uiwc.register("table", UiTable);

  // components/tabs/tabs.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTabs = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const panels = [...this.querySelectorAll(`${window.__uiwc.prefix}-tab-panel`)];
      if (!panels.length) return;
      const activeIndex = Math.max(
        0,
        panels.findIndex((p3) => p3.hasAttribute("active"))
      );
      const list = document.createElement("div");
      list.className = `${window.__uiwc.prefix}-tabs-list flex gap-1 border-b border-base-200`;
      list.setAttribute("role", "tablist");
      const buttons = panels.map((panel, i7) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = panel.getAttribute("label") || "";
        btn.setAttribute("role", "tab");
        btn.className = this.#buttonClass(i7 === activeIndex);
        btn.setAttribute("aria-selected", String(i7 === activeIndex));
        btn.tabIndex = i7 === activeIndex ? 0 : -1;
        btn.addEventListener("click", () => this.#select(i7));
        btn.addEventListener("keydown", (e6) => this.#handleKeydown(e6, i7));
        list.appendChild(btn);
        return btn;
      });
      this._buttons = buttons;
      this._panels = panels;
      this.prepend(list);
      this.#select(activeIndex, false);
    }
    #buttonClass(active) {
      return active ? "border-b-2 border-brand-900 px-6 py-3 text-sm font-medium text-base-900 -mb-px" : "border-b-2 border-transparent px-6 py-3 text-sm font-medium text-base-500 hover:text-base-900 -mb-px";
    }
    #select(index, emit = true) {
      this._panels.forEach((panel, i7) => panel.toggleAttribute("active", i7 === index));
      this._buttons.forEach((btn, i7) => {
        btn.className = this.#buttonClass(i7 === index);
        btn.setAttribute("aria-selected", String(i7 === index));
        btn.tabIndex = i7 === index ? 0 : -1;
      });
      if (emit) {
        this.dispatchEvent(
          new CustomEvent("ui-tabs-change", { bubbles: true, composed: true, detail: { label: this._panels[index].label } })
        );
      }
    }
    #handleKeydown(e6, index) {
      if (e6.key !== "ArrowRight" && e6.key !== "ArrowLeft") return;
      e6.preventDefault();
      const next = e6.key === "ArrowRight" ? (index + 1) % this._buttons.length : (index - 1 + this._buttons.length) % this._buttons.length;
      this._buttons[next].focus();
      this.#select(next);
    }
  };
  window.__uiwc.register("tabs", UiTabs);

  // components/tag/tag.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS8 = {
    neutral: "bg-base-50 text-base-900 hover:bg-base-200",
    primary: "bg-base-100 text-base-800 hover:bg-base-200",
    success: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    warning: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    danger: "bg-rose-100 text-rose-700 hover:bg-rose-200",
    info: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    purple: "bg-purple-100 text-purple-700 hover:bg-purple-200",
    pink: "bg-pink-100 text-pink-700 hover:bg-pink-200",
    indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
    cyan: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
  };
  var UiTag = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      removable: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "neutral";
      this.removable = false;
    }
    #handleRemove() {
      this.dispatchEvent(new CustomEvent("ui-tag-remove", { bubbles: true, composed: true }));
    }
    // Light DOM has no shadow root, so <slot> can't project children — capture the
    // author-provided markup once and re-inject it with unsafeHTML instead.
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const variantClass = VARIANTS8[this.variant] || VARIANTS8.neutral;
      return b2`
      <span class="${window.__uiwc.prefix}-tag inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${variantClass}">
        ${o5(this._content || "")}
        ${this.removable ? b2`
              <button
                type="button"
                class="-mr-0.5 ml-0.5 rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Quitar"
                @click=${this.#handleRemove}
              >
                <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ` : ""}
      </span>
    `;
    }
  };
  window.__uiwc.register("tag", UiTag);

  // node_modules/lit-html/static.js
  var a3 = /* @__PURE__ */ Symbol.for("");
  var o6 = (t4) => {
    if (t4?.r === a3) return t4?._$litStatic$;
  };
  var i6 = (t4, ...r4) => ({ _$litStatic$: r4.reduce((r5, e6, a4) => r5 + ((t5) => {
    if (void 0 !== t5._$litStatic$) return t5._$litStatic$;
    throw Error(`Value passed to 'literal' function must be a 'literal' result: ${t5}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`);
  })(e6) + t4[a4 + 1], t4[0]), r: a3 });
  var l3 = /* @__PURE__ */ new Map();
  var n4 = (t4) => (r4, ...e6) => {
    const a4 = e6.length;
    let s4, i7;
    const n5 = [], u4 = [];
    let c5, $3 = 0, f3 = false;
    for (; $3 < a4; ) {
      for (c5 = r4[$3]; $3 < a4 && void 0 !== (i7 = e6[$3], s4 = o6(i7)); ) c5 += s4 + r4[++$3], f3 = true;
      $3 !== a4 && u4.push(i7), n5.push(c5), $3++;
    }
    if ($3 === a4 && n5.push(r4[a4]), f3) {
      const t5 = n5.join("$$lit$$");
      void 0 === (r4 = l3.get(t5)) && (n5.raw = n5, l3.set(t5, r4 = n5)), e6 = u4;
    }
    return t4(r4, ...e6);
  };
  var u3 = n4(b2);
  var c4 = n4(w);
  var $2 = n4(T);

  // components/text/text.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var TAGS = {
    h1: i6`h1`,
    h2: i6`h2`,
    h3: i6`h3`,
    h4: i6`h4`,
    p: i6`p`,
    span: i6`span`,
    label: i6`label`
  };
  var SIZES6 = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
    "2xl": "text-2xl",
    "3xl": "text-3xl"
  };
  var WEIGHTS = {
    normal: "font-normal",
    medium: "font-medium",
    semibold: "font-semibold",
    bold: "font-bold"
  };
  var COLORS2 = {
    base: "text-base-900",
    muted: "text-base-500",
    brand: "text-brand-900",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info"
  };
  var UiText = class extends i4 {
    static properties = {
      as: { type: String, reflect: true },
      size: { type: String },
      weight: { type: String },
      muted: { type: Boolean, reflect: true },
      color: { type: String, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.as = "p";
      this.size = "md";
      this.weight = "normal";
      this.muted = false;
      this.color = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const tag = TAGS[this.as] || TAGS.p;
      const sizeClass = SIZES6[this.size] || SIZES6.md;
      const weightClass = WEIGHTS[this.weight] || WEIGHTS.normal;
      const colorClass = COLORS2[this.color] || (this.muted ? COLORS2.muted : COLORS2.base);
      return u3`<${tag} class="${window.__uiwc.prefix}-text ${sizeClass} ${weightClass} ${colorClass}">${o5(this._content || "")}</${tag}>`;
    }
  };
  window.__uiwc.register("text", UiText);

  // components/textarea/textarea.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter19 = 0;
  var UiTextarea = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      placeholder: { type: String },
      rows: { type: Number },
      helpText: { type: String, attribute: "help-text" },
      error: { type: String },
      disabled: { type: Boolean, reflect: true },
      required: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "";
      this.placeholder = "";
      this.rows = 3;
      this.helpText = "";
      this.error = "";
      this.disabled = false;
      this.required = false;
      this.name = "";
      this._id = `ui-textarea-${++idCounter19}`;
    }
    #handleInput(e6) {
      this.value = e6.target.value;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      const hasError = Boolean(this.error);
      const borderClass = hasError ? "border-danger focus:border-danger focus:ring-danger" : "border-base-300 focus:border-brand-900 focus:ring-brand-900";
      const describedBy = hasError ? `${this._id}-error` : this.helpText ? `${this._id}-help` : void 0;
      return b2`
      <div class="${window.__uiwc.prefix}-textarea flex flex-col gap-1.5">
        ${this.label ? b2`
              <label for=${this._id} class="text-sm font-medium text-base-900">
                ${this.label} ${this.required ? b2`<span class="text-danger">*</span>` : ""}
              </label>
            ` : ""}
        <textarea
          id=${this._id}
          class="rounded border bg-surface px-3 py-2 text-sm text-base-900 placeholder:text-base-400 focus:outline-none focus:ring-2 disabled:bg-base-50 disabled:opacity-60 ${borderClass}"
          name=${this.name || ""}
          rows=${this.rows}
          placeholder=${this.placeholder || ""}
          ?disabled=${this.disabled}
          ?required=${this.required}
          aria-invalid=${hasError}
          aria-describedby=${describedBy}
          .value=${this.value}
          @input=${this.#handleInput}
        ></textarea>
        ${hasError ? b2`<p id="${this._id}-error" class="text-xs text-danger">${this.error}</p>` : this.helpText ? b2`<p id="${this._id}-help" class="text-xs text-base-500">${this.helpText}</p>` : ""}
      </div>
    `;
    }
  };
  window.__uiwc.register("textarea", UiTextarea);

  // components/dist/ui-web-components-entry.js
  var import_theme_toggle = __toESM(require_theme_toggle());

  // components/thumb/thumb.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var SIZES7 = { sm: "w-7 h-7 text-sm", md: "w-9 h-9 text-base", lg: "w-11 h-11 text-lg" };
  var COLORS3 = {
    base: "bg-base-100 text-base-700",
    brand: "bg-brand-900/10 text-brand-900",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    info: "bg-info/15 text-info"
  };
  var UiThumb = class extends HTMLElement {
    static get observedAttributes() {
      return ["size", "color", "shape", "remove-class"];
    }
    connectedCallback() {
      if (!this._built) this._built = true;
      this.#applyClasses();
    }
    attributeChangedCallback() {
      if (this._built) this.#applyClasses();
    }
    #applyClasses() {
      const sizeClass = SIZES7[this.getAttribute("size")] || SIZES7.md;
      const colorClass = COLORS3[this.getAttribute("color")] || COLORS3.base;
      const shapeClass = this.getAttribute("shape") === "circle" ? "rounded-full" : "rounded";
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-thumb`,
        "inline-flex",
        "shrink-0",
        "items-center",
        "justify-center",
        "overflow-hidden",
        "font-semibold",
        ...sizeClass.split(" "),
        ...colorClass.split(" "),
        shapeClass
      ]);
    }
  };
  window.__uiwc.register("thumb", UiThumb);

  // components/time-picker/time-picker.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var idCounter20 = 0;
  var UiTimePicker = class extends i4 {
    static properties = {
      label: { type: String },
      value: { type: String },
      disabled: { type: Boolean, reflect: true },
      required: { type: Boolean, reflect: true },
      name: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.label = "";
      this.value = "";
      this.disabled = false;
      this.required = false;
      this.name = "";
      this._id = `ui-time-picker-${++idCounter20}`;
    }
    #handleInput(e6) {
      this.value = e6.target.value;
      this.dispatchEvent(new CustomEvent("ui-input", { bubbles: true, composed: true, detail: { value: this.value } }));
    }
    render() {
      return b2`
      <div class="${window.__uiwc.prefix}-time-picker flex flex-col gap-1.5">
        ${this.label ? b2`<label for=${this._id} class="text-sm font-medium text-base-900">${this.label} ${this.required ? b2`<span class="text-danger">*</span>` : ""}</label>` : ""}
        <input
          id=${this._id}
          type="time"
          class="rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
          name=${this.name || ""}
          .value=${this.value}
          ?disabled=${this.disabled}
          ?required=${this.required}
          @input=${this.#handleInput}
        />
      </div>
    `;
    }
  };
  window.__uiwc.register("time-picker", UiTimePicker);

  // components/timeline/timeline.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTimeline = class extends HTMLElement {
    connectedCallback() {
      this.classList.add(`${window.__uiwc.prefix}-timeline`, "block");
      this.setAttribute("role", "list");
    }
  };
  window.__uiwc.register("timeline", UiTimeline);

  // components/timeline-item/timeline-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTimelineItem = class extends i4 {
    static properties = {
      date: { type: String },
      title: { type: String },
      variant: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.date = "";
      this.title = "";
      this.variant = "default";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const dotClass = this.variant === "success" ? "bg-success" : this.variant === "danger" ? "bg-danger" : "bg-base-900";
      return b2`
      <div class="${window.__uiwc.prefix}-timeline-item relative flex gap-3 pb-6 last:pb-0">
        <div class="relative flex flex-col items-center">
          <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}"></span>
          <span class="ui-timeline-line mt-1 w-px flex-1 bg-base-200"></span>
        </div>
        <div class="flex-1 pb-1">
          <div class="flex items-baseline gap-2">
            ${this.title ? b2`<span class="text-sm font-medium text-base-900">${this.title}</span>` : ""}
            ${this.date ? b2`<span class="text-xs text-base-400">${this.date}</span>` : ""}
          </div>
          <div class="mt-0.5 text-sm text-base-500">${o5(this._content || "")}</div>
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("timeline-item", UiTimelineItem);

  // components/toast/toast.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var VARIANTS9 = {
    info: { box: "bg-zinc-900 text-white", icon: "info", iconClass: "text-zinc-400" },
    success: { box: "bg-zinc-900 text-white", icon: "check", iconClass: "text-emerald-400" },
    warning: { box: "bg-zinc-900 text-white", icon: "info", iconClass: "text-amber-400" },
    danger: { box: "bg-zinc-900 text-white", icon: "x", iconClass: "text-rose-400" }
  };
  var UiToast = class extends i4 {
    static properties = {
      variant: { type: String, reflect: true },
      duration: { type: Number },
      heading: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.variant = "info";
      this.duration = 4e3;
      this.heading = "";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
      if (this.duration > 0) {
        this._timer = setTimeout(() => this.#dismiss(), this.duration);
      }
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      clearTimeout(this._timer);
    }
    #dismiss() {
      this.dispatchEvent(new CustomEvent("ui-toast-dismiss", { bubbles: true, composed: true }));
      this.remove();
    }
    render() {
      const cfg = VARIANTS9[this.variant] || VARIANTS9.info;
      return b2`
      <div class="${window.__uiwc.prefix}-toast flex items-start gap-3 rounded ${cfg.box} px-4 py-3 text-sm shadow-lg" role="status" aria-live="polite">
        <uiwc-icon name=${cfg.icon} class="${cfg.iconClass} shrink-0 mt-0.5"></uiwc-icon>
        <div class="flex-1">
          ${this.heading ? b2`<p class="mb-0.5 font-semibold">${this.heading}</p>` : ""}
          ${o5(this._content || "")}
        </div>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
          aria-label="Cerrar"
          @click=${this.#dismiss}
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;
    }
    // ---- imperative convenience API — creates a one-off <ui-toast>, drops it into a
    // shared fixed-position stack (created lazily, one per page), and lets it
    // self-dismiss as usual. Static method (not a global `window.uiToast`-style
    // function) so the API stays consistent with how the rest of the library works —
    // see the comment on `UiDialog.confirm()` in dialog.js for the same reasoning.
    // For consumers using the classic (non-module) bundle, `window.__uiwc.toast()`
    // below calls the same code. ----
    static show(message, options = {}) {
      const { variant = "info", duration = 4e3, heading = "" } = options;
      let stack = document.querySelector(`.${window.__uiwc.prefix}-toast-stack`);
      if (!stack) {
        stack = document.createElement("div");
        stack.className = `${window.__uiwc.prefix}-toast-stack fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[22rem] max-w-[calc(100vw-2rem)]`;
        document.body.appendChild(stack);
      }
      const toast = document.createElement(`${window.__uiwc.prefix}-toast`);
      toast.setAttribute("variant", variant);
      toast.setAttribute("duration", String(duration));
      if (heading) toast.setAttribute("heading", heading);
      toast.textContent = message;
      stack.appendChild(toast);
      return toast;
    }
  };
  window.__uiwc.register("toast", UiToast);
  window.__uiwc.toast = (message, options) => UiToast.show(message, options);

  // components/toolbar/toolbar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var JUSTIFY = { start: "justify-start", between: "justify-between", end: "justify-end" };
  var UiToolbar = class extends i4 {
    static properties = {
      justify: { type: String }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.justify = "start";
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._content === void 0) {
        this._content = this.innerHTML;
        this.innerHTML = "";
      }
    }
    render() {
      const justifyClass = JUSTIFY[this.justify] || JUSTIFY.start;
      return b2`
      <div class="${window.__uiwc.prefix}-toolbar flex items-center gap-2 ${justifyClass} rounded border border-base-200 bg-surface p-2">
        ${o5(this._content || "")}
      </div>
    `;
    }
  };
  window.__uiwc.register("toolbar", UiToolbar);

  // components/dist/ui-web-components-entry.js
  var import_tooltip = __toESM(require_tooltip());

  // components/topbar/topbar.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTopbar = class extends HTMLElement {
    static get observedAttributes() {
      return ["heading", "subheading", "sidebar-toggle-display", "remove-class"];
    }
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.#applyClasses();
      const left = document.createElement("div");
      left.className = "flex min-w-0 items-center gap-3";
      const hamburger = document.createElement("button");
      hamburger.type = "button";
      hamburger.className = "-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded text-base-500 hover:bg-base-100 md:hidden";
      hamburger.setAttribute("aria-label", "Abrir men\xFA");
      hamburger.innerHTML = `<uiwc-icon name="menu" size="md"></uiwc-icon>`;
      hamburger.addEventListener("click", () => window.__uiwc.sidebarToggle?.());
      const textWrap = document.createElement("div");
      textWrap.className = "min-w-0";
      this._headingEl = document.createElement("h1");
      this._headingEl.className = "truncate text-lg font-bold tracking-tight text-base-900";
      this._subheadingEl = document.createElement("div");
      this._subheadingEl.className = "mt-0.5 truncate text-xs font-medium text-base-400";
      textWrap.append(this._headingEl, this._subheadingEl);
      this._hamburgerEl = hamburger;
      left.append(hamburger, textWrap);
      const actions = document.createElement("div");
      actions.className = "flex shrink-0 items-center gap-2.5";
      [...this.children].forEach((child) => actions.appendChild(child));
      this.append(left, actions);
      this.#sync();
    }
    attributeChangedCallback(name) {
      if (!this._built) return;
      if (name === "remove-class") this.#applyClasses();
      else this.#sync();
    }
    #applyClasses() {
      window.__uiwc.syncClasses(this, [
        `${window.__uiwc.prefix}-topbar`,
        "sticky",
        "top-0",
        "z-20",
        "flex",
        "h-16",
        "shrink-0",
        "items-center",
        "justify-between",
        "border-b",
        "border-base-200",
        "bg-surface",
        "px-4",
        "md:px-7"
      ]);
    }
    #sync() {
      const heading = this.getAttribute("heading") || "";
      const subheading = this.getAttribute("subheading") || "";
      this._headingEl.textContent = heading;
      this._headingEl.hidden = !heading;
      this._subheadingEl.textContent = subheading;
      this._subheadingEl.hidden = !subheading;
      const hideToggle = this.getAttribute("sidebar-toggle-display") === "none";
      this._hamburgerEl.style.display = hideToggle ? "none" : "";
    }
  };
  window.__uiwc.register("topbar", UiTopbar);

  // components/tree/tree.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTree = class extends HTMLElement {
    connectedCallback() {
      this.setAttribute("role", "tree");
      this.classList.add(`${window.__uiwc.prefix}-tree`, "block");
      this.addEventListener("ui-tree-select", this.#handleSelect);
    }
    disconnectedCallback() {
      this.removeEventListener("ui-tree-select", this.#handleSelect);
    }
    #handleSelect = (e6) => {
      this.querySelectorAll(`${window.__uiwc.prefix}-tree-item`).forEach((item) => {
        if (item !== e6.target) item.deselect?.();
      });
    };
  };
  window.__uiwc.register("tree", UiTree);

  // components/tree-item/tree-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiTreeItem = class extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      const label = this.getAttribute("label") || "";
      const hasChildren = this.querySelector(`${window.__uiwc.prefix}-tree-item`) !== null;
      this.classList.add(`${window.__uiwc.prefix}-tree-item`, "block");
      const header = document.createElement("div");
      header.setAttribute("role", "treeitem");
      header.tabIndex = 0;
      header.className = "flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm text-base-700 hover:bg-base-100";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `h-4 w-4 shrink-0 border-0 bg-transparent p-0 text-base-400 transition-transform -rotate-90 ` + (hasChildren ? "cursor-pointer" : "cursor-default");
      toggle.innerHTML = hasChildren ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' : "";
      toggle.setAttribute("aria-label", "Expandir");
      toggle.addEventListener("click", (e6) => {
        e6.stopPropagation();
        if (hasChildren) this.#setOpen(!this._open);
      });
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      header.append(toggle, labelEl);
      header.addEventListener("click", () => this.#select());
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "ml-4 hidden border-l border-base-100 pl-2";
      [...this.children].forEach((child) => childrenWrap.appendChild(child));
      this.prepend(childrenWrap);
      this.prepend(header);
      this._header = header;
      this._toggle = toggle;
      this._childrenWrap = childrenWrap;
      this._open = false;
      this._label = label;
    }
    #setOpen(open) {
      this._open = open;
      this._childrenWrap.classList.toggle("hidden", !open);
      this._toggle.classList.toggle("-rotate-90", !open);
      this._header.setAttribute("aria-expanded", String(open));
    }
    #select() {
      this._header.classList.remove("text-base-700", "hover:bg-base-100");
      this._header.classList.add("bg-brand-900/10", "font-medium", "text-brand-900");
      this.dispatchEvent(new CustomEvent("ui-tree-select", { bubbles: true, composed: true, detail: { label: this._label } }));
    }
    deselect() {
      this._header.classList.remove("bg-brand-900/10", "font-medium", "text-brand-900");
      this._header.classList.add("text-base-700", "hover:bg-base-100");
    }
  };
  window.__uiwc.register("tree-item", UiTreeItem);

  // components/video/video.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiVideo = class extends i4 {
    static properties = {
      src: { type: String },
      poster: { type: String },
      autoplay: { type: Boolean, reflect: true },
      loop: { type: Boolean, reflect: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this.src = "";
      this.poster = "";
      this.autoplay = false;
      this.loop = false;
    }
    get videoElement() {
      return this.querySelector("video");
    }
    render() {
      return b2`
      <video
        class="${window.__uiwc.prefix}-video block w-full rounded bg-black"
        src=${this.src}
        poster=${this.poster || void 0}
        controls
        ?autoplay=${this.autoplay}
        ?loop=${this.loop}
        playsinline
      ></video>
    `;
    }
  };
  window.__uiwc.register("video", UiVideo);

  // components/video-playlist/video-playlist.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiVideoPlaylist = class extends i4 {
    static properties = {
      _activeIndex: { state: true }
    };
    createRenderRoot() {
      return this;
    }
    constructor() {
      super();
      this._items = [];
      this._activeIndex = 0;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this._items.length === 0) {
        this._items = [...this.querySelectorAll(`${window.__uiwc.prefix}-video-playlist-item`)].map((el) => ({
          src: el.getAttribute("src") || "",
          poster: el.getAttribute("poster") || "",
          label: el.getAttribute("title") || el.getAttribute("src") || ""
        }));
      }
    }
    render() {
      if (!this._items.length) return b2``;
      const active = this._items[this._activeIndex];
      return b2`
      <div class="${window.__uiwc.prefix}-video-playlist flex flex-col gap-3">
        <video class="block w-full rounded bg-black" src=${active.src} poster=${active.poster || void 0} controls playsinline></video>
        <div class="flex gap-2 overflow-x-auto pb-1">
          ${this._items.map(
        (item, i7) => b2`
              <button
                type="button"
                class="shrink-0 overflow-hidden rounded border-2 ${i7 === this._activeIndex ? "border-base-900" : "border-transparent"}"
                @click=${() => this._activeIndex = i7}
              >
                <img src=${item.poster} alt=${item.label} style="width:6rem;height:3.5rem;object-fit:cover;display:block" />
              </button>
            `
      )}
        </div>
      </div>
    `;
    }
  };
  window.__uiwc.register("video-playlist", UiVideoPlaylist);

  // components/video-playlist-item/video-playlist-item.js
  window.__uiwc = window.__uiwc || { prefix: "ui" };
  var UiVideoPlaylistItem = class extends HTMLElement {
    connectedCallback() {
      this.hidden = true;
    }
    get src() {
      return this.getAttribute("src") || "";
    }
    get poster() {
      return this.getAttribute("poster") || "";
    }
    get label() {
      return this.getAttribute("title") || this.src;
    }
  };
  window.__uiwc.register("video-playlist-item", UiVideoPlaylistItem);
})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
lit-html/directives/unsafe-html.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/static.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
