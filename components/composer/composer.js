import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-composer placeholder="Escribí un mensaje...">` — chat-style input: auto-growing
 * textarea, `Enter` sends (`Shift+Enter` for a newline), optional attach button.
 * Emits `ui-composer-submit` with `{ value }` and clears itself.
 */
export class UiComposer extends LitElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    allowAttach: { type: Boolean, attribute: 'allow-attach' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.placeholder = 'Escribí un mensaje...';
    this.disabled = false;
    this.allowAttach = false;
  }

  #handleInput(e) {
    this.value = e.target.value;
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
  }

  #submit() {
    const trimmed = this.value.trim();
    if (!trimmed) return;
    this.dispatchEvent(new CustomEvent('ui-composer-submit', { bubbles: true, composed: true, detail: { value: trimmed } }));
    this.value = '';
    const textarea = this.querySelector('textarea');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  }

  #handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.#submit();
    }
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-composer flex items-end gap-2 rounded border border-base-300 bg-surface p-2 focus-within:ring-2 focus-within:ring-brand-900 focus-within:border-brand-900">
        ${this.allowAttach
          ? html`
              <button type="button" class="shrink-0 rounded p-2 text-base-400 hover:bg-base-50 hover:text-base-500" aria-label="Adjuntar archivo">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.83 17.44a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            `
          : ''}
        <textarea
          rows="1"
          class="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm text-base-900 placeholder:text-base-400 focus:outline-none disabled:opacity-60"
          placeholder=${this.placeholder}
          .value=${this.value}
          ?disabled=${this.disabled}
          @input=${this.#handleInput}
          @keydown=${this.#handleKeydown}
        ></textarea>
        <button
          type="button"
          class="shrink-0 rounded bg-base-900 p-2 text-white hover:bg-base-800 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Enviar"
          ?disabled=${this.disabled || !this.value.trim()}
          @click=${this.#submit}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
    `;
  }
}

window.__uiwc.register('composer', UiComposer);
