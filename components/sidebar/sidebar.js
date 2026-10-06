window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-sidebar>` — vertical app-navigation sidebar: an optional `<ui-sidebar-header>`
 * (logo, workspace switcher, whatever) and `<ui-sidebar-footer>` — either or both
 * omittable — around a navigation tree.
 *
 * Children follow the same convention as `<ui-menu>` — `<a>` links (`class="active"`
 * for the current one), `<hr>` dividers, `<ui-sidebar-section>` group headers — with
 * one addition: wrap a set of links in `<ui-sidebar-group label="...">` for an
 * expand/collapse submenu. Nest more `<ui-sidebar-group>` inside for deeper levels
 * (tested up to 3).
 *
 * This supersedes the sidebar use case of `<ui-menu>` (which stays around for flat
 * lists elsewhere, e.g. inside a `<ui-popover>`) — Menu plus a header slot plus
 * nesting, matching an app's real sidebar. Page-level positioning (fixed, width,
 * offset for a rail alongside it) is left to the consumer — this component only owns
 * its own layout, not the shell around it. Recommended layout: a plain
 * `<div class="flex h-screen">` wrapping `<ui-sidebar>` and `<ui-main>` side by side —
 * flexbox does the offsetting, no magic CSS variables needed.
 *
 * Below `md:`, the sidebar goes off-canvas (hidden by default) and slides in as an
 * overlay with a backdrop — toggle it with the `open` attribute, `.show()`/`.hide()`/
 * `.toggle()`, or the global `window.__uiwc.sidebarToggle()` (what `<ui-topbar>`'s
 * mobile hamburger button calls). At `md:` and up it's always visible, `open` is
 * ignored.
 *
 * Also below `md:`: a touch drag from the left screen edge pulls it open, and a drag
 * left (on the panel or the backdrop) pushes it closed — the panel follows the finger
 * and snaps to the nearest state on release.
 *
 * No wrapper `<div>`: this element IS the sidebar box, styled directly. One
 * consequence worth knowing — the mobile backdrop can't live inside it as a normal
 * child: the slide animation uses a CSS `transform`, and a `position:fixed`
 * descendant of a transformed element resolves against THAT element's box instead of
 * the viewport, breaking a full-screen overlay. So the backdrop is appended straight
 * to `<body>` while open, and removed on close — same thing the old `<ui-drawer>`
 * did before it merged into `<ui-dialog>`.
 */
export class UiSidebar extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'remove-class'];
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const prefix = window.__uiwc.prefix;
    const headerEl = this.querySelector(`:scope > ${prefix}-sidebar-header`);
    const footerEl = this.querySelector(`:scope > ${prefix}-sidebar-footer`);

    const nav = document.createElement('nav');
    nav.className = `flex-1 flex flex-col gap-1 overflow-y-auto p-4
      [&>${prefix}-sidebar-section:first-child]:!pt-0
      [&>a]:flex [&>a]:items-center [&>a]:gap-2.5 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-1 [&>a]:text-sm [&>a]:text-sidebar-fg/70 [&>a]:no-underline [&>a:hover]:bg-sidebar-fg/10 [&>a:hover]:text-sidebar-fg
      [&>a.active]:bg-sidebar-fg/10 [&>a.active]:font-medium [&>a.active]:text-sidebar-fg
      [&>hr]:my-2 [&>hr]:border-sidebar-fg/20`;

    // Move everything that isn't the header/footer into nav (real nodes, not a
    // captured-and-reparsed string — any state they hold survives).
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
    if (name === 'open') this.#syncOpen();
    if (name === 'remove-class') this.#applyClasses();
  }

  #applyClasses() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-sidebar`,
      'fixed', 'inset-y-0', 'left-0', 'z-40', 'flex', 'h-full', 'w-72', 'flex-col',
      'bg-sidebar', 'text-sidebar-fg', 'transition-transform',
      'md:static', 'md:z-auto', 'md:translate-x-0',
    ]);
  }

  show() {
    this.setAttribute('open', '');
  }

  hide() {
    this.removeAttribute('open');
  }

  toggle() {
    this.hasAttribute('open') ? this.hide() : this.show();
  }

  #syncOpen() {
    const open = this.hasAttribute('open');
    this.classList.toggle('translate-x-0', open);
    this.classList.toggle('-translate-x-full', !open);
    if (open) this.#ensureScrim();
    else this.#removeScrim();
  }

  #ensureScrim() {
    if (this._scrim) return this._scrim;
    const scrim = document.createElement('div');
    scrim.className = 'fixed inset-0 z-30 bg-zinc-900/40 transition-opacity md:hidden';
    scrim.addEventListener('click', () => this.hide());
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
    const desktop = window.matchMedia('(min-width: 768px)');
    const EDGE = 24; // px from the left edge that arms an opening drag
    let startX = 0;
    let startY = 0;
    let active = false;
    let claimed = false;
    let opening = false;

    const onStart = (e) => {
      if (desktop.matches || this._built !== true) return;
      const t = e.touches[0];
      const isOpen = this.hasAttribute('open');
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
        if (Math.abs(dy) > Math.abs(dx)) { active = false; return; } // vertical scroll
        if (Math.abs(dx) < 8) return;
        claimed = true;
        this.style.transition = 'none';
        this.#ensureScrim();
      }

      e.preventDefault();
      const width = this.offsetWidth || 288;
      const tx = opening
        ? Math.min(0, -width + Math.max(0, dx))
        : Math.max(-width, Math.min(0, dx));
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

      // Re-enable the CSS transition and set the destination explicitly so it
      // animates from the dragged position. Then drop the inline styles once the
      // slide finishes (with a timeout fallback — `transitionend` won't fire if the
      // tab is hidden) so class-based state (e.g. `md:` desktop) takes over cleanly.
      this.style.transition = '';
      this.style.transform = willOpen ? 'translateX(0)' : 'translateX(-100%)';
      if (this._scrim) this._scrim.style.opacity = '';

      const cleanup = () => {
        this.style.transform = '';
        this.style.transition = '';
        this.removeEventListener('transitionend', cleanup);
        clearTimeout(timer);
      };
      const timer = setTimeout(cleanup, 300);
      this.addEventListener('transitionend', cleanup);

      willOpen ? this.show() : this.hide();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    this._gestureCleanup = () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }
}

window.__uiwc.register('sidebar', UiSidebar);

// Global shortcut, same window.__uiwc namespace as UiDialog.confirm()/.prompt() —
// looks up the page's <ui-sidebar> so a <ui-topbar>'s mobile menu button (or any of
// your own markup) can toggle it without holding a reference to the element.
window.__uiwc.sidebarToggle = () => {
  document.querySelector(`${window.__uiwc.prefix}-sidebar`)?.toggle();
};

// Declarative hook: any element, anywhere, with this attribute toggles the sidebar
// on click — no JS needed on your end. `${prefix}-sidebar-toggle` is `ui-sidebar-toggle`
// by default (same as the tag/class prefix everywhere else in the library).
//   <button ui-sidebar-toggle>☰</button>
document.addEventListener('click', (e) => {
  if (e.target.closest(`[${window.__uiwc.prefix}-sidebar-toggle]`)) {
    window.__uiwc.sidebarToggle();
  }
});
