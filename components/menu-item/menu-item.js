window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-menu-item href="/docs" label="Docs">` — a link in a `<ui-navbar>` or standalone
 * menu. Nest more `<ui-menu-item>` inside for a dropdown submenu (opens on click,
 * closes on outside click / `Escape`) — nesting further builds a mega-menu. Plain
 * custom element so nested items stay live.
 */
export class UiMenuItem extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const label = this.getAttribute('label') || '';
    const href = this.getAttribute('href');
    const submenuItems = [...this.children].filter((el) => el.tagName === `${window.__uiwc.prefix}-menu-item`.toUpperCase());
    const hasSubmenu = submenuItems.length > 0;

    this.classList.add('relative', 'inline-block');

    const trigger = document.createElement(href && !hasSubmenu ? 'a' : 'button');
    if (href && !hasSubmenu) trigger.href = href;
    if (trigger.tagName === 'BUTTON') trigger.type = 'button';
    trigger.textContent = label;
    trigger.className = 'inline-flex items-center gap-1 border-0 bg-transparent px-1 py-2 font-inherit text-sm font-medium text-base-700 no-underline cursor-pointer';

    if (hasSubmenu) {
      const chevron = document.createElement('span');
      chevron.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      trigger.appendChild(chevron);

      const submenu = document.createElement('div');
      submenu.setAttribute('role', 'menu');
      submenu.className =
        'absolute top-full left-0 z-20 hidden min-w-[12rem] flex-col gap-0.5 rounded-lg border border-base-200 bg-surface p-2 shadow-xl';
      submenuItems.forEach((item) => submenu.appendChild(item));
      this.appendChild(submenu);
      this._submenu = submenu;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.#toggle();
      });
      this._onDocClick = () => this.#close();
      this._onKeydown = (e) => {
        if (e.key === 'Escape') this.#close();
      };
    }

    this.prepend(trigger);
  }

  #toggle() {
    this._open ? this.#close() : this.#open();
  }

  #open() {
    this._open = true;
    this._submenu.style.display = 'flex';
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeydown);
  }

  #close() {
    this._open = false;
    if (this._submenu) this._submenu.style.display = 'none';
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }
}

window.__uiwc.register('menu-item', UiMenuItem);
