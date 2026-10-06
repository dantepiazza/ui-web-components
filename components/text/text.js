import { LitElement } from 'lit';
import { literal, html as staticHtml } from 'lit/static-html.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const TAGS = {
  h1: literal`h1`,
  h2: literal`h2`,
  h3: literal`h3`,
  h4: literal`h4`,
  p: literal`p`,
  span: literal`span`,
  label: literal`label`,
};

const SIZES = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

const WEIGHTS = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

// Literal classes on purpose: Tailwind's scanner reads raw text, it can't evaluate
// `text-${color}`.
const COLORS = {
  base: 'text-base-900',
  muted: 'text-base-500',
  brand: 'text-brand-900',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * `<ui-text as="h2" size="xl" weight="semibold" color="danger">` — renders the semantic
 * tag given in `as` (h1-h4, p, span, label) with a size/weight scale independent of the
 * tag chosen, so heading level (semantics) and visual size (design) can vary
 * independently. `color` is `base` (default), `muted`, `brand`, `success`, `warning`,
 * `danger` or `info`; the boolean `muted` stays as shorthand for `color="muted"`.
 */
export class UiText extends LitElement {
  static properties = {
    as: { type: String, reflect: true },
    size: { type: String },
    weight: { type: String },
    muted: { type: Boolean, reflect: true },
    color: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.as = 'p';
    this.size = 'md';
    this.weight = 'normal';
    this.muted = false;
    this.color = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  render() {
    const tag = TAGS[this.as] || TAGS.p;
    const sizeClass = SIZES[this.size] || SIZES.md;
    const weightClass = WEIGHTS[this.weight] || WEIGHTS.normal;
    const colorClass = COLORS[this.color] || (this.muted ? COLORS.muted : COLORS.base);

    return staticHtml`<${tag} class="${window.__uiwc.prefix}-text ${sizeClass} ${weightClass} ${colorClass}">${unsafeHTML(this._content || '')}</${tag}>`;
  }
}

window.__uiwc.register('text', UiText);
