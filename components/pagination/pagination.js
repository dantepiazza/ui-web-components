import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-pagination page="1" total-pages="12">` — page number navigation with a windowed
 * range around the current page. Emits `ui-page-change` with `{ page }`.
 */
export class UiPagination extends LitElement {
  static properties = {
    page: { type: Number },
    totalPages: { type: Number, attribute: 'total-pages' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.page = 1;
    this.totalPages = 1;
  }

  #goTo(page) {
    if (page < 1 || page > this.totalPages || page === this.page) return;
    this.page = page;
    this.dispatchEvent(new CustomEvent('ui-page-change', { bubbles: true, composed: true, detail: { page } }));
  }

  #buttonClass(active) {
    return active
      ? 'bg-brand-900 text-brand-fg'
      : 'text-base-900 hover:bg-base-100';
  }

  #pages() {
    const total = this.totalPages;
    const current = this.page;
    const pages = new Set([1, total, current, current - 1, current + 1]);
    return [...pages]
      .filter((p) => p >= 1 && p <= total)
      .sort((a, b) => a - b);
  }

  render() {
    const pages = this.#pages();
    let prev = 0;
    const items = [];
    for (const p of pages) {
      if (p - prev > 1) items.push(html`<span class="px-1.5 text-base-400">…</span>`);
      items.push(html`
        <button
          type="button"
          class="min-w-[2rem] rounded px-2 py-1 text-sm ${this.#buttonClass(p === this.page)}"
          aria-current=${p === this.page ? 'page' : undefined}
          @click=${() => this.#goTo(p)}
        >
          ${p}
        </button>
      `);
      prev = p;
    }

    return html`
      <nav class="${window.__uiwc.prefix}-pagination flex items-center gap-1" aria-label="Paginación">
        <button
          type="button"
          class="rounded p-1.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Página anterior"
          ?disabled=${this.page <= 1}
          @click=${() => this.#goTo(this.page - 1)}
        >
          <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(90deg)"></uiwc-icon>
        </button>
        ${items}
        <button
          type="button"
          class="rounded p-1.5 text-base-500 hover:bg-base-50 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Página siguiente"
          ?disabled=${this.page >= this.totalPages}
          @click=${() => this.#goTo(this.page + 1)}
        >
          <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(-90deg)"></uiwc-icon>
        </button>
      </nav>
    `;
  }
}

window.__uiwc.register('pagination', UiPagination);
