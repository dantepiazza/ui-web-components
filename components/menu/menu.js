import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-menu>` — generic vertical menu list: plain `<a>` links, a `<hr>` as a divider,
 * and a direct child with class `menu-section` as a section heading — same
 * child-class convention as `<ui-card>`'s `card-header`/`card-footer`. Distinct from
 * `<ui-navbar>` (horizontal top bar): this is the vertical sidebar/dropdown-list shape,
 * migrated from panel-assets' `.menu` (the "Menu genérico" gap from the comparison pass).
 */
export class UiMenu extends LitElement {
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
      <nav
        class="${window.__uiwc.prefix}-menu flex flex-col gap-0.5 rounded border border-base-200 bg-surface p-1.5
          [&>.menu-section]:px-2.5 [&>.menu-section]:pb-1 [&>.menu-section]:pt-2 [&>.menu-section]:text-xs [&>.menu-section]:font-semibold [&>.menu-section]:uppercase [&>.menu-section]:tracking-wide [&>.menu-section]:text-base-400
          [&>a]:flex [&>a]:items-center [&>a]:gap-2 [&>a]:rounded [&>a]:px-2.5 [&>a]:py-1.5 [&>a]:text-sm [&>a]:text-base-700 [&>a]:no-underline [&>a:hover]:bg-base-50
          [&>a.active]:bg-base-100 [&>a.active]:font-medium [&>a.active]:text-base-900
          [&>hr]:my-1 [&>hr]:border-base-100"
      >
        ${unsafeHTML(this._content || '')}
      </nav>
    `;
  }
}

window.__uiwc.register('menu', UiMenu);
