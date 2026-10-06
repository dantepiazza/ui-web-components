import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-sidebar-header>` — the top area of a `<ui-sidebar>` (logo, workspace switcher,
 * whatever — any content). Optional: omit it and the sidebar has no header at all.
 */
export class UiSidebarHeader extends LitElement {
  static properties = {
    removeClass: { type: String, attribute: 'remove-class' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.removeClass = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const cls = window.__uiwc
      .classes([`${window.__uiwc.prefix}-sidebar-header`, 'shrink-0', 'border-b', 'border-sidebar-fg/15', 'p-4'], this)
      .join(' ');
    return html`
      <div class="${cls}">
        ${unsafeHTML(this._content || '')}
      </div>
    `;
  }
}

window.__uiwc.register('sidebar-header', UiSidebarHeader);
