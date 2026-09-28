import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-empty-state icon="inbox" title="Sin resultados" desc="No encontramos nada.">`
 * — centered placeholder for an empty list/table/search. An optional default slot
 * (e.g. a `<ui-button>`) renders below the text as a call to action.
 * Migrated from panel-assets' `.empty-state` (candidate from the comparison pass).
 */
export class UiEmptyState extends LitElement {
  static properties = {
    icon: { type: String },
    title: { type: String },
    desc: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.icon = 'folder';
    this.title = '';
    this.desc = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML.trim();
      this.innerHTML = '';
    }
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-empty-state flex flex-col items-center gap-2 py-10 text-center">
        <span class="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-base-100 text-base-400">
          <uiwc-icon name=${this.icon} size="lg"></uiwc-icon>
        </span>
        ${this.title ? html`<div class="text-sm font-semibold text-base-900">${this.title}</div>` : ''}
        ${this.desc ? html`<div class="max-w-xs text-sm text-base-500">${this.desc}</div>` : ''}
        ${this._content ? html`<div class="mt-2">${unsafeHTML(this._content)}</div>` : ''}
      </div>
    `;
  }
}

window.__uiwc.register('empty-state', UiEmptyState);
