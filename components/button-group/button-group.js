import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-button-group>` — groups `<ui-button>` elements in a single visual row.
 * v1: spacing only, no shared border-merging between adjacent buttons.
 */
export class UiButtonGroup extends LitElement {
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
      <div class="${window.__uiwc.prefix}-button-group inline-flex items-center gap-1 rounded border border-base-200 bg-surface p-1" role="group">
        ${unsafeHTML(this._content || '')}
      </div>
    `;
  }
}

window.__uiwc.register('button-group', UiButtonGroup);
