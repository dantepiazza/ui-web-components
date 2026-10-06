import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-sidebar-footer>` — the bottom area of a `<ui-sidebar>` (a "back to plan" link,
 * a version number, whatever — any content). Optional: omit it and the sidebar has
 * no footer at all.
 */
export class UiSidebarFooter extends LitElement {
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
      .classes([`${window.__uiwc.prefix}-sidebar-footer`, 'shrink-0', 'border-t', 'border-sidebar-fg/15', 'p-4'], this)
      .join(' ');
    return html`
      <div class="${cls}">
        ${unsafeHTML(this._content || '')}
      </div>
    `;
  }
}

window.__uiwc.register('sidebar-footer', UiSidebarFooter);
