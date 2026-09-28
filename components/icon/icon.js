import { LitElement, html, svg } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

// Minimal built-in icon set (stroke-based, 24x24 viewBox). Add entries here as needed.
const ICONS = {
  check: svg`<path d="M20 6 9 17l-5-5" />`,
  x: svg`<path d="M18 6 6 18M6 6l12 12" />`,
  'chevron-down': svg`<path d="m6 9 6 6 6-6" />`,
  'chevron-up': svg`<path d="m18 15-6-6-6 6" />`,
  'chevron-left': svg`<path d="m15 18-6-6 6-6" />`,
  'chevron-right': svg`<path d="m9 18 6-6-6-6" />`,
  info: svg`<path d="M12 16v-4M12 8h.01" /><circle cx="12" cy="12" r="9" />`,
  star: svg`<path d="m12 3 2.9 6.1 6.6.7-5 4.5 1.4 6.5L12 17.6 5.9 20.8l1.5-6.5-5-4.5 6.6-.7Z" />`,
  heart: svg`<path d="M12 20.5S3.5 15 3.5 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.5 2.8c0 6.2-8.5 11.7-8.5 11.7Z" />`,
  spinner: svg`<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />`,
  copy: svg`<rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
  search: svg`<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />`,
  eye: svg`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />`,
  'eye-off': svg`<path d="M9.9 4.24A9.4 9.4 0 0 1 12 4c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.16 3.19M6.6 6.6C3.7 8.5 2 11 2 11s3.5 7 10 7a9.5 9.5 0 0 0 5.4-1.6M2 2l20 20" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />`,
  upload: svg`<path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" />`,
  download: svg`<path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />`,
  home: svg`<path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" />`,
  user: svg`<circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />`,
  users: svg`<circle cx="9" cy="8" r="3.2" /><path d="M2.5 21c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4" /><path d="M16.5 8.6a2.6 2.6 0 1 1 0 5.1" /><path d="M21.5 21c0-2.6-1.8-4.4-4.5-5" />`,
  settings: svg`<circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V19a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0A1.7 1.7 0 0 0 10.2 3V3a2 2 0 1 1 4 0v.2c0 .7.4 1.3 1 1.6h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.3.6.9 1 1.6 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" />`,
  trash: svg`<path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" />`,
  edit: svg`<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />`,
  plus: svg`<path d="M12 5v14" /><path d="M5 12h14" />`,
  minus: svg`<path d="M5 12h14" />`,
  menu: svg`<path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />`,
  bell: svg`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />`,
  calendar: svg`<rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />`,
  clock: svg`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />`,
  mail: svg`<rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 6 10 7 10-7" />`,
  phone: svg`<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z" />`,
  lock: svg`<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
  unlock: svg`<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />`,
  filter: svg`<path d="M3 4h18l-7 8v6l-4 2v-8Z" />`,
  'arrow-up': svg`<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />`,
  'arrow-down': svg`<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />`,
  'arrow-left': svg`<path d="M19 12H5" /><path d="m12 19-7-7 7-7" />`,
  'arrow-right': svg`<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />`,
  'external-link': svg`<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" />`,
  refresh: svg`<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />`,
  warning: svg`<path d="M12 3 2 20h20Z" /><path d="M12 9v5" /><path d="M12 17h.01" />`,
  folder: svg`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />`,
  file: svg`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />`,
  image: svg`<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />`,
  link: svg`<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />`,
  'more-horizontal': svg`<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />`,
  'more-vertical': svg`<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />`,
  'map-pin': svg`<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" />`,
  briefcase: svg`<rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M2 13h20" />`,
  tag: svg`<path d="M20.6 12.6 12 21.2a2 2 0 0 1-2.8 0l-7.4-7.4a2 2 0 0 1 0-2.8L10.4 2.4A2 2 0 0 1 12 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-.6 1.4Z" /><circle cx="16.5" cy="7.5" r="1.5" />`,
  bookmark: svg`<path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />`,
  globe: svg`<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />`,
  grid: svg`<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />`,
  list: svg`<path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />`,
  'credit-card': svg`<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />`,
  'log-out': svg`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />`,
  'log-in': svg`<path d="M15 21h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4" /><path d="m8 7-5 5 5 5" /><path d="M3 12h12" />`,
  share: svg`<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-3.9" /><path d="m8.6 13.5 6.8 3.9" />`,
  bold: svg`<path d="M6 4h6a3.5 3.5 0 0 1 0 7H6z" /><path d="M6 11h7a3.5 3.5 0 0 1 0 7H6z" />`,
  italic: svg`<path d="M10 4h6" /><path d="M8 20h6" /><path d="M13 4 9 20" />`,
  underline: svg`<path d="M6 4v6a6 6 0 0 0 12 0V4" /><path d="M4 20h16" />`,
};

/**
 * `<ui-icon name="check">` — inline SVG icon from the built-in set.
 *
 * If `name` doesn't match a built-in icon, it's treated as one or more CSS classes
 * from a third-party icon font already loaded on the page — e.g.
 * `<ui-icon name="pi pi-moon">` (PrimeIcons) or `<ui-icon name="fab fa-instagram">`
 * (Font Awesome). In that case an `<i>` is rendered with those classes instead of an
 * inline SVG, so any icon font works without the library needing to know about it.
 */
export class UiIcon extends LitElement {
  static properties = {
    name: { type: String, reflect: true },
    size: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.name = 'info';
    this.size = 'md';
  }

  render() {
    const path = ICONS[this.name];

    if (path) {
      const sizeClass = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' }[this.size] || 'w-5 h-5';
      return html`
        <svg
          class="${window.__uiwc.prefix}-icon ${sizeClass} shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${path}
        </svg>
      `;
    }

    if (!this.name) {
      console.warn('ui-icon: unknown icon name ""');
      return html``;
    }

    // Not in the built-in set — assume it's a class (or classes) from an icon font
    // (PrimeIcons, Font Awesome, Material Icons, etc.) loaded by the consumer.
    const fontSizeClass = { sm: 'text-base', md: 'text-lg', lg: 'text-xl' }[this.size] || 'text-lg';
    return html`<i class="${window.__uiwc.prefix}-icon ${this.name} ${fontSizeClass}" aria-hidden="true"></i>`;
  }
}

window.__uiwc.register('icon', UiIcon);
// A custom element constructor can only be registered once per registry — even under a
// second name — so the fixed internal alias needs its own (trivial, behavior-identical)
// subclass rather than reusing the UiIcon class directly.
if (!customElements.get('uiwc-icon')) {
  customElements.define('uiwc-icon', class extends UiIcon {});
}
