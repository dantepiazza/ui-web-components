import { LitElement, html, svg } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const SIZES = { sm: 'h-4 w-5', md: 'h-5 w-7', lg: 'h-7 w-10' };

// DEUDA: emoji de bandera regional-indicator no renderiza como imagen en Windows
// (Chrome/Edge muestran las dos letras del código, no el emoji real) — por eso se
// migró a SVG inline por país, mismo patrón que ui-icon. De momento solo AR tiene su
// SVG a modo de referencia; el resto de los países sigue cayendo al emoji (que en
// Windows se ve como texto). Sumar más países acá a medida que se necesiten — no vale
// la pena dibujar los ~195 a mano de una sola vez.
const FLAGS = {
  AR: svg`
    <rect width="24" height="16" fill="#74acdf" />
    <rect y="5.33" width="24" height="5.33" fill="#fff" />
    <circle cx="12" cy="8" r="2" fill="#f6b40e" stroke="#85340a" stroke-width="0.3" />
  `,
};

function toFlagEmoji(countryCode) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const base = 0x1f1e6;
  return [...code].map((c) => String.fromCodePoint(base + (c.charCodeAt(0) - 65))).join('');
}

/**
 * `<ui-flag country="AR">` — country flag from an ISO 3166-1 alpha-2 code. Renders an
 * inline SVG for countries in the built-in set (accurate, no font/OS dependency);
 * falls back to the native emoji flag for everything else (works on most platforms,
 * but shows as plain text on Windows browsers — see the FLAGS comment above).
 */
export class UiFlag extends LitElement {
  static properties = {
    country: { type: String, reflect: true },
    size: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.country = '';
    this.size = 'md';
  }

  render() {
    const code = this.country.trim().toUpperCase();
    const sizeClass = SIZES[this.size] || SIZES.md;
    const svgFlag = FLAGS[code];

    if (svgFlag) {
      return html`
        <svg
          class="${window.__uiwc.prefix}-flag ${sizeClass} inline-block shrink-0 rounded-sm"
          viewBox="0 0 24 16"
          role="img"
          aria-label="Bandera de ${code}"
        >
          ${svgFlag}
        </svg>
      `;
    }

    const emoji = toFlagEmoji(this.country);
    if (!emoji) {
      console.warn(`ui-flag: "${this.country}" no es un código ISO 3166-1 alpha-2 válido`);
      return html``;
    }

    const emojiSizeClass = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' }[this.size] || 'text-xl';
    return html`<span class="${window.__uiwc.prefix}-flag ${emojiSizeClass} leading-none" role="img" aria-label="Bandera de ${code}">${emoji}</span>`;
  }
}

window.__uiwc.register('flag', UiFlag);
