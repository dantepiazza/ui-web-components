import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-table striped>` — wraps a real `<table>` you author inside (thead/tbody/etc),
 * applying consistent styling. Doesn't reinvent table semantics — v1 is a styling
 * layer, not a data grid.
 *
 * `remove-class="border rounded"` strips classes off the wrapper — typical case: a
 * `<ui-table>` nested inside a `<ui-card>` doubles up borders, trim one side. See
 * `window.__uiwc.classes()` in the core banner.
 */
export class UiTable extends LitElement {
  static properties = {
    striped: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    removeClass: { type: String, attribute: 'remove-class' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.striped = false;
    this.compact = false;
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
    const pad = this.compact
      ? '[&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2'
      : '[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3';
    const striped = this.striped ? '[&_tbody_tr:nth-child(even)]:bg-base-50' : '';

    // Descendant styling of the consumer-authored <table> via Tailwind arbitrary
    // variants — no injected <style>, so it re-themes with the tokens like everything else.
    const wanted = [
      `${window.__uiwc.prefix}-table`, 'overflow-x-auto', 'rounded', 'border', 'border-base-200',
      '[&_table]:w-full', '[&_table]:border-collapse', '[&_table]:text-sm',
      '[&_thead]:border-b', '[&_thead]:border-base-200', '[&_thead]:bg-base-50',
      '[&_th]:text-left', '[&_th]:font-semibold', '[&_th]:text-base-600',
      '[&_td]:border-b', '[&_td]:border-base-100', '[&_td]:text-base-900',
      '[&_tbody_tr:last-child_td]:border-b-0', ...pad.split(' '), ...(striped ? [striped] : []),
    ];
    const wrapperClass = window.__uiwc.classes(wanted, this).join(' ');

    return html`
      <div class="${wrapperClass}">
        ${unsafeHTML(this._content || '')}
      </div>
    `;
  }
}

window.__uiwc.register('table', UiTable);
