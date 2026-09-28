import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const TONES = {
  neutral: 'bg-base-100 text-base-700',
  accent: 'bg-brand-900 text-brand-fg',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};

/**
 * `<ui-stat-card icon="users" label="Postulantes" value="1.284" trend="+12%" trend-dir="up" tone="accent">`
 * — dashboard KPI tile: icon badge + trend pill on top, big value, label below.
 * Migrated from panel-assets' `.stat-card` (candidate #1 from the comparison pass).
 */
export class UiStatCard extends LitElement {
  static properties = {
    icon: { type: String },
    label: { type: String },
    value: { type: String },
    trend: { type: String },
    trendDir: { type: String, attribute: 'trend-dir' },
    tone: { type: String, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.icon = '';
    this.label = '';
    this.value = '';
    this.trend = '';
    this.trendDir = 'up';
    this.tone = 'neutral';
  }

  render() {
    const toneClass = TONES[this.tone] || TONES.neutral;
    const trendClass = this.trendDir === 'down' ? 'text-danger' : 'text-success';

    return html`
      <div class="${window.__uiwc.prefix}-stat-card rounded border border-base-200 bg-surface p-4">
        <div class="mb-3 flex items-center justify-between">
          ${this.icon
            ? html`<span class="flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}"><uiwc-icon name=${this.icon} size="sm"></uiwc-icon></span>`
            : html`<span></span>`}
          ${this.trend ? html`<span class="text-xs font-semibold ${trendClass}">${this.trend}</span>` : ''}
        </div>
        <div class="text-2xl font-semibold text-base-900">${this.value}</div>
        <div class="text-sm text-base-500">${this.label}</div>
      </div>
    `;
  }
}

window.__uiwc.register('stat-card', UiStatCard);
