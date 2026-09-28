import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-splitbutton label="Guardar">` — a primary action button plus a caret that opens
 * a menu of secondary actions. Menu items are authored as the default slot content
 * (e.g. `<button data-value="draft">Guardar borrador</button>`); since Light DOM can't
 * preserve JS listeners attached to captured markup, don't attach click handlers to the
 * items yourself — listen for the `ui-splitbutton-select` event on this element instead,
 * and read `event.detail.value` (from `data-value`) or `event.detail.label` (text).
 *
 * Emits `ui-splitbutton-action` when the main button is clicked, and
 * `ui-splitbutton-select` when a menu item is clicked.
 */
export class UiSplitbutton extends LitElement {
  static properties = {
    label: { type: String },
    variant: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    _open: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.variant = 'primary';
    this.disabled = false;
    this._open = false;
    this._onDocClick = (e) => {
      if (!this.contains(e.target)) this._open = false;
    };
    this._onKeydown = (e) => {
      if (e.key === 'Escape') this._open = false;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }

  #handleMain() {
    this.dispatchEvent(new CustomEvent('ui-splitbutton-action', { bubbles: true, composed: true }));
  }

  #handleMenuClick(e) {
    const item = e.target.closest('[data-value], a, button');
    if (!item) return;
    this._open = false;
    this.dispatchEvent(
      new CustomEvent('ui-splitbutton-select', {
        bubbles: true,
        composed: true,
        detail: { value: item.dataset.value ?? item.textContent.trim(), label: item.textContent.trim() },
      })
    );
  }

  render() {
    const isPrimary = this.variant !== 'secondary';
    const base = isPrimary ? 'bg-base-900 text-white hover:bg-base-800' : 'bg-base-50 text-base-900 hover:bg-base-200';
    const divider = isPrimary ? 'border-base-900' : 'border-base-300';

    return html`
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
          @click=${() => (this._open = !this._open)}
        >
          <uiwc-icon name="chevron-down" size="sm"></uiwc-icon>
        </button>
        ${this._open
          ? html`
              <div
                class="absolute right-0 top-full mt-1 min-w-[10rem] rounded border border-base-200 bg-surface py-1 shadow-lg [&_a]:block [&_a]:px-3 [&_a]:py-1.5 [&_a]:text-sm [&_a]:text-base-900 [&_a]:hover:bg-base-50 [&_button]:block [&_button]:w-full [&_button]:text-left [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-sm [&_button]:text-base-900 [&_button]:hover:bg-base-50"
                role="menu"
                @click=${this.#handleMenuClick}
              >
                ${unsafeHTML(this._content || '')}
              </div>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('splitbutton', UiSplitbutton);
