window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-speeddial>` wrapping `<ui-speeddial-item icon="..." label="...">` children — a
 * floating "+" button that reveals a column of action buttons above it. Fixed to the
 * viewport's bottom-right corner by default; add the `inline` attribute to render as
 * a static block instead (e.g. inside a docs demo). Emits `ui-speeddial-select` with
 * `{ index }` when an item is clicked (and closes). Migrated from panel-assets'
 * `.speeddial` (candidate from the comparison pass).
 */
export class UiSpeeddial extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const items = [...this.querySelectorAll(`${window.__uiwc.prefix}-speeddial-item`)];
    const isInline = this.hasAttribute('inline');

    this.className = `${window.__uiwc.prefix}-speeddial ${isInline ? 'relative' : 'fixed bottom-6 right-6 z-50'} flex flex-col items-end gap-2`;

    const list = document.createElement('div');
    list.className = 'flex flex-col items-end gap-2';

    this._buttons = items.map((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.getAttribute('label') || '';
      btn.setAttribute('aria-label', item.getAttribute('label') || '');
      btn.className =
        'flex h-10 w-10 scale-90 items-center justify-center rounded-full border border-base-200 bg-surface text-base-700 opacity-0 shadow transition-all pointer-events-none hover:bg-base-50';
      btn.innerHTML = `<uiwc-icon name="${item.getAttribute('icon') || 'star'}" size="sm"></uiwc-icon>`;
      btn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('ui-speeddial-select', { bubbles: true, composed: true, detail: { index: i } }));
        this.#close();
      });
      list.appendChild(btn);
      return btn;
    });

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Abrir acciones');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.className =
      'flex h-12 w-12 items-center justify-center rounded-full bg-base-900 text-white shadow-lg transition-transform hover:bg-base-800';
    toggle.innerHTML = `<uiwc-icon name="plus" size="md"></uiwc-icon>`;
    toggle.addEventListener('click', () => (this._open ? this.#close() : this.#open()));

    this.replaceChildren(list, toggle);
    this._toggle = toggle;
    this._open = false;
  }

  #open() {
    this._open = true;
    this._toggle.style.transform = 'rotate(45deg)';
    this._toggle.setAttribute('aria-expanded', 'true');
    this._buttons.forEach((btn) => {
      btn.classList.remove('opacity-0', 'scale-90', 'pointer-events-none');
    });
  }

  #close() {
    this._open = false;
    this._toggle.style.transform = '';
    this._toggle.setAttribute('aria-expanded', 'false');
    this._buttons.forEach((btn) => {
      btn.classList.add('opacity-0', 'scale-90', 'pointer-events-none');
    });
  }
}

window.__uiwc.register('speeddial', UiSpeeddial);
