import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const SIZES = { sm: 'w-6 h-6 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };

/**
 * `<ui-avatar src="..." name="Dante H" size="md" shape="circle">`
 * Falls back to initials from `name` when `src` is missing or fails to load.
 */
export class UiAvatar extends LitElement {
  static properties = {
    src: { type: String },
    name: { type: String },
    size: { type: String, reflect: true },
    shape: { type: String, reflect: true },
    _imgFailed: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.src = '';
    this.name = '';
    this.size = 'md';
    this.shape = 'circle';
    this._imgFailed = false;
  }

  get #initials() {
    return this.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  render() {
    const sizeClass = SIZES[this.size] || SIZES.md;
    const shapeClass = this.shape === 'square' ? 'rounded' : 'rounded-full';
    const showImage = this.src && !this._imgFailed;

    return html`
      <span
        class="${window.__uiwc.prefix}-avatar inline-flex items-center justify-center shrink-0 overflow-hidden bg-base-100 text-base-800 font-medium ${sizeClass} ${shapeClass}"
        role="img"
        aria-label=${this.name || 'Avatar'}
      >
        ${showImage
          ? html`<img
              class="w-full h-full object-cover"
              src=${this.src}
              alt=${this.name || ''}
              @error=${() => (this._imgFailed = true)}
            />`
          : html`${this.#initials || ''}`}
      </span>
    `;
  }
}

window.__uiwc.register('avatar', UiAvatar);
// Fixed internal alias so other components can reference it directly in their own
// templates without knowing the runtime prefix — same pattern as ui-icon/ui-spinner.
// A constructor can only be registered once per registry, even under a second name,
// so this needs its own (trivial, behavior-identical) subclass.
if (!customElements.get('uiwc-avatar')) {
  customElements.define('uiwc-avatar', class extends UiAvatar {});
}
