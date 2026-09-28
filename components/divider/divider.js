import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-divider>` — horizontal or vertical separator, with an optional label.
 */
export class UiDivider extends LitElement {
  static properties = {
    orientation: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.orientation = 'horizontal';
  }

  // Light DOM has no shadow root, so <slot> can't project children — capture the
  // author-provided label once and re-inject it with unsafeHTML instead.
  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const hasLabel = (this._content || '').trim().length > 0;

    if (this.orientation === 'vertical') {
      return html`<span class="${window.__uiwc.prefix}-divider inline-block w-px self-stretch bg-base-200" role="separator" aria-orientation="vertical"></span>`;
    }

    if (hasLabel) {
      return html`
        <div class="${window.__uiwc.prefix}-divider flex items-center gap-3 text-sm text-base-500" role="separator">
          <span class="h-px flex-1 bg-base-200"></span>
          <span>${unsafeHTML(this._content)}</span>
          <span class="h-px flex-1 bg-base-200"></span>
        </div>
      `;
    }

    return html`<hr class="${window.__uiwc.prefix}-divider border-0 border-t border-base-200" role="separator" aria-orientation="horizontal" />`;
  }
}

window.__uiwc.register('divider', UiDivider);
