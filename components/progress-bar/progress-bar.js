import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  primary: 'bg-brand-900',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/**
 * `<ui-progress-bar value="60" max="100" variant="primary">` — determinate progress bar.
 * Add `indeterminate` for an unknown-duration loading state.
 */
export class UiProgressBar extends LitElement {
  static properties = {
    value: { type: Number },
    max: { type: Number },
    variant: { type: String, reflect: true },
    indeterminate: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = 0;
    this.max = 100;
    this.variant = 'primary';
    this.indeterminate = false;
  }

  render() {
    const variantClass = VARIANTS[this.variant] || VARIANTS.primary;
    const pct = Math.max(0, Math.min(100, (this.value / this.max) * 100));

    return html`
      <div
        class="${window.__uiwc.prefix}-progress-bar w-full h-2 rounded-full bg-base-50 overflow-hidden"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax=${this.max}
        aria-valuenow=${this.indeterminate ? undefined : this.value}
      >
        <div
          class="h-full rounded-full ${variantClass} ${this.indeterminate ? 'w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]' : 'transition-[width] duration-300'}"
          style=${this.indeterminate ? '' : `width:${pct}%`}
        ></div>
      </div>
      <style>
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      </style>
    `;
  }
}

window.__uiwc.register('progress-bar', UiProgressBar);
