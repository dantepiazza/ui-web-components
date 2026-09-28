import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-navbar>` — horizontal top bar. Put a brand/logo and `<ui-menu-item>` links
 * inside; layout is `justify-between` so the first child and the rest naturally end up
 * on opposite sides if you wrap the links in their own container.
 */
export class UiNavbar extends LitElement {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    return html`
      <nav class="${window.__uiwc.prefix}-navbar flex items-center justify-between gap-4 border-b border-base-200 bg-surface px-4 py-3">
        ${unsafeHTML(this._content || '')}
      </nav>
    `;
  }
}

window.__uiwc.register('navbar', UiNavbar);
