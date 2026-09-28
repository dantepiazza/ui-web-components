import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-otp-input length="6">` — one input box per digit, auto-advances focus and
 * supports pasting the full code. Emits `ui-input` on every change and
 * `ui-otp-complete` with `{ value }` once all boxes are filled.
 */
export class UiOtpInput extends LitElement {
  static properties = {
    length: { type: Number },
    disabled: { type: Boolean, reflect: true },
    _digits: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.length = 6;
    this.disabled = false;
    this._digits = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this._digits = Array(this.length).fill('');
  }

  get value() {
    return this._digits.join('');
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
    if (this._digits.every((d) => d !== '')) {
      this.dispatchEvent(new CustomEvent('ui-otp-complete', { bubbles: true, composed: true, detail: { value: this.value } }));
    }
  }

  #focusBox(index) {
    this.renderRoot.querySelector(`input[data-index="${index}"]`)?.focus();
  }

  #handleInput(index, e) {
    const char = e.target.value.replace(/[^0-9]/g, '').slice(-1);
    this._digits = this._digits.map((d, i) => (i === index ? char : d));
    e.target.value = char;
    if (char && index < this.length - 1) this.#focusBox(index + 1);
    this.#emit();
  }

  #handleKeydown(index, e) {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      this.#focusBox(index - 1);
    }
  }

  #handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, this.length);
    if (!text) return;
    e.preventDefault();
    this._digits = Array(this.length)
      .fill('')
      .map((_, i) => text[i] || '');
    this.#emit();
    this.#focusBox(Math.min(text.length, this.length - 1));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-otp-input flex gap-2" @paste=${this.#handlePaste}>
        ${this._digits.map(
          (digit, i) => html`
            <input
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="1"
              data-index=${i}
              .value=${digit}
              ?disabled=${this.disabled}
              class="h-11 w-9 rounded border border-base-300 text-center text-lg font-medium focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900 disabled:bg-base-50 disabled:opacity-60"
              aria-label="Dígito ${i + 1} de ${this.length}"
              @input=${(e) => this.#handleInput(i, e)}
              @keydown=${(e) => this.#handleKeydown(i, e)}
            />
          `
        )}
      </div>
    `;
  }
}

window.__uiwc.register('otp-input', UiOtpInput);
