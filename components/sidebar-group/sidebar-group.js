import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-sidebar-group label="Configuración" icon="settings">` — expandable node inside
 * `<ui-sidebar>` (or standalone): a toggle button + a collapsible list of `<a>` links
 * (same convention as `<ui-sidebar>` itself — `class="active"`, `<hr>`, nested
 * `<ui-sidebar-group>` for another level). Indentation compounds naturally since each
 * level only pads its own children — tested up to 3 levels deep.
 */
export class UiSidebarGroup extends LitElement {
  static properties = {
    label: { type: String },
    icon: { type: String },
    open: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.icon = '';
    this.open = false;
    this._id = `ui-sidebar-group-${++idCounter}`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  #toggle() {
    this.open = !this.open;
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-sidebar-group">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm text-sidebar-fg/80 hover:bg-sidebar-fg/10 hover:text-sidebar-fg"
          aria-expanded=${this.open}
          aria-controls="${this._id}-panel"
          @click=${this.#toggle}
        >
          ${this.icon ? html`<uiwc-icon name=${this.icon} size="sm" class="shrink-0"></uiwc-icon>` : ''}
          <span class="flex-1">${this.label}</span>
          <uiwc-icon name="chevron-down" size="sm" class="shrink-0 transition-transform ${this.open ? 'rotate-180' : ''}"></uiwc-icon>
        </button>
        <div
          id="${this._id}-panel"
          ?hidden=${!this.open}
          class="ml-2.5 border-l border-sidebar-fg/20 pl-2.5
            [&>a]:flex [&>a]:items-center [&>a]:gap-2.5 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-2 [&>a]:text-sm [&>a]:text-sidebar-fg/60 [&>a]:no-underline [&>a:hover]:bg-sidebar-fg/10 [&>a:hover]:text-sidebar-fg
            [&>a.active]:bg-white/10 [&>a.active]:font-medium [&>a.active]:text-white
            [&>hr]:my-2 [&>hr]:border-sidebar-fg/20"
        >
          ${unsafeHTML(this._content || '')}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('sidebar-group', UiSidebarGroup);
