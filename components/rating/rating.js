import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-rating value="3" max="5">` — star rating. Click (or `Enter`/`Space` while
 * focused, with arrow-key adjustment) to change. Add `readonly` to just display a value.
 * Emits `ui-change` with `{ value }`.
 */
export class UiRating extends LitElement {
  static properties = {
    value: { type: Number },
    max: { type: Number },
    readonly: { type: Boolean, reflect: true },
    _hover: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = 0;
    this.max = 5;
    this.readonly = false;
    this._hover = 0;
  }

  #setValue(next) {
    if (this.readonly) return;
    this.value = next;
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  #handleKeydown(e) {
    if (this.readonly) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.#setValue(Math.min(this.max, this.value + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.#setValue(Math.max(0, this.value - 1));
    }
  }

  render() {
    const display = this._hover || this.value;

    return html`
      <div
        class="${window.__uiwc.prefix}-rating inline-flex gap-0.5"
        role="slider"
        aria-label="Calificación"
        aria-valuemin="0"
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
        tabindex=${this.readonly ? -1 : 0}
        @keydown=${this.#handleKeydown}
        @mouseleave=${() => (this._hover = 0)}
      >
        ${Array.from({ length: this.max }, (_, i) => i + 1).map(
          (n) => html`
            <button
              type="button"
              class="${this.readonly ? 'cursor-default' : 'cursor-pointer'} ${n <= display ? 'text-amber-400' : 'text-base-200'}"
              tabindex="-1"
              aria-hidden="true"
              @click=${() => this.#setValue(n)}
              @mouseenter=${() => !this.readonly && (this._hover = n)}
            >
              <uiwc-icon name="star" size="md"></uiwc-icon>
            </button>
          `
        )}
      </div>
    `;
  }
}

window.__uiwc.register('rating', UiRating);
