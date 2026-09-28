import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-copy-button value="npm install foo">` — copies `value` to the clipboard on click,
 * shows a checkmark for 1.5s as feedback. Emits `ui-copy` with `{ value }` on success.
 */
export class UiCopyButton extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    _copied: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.label = 'Copiar';
    this._copied = false;
  }

  async #handleClick() {
    try {
      await navigator.clipboard.writeText(this.value);
      this._copied = true;
      this.dispatchEvent(new CustomEvent('ui-copy', { bubbles: true, composed: true, detail: { value: this.value } }));
      setTimeout(() => (this._copied = false), 1500);
    } catch {
      console.warn('ui-copy-button: no se pudo escribir al portapapeles');
    }
  }

  render() {
    return html`
      <button
        type="button"
        class="${window.__uiwc.prefix}-copy-button inline-flex items-center gap-1.5 rounded border border-base-200 bg-surface px-2.5 py-1.5 text-xs font-medium text-base-900 hover:bg-base-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
        @click=${this.#handleClick}
        aria-label=${this.label}
      >
        <uiwc-icon name=${this._copied ? 'check' : 'copy'} size="sm" class=${this._copied ? 'text-success' : ''}></uiwc-icon>
        ${this._copied ? 'Copiado' : this.label}
      </button>
    `;
  }
}

window.__uiwc.register('copy-button', UiCopyButton);
