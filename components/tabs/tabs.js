window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-tabs><ui-tab-panel label="General">...</ui-tab-panel><ui-tab-panel label="Avanzado">...</ui-tab-panel></ui-tabs>`
 * — builds a tab list from each `<ui-tab-panel>`'s `label` and shows one at a time.
 * Plain custom element (no Lit template): it never captures/reparses its panels, so
 * their content stays live — forms, other components, anything interactive keeps
 * working. Emits `ui-tabs-change` with `{ label }`.
 */
export class UiTabs extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const panels = [...this.querySelectorAll(`${window.__uiwc.prefix}-tab-panel`)];
    if (!panels.length) return;

    const activeIndex = Math.max(
      0,
      panels.findIndex((p) => p.hasAttribute('active'))
    );

    const list = document.createElement('div');
    list.className = `${window.__uiwc.prefix}-tabs-list flex gap-1 border-b border-base-200`;
    list.setAttribute('role', 'tablist');

    const buttons = panels.map((panel, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = (panel.getAttribute('label') || '');
      btn.setAttribute('role', 'tab');
      btn.className = this.#buttonClass(i === activeIndex);
      btn.setAttribute('aria-selected', String(i === activeIndex));
      btn.tabIndex = i === activeIndex ? 0 : -1;
      btn.addEventListener('click', () => this.#select(i));
      btn.addEventListener('keydown', (e) => this.#handleKeydown(e, i));
      list.appendChild(btn);
      return btn;
    });

    this._buttons = buttons;
    this._panels = panels;
    this.prepend(list);
    this.#select(activeIndex, false);
  }

  #buttonClass(active) {
    return active
      ? 'border-b-2 border-brand-900 px-6 py-3 text-sm font-medium text-base-900 -mb-px'
      : 'border-b-2 border-transparent px-6 py-3 text-sm font-medium text-base-500 hover:text-base-900 -mb-px';
  }

  #select(index, emit = true) {
    this._panels.forEach((panel, i) => panel.toggleAttribute('active', i === index));
    this._buttons.forEach((btn, i) => {
      btn.className = this.#buttonClass(i === index);
      btn.setAttribute('aria-selected', String(i === index));
      btn.tabIndex = i === index ? 0 : -1;
    });
    if (emit) {
      this.dispatchEvent(
        new CustomEvent('ui-tabs-change', { bubbles: true, composed: true, detail: { label: this._panels[index].label } })
      );
    }
  }

  #handleKeydown(e, index) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (index + 1) % this._buttons.length : (index - 1 + this._buttons.length) % this._buttons.length;
    this._buttons[next].focus();
    this.#select(next);
  }
}

window.__uiwc.register('tabs', UiTabs);
