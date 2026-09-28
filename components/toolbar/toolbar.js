import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const JUSTIFY = { start: 'justify-start', between: 'justify-between', end: 'justify-end' };

/**
 * `<ui-toolbar justify="between">` — flex row for grouping actions/controls.
 */
export class UiToolbar extends LitElement {
  static properties = {
    justify: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.justify = 'start';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const justifyClass = JUSTIFY[this.justify] || JUSTIFY.start;

    return html`
      <div class="${window.__uiwc.prefix}-toolbar flex items-center gap-2 ${justifyClass} rounded border border-base-200 bg-surface p-2">
        ${unsafeHTML(this._content || '')}
      </div>
    `;
  }
}

window.__uiwc.register('toolbar', UiToolbar);
