import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  text: 'rounded h-4 w-full',
  circle: 'rounded-full',
  rect: 'rounded',
};

/**
 * `<ui-skeleton variant="text" width="12rem" height="1rem">` — loading placeholder block.
 */
export class UiSkeleton extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    width: { type: String },
    height: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'text';
    this.width = '';
    this.height = '';
  }

  render() {
    const variantClass = VARIANTS[this.variant] || VARIANTS.text;
    const style = [this.width ? `width:${this.width}` : '', this.height ? `height:${this.height}` : '']
      .filter(Boolean)
      .join(';');

    return html`
      <span
        class="${window.__uiwc.prefix}-skeleton block animate-pulse bg-base-200 ${variantClass}"
        style=${style}
        role="presentation"
        aria-hidden="true"
      ></span>
    `;
  }
}

window.__uiwc.register('skeleton', UiSkeleton);
