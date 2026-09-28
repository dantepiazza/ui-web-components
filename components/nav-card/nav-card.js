import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const TONES = {
  base: 'bg-base-100 text-base-700',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  violet: 'bg-violet-100 text-violet-700',
  rose: 'bg-rose-100 text-rose-700',
};

const ACCENT_BORDER = {
  base: 'border-l-base-900',
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
  info: 'border-l-info',
  violet: 'border-l-violet-500',
  rose: 'border-l-rose-500',
};

/**
 * `<ui-nav-card icon="users" heading="Gestionar equipo" text="Invitá personas y
 * asigná roles" href="/team" layout="center" tone="info">` — clickable icon+title+text
 * card for CTA/nav grids: shortcut tiles, a settings menu, a feature list. Wraps a
 * real `<a>` (if `href`) or `<button type="button">` (if not — dispatches
 * `ui-nav-card-action` on click) inside, same reasoning as `<ui-button>`: native
 * keyboard activation and focus, not a `div` with a click listener bolted on.
 *
 * `layout`:
 *   - `"row"` (default) — icon left, title+text stacked, trailing arrow that
 *     nudges on hover.
 *   - `"center"` — icon on top, everything centered, card lifts on hover.
 *   - `"inline"` — small icon next to the title, text below, a `cta` link line
 *     at the bottom.
 *   - `"tile"` — icon + title only (no `text`) — dense shortcut grids.
 *   - `"accent"` — a colored left border instead of a tinted icon box.
 *
 * `tone` colors the icon box (and the border in `"accent"`) — `base`/`success`/
 * `warning`/`danger`/`info` are the library's semantic tokens, `violet`/`rose` are
 * literal picks (same idea as `ui-badge`'s `variant`).
 */
export class UiNavCard extends LitElement {
  static properties = {
    icon: { type: String },
    heading: { type: String },
    text: { type: String },
    href: { type: String },
    layout: { type: String, reflect: true },
    tone: { type: String, reflect: true },
    cta: { type: String },
    removeClass: { type: String, attribute: 'remove-class' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.icon = '';
    this.heading = '';
    this.text = '';
    this.href = '';
    this.layout = 'row';
    this.tone = 'base';
    this.cta = 'Ver más';
    this.removeClass = '';
  }

  #action() {
    if (this.href) return;
    this.dispatchEvent(new CustomEvent('ui-nav-card-action', { bubbles: true, composed: true }));
  }

  #iconBox(size) {
    if (!this.icon) return '';
    const toneClass = TONES[this.tone] || TONES.base;
    return html`
      <span class="flex shrink-0 items-center justify-center rounded ${toneClass} ${size}">
        <uiwc-icon name=${this.icon} size="sm"></uiwc-icon>
      </span>
    `;
  }

  #content() {
    if (this.layout === 'center') {
      return html`
        <div class="flex flex-col items-center gap-3 p-6 text-center">
          ${this.#iconBox('h-11 w-11')}
          <div>
            <h3 class="text-[14.5px] font-bold text-base-900">${this.heading}</h3>
            ${this.text ? html`<p class="mt-1 text-[12.5px] leading-relaxed text-base-500">${this.text}</p>` : ''}
          </div>
        </div>
      `;
    }
    if (this.layout === 'inline') {
      return html`
        <div class="p-4">
          <div class="mb-1.5 flex items-center gap-2.5">
            ${this.#iconBox('h-7 w-7')}
            <h3 class="text-[13.5px] font-bold text-base-900">${this.heading}</h3>
          </div>
          ${this.text ? html`<p class="mb-3 text-xs leading-relaxed text-base-500">${this.text}</p>` : ''}
          <span class="inline-flex items-center gap-1 text-xs font-semibold text-base-900">
            ${this.cta}
            <uiwc-icon name="chevron-right" size="sm" class="transition-transform group-hover:translate-x-1"></uiwc-icon>
          </span>
        </div>
      `;
    }
    if (this.layout === 'tile') {
      return html`
        <div class="flex flex-col items-center gap-2.5 p-4 text-center">
          ${this.#iconBox('h-9 w-9')}
          <strong class="text-[12.5px] font-semibold text-base-900">${this.heading}</strong>
        </div>
      `;
    }
    if (this.layout === 'accent') {
      return html`
        <div class="flex gap-3.5 p-4">
          ${this.#iconBox('h-9 w-9')}
          <div class="min-w-0">
            <strong class="block text-[13.5px] font-bold text-base-900">${this.heading}</strong>
            ${this.text ? html`<span class="text-xs text-base-500">${this.text}</span>` : ''}
          </div>
        </div>
      `;
    }
    // row (default)
    return html`
      <div class="flex items-center gap-3.5 p-4">
        ${this.#iconBox('h-10 w-10')}
        <div class="min-w-0 flex-1">
          <strong class="block text-[13.5px] font-bold text-base-900">${this.heading}</strong>
          ${this.text ? html`<span class="text-xs text-base-500">${this.text}</span>` : ''}
        </div>
        <uiwc-icon
          name="chevron-right"
          size="sm"
          class="shrink-0 text-base-300 transition-transform group-hover:translate-x-1 group-hover:text-base-900"
        ></uiwc-icon>
      </div>
    `;
  }

  render() {
    const wanted = [
      `${window.__uiwc.prefix}-nav-card`,
      'group', 'block', 'w-full', 'appearance-none', 'text-left', 'no-underline',
      'rounded', 'border', 'border-base-200', 'bg-surface', 'text-base-900',
      'transition-colors', 'hover:border-base-300', 'hover:bg-base-50',
      this.layout === 'accent' ? `border-l-[3px] ${ACCENT_BORDER[this.tone] || ACCENT_BORDER.base}` : '',
      this.layout === 'center' ? 'transition-transform hover:-translate-y-0.5 hover:shadow-md' : '',
    ];
    const cls = window.__uiwc.classes(wanted, this).join(' ');
    const content = this.#content();

    return this.href
      ? html`<a href=${this.href} class="${cls}">${content}</a>`
      : html`<button type="button" @click=${this.#action} class="${cls} cursor-pointer">${content}</button>`;
  }
}

window.__uiwc.register('nav-card', UiNavCard);
