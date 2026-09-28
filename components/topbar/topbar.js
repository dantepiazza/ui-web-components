window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-topbar heading="Postulantes" subheading="36 vacantes activas">` — the app's
 * fixed page header: a mobile hamburger (toggles `<ui-sidebar>` via
 * `window.__uiwc.sidebarToggle()`), a title/subtitle, and a slot for actions on the
 * right. This is the difference from `<ui-toolbar>`: Toolbar is a plain flex row you
 * can drop anywhere inside your content (e.g. above a table); Topbar is specifically
 * the top strip of the whole interface, sticky, one per page.
 *
 * Set `sidebar-toggle-display="none"` if you don't have a `<ui-sidebar>` on the page
 * (or you're wiring your own toggle button elsewhere, e.g. with `ui-sidebar-toggle`)
 * — hides the hamburger entirely instead of leaving a button that does nothing.
 *
 * No wrapper `<div>`: this element styles and lays itself out directly. The action
 * elements you put inside are real DOM nodes moved (not captured-as-string and
 * reinjected) into their own group — so any component state they hold survives
 * untouched.
 */
export class UiTopbar extends HTMLElement {
  static get observedAttributes() {
    return ['heading', 'subheading', 'sidebar-toggle-display', 'remove-class'];
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.#applyClasses();

    const left = document.createElement('div');
    left.className = 'flex min-w-0 items-center gap-3';

    const hamburger = document.createElement('button');
    hamburger.type = 'button';
    hamburger.className =
      '-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded text-base-500 hover:bg-base-100 md:hidden';
    hamburger.setAttribute('aria-label', 'Abrir menú');
    hamburger.innerHTML = `<uiwc-icon name="menu" size="md"></uiwc-icon>`;
    hamburger.addEventListener('click', () => window.__uiwc.sidebarToggle?.());

    const textWrap = document.createElement('div');
    textWrap.className = 'min-w-0';
    this._headingEl = document.createElement('h1');
    this._headingEl.className = 'truncate text-lg font-bold tracking-tight text-base-900';
    this._subheadingEl = document.createElement('div');
    this._subheadingEl.className = 'mt-0.5 truncate text-xs font-medium text-base-400';
    textWrap.append(this._headingEl, this._subheadingEl);

    this._hamburgerEl = hamburger;
    left.append(hamburger, textWrap);

    const actions = document.createElement('div');
    actions.className = 'flex shrink-0 items-center gap-2.5';
    [...this.children].forEach((child) => actions.appendChild(child));

    this.append(left, actions);
    this.#sync();
  }

  attributeChangedCallback(name) {
    if (!this._built) return;
    if (name === 'remove-class') this.#applyClasses();
    else this.#sync();
  }

  #applyClasses() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-topbar`,
      'sticky', 'top-0', 'z-20', 'flex', 'h-16', 'shrink-0', 'items-center', 'justify-between',
      'border-b', 'border-base-200', 'bg-surface', 'px-4', 'md:px-7',
    ]);
  }

  #sync() {
    const heading = this.getAttribute('heading') || '';
    const subheading = this.getAttribute('subheading') || '';
    this._headingEl.textContent = heading;
    this._headingEl.hidden = !heading;
    this._subheadingEl.textContent = subheading;
    this._subheadingEl.hidden = !subheading;
    // Not just `.hidden = true`: the button also carries an explicit `flex` class,
    // which has the same specificity as the native `[hidden]` UA rule and wins on
    // source order in the compiled Tailwind sheet. Inline `display` always wins.
    const hideToggle = this.getAttribute('sidebar-toggle-display') === 'none';
    this._hamburgerEl.style.display = hideToggle ? 'none' : '';
  }
}

window.__uiwc.register('topbar', UiTopbar);
