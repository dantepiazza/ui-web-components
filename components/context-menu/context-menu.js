window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-context-menu>` wrapping a target area plus a `<template data-menu-items>` with
 * `<button data-value="...">`/`<a data-value="...">` items — right-click the target to
 * open the menu at the cursor. Emits `ui-context-menu-select` with `{ value, label }`.
 */
export class UiContextMenu extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const template = this.querySelector('template[data-menu-items]');
    this._itemsTemplate = template ? template.content : document.createDocumentFragment();
    template?.remove();

    this.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.#open(e.clientX, e.clientY);
    });

    this._onDocClick = () => this.#close();
    this._onKeydown = (e) => {
      if (e.key === 'Escape') this.#close();
    };
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }

  #open(x, y) {
    this.#close();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.className =
      `${window.__uiwc.prefix}-context-menu fixed z-50 min-w-40 rounded-lg border border-base-200 ` +
      `bg-surface py-1 shadow-lg shadow-base-950/15`;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.appendChild(this._itemsTemplate.cloneNode(true));
    menu.querySelectorAll('a, button').forEach((el) => {
      el.className =
        `block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-sm ` +
        `text-base-700 no-underline hover:bg-base-100 ${el.className}`.trim();
    });
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-value], a, button');
      if (!item) return;
      this.dispatchEvent(
        new CustomEvent('ui-context-menu-select', {
          bubbles: true,
          composed: true,
          detail: { value: item.dataset.value ?? item.textContent.trim(), label: item.textContent.trim() },
        })
      );
      this.#close();
    });

    document.body.appendChild(menu);
    this._menu = menu;
    setTimeout(() => {
      document.addEventListener('click', this._onDocClick);
      document.addEventListener('keydown', this._onKeydown);
    });
  }

  #close() {
    this._menu?.remove();
    this._menu = null;
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }
}

window.__uiwc.register('context-menu', UiContextMenu);
