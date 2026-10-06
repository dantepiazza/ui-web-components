window.__uiwc = window.__uiwc || { prefix: 'ui' };

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']);

/**
 * `<ui-file-manager-item item-id="12" name="Factura.pdf" type="file" size="1,2 MB"
 * modified="01/10/2026">` — one file or folder row/tile inside `<ui-file-manager>`.
 * Everything is data in attributes (the backend sends it; nothing is formatted here):
 * `name`, `type` (`file` | `folder`), `size`, `modified`, `ext`, `icon` (overrides the
 * built-in one — a built-in name or external icon-font classes), `thumb` (image URL,
 * shown in grid view), `selected`, `disabled`.
 *
 * It has no user children, so it can own its inner markup — rendered once, rebuilt only
 * if an attribute changes, and put back if a server re-render wipes it. Selection,
 * keyboard and events are handled by the parent manager by delegation.
 */
export class UiFileManagerItem extends HTMLElement {
  static get observedAttributes() {
    return ['name', 'type', 'size', 'modified', 'ext', 'icon', 'thumb', 'selected', 'disabled', 'data-view', 'remove-class'];
  }

  get itemId() {
    return this.getAttribute('item-id') ?? this.id;
  }

  connectedCallback() {
    this.setAttribute('data-uiwc-fm-item', '');
    this.setAttribute('role', 'option');
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
    if (!this.hasAttribute('data-view')) {
      const view = this.closest('[data-uiwc-file-manager]')?.getAttribute('view');
      if (view) this.setAttribute('data-view', view);
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
    const grid = this.getAttribute('data-view') === 'grid';
    const selected = this.hasAttribute('selected');
    this.setAttribute('aria-selected', selected ? 'true' : 'false');

    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-file-manager-item`,
      'relative', 'block', 'min-w-0', 'cursor-pointer', 'select-none', 'rounded', 'outline-none', 'transition-colors',
      grid ? 'p-2' : 'px-3 py-2',
      'focus-visible:ring-2', 'focus-visible:ring-brand-500',
      selected ? 'bg-brand-900/10 ring-1 ring-brand-900/30' : 'hover:bg-base-100',
      this.hasAttribute('disabled') ? 'pointer-events-none opacity-50' : '',
    ]);
    this.#render();
  }

  #iconName() {
    const explicit = this.getAttribute('icon');
    if (explicit) return explicit;
    if (this.getAttribute('type') === 'folder') return 'folder';
    return IMAGE_EXT.has((this.getAttribute('ext') || '').toLowerCase()) ? 'image' : 'file';
  }

  #render() {
    if (!this.isConnected) return;
    const grid = this.getAttribute('data-view') === 'grid';
    const g = (n) => this.getAttribute(n) || '';
    const key = [grid, g('type'), g('name'), g('size'), g('modified'), g('ext'), g('icon'), g('thumb')].join('\u0001');

    let body = this.querySelector(':scope > [data-uiwc-body]');
    if (body && body._key === key) return;
    if (!body) {
      body = document.createElement('div');
      body.setAttribute('data-uiwc-body', '');
      this.prepend(body);
    }
    body._key = key;
    body.replaceChildren();

    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    const folder = g('type') === 'folder';
    const tone = folder ? 'text-warning' : IMAGE_EXT.has(g('ext').toLowerCase()) ? 'text-info' : 'text-base-500';

    const iconBox = el('span', `flex shrink-0 items-center justify-center overflow-hidden bg-base-100 ${tone} ${grid ? 'h-16 w-full rounded-lg' : 'h-8 w-8 rounded'}`);
    if (grid && g('thumb')) {
      const img = el('img', 'h-full w-full object-cover');
      img.src = g('thumb');
      img.alt = '';
      img.loading = 'lazy';
      iconBox.appendChild(img);
    } else {
      const icon = document.createElement('uiwc-icon');
      icon.setAttribute('name', this.#iconName());
      icon.setAttribute('size', grid ? 'md' : 'sm');
      iconBox.appendChild(icon);
    }

    if (grid) {
      body.className = 'flex w-full flex-col items-center gap-1.5 text-center';
      body.append(iconBox, el('span', 'w-full truncate text-xs font-medium text-base-900', g('name')));
      if (g('size')) body.append(el('span', 'text-[11px] text-base-500', g('size')));
    } else {
      body.className = 'flex w-full min-w-0 items-center gap-3';
      body.append(
        iconBox,
        el('span', 'min-w-0 flex-1 truncate text-sm font-medium text-base-900', g('name')),
        el('span', 'hidden w-24 shrink-0 text-right text-xs text-base-500 sm:block', g('size')),
        el('span', 'hidden w-36 shrink-0 text-right text-xs text-base-500 md:block', g('modified'))
      );
    }
  }
}

window.__uiwc.register('file-manager-item', UiFileManagerItem);
