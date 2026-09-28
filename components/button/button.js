import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

// `variant` picks the SHAPE (solid/tinted/plain/bordered). `color` picks the
// PALETTE (brand/base/success/warning/danger/info) — the two are independent,
// so any shape can be combined with any color (e.g. `variant="outlined"
// color="danger"`, `variant="ghost" color="success"`).
const VARIANTS = {
  primary: 'bg-brand-900 text-brand-fg hover:bg-brand-800 focus-visible:outline-brand-900',
  secondary: 'bg-base-100 text-base-900 hover:bg-base-200 focus-visible:outline-brand-500',
  ghost: 'bg-transparent text-base-900 hover:bg-base-100 focus-visible:outline-brand-500',
  outlined: 'bg-transparent border border-brand-900 text-brand-900 hover:bg-brand-900 hover:text-brand-fg focus-visible:outline-brand-900',
};

// `brand`/`base` ride the full theme ramp (re-themeable via `--ui-*`, see the
// README's "Personalizar colores"); `success/warning/danger/info` are flat
// semantic tokens (single shade + `-fg`), so their shapes lean on opacity
// modifiers (`/10`, `/20`, `/90`) instead of a 50-950 ramp.
//
// Classes are spelled out literally (not built with template strings) on
// purpose: Tailwind's content scanner matches raw text in this file, it
// doesn't evaluate JS — a `bg-${c}-900` would never make it into the CSS.
const COLOR_VARIANTS = {
  brand: {
    primary: 'bg-brand-900 text-brand-fg hover:bg-brand-800 focus-visible:outline-brand-900',
    secondary: 'bg-brand-100 text-brand-900 hover:bg-brand-200 focus-visible:outline-brand-500',
    ghost: 'bg-transparent text-brand-900 hover:bg-brand-100 focus-visible:outline-brand-500',
    outlined: 'bg-transparent border border-brand-900 text-brand-900 hover:bg-brand-900 hover:text-brand-fg focus-visible:outline-brand-900',
  },
  base: {
    primary: 'bg-base-900 text-white hover:bg-base-800 focus-visible:outline-base-900',
    secondary: 'bg-base-100 text-base-900 hover:bg-base-200 focus-visible:outline-base-500',
    ghost: 'bg-transparent text-base-900 hover:bg-base-100 focus-visible:outline-base-500',
    outlined: 'bg-transparent border border-base-300 text-base-900 hover:bg-base-900 hover:text-white focus-visible:outline-base-500',
  },
  success: {
    primary: 'bg-success text-success-fg hover:bg-success/90 focus-visible:outline-success',
    secondary: 'bg-success/10 text-success hover:bg-success/20 focus-visible:outline-success',
    ghost: 'bg-transparent text-success hover:bg-success/10 focus-visible:outline-success',
    outlined: 'bg-transparent border border-success text-success hover:bg-success hover:text-success-fg focus-visible:outline-success',
  },
  warning: {
    primary: 'bg-warning text-warning-fg hover:bg-warning/90 focus-visible:outline-warning',
    secondary: 'bg-warning/10 text-warning hover:bg-warning/20 focus-visible:outline-warning',
    ghost: 'bg-transparent text-warning hover:bg-warning/10 focus-visible:outline-warning',
    outlined: 'bg-transparent border border-warning text-warning hover:bg-warning hover:text-warning-fg focus-visible:outline-warning',
  },
  danger: {
    primary: 'bg-danger text-danger-fg hover:bg-danger/90 focus-visible:outline-danger',
    secondary: 'bg-danger/10 text-danger hover:bg-danger/20 focus-visible:outline-danger',
    ghost: 'bg-transparent text-danger hover:bg-danger/10 focus-visible:outline-danger',
    outlined: 'bg-transparent border border-danger text-danger hover:bg-danger hover:text-danger-fg focus-visible:outline-danger',
  },
  info: {
    primary: 'bg-info text-info-fg hover:bg-info/90 focus-visible:outline-info',
    secondary: 'bg-info/10 text-info hover:bg-info/20 focus-visible:outline-info',
    ghost: 'bg-transparent text-info hover:bg-info/10 focus-visible:outline-info',
    outlined: 'bg-transparent border border-info text-info hover:bg-info hover:text-info-fg focus-visible:outline-info',
  },
};

