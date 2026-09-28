import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-timeline-item date="Hoy" title="Pedido enviado">contenido</ui-timeline-item>` —
 * one entry in a `<ui-timeline>`, with a dot connected to the next item by a line.
 */
export class UiTimelineItem extends LitElement {
  static properties = {
    date: { type: String },
    title: { type: String },
    variant: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.date = '';
    this.title = '';
    this.variant = 'default';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const dotClass = this.variant === 'success' ? 'bg-success' : this.variant === 'danger' ? 'bg-danger' : 'bg-base-900';

    return html`
      <div class="${window.__uiwc.prefix}-timeline-item relative flex gap-3 pb-6 last:pb-0">
        <div class="relative flex flex-col items-center">
          <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}"></span>
          <span class="ui-timeline-line mt-1 w-px flex-1 bg-base-200"></span>
        </div>
        <div class="flex-1 pb-1">
          <div class="flex items-baseline gap-2">
            ${this.title ? html`<span class="text-sm font-medium text-base-900">${this.title}</span>` : ''}
            ${this.date ? html`<span class="text-xs text-base-400">${this.date}</span>` : ''}
          </div>
          <div class="mt-0.5 text-sm text-base-500">${unsafeHTML(this._content || '')}</div>
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('timeline-item', UiTimelineItem);
