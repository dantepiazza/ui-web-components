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
  // components/file-manager/markdown.js
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var safeUrl = (u) => /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(https?|mailto):/i.test(u) ? "#" : u;
  function inline(src) {
    const codes = [];
    let s = src.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return `\0${codes.length - 1}\0`;
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, u) => `<img src="${safeUrl(u)}" alt="${alt}">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
    s = s.replace(/\*(?!\s)(.+?)(?<!\s)\*|(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])/g, (_, a, b) => `<em>${a ?? b}</em>`);
    s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
    s = s.replace(/ {2,}$/, "<br>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  }
  var LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*([-*_])(\s*\2){2,}\s*$)/.test(l) || LIST.test(l);
  function renderList(lines) {
    const items = lines.map((l) => {
      const m = LIST.exec(l);
      return { indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), text: m[3] };
    });
    let i = 0;
    const build = (indent) => {
      const ordered = items[i].ordered;
      let out = ordered ? "<ol>" : "<ul>";
      while (i < items.length && items[i].indent >= indent) {
        if (items[i].indent > indent) {
          out += build(items[i].indent);
          continue;
        }
        const task = /^\[([ xX])\]\s+(.*)$/.exec(items[i].text);
        const body = task ? `<input type="checkbox" disabled ${task[1] !== " " ? "checked" : ""} class="mr-1.5">${inline(task[2])}` : inline(items[i].text);
        i++;
        let nested = "";
        if (i < items.length && items[i].indent > indent) nested = build(items[i].indent);
        out += `<li${task ? ' class="list-none -ml-6"' : ""}>${body}${nested}</li>`;
      }
      return out + (ordered ? "</ol>" : "</ul>");
    };
    return build(items[0].indent);
  }
  var cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  function renderMarkdown(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const fence = /^```\s*(\S*)/.exec(line);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }
      if (line.startsWith(">")) {
        const buf = [];
        while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
        continue;
      }
      if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` + rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table>"
        );
        continue;
      }
      if (LIST.test(line)) {
        const buf = [];
        while (i < lines.length && lines[i].trim() && LIST.test(lines[i])) buf.push(lines[i++]);
        out.push(renderList(buf));
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && (!para.length || !isBlockStart(lines[i]))) para.push(lines[i++]);
      out.push(`<p>${para.map((l) => inline(l.replace(/\s+$/, (m) => m.length >= 2 ? "  " : ""))).join(" ")}</p>`);
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
      if (name === "view") this.#items().forEach((i) => i.setAttribute("data-view", this.#view));
      this.#apply();
    }
    // ---------- public API ----------
    getSelection() {
      return this.#items().filter((i) => i.hasAttribute("selected")).map(this.#idOf);
    }
    select(ids) {
      const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
      this.#setSelection(this.#items().filter((i) => set.has(this.#idOf(i))));
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
      return Object.keys(KINDS).find((k) => KINDS[k].includes(ext)) || null;
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
      items.forEach((i) => {
        if (i.getAttribute("data-view") !== this.#view) i.setAttribute("data-view", this.#view);
      });
      const selected = items.filter((i) => i.hasAttribute("selected")).length;
      const path = this.getAttribute("path") || "";
      const crumbs = path.split("/").filter(Boolean);
      crumbs.forEach((_, i) => this.#open.add(crumbs.slice(0, i + 1).join("/")));
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
        const tkey = [path, this.getAttribute("root-label") || "", [...this.#open].sort().join("|"), nodes.map((n) => `${n.path}:${n.name}:${n.lazy}`).join("|")].join("");
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
      if (items.length && !items.some((i) => i.tabIndex === 0)) {
        (items.find((i) => i.hasAttribute("selected")) || items[0]).tabIndex = 0;
      }
    }
    #el(tag, cls, text) {
      const n = document.createElement(tag);
      n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    #icon(name, size = "sm", cls = "") {
      const i = document.createElement("uiwc-icon");
      i.setAttribute("name", name);
      i.setAttribute("size", size);
      if (cls) i.className = cls;
      return i;
    }
    #buildHeader(grid, tree, crumbs, selected) {
      const margin = grid ? `-mx-2 -mt-2 mb-0 ${tree ? "md:-ml-[calc(14rem+0.5rem)]" : ""}` : tree ? "md:-ml-56" : "";
      const header = this.#el("div", `col-span-full flex h-11 items-center gap-2 border-b border-base-200 px-3 text-sm ${margin}`);
      header.setAttribute("data-uiwc-header", "");
      const nav = this.#el("nav", "flex min-w-0 flex-1 items-center gap-1 overflow-hidden");
      nav.setAttribute("aria-label", "Ruta");
      const parts = [{ label: this.getAttribute("root-label") || "Inicio", path: "" }];
      crumbs.forEach((c, i) => parts.push({ label: c, path: crumbs.slice(0, i + 1).join("/") }));
      parts.forEach((p, i) => {
        const last = i === parts.length - 1;
        if (i) nav.appendChild(this.#icon("chevron-right", "sm", "shrink-0 text-base-300"));
        if (last) nav.appendChild(this.#el("span", "truncate font-medium text-base-900", p.label));
        else {
          const b = this.#el("button", "truncate rounded px-1 text-base-500 hover:bg-base-100 hover:text-base-900", p.label);
          b.type = "button";
          b.setAttribute("data-path", p.path);
          nav.appendChild(b);
        }
      });
      header.appendChild(nav);
      if (selected) header.appendChild(this.#el("span", "shrink-0 text-xs text-base-500", `${selected} seleccionado${selected === 1 ? "" : "s"}`));
      const toggle = this.#el("div", "flex shrink-0 rounded border border-base-200 p-0.5");
      for (const v of ["list", "grid"]) {
        const b = this.#el("button", `rounded p-1 ${this.#view === v ? "bg-base-100 text-base-900" : "text-base-500 hover:text-base-900"}`);
        b.type = "button";
        b.setAttribute("data-view-btn", v);
        b.setAttribute("aria-pressed", String(this.#view === v));
        b.setAttribute("aria-label", v === "list" ? "Vista de lista" : "Vista de cuadr\xEDcula");
        b.appendChild(this.#icon(v));
        toggle.appendChild(b);
      }
      header.appendChild(toggle);
      return header;
    }
    // ---------- folder tree ----------
    #treeNodes() {
      const map = /* @__PURE__ */ new Map();
      this.#folders().forEach((f, order) => {
        const path = (f.getAttribute("path") || "").split("/").filter(Boolean).join("/");
        if (!path) return;
        const parts = path.split("/");
        parts.forEach((seg, i) => {
          const p = parts.slice(0, i + 1).join("/");
          if (!map.has(p)) map.set(p, { path: p, name: seg, lazy: false, order: order + i / 100 });
        });
        const n = map.get(path);
        n.name = f.getAttribute("name") || n.name;
        n.lazy = f.hasAttribute("has-children");
        n.order = order;
      });
      return [...map.values()];
    }
    #buildTree(nodes, current) {
      const bar = this.#el("nav", "absolute bottom-0 left-0 top-11 w-56 overflow-y-auto border-r border-base-200 bg-base-50 p-2 max-md:hidden");
      bar.setAttribute("data-uiwc-tree", "");
      bar.setAttribute("role", "tree");
      bar.setAttribute("aria-label", "Carpetas");
      const childrenOf = (parent) => nodes.filter((n) => (n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "") === parent).sort((a, b) => a.order - b.order);
      const row = (label, path, depth, hasKids, lazy) => {
        const active = path === current;
        const open = this.#open.has(path);
        const r = this.#el("div", `flex items-center gap-1 rounded text-sm ${active ? "bg-brand-900/10 font-medium text-brand-900" : "text-base-700 hover:bg-base-100"}`);
        r.style.paddingLeft = `${depth * 12 + 4}px`;
        r.setAttribute("role", "treeitem");
        r.setAttribute("aria-level", String(depth + 1));
        if (hasKids || lazy) r.setAttribute("aria-expanded", String(open));
        if (active) r.setAttribute("aria-current", "page");
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
        r.append(tog, go);
        return r;
      };
      const walk = (parent, depth) => {
        for (const n of childrenOf(parent)) {
          const kids = childrenOf(n.path);
          bar.appendChild(row(n.name, n.path, depth, kids.length > 0, n.lazy));
          if (kids.length && this.#open.has(n.path)) walk(n.path, depth + 1);
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
      this.#items().forEach((i) => i.toggleAttribute("selected", set.has(i)));
      this.#apply();
    }
    #focus(item) {
      this.#items().forEach((i) => i.tabIndex = i === item ? 0 : -1);
      item.focus();
    }
    #onFocusIn = (e) => {
      const item = e.target.closest?.(ITEM);
      if (item && this.contains(item)) this.#items().forEach((i) => i.tabIndex = i === item ? 0 : -1);
    };
    #pick(item, { toggle = false, range = false } = {}) {
      const items = this.#items();
      const multiple = !this.hasAttribute("single");
      if (range && multiple && this.#anchor && items.includes(this.#anchor)) {
        const [a, b] = [items.indexOf(this.#anchor), items.indexOf(item)].sort((x, y) => x - y);
        this.#setSelection(items.slice(a, b + 1));
      } else if (toggle && multiple) {
        const cur = new Set(items.filter((i) => i.hasAttribute("selected")));
        cur.has(item) ? cur.delete(item) : cur.add(item);
        this.#setSelection(items.filter((i) => cur.has(i)));
        this.#anchor = item;
      } else {
        this.#setSelection([item]);
        this.#anchor = item;
      }
    }
    // ---------- pointer / mouse ----------
    #onClick = (e) => {
      const view = e.target.closest("[data-view-btn]");
      if (view && this.contains(view)) {
        this.setAttribute("view", view.getAttribute("data-view-btn"));
        this.#emit("ui-fm-view", { view: this.#view });
        return;
      }
      const toggle = e.target.closest("[data-toggle]");
      if (toggle && this.contains(toggle)) {
        const p = toggle.getAttribute("data-toggle");
        if (this.#open.has(p)) this.#open.delete(p);
        else {
          this.#open.add(p);
          if (toggle.getAttribute("data-lazy") === "true") this.#emit("ui-fm-expand", { path: p });
        }
        this.#apply();
        return;
      }
      const crumb = e.target.closest("[data-path]");
      if (crumb && this.contains(crumb)) {
        this.#emit("ui-fm-navigate", { path: crumb.getAttribute("data-path") });
        return;
      }
      const item = e.target.closest(ITEM);
      if (!item || !this.contains(item)) {
        if (!e.target.closest("[data-uiwc-header],[data-uiwc-tree]")) this.clearSelection();
        return;
      }
      if (this._touchHandled) return;
      this.#pick(item, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
      this.#focus(item);
    };
    #onDblClick = (e) => {
      const item = e.target.closest(ITEM);
      if (item && this.contains(item)) this.#openItem(item);
    };
    #openItem(item) {
      const detail = { itemId: this.#idOf(item), type: item.getAttribute("type") || "file", name: item.getAttribute("name") || "", item };
      if (!this.#emit("ui-fm-open", detail, true)) return;
      if (!this.hasAttribute("no-preview") && this.#kindOf(item)) this.#preview(item);
    }
    // ---------- context menu ----------
    #onContextMenu = (e) => {
      const item = e.target.closest(ITEM);
      if (!item || !this.contains(item)) return;
      e.preventDefault();
      if (!item.hasAttribute("selected")) this.#pick(item);
      let { clientX: x, clientY: y } = e;
      if (!x && !y) {
        const r = item.getBoundingClientRect();
        x = r.left + 24;
        y = r.top + r.height / 2;
      }
      const ids = this.getSelection();
      if (!this.#emit("ui-fm-contextmenu", { itemId: this.#idOf(item), ids, x, y }, true)) return;
      this.#showMenu(item, x, y);
    };
    #showMenu(item, x, y) {
      this.#closeMenu();
      const sel = this.#items().filter((i) => i.hasAttribute("selected"));
      const multiple = sel.length > 1;
      const kind = multiple ? "multiple" : item.getAttribute("type") === "folder" ? "folder" : "file";
      const entries = [];
      const previewable = !multiple && !this.hasAttribute("no-preview") && this.#kindOf(item);
      entries.push({ value: "__open", label: previewable ? "Vista previa" : "Abrir", icon: previewable ? "image" : "folder", show: !multiple });
      const downloadable = sel.length > 0 && sel.every((i) => i.getAttribute("type") !== "folder" && i.getAttribute("href"));
      entries.push({ value: "__download", label: multiple ? "Descargar selecci\xF3n" : "Descargar", icon: "download", show: downloadable });
      const custom = [...this.children].filter((el) => el.matches(ACTION)).filter((a) => {
        const f = (a.getAttribute("for") || "").split(/\s+/).filter(Boolean);
        return !f.length || f.includes(kind);
      });
      const shown = entries.filter((e) => e.show);
      if (!shown.length && !custom.length) return;
      const menu = this.#el("div", "fixed z-[100] min-w-48 rounded-lg border border-base-200 bg-surface py-1 text-sm shadow-lg");
      menu.setAttribute("role", "menu");
      menu.setAttribute("data-uiwc-fm-menu", "");
      const add = (value, label, icon, danger) => {
        const b = this.#el("button", `flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-base-100 focus:bg-base-100 focus:outline-none ${danger ? "text-danger" : "text-base-700"}`);
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.setAttribute("data-value", value);
        if (icon) b.appendChild(this.#icon(icon, "sm", "shrink-0"));
        b.appendChild(this.#el("span", "", label));
        menu.appendChild(b);
      };
      shown.forEach((e) => add(e.value, e.label, e.icon, false));
      if (shown.length && custom.length) menu.appendChild(this.#el("div", "my-1 border-t border-base-200"));
      custom.forEach((a) => add(a.getAttribute("value") || "", a.getAttribute("label") || "", a.getAttribute("icon") || "", a.hasAttribute("danger")));
      menu.addEventListener("click", (e) => {
        const b = e.target.closest("[data-value]");
        if (!b) return;
        const value = b.getAttribute("data-value");
        this.#closeMenu();
        if (value === "__open") this.#openItem(item);
        else if (value === "__download") this.#download(sel);
        else this.#emit("ui-fm-action", { value, ids: sel.map(this.#idOf), itemId: this.#idOf(item) });
      });
      menu.addEventListener("keydown", (e) => {
        const btns = [...menu.querySelectorAll("button")];
        const i = btns.indexOf(document.activeElement);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          btns[(i + 1) % btns.length].focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          btns[(i - 1 + btns.length) % btns.length].focus();
        } else if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          this.#closeMenu();
          item.focus();
        }
      });
      document.body.appendChild(menu);
      const r = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
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
      const files = items.filter((i) => i.getAttribute("href"));
      if (!files.length) return;
      if (!this.#emit("ui-fm-download", { ids: files.map(this.#idOf), items: files }, true)) return;
      files.forEach(
        (f, n) => setTimeout(() => {
          const a = document.createElement("a");
          a.href = f.getAttribute("href");
          a.download = f.getAttribute("name") || "";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, n * 200)
      );
    }
    // ---------- preview ----------
    #dropDialog() {
      const d = this.#dialog;
      this.#dialog = null;
      if (!d) return;
      if (d.open) d.close();
      d.remove();
    }
    #preview(item) {
      const list = this.#items().filter((i) => this.#kindOf(i));
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
        const b = this.#el("button", `flex h-8 w-8 shrink-0 items-center justify-center rounded text-base-500 hover:bg-base-100 hover:text-base-900 ${extra}`);
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.appendChild(this.#icon(icon));
        return b;
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
          const f = this.#el("iframe", "h-full w-full border-0");
          f.src = href;
          f.title = name;
          body.appendChild(f);
        } else if (kind === "video") {
          const v = this.#el("video", "max-h-full max-w-full");
          v.src = href;
          v.controls = true;
          v.autoplay = true;
          centered(v);
        } else if (kind === "audio") {
          const a = this.#el("audio", "w-full max-w-md");
          a.src = href;
          a.controls = true;
          centered(a);
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
      const step = (d) => {
        index = (index + d + list.length) % list.length;
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
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dismiss();
      });
      dialog.addEventListener("cancel", () => setTimeout(finish, 0));
      dialog.addEventListener("close", finish);
      dialog.addEventListener("keydown", (e) => {
        if (list.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.target.closest("video,audio")) {
          e.preventDefault();
          step(e.key === "ArrowLeft" ? -1 : 1);
        }
      });
      document.body.appendChild(dialog);
      this.#dialog = dialog;
      dialog.showModal();
      show();
    }
    // ---------- touch ----------
    #onPointerDown = (e) => {
      if (e.pointerType !== "touch") return;
      const item = e.target.closest(ITEM);
      if (!item || !this.contains(item)) return;
      this.#press = {
        item,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        long: false,
        timer: setTimeout(() => {
          this.#press.long = true;
          this.#pick(item, { toggle: true });
        }, LONG_PRESS_MS)
      };
    };
    #onPointerEnd = (e) => {
      const p = this.#press;
      if (!p || e.pointerId !== p.id) return;
      clearTimeout(p.timer);
      this.#press = null;
      if (e.type !== "pointerup") return;
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10;
      this._touchHandled = true;
      setTimeout(() => this._touchHandled = false, 400);
      if (moved || p.long) return;
      if (this.getSelection().length) this.#pick(p.item, { toggle: true });
      else this.#openItem(p.item);
    };
    // ---------- keyboard ----------
    #columns(items) {
      if (this.#view !== "grid" || !items.length) return 1;
      const top = items[0].offsetTop;
      return Math.max(1, items.filter((i) => i.offsetTop === top).length);
    }
    #onKeyDown = (e) => {
      const item = e.target.closest?.(ITEM);
      if (!item || !this.contains(item) || e.target !== item) return;
      if (e.key === "ContextMenu" || e.key === "F10" && e.shiftKey) {
        e.preventDefault();
        const r = item.getBoundingClientRect();
        return void item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 24, clientY: r.top + r.height / 2 }));
      }
      const items = this.#items();
      const i = items.indexOf(item);
      const cols = this.#columns(items);
      const grid = this.#view === "grid";
      let to = null;
      switch (e.key) {
        case "ArrowDown":
          to = i + cols;
          break;
        case "ArrowUp":
          to = i - cols;
          break;
        case "ArrowRight":
          if (grid) to = i + 1;
          break;
        case "ArrowLeft":
          if (grid) to = i - 1;
          break;
        case "Home":
          to = 0;
          break;
        case "End":
          to = items.length - 1;
          break;
        case "Enter":
          e.preventDefault();
          return this.#openItem(item);
        case " ":
          e.preventDefault();
          return this.#pick(item, { toggle: true });
        case "Escape":
          return this.clearSelection();
        case "Delete": {
          const ids = this.getSelection();
          return void this.#emit("ui-fm-delete-request", { ids: ids.length ? ids : [this.#idOf(item)] });
        }
        case "F2":
          e.preventDefault();
          return void this.#emit("ui-fm-rename-request", { itemId: this.#idOf(item) });
        case "a":
        case "A":
          if (!(e.ctrlKey || e.metaKey) || this.hasAttribute("single")) return;
          e.preventDefault();
          return this.#setSelection(items);
        default:
          return;
      }
      if (to == null || to < 0 || to >= items.length) {
        if (to != null) e.preventDefault();
        return;
      }
      e.preventDefault();
      const target = items[to];
      if (e.shiftKey) {
        if (!this.#anchor || !items.includes(this.#anchor)) this.#anchor = item;
        this.#pick(target, { range: true });
      } else {
        this.#anchor = target;
      }
      this.#focus(target);
    };
  };
  window.__uiwc.register("file-manager", UiFileManager);
})();