// `inverted` — force the on-a-DARK-surface treatment regardless of the current
// theme (e.g. a button sitting on the always-dark rail). Fixed literal colours on
// purpose: it must NOT react to light/dark tokens. Not a complementary/hue flip —
// everything collapses toward white and white-alpha, so a themed brand stays itself
// and just reads on dark. Each shape keeps its own look.
const VARIANTS_INVERTED = {
  primary: 'bg-white text-zinc-900 hover:bg-zinc-200 focus-visible:outline-white',
  secondary: 'bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white/70',
  ghost: 'bg-transparent text-white hover:bg-white/10 focus-visible:outline-white/70',
  outlined: 'bg-transparent border border-white text-white hover:bg-white hover:text-zinc-900 focus-visible:outline-white',
};

// `inverted` + a semantic `color` — same idea, but keeps the hue legible
// (literal saturated shades) instead of collapsing to white/zinc. Same reason
// as above for spelling every class out: the scanner needs literal text.
const INVERTED_COLOR_VARIANTS = {
  danger: {
    primary: 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:outline-rose-400',
    secondary: 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 focus-visible:outline-rose-400',
    ghost: 'bg-transparent text-rose-300 hover:bg-rose-500/10 focus-visible:outline-rose-400',
    outlined: 'bg-transparent border border-rose-400 text-rose-300 hover:bg-rose-500 hover:text-white focus-visible:outline-rose-400',
  },
  success: {
    primary: 'bg-emerald-500 text-white hover:bg-emerald-400 focus-visible:outline-emerald-400',
    secondary: 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 focus-visible:outline-emerald-400',
    ghost: 'bg-transparent text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-emerald-400',
    outlined: 'bg-transparent border border-emerald-400 text-emerald-300 hover:bg-emerald-500 hover:text-white focus-visible:outline-emerald-400',
  },
  warning: {
    primary: 'bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:outline-amber-400',
    secondary: 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 focus-visible:outline-amber-400',
    ghost: 'bg-transparent text-amber-300 hover:bg-amber-500/10 focus-visible:outline-amber-400',
    outlined: 'bg-transparent border border-amber-400 text-amber-300 hover:bg-amber-500 hover:text-amber-950 focus-visible:outline-amber-400',
  },
  info: {
    primary: 'bg-sky-500 text-white hover:bg-sky-400 focus-visible:outline-sky-400',
    secondary: 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30 focus-visible:outline-sky-400',
    ghost: 'bg-transparent text-sky-300 hover:bg-sky-500/10 focus-visible:outline-sky-400',
    outlined: 'bg-transparent border border-sky-400 text-sky-300 hover:bg-sky-500 hover:text-white focus-visible:outline-sky-400',
  },
};

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

// Icon-only sizing (square padding) — used when `icon` is set and there's no
// visible text content, replacing the old standalone `<ui-button-icon>`.
const ICON_ONLY_SIZES = { sm: 'p-1.5', md: 'p-2', lg: 'p-2.5' };
const ICON_SIZES = { sm: 'sm', md: 'sm', lg: 'md' };

/**
 * `<ui-button variant="primary" size="md" icon="check">` — wraps a real `<button>`
 * internally so keyboard activation, focus and form submission work natively without
 * extra JS. Set `icon` to show an icon alongside the text (`icon-position="start"`,
 * the default, or `"end"`); with no visible text content it becomes an icon-only
 * button — set `label` in that case, it becomes the accessible name.
 *
 * `variant` is the SHAPE (`primary` solid / `secondary` tinted / `ghost` plain /
 * `outlined` bordered) and `color` is the PALETTE (`brand`, `base`, `success`,
 * `warning`, `danger`, `info`) — independent axes, so any shape × color combo
 * works (`variant="outlined" color="danger"`). Leaving `color` unset keeps each
 * shape's traditional look (`primary`→brand solid, `secondary`/`ghost`→neutral).
 *
 * Set `href` to render a real `<a>` instead of a `<button>` (same classes/variants) —
 * `target` only has effect when `href` is set (auto `rel="noopener noreferrer"` on
 * `target="_blank"`). `disabled`/`loading` on a link drop the `href` and add
 * `aria-disabled` + `tabindex="-1"` instead (an `<a>` has no native `disabled`).
 */
