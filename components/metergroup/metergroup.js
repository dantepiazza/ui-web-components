import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const VARIANTS = {
  neutral: { bar: 'bg-base-400', dot: 'bg-base-400' },
  primary: { bar: 'bg-base-900', dot: 'bg-base-900' },
  success: { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  warning: { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  danger: { bar: 'bg-rose-500', dot: 'bg-rose-500' },
  info: { bar: 'bg-blue-500', dot: 'bg-blue-500' },
  purple: { bar: 'bg-purple-500', dot: 'bg-purple-500' },
};

/**
 * `<ui-metergroup>` — set `.segments = [{ label, value, variant }]` (percentages,
 * ideally summing to ~100) as a JS property. Renders a single stacked bar plus a
 * legend below, one dot+label per segment. Migrated from panel-assets' `.metergroup`
 * (candidate from the comparison pass).
 */
export class UiMetergroup extends LitElement {
  static properties = {
    segments: { type: Array },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.segments = [];
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-metergroup flex flex-col gap-2.5">
        <div class="flex h-2 w-full overflow-hidden rounded-full bg-base-100">
          ${this.segments.map((s) => {
            const v = VARIANTS[s.variant] || VARIANTS.neutral;
            return html`<span class="${v.bar} h-full" style="width:${s.value}%"></span>`;
          })}
        </div>
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-600">
          ${this.segments.map((s) => {
            const v = VARIANTS[s.variant] || VARIANTS.neutral;
            return html`
              <li class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full ${v.dot}"></span>
                ${s.label} ${s.value}%
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }
}

window.__uiwc.register('metergroup', UiMetergroup);
