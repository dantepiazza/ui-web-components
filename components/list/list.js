import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const SIZES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const ICON_SIZES = { sm: 'sm', md: 'sm', lg: 'md' };

// Same idea as `ui-nav-card`'s `tone`: `base`/`brand` ride the theme ramp,
// `success/warning/danger/info` are the flat semantic tokens (opacity
// modifiers instead of a 50-950 ramp).
const COLORS = {
  base: { border: 'border-base-200', dot: 'bg-base-400', icon: 'text-base-500' },
  brand: { border: 'border-brand-200', dot: 'bg-brand-500', icon: 'text-brand-600' },
  success: { border: 'border-success/20', dot: 'bg-success', icon: 'text-success' },
  warning: { border: 'border-warning/20', dot: 'bg-warning', icon: 'text-warning' },
  danger: { border: 'border-danger/20', dot: 'bg-danger', icon: 'text-danger' },
  info: { border: 'border-info/20', dot: 'bg-info', icon: 'text-info' },
};

/**
 * `<ui-list title="Servicios" color="brand" variant="right">` — a `<ul>` where each
 * `<li>` can take its own `icon` (renders a `<ui-icon>` instead of the bullet dot)
 * and `title` (renders a `<strong>` alongside the item's text) — both optional:
 *
 *   <ui-list title="Mi título">
 *     <li icon="pi pi-server" title="Dominio principal">midominio.com</li>
 *     <li>Sin ícono ni título — queda como un bullet + texto plano</li>
 *   </ui-list>
 *
 * `variant="left"` (default) keeps `<strong>título</strong> texto` together on the
 * left; `variant="right"` splits the row (`justify-between`): the text stays left,
 * the `<strong>` moves to the right — a "label ... value" row. `color` sets the
 * divider between rows and the icon/dot tint (`base`/`brand`/`success`/`warning`/
 * `danger`/`info`). `size` scales the row text (`sm`/`md`/`lg`).
 */
export class UiList extends LitElement {
  static properties = {
    title: { type: String },
    size: { type: String, reflect: true },
    color: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    removeClass: { type: String, attribute: 'remove-class' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.title = '';
    this.size = 'md';
    this.color = 'base';
    this.variant = 'left';
    this.removeClass = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }

  // Reads the raw <li icon="..." title="...">text</li> children captured before
  // Lit took over, same parsing approach as `ui-breadcrumb`.
  #items() {
    const template = document.createElement('template');
    template.innerHTML = this._content || '';
    return [...template.content.children]
      .filter((el) => el.tagName === 'LI')
      .map((li) => ({
        icon: li.getAttribute('icon') || '',
        title: li.getAttribute('title') || '',
        text: li.innerHTML.trim(),
      }));
  }

  render() {
    const tone = COLORS[this.color] || COLORS.base;
    const sizeClass = SIZES[this.size] || SIZES.md;
    const iconSize = ICON_SIZES[this.size] || 'sm';
    const isRight = this.variant === 'right';

    const wanted = [`${window.__uiwc.prefix}-list`, sizeClass, 'text-base-700'];
    const cls = window.__uiwc.classes(wanted, this).join(' ');

    const rows = this.#items().map(
      ({ icon, title, text }) => html`
        <li class="flex items-center gap-2.5 py-1 ${isRight ? 'justify-between' : ''}">
          ${icon
            ? html`<uiwc-icon name=${icon} size=${iconSize} class="shrink-0 ${tone.icon}"></uiwc-icon>`
            : html`<span class="shrink-0 w-1.5 h-1.5 rounded-full ${tone.dot}"></span>`}
          ${isRight
            ? html`
                <span class="flex-1">${unsafeHTML(text)}</span>
                ${title ? html`<strong class="shrink-0 font-medium text-base-900">${title}</strong>` : ''}
              `
            : html`<span>${title ? html`<strong class="mr-1 font-medium text-base-900">${title}</strong>` : ''}${unsafeHTML(text)}</span>`}
        </li>
      `
    );

    return html`
      ${this.title ? html`<h2 class="block mb-2 text-base font-medium text-base-900">${this.title}</h2>` : ''}
      <ul class="${cls}">
        ${rows}
      </ul>
    `;
  }
}

window.__uiwc.register('list', UiList);
