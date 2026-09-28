window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-tree-item label="Carpeta"><ui-tree-item label="Archivo"></ui-tree-item></ui-tree-item>`
 * — recursive tree node. Plain custom element (no Lit template): it builds its header
 * row imperatively and leaves any nested `<ui-tree-item>` children exactly where they
 * are, so each nested node keeps its own open/selected state independently.
 * Emits `ui-tree-select` with `{ label }` (bubbles, so `<ui-tree>` can track selection).
 */
export class UiTreeItem extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const label = this.getAttribute('label') || '';
    const hasChildren = this.querySelector(`${window.__uiwc.prefix}-tree-item`) !== null;

    this.classList.add(`${window.__uiwc.prefix}-tree-item`, 'block');

    const header = document.createElement('div');
    header.setAttribute('role', 'treeitem');
    header.tabIndex = 0;
    header.className =
      'flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm text-base-700 hover:bg-base-100';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className =
      `h-4 w-4 shrink-0 border-0 bg-transparent p-0 text-base-400 transition-transform -rotate-90 ` +
      (hasChildren ? 'cursor-pointer' : 'cursor-default');
    toggle.innerHTML = hasChildren
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
      : '';
    toggle.setAttribute('aria-label', 'Expandir');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasChildren) this.#setOpen(!this._open);
    });

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    header.append(toggle, labelEl);
    header.addEventListener('click', () => this.#select());

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'ml-4 hidden border-l border-base-100 pl-2';
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
    this._childrenWrap.classList.toggle('hidden', !open);
    this._toggle.classList.toggle('-rotate-90', !open);
    this._header.setAttribute('aria-expanded', String(open));
  }

  #select() {
    this._header.classList.remove('text-base-700', 'hover:bg-base-100');
    this._header.classList.add('bg-brand-900/10', 'font-medium', 'text-brand-900');
    this.dispatchEvent(new CustomEvent('ui-tree-select', { bubbles: true, composed: true, detail: { label: this._label } }));
  }

  deselect() {
    this._header.classList.remove('bg-brand-900/10', 'font-medium', 'text-brand-900');
    this._header.classList.add('text-base-700', 'hover:bg-base-100');
  }
}

window.__uiwc.register('tree-item', UiTreeItem);
