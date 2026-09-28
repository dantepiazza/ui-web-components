import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-pillbox placeholder="Agregar tag...">` — free-text multi-value input. `Enter` or
 * `,` adds a pill from the typed text; `Backspace` on an empty field removes the last
 * pill. Emits `ui-pillbox-change` with `{ values }` on every add/remove.
 */
export class UiPillbox extends LitElement {
  static properties = {
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    _values: { state: true },
    _draft: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.placeholder = 'Agregar...';
    this.disabled = false;
    this._values = [];
    this._draft = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._initialized === undefined) {
      const initial = this.getAttribute('value');
      this._values = initial ? initial.split(',').filter(Boolean) : [];
      this._initialized = true;
    }
  }

  get values() {
    return this._values;
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('ui-pillbox-change', { bubbles: true, composed: true, detail: { values: this._values } }));
  }

  #addFromDraft() {
    const text = this._draft.trim();
    if (!text) return;
    this._values = [...this._values, text];
    this._draft = '';
    this.#emit();
  }

  #removeAt(index) {
    this._values = this._values.filter((_, i) => i !== index);
    this.#emit();
  }

  #handleKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.#addFromDraft();
    } else if (e.key === 'Backspace' && !this._draft && this._values.length) {
      this.#removeAt(this._values.length - 1);
    }
  }

  render() {
    return html`
      <div
        class="${window.__uiwc.prefix}-pillbox flex flex-wrap items-center gap-1.5 rounded border border-base-300 bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900 ${this.disabled ? 'opacity-60' : ''}"
      >
        ${this._values.map(
          (v, i) => html`
            <span class="inline-flex items-center gap-1 rounded bg-base-100 px-2 py-0.5 text-xs font-medium text-base-800">
              ${v}
              <button
                type="button"
                class="rounded p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
                aria-label="Quitar ${v}"
                ?disabled=${this.disabled}
                @click=${() => this.#removeAt(i)}
              >
                <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          `
        )}
        <input
          type="text"
          class="min-w-[6rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-base-900 placeholder:text-base-400 focus:outline-none disabled:cursor-not-allowed"
          placeholder=${this._values.length ? '' : this.placeholder}
          .value=${this._draft}
          ?disabled=${this.disabled}
          @input=${(e) => (this._draft = e.target.value)}
          @keydown=${this.#handleKeydown}
          @blur=${() => this.#addFromDraft()}
        />
      </div>
    `;
  }
}

window.__uiwc.register('pillbox', UiPillbox);
