import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-command-palette>` with `<ui-command value="new-file">Nuevo archivo</ui-command>`
 * children — global `Cmd+K`/`Ctrl+K` overlay with a search box that filters commands.
 * Commands are parsed into a plain array at connect time (same reasoning as
 * `<ui-autocomplete>`), so this element renders its own list instead of the children.
 * Emits `ui-command-select` with `{ value, label }`.
 */
export class UiCommandPalette extends LitElement {
  static properties = {
    _open: { state: true },
    _query: { state: true },
    _activeIndex: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._commands = [];
    this._open = false;
    this._query = '';
    this._activeIndex = 0;
    this._onGlobalKeydown = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this._open ? this.#close() : this.#open();
      } else if (this._open && e.key === 'Escape') {
        this.#close();
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._commands.length === 0) {
      const template = document.createElement('template');
      template.innerHTML = this.innerHTML;
      this._commands = [...template.content.children].map((el) => ({
        value: el.getAttribute('value') || el.textContent.trim(),
        label: el.textContent.trim(),
      }));
      this.innerHTML = '';
    }
    document.addEventListener('keydown', this._onGlobalKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onGlobalKeydown);
  }

  #open() {
    this._open = true;
    this._query = '';
    this._activeIndex = 0;
  }

  #close() {
    this._open = false;
  }

  get #filtered() {
    const q = this._query.trim().toLowerCase();
    if (!q) return this._commands;
    return this._commands.filter((c) => c.label.toLowerCase().includes(q));
  }

  #select(command) {
    this.dispatchEvent(new CustomEvent('ui-command-select', { bubbles: true, composed: true, detail: command }));
    this.#close();
  }

  #handleKeydown(e) {
    const results = this.#filtered;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._activeIndex = Math.min(results.length - 1, this._activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._activeIndex = Math.max(0, this._activeIndex - 1);
    } else if (e.key === 'Enter' && results[this._activeIndex]) {
      this.#select(results[this._activeIndex]);
    }
  }

  render() {
    if (!this._open) return html``;
    const results = this.#filtered;

    return html`
      <div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" @click=${(e) => e.target === e.currentTarget && this.#close()}>
        <div class="w-full max-w-lg rounded border border-base-200 bg-surface shadow-2xl">
          <input
            type="text"
            autofocus
            class="w-full border-b border-base-200 px-4 py-3 text-sm text-base-900 placeholder:text-base-400 focus:outline-none"
            placeholder="Buscar comando... (Escape para cerrar)"
            .value=${this._query}
            @input=${(e) => {
              this._query = e.target.value;
              this._activeIndex = 0;
            }}
            @keydown=${this.#handleKeydown}
          />
          <div class="max-h-72 overflow-y-auto py-1">
            ${results.length === 0
              ? html`<div class="px-4 py-6 text-center text-sm text-base-400">Sin resultados</div>`
              : results.map(
                  (c, i) => html`
                    <div
                      class="px-4 py-2 text-sm cursor-pointer ${i === this._activeIndex ? 'bg-base-100 text-base-800' : 'text-base-900 hover:bg-base-50'}"
                      @mousedown=${(e) => e.preventDefault()}
                      @click=${() => this.#select(c)}
                    >
                      ${c.label}
                    </div>
                  `
                )}
          </div>
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('command-palette', UiCommandPalette);