export class UiButton extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    type: { type: String },
    disabled: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    inverted: { type: Boolean, reflect: true },
    icon: { type: String },
    iconPosition: { type: String, attribute: 'icon-position' },
    label: { type: String },
    href: { type: String },
    target: { type: String },
    color: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'primary';
    this.size = 'md';
    this.type = 'button';
    this.disabled = false;
    this.loading = false;
    this.inverted = false;
    this.icon = '';
    this.iconPosition = 'start';
    this.label = '';
    this.href = '';
    this.target = '';
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
    // Legacy: `variant="danger"` (pre-`color`) keeps working as shape "primary" + color "danger".
    const shape = this.variant === 'danger' ? 'primary' : (VARIANTS[this.variant] ? this.variant : 'primary');
    const color = this.color || (this.variant === 'danger' ? 'danger' : '');

    let variantClass;
    if (color && this.inverted && INVERTED_COLOR_VARIANTS[color]) {
      variantClass = INVERTED_COLOR_VARIANTS[color][shape] || INVERTED_COLOR_VARIANTS[color].primary;
    } else if (color && COLOR_VARIANTS[color]) {
      variantClass = COLOR_VARIANTS[color][shape] || COLOR_VARIANTS[color].primary;
    } else if (this.inverted) {
      variantClass = VARIANTS_INVERTED[shape] || VARIANTS_INVERTED.primary;
    } else {
      variantClass = VARIANTS[shape] || VARIANTS.primary;
    }

    const isDisabled = this.disabled || this.loading;
    const hasText = Boolean(this._content && this._content.trim());
    const iconOnly = Boolean(this.icon) && !hasText;

    if (iconOnly && !this.label) {
      console.warn('ui-button: icono sin texto visible — falta el atributo "label" para el nombre accesible');
    }

    const sizeClass = iconOnly ? ICON_ONLY_SIZES[this.size] || ICON_ONLY_SIZES.md : SIZES[this.size] || SIZES.md;
    // Icon-only: the icon IS the button's content, so it uses the real size scale
    // (1:1 with `size`). Icon next to text: one step smaller than the button size,
    // so it doesn't visually outweigh the label.
    const iconSize = iconOnly ? this.size : ICON_SIZES[this.size] || 'sm';
    const icon = this.icon ? html`<uiwc-icon name=${this.icon} size=${iconSize} class="w-[1.5em] h-[1.5em] aspect-square flex items-center justify-center"></uiwc-icon>` : '';

    const classes = `${window.__uiwc.prefix}-button inline-flex items-center justify-center rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${variantClass} ${sizeClass}`;
    const inner = html`
      ${this.loading ? html`<uiwc-spinner size="sm" label="Cargando"></uiwc-spinner>` : this.iconPosition === 'end' ? '' : icon}
      ${unsafeHTML(this._content || '')}
      ${!this.loading && this.iconPosition === 'end' ? icon : ''}
    `;

    if (this.href) {
      return html`
        <a
          href=${isDisabled ? undefined : this.href}
          target=${this.target || undefined}
          rel=${this.target === '_blank' ? 'noopener noreferrer' : undefined}
          class="${classes} ${isDisabled ? 'opacity-50 pointer-events-none' : ''}"
          aria-label=${iconOnly ? this.label : undefined}
          aria-disabled=${isDisabled ? 'true' : undefined}
          tabindex=${isDisabled ? '-1' : undefined}
        >
          ${inner}
        </a>
      `;
    }

    return html`
      <button
        type=${this.type}
        class="${classes}"
        ?disabled=${isDisabled}
        aria-label=${iconOnly ? this.label : undefined}
      >
        ${inner}
      </button>
    `;
  }
}

window.__uiwc.register('button', UiButton);
