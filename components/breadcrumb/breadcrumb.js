import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-breadcrumb><a href="/">Inicio</a><a href="/docs">Docs</a><span>Actual</span></ui-breadcrumb>`
 * — trail of links with an automatic separator between items (CSS-only, works on any
 * number of children).
 */
export class UiBreadcrumb extends LitElement {
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
      <nav class="${window.__uiwc.prefix}-breadcrumb" aria-label="Breadcrumb">
        <ol class="flex flex-wrap items-center gap-1.5 text-sm text-base-500 [&_a]:text-base-500 [&_a]:hover:text-base-900 [&_a]:no-underline [&_li:last-child]:text-base-900 [&_li:last-child]:font-medium">
          ${unsafeHTML(this.#wrapItems(this._content || ''))}
        </ol>
      </nav>
    `;
  }

  // One <uiwc-icon chevron-right> between items instead of a CSS ::after "/" —
  // matches the icon-separator pattern most host design systems already use.
  #wrapItems(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const children = [...template.content.children];
    return children
      .map((child, i) => {
        const separator =
          i < children.length - 1
            ? '<uiwc-icon name="chevron-right" size="sm" class="text-base-300"></uiwc-icon>'
            : '';
        return `<li class="flex items-center gap-1.5">${child.outerHTML}${separator}</li>`;
      })
      .join('');
  }
}

window.__uiwc.register('breadcrumb', UiBreadcrumb);
