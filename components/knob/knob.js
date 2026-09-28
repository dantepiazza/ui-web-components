import { LitElement, html, svg } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-knob value="40" min="0" max="100" size="80">` — circular drag-to-set control.
 * Drag, or focus it and use arrow keys / Home / End. Emits `ui-input` with `{ value }`.
 */
export class UiKnob extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    size: { type: Number },
    disabled: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.value = 0;
    this.min = 0;
    this.max = 100;
    this.size = 80;
    this.disabled = false;
    this._id = `ui-knob-${++idCounter}`;
  }

  #setFromPercent(pct) {
    const clamped = Math.min(1, Math.max(0, pct));
    const next = Math.round(this.min + clamped * (this.max - this.min));
    if (next === this.value) return;
    this.value = next;
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  #handlePointerDown(e) {
    if (this.disabled) return;
    e.preventDefault();
    const track = e.currentTarget;
    track.setPointerCapture(e.pointerId);
    const update = (evt) => {
      const rect = track.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // 0deg at bottom (270deg in standard math angle), sweeping clockwise 270°
      let angle = Math.atan2(evt.clientX - cx, cy - evt.clientY) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const sweep = 270;
      const startOffset = -135;
      let normalized = angle + 180 - (startOffset + 180);
      normalized = ((normalized % 360) + 360) % 360;
      this.#setFromPercent(normalized / sweep);
    };
    update(e);
    const onMove = (evt) => update(evt);
    const onUp = () => {
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
    };
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
  }

  #handleKeydown(e) {
    if (this.disabled) return;
    const step = (this.max - this.min) / 100 || 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.value = Math.min(this.max, this.value + step);
      this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      this.value = Math.max(this.min, this.value - step);
      this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: this.value } }));
    } else if (e.key === 'Home') {
      this.value = this.min;
    } else if (e.key === 'End') {
      this.value = this.max;
    }
  }

  render() {
    const pct = (this.value - this.min) / (this.max - this.min);
    const sweep = 270;
    const startAngle = -225;
    const r = 40;
    const circumference = 2 * Math.PI * r * (sweep / 360);
    const dashOffset = circumference * (1 - pct);

    return html`
      <div class="${window.__uiwc.prefix}-knob inline-flex flex-col items-center gap-1.5">
        <div
          class="relative cursor-pointer touch-none"
          style="width:${this.size}px;height:${this.size}px"
          role="slider"
          tabindex=${this.disabled ? -1 : 0}
          aria-label=${this.label || 'Knob'}
          aria-valuemin=${this.min}
          aria-valuemax=${this.max}
          aria-valuenow=${this.value}
          @pointerdown=${this.#handlePointerDown}
          @keydown=${this.#handleKeydown}
        >
          <svg viewBox="0 0 100 100" class="${this.disabled ? 'opacity-50' : ''}">
            ${svg`<circle cx="50" cy="50" r="${r}" fill="none" class="stroke-base-200" stroke-width="8"
              stroke-dasharray="${circumference} 999"
              stroke-dashoffset="0"
              transform="rotate(${startAngle} 50 50)"
              stroke-linecap="round" />
            <circle cx="50" cy="50" r="${r}" fill="none" class="stroke-base-900" stroke-width="8"
              stroke-dasharray="${circumference} 999"
              stroke-dashoffset="${dashOffset}"
              transform="rotate(${startAngle} 50 50)"
              stroke-linecap="round" />`}
          </svg>
          <div class="absolute inset-0 flex items-center justify-center text-sm font-semibold text-base-900">${this.value}</div>
        </div>
        ${this.label ? html`<span class="text-xs text-base-500">${this.label}</span>` : ''}
      </div>
    `;
  }
}

window.__uiwc.register('knob', UiKnob);
