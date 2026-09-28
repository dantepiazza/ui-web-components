import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * `<ui-calendar value="2026-09-04">` — month grid, click a day to select. Also used
 * internally by `<ui-date-picker>`. Emits `ui-change` with `{ value }` (ISO date).
 */
export class UiCalendar extends LitElement {
  static properties = {
    value: { type: String },
    min: { type: String },
    max: { type: String },
    _viewYear: { state: true },
    _viewMonth: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.min = '';
    this.max = '';
    const base = this.value ? new Date(`${this.value}T00:00:00`) : new Date();
    this._viewYear = base.getFullYear();
    this._viewMonth = base.getMonth();
  }

  #changeMonth(delta) {
    let month = this._viewMonth + delta;
    let year = this._viewYear;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    this._viewMonth = month;
    this._viewYear = year;
  }

  #select(date) {
    this.value = toISODate(date);
    this.dispatchEvent(new CustomEvent('ui-change', { bubbles: true, composed: true, detail: { value: this.value } }));
  }

  #isDisabled(iso) {
    return (this.min && iso < this.min) || (this.max && iso > this.max);
  }

  render() {
    const first = new Date(this._viewYear, this._viewMonth, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(this._viewYear, this._viewMonth + 1, 0).getDate();
    const todayISO = toISODate(new Date());

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(this._viewYear, this._viewMonth, d));

    return html`
      <div class="${window.__uiwc.prefix}-calendar w-64 select-none">
        <div class="flex items-center justify-between mb-2">
          <button type="button" class="rounded p-1 text-base-500 hover:bg-base-50" aria-label="Mes anterior" @click=${() => this.#changeMonth(-1)}>
            <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(90deg)"></uiwc-icon>
          </button>
          <span class="text-sm font-medium text-base-900 capitalize">${MONTHS[this._viewMonth]} ${this._viewYear}</span>
          <button type="button" class="rounded p-1 text-base-500 hover:bg-base-50" aria-label="Mes siguiente" @click=${() => this.#changeMonth(1)}>
            <uiwc-icon name="chevron-down" size="sm" style="transform:rotate(-90deg)"></uiwc-icon>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-y-1 text-center text-xs text-base-400 mb-1">
          ${WEEKDAYS.map((w) => html`<span>${w}</span>`)}
        </div>
        <div class="grid grid-cols-7 gap-y-1 text-center">
          ${cells.map((date) => {
            if (!date) return html`<span></span>`;
            const iso = toISODate(date);
            const disabled = this.#isDisabled(iso);
            const selected = iso === this.value;
            const isToday = iso === todayISO;
            return html`
              <button
                type="button"
                class="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm disabled:opacity-30 disabled:pointer-events-none
                  ${selected ? 'bg-base-900 text-white' : isToday ? 'text-base-900 font-semibold' : 'text-base-900 hover:bg-base-50'}"
                ?disabled=${disabled}
                @click=${() => this.#select(date)}
              >
                ${date.getDate()}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('calendar', UiCalendar);
