import { LitElement, html, svg } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-chart type="bar">` with `.data = [{ label, value }, ...]` set as a JS property —
 * minimal inline-SVG chart with no external charting library. v1: bar and line, no
 * legends/tooltips/animation yet.
 */
export class UiChart extends LitElement {
  static properties = {
    type: { type: String, reflect: true },
    data: { type: Array },
    height: { type: Number },
    color: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.type = 'bar';
    this.data = [];
    this.height = 200;
    this.color = ''; // empty = inherit the brand colour (currentColor)
  }

  render() {
    if (!this.data.length) {
      return html`<div class="${window.__uiwc.prefix}-chart flex items-center justify-center text-sm text-base-400" style="height:${this.height}px">Sin datos</div>`;
    }

    const width = 400;
    const padding = 24;
    const max = Math.max(...this.data.map((d) => d.value), 1);
    const innerW = width - padding * 2;
    const innerH = this.height - padding * 2;
    const stepX = innerW / Math.max(1, this.data.length - (this.type === 'line' ? 1 : 0));

    const paint = this.color || 'currentColor';
    let body;
    if (this.type === 'line') {
      const points = this.data.map((d, i) => {
        const x = padding + i * stepX;
        const y = padding + innerH - (d.value / max) * innerH;
        return [x, y];
      });
      const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
      body = svg`
        <path d="${path}" fill="none" stroke="${paint}" stroke-width="2" />
        ${points.map(([x, y]) => svg`<circle cx="${x}" cy="${y}" r="3" fill="${paint}" />`)}
      `;
    } else {
      const barW = (innerW / this.data.length) * 0.6;
      body = svg`
        ${this.data.map((d, i) => {
          const barH = (d.value / max) * innerH;
          const x = padding + i * stepX + (stepX - barW) / 2;
          const y = padding + innerH - barH;
          return svg`<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${paint}" />`;
        })}
      `;
    }

    return html`
      <div class="${window.__uiwc.prefix}-chart text-brand-900">
        <svg viewBox="0 0 ${width} ${this.height}" style="width:100%;height:${this.height}px" role="img" aria-label="Gráfico de ${this.type === 'line' ? 'línea' : 'barras'}">
          <line x1="${padding}" y1="${padding + innerH}" x2="${width - padding}" y2="${padding + innerH}" class="stroke-base-200" />
          ${body}
        </svg>
        <div class="flex justify-between px-1 text-[10px] text-base-400">
          ${this.data.map((d) => html`<span>${d.label}</span>`)}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('chart', UiChart);
