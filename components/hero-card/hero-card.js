import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

// Cada tono es una paleta LITERAL (como el `variant` de ui-badge), no un token de tema
// — pero cada uno trae su propio par claro/oscuro vía el modificador `dark:` de
// Tailwind (que ya está habilitado con `darkMode: 'class'`), así la card se invierte
// sola con `class="dark"` en el <html> sin que el componente tenga que escuchar nada.
const TONES = {
  indigo: {
    card: 'from-slate-900 via-indigo-950 to-slate-900 border-slate-800 dark:from-indigo-50 dark:via-white dark:to-indigo-50 dark:border-indigo-200',
    glow: 'bg-indigo-500/20 dark:bg-indigo-400/30',
    icon: 'bg-blue-500/20 border-blue-400/30 text-indigo-300 dark:bg-indigo-600/10 dark:border-indigo-300 dark:text-indigo-700',
    heading: 'text-white dark:text-indigo-950',
    text: 'text-slate-300 dark:text-indigo-900/70',
    button: 'bg-white text-slate-900 dark:bg-indigo-950 dark:text-white',
  },
  emerald: {
    card: 'from-emerald-950 via-slate-900 to-emerald-950 border-emerald-900 dark:from-emerald-50 dark:via-white dark:to-emerald-50 dark:border-emerald-200',
    glow: 'bg-emerald-500/20 dark:bg-emerald-400/30',
    icon: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300 dark:bg-emerald-600/10 dark:border-emerald-300 dark:text-emerald-700',
    heading: 'text-white dark:text-emerald-950',
    text: 'text-slate-300 dark:text-emerald-900/70',
    button: 'bg-white text-slate-900 dark:bg-emerald-950 dark:text-white',
  },
  amber: {
    card: 'from-amber-950 via-slate-900 to-amber-950 border-amber-900 dark:from-amber-50 dark:via-white dark:to-amber-50 dark:border-amber-200',
    glow: 'bg-amber-500/20 dark:bg-amber-400/30',
    icon: 'bg-amber-500/20 border-amber-400/30 text-amber-300 dark:bg-amber-600/10 dark:border-amber-300 dark:text-amber-700',
    heading: 'text-white dark:text-amber-950',
    text: 'text-slate-300 dark:text-amber-900/70',
    button: 'bg-white text-slate-900 dark:bg-amber-950 dark:text-white',
  },
  rose: {
    card: 'from-rose-950 via-slate-900 to-rose-950 border-rose-900 dark:from-rose-50 dark:via-white dark:to-rose-50 dark:border-rose-200',
    glow: 'bg-rose-500/20 dark:bg-rose-400/30',
    icon: 'bg-rose-500/20 border-rose-400/30 text-rose-300 dark:bg-rose-600/10 dark:border-rose-300 dark:text-rose-700',
    heading: 'text-white dark:text-rose-950',
    text: 'text-slate-300 dark:text-rose-900/70',
    button: 'bg-white text-slate-900 dark:bg-rose-950 dark:text-white',
  },
};

/**
 * `<ui-hero-card tone="indigo" icon="pi pi-code" heading="Desplegá una app" text="..."
 * button-label="Instalar aplicación" href="/apps">` — big promo/CTA card: gradient
 * background, blurred glow, icon badge, heading, text, button. `tone` picks the color
 * family (`indigo` | `emerald` | `amber` | `rose`).
 *
 * Auto-inverts with the page theme: a dark gradient on a light page (default), and a
 * LIGHT version of the same tone on a dark page (`class="dark"` on `<html>`, what
 * `ui-theme-toggle` sets) — it always reads as the brighter thing on the page, never
 * the same fixed look regardless of theme.
 *
 * The whole card is the link (`href`) — like `<ui-banner-card>` but promo-sized and
 * always clickable as one unit, not just its button.
 */
export class UiHeroCard extends LitElement {
  static properties = {
    icon: { type: String },
    heading: { type: String },
    text: { type: String },
    buttonLabel: { type: String, attribute: 'button-label' },
    href: { type: String },
    tone: { type: String, reflect: true },
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
    this.tone = 'indigo';
    this.removeClass = '';
  }

  render() {
    const t = TONES[this.tone] || TONES.indigo;
    const wanted = [
      `${window.__uiwc.prefix}-hero-card`,
      'group', 'relative', 'block', 'overflow-hidden', 'no-underline',
      'rounded', 'border', 'p-6', 'shadow-md', 'min-h-[220px]', 'flex', 'flex-col', 'justify-between',
      'bg-gradient-to-br',
      ...t.card.split(' '),
    ];
    const cls = window.__uiwc.classes(wanted, this).join(' ');

    const content = html`
      <div
        class="absolute -bottom-6 -right-6 h-36 w-36 rounded-full blur-2xl transition-transform duration-300 group-hover:scale-110 ${t.glow}"
      ></div>
      <div class="relative z-10 flex flex-col gap-3">
        ${this.icon
          ? html`<span class="flex h-10 w-10 items-center justify-center rounded border ${t.icon}">
              <uiwc-icon name=${this.icon} size="md"></uiwc-icon>
            </span>`
          : ''}
        <h3 class="text-[17px] font-bold ${t.heading}">${this.heading}</h3>
        ${this.text ? html`<p class="text-[13px] leading-relaxed ${t.text}">${this.text}</p>` : ''}
      </div>
      ${this.buttonLabel
        ? html`<span class="relative z-10 mt-5 inline-flex w-fit rounded px-4 py-2 text-[12.5px] font-semibold ${t.button}"
            >${this.buttonLabel}</span
          >`
        : ''}
    `;

    return this.href ? html`<a href=${this.href} class="${cls}">${content}</a>` : html`<div class="${cls}">${content}</div>`;
  }
}

window.__uiwc.register('hero-card', UiHeroCard);
