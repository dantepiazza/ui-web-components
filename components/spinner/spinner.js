import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const SIZES = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-9 h-9 border-[3px]' };

/**
 * `<ui-spinner size="md" label="Cargando">` — indeterminate loading indicator.
 */
export class UiSpinner extends LitElement {
  static properties = {
    size: { type: String, reflect: true },
    label: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.size = 'md';
    this.label = 'Cargando';
  }

  render() {
    const sizeClass = SIZES[this.size] || SIZES.md;

    return html`
      <span
        class="${window.__uiwc.prefix}-spinner inline-block rounded-full animate-spin border-base-200 border-t-base-900 ${sizeClass}"
        role="status"
        aria-live="polite"
      >
        <span class="sr-only">${this.label}</span>
      </span>
    `;
  }
}

window.__uiwc.register('spinner', UiSpinner);
// A custom element constructor can only be registered once per registry — even under a
// second name — so the fixed internal alias needs its own (trivial, behavior-identical)
// subclass rather than reusing the UiSpinner class directly.
if (!customElements.get('uiwc-spinner')) {
  customElements.define('uiwc-spinner', class extends UiSpinner {});
}
