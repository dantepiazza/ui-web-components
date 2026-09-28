import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-banner-card icon="zap" heading="Probá el modo oscuro" text="Se activa con un
 * atributo, cero configuración" button-label="Activar" href="/settings/theme">` —
 * dark promo banner: icon badge, heading/text, and a button. Uses `--ui-base-*`
 * (not a literal color), so it re-themes with whatever `base`/`brand` the consumer
 * sets — a neutral dark strip, not tied to one hardcoded palette.
 *
 * Not clickable as a whole card — only the button acts (real `<a>` if `href` is set,
 * otherwise a `<button>` that dispatches `ui-banner-action`). That's the difference
 * from `<ui-nav-card>`: a banner has one specific action, a nav card IS the link.
 */
export class UiBannerCard extends LitElement {
  static properties = {
    icon: { type: String },
    heading: { type: String },
    text: { type: String },
    buttonLabel: { type: String, attribute: 'button-label' },
    href: { type: String },
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
    this.buttonLabel = '';
    this.href = '';
    this.removeClass = '';
  }

  #action() {
    this.dispatchEvent(new CustomEvent('ui-banner-action', { bubbles: true, composed: true }));
  }

  render() {
    const wanted = [
      `${window.__uiwc.prefix}-banner-card`,
      'flex', 'items-center', 'gap-4', 'rounded', 'border', 'border-base-900',
      'bg-gradient-to-br', 'from-base-900', 'to-base-800', 'p-5',
    ];
    const cls = window.__uiwc.classes(wanted, this).join(' ');
    const btnClass =
      'shrink-0 whitespace-nowrap rounded border-0 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-base-900 cursor-pointer no-underline';

    return html`
      <div class="${cls}">
        ${this.icon
          ? html`<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-white/10 text-white">
              <uiwc-icon name=${this.icon} size="md"></uiwc-icon>
            </span>`
          : ''}
        <div class="min-w-0 flex-1">
          <strong class="block text-[14.5px] font-bold text-white">${this.heading}</strong>
          ${this.text ? html`<span class="mt-0.5 block text-[12.5px] text-white/65">${this.text}</span>` : ''}
        </div>
        ${this.buttonLabel
          ? this.href
            ? html`<a href=${this.href} class="${btnClass}">${this.buttonLabel}</a>`
            : html`<button type="button" @click=${this.#action} class="${btnClass}">${this.buttonLabel}</button>`
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('banner-card', UiBannerCard);
