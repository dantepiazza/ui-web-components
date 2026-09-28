window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-stepper><ui-step label="Datos" active>...</ui-step><ui-step label="Pago">...</ui-step></ui-stepper>`
 * — numbered step indicator + content panels, same "don't capture live children"
 * reasoning as `<ui-tabs>`. Steps before the active one show a checkmark.
 * Emits `ui-stepper-change` with `{ index }`.
 */
export class UiStepper extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const steps = [...this.querySelectorAll(`${window.__uiwc.prefix}-step`)];
    if (!steps.length) return;
    this._steps = steps;

    const activeIndex = Math.max(0, steps.findIndex((s) => s.hasAttribute('active')));

    const header = document.createElement('div');
    header.className = `${window.__uiwc.prefix}-stepper-header mb-6 flex items-center`;

    this._circles = steps.map((step, i) => {
      const wrap = document.createElement('div');
      wrap.className = `flex items-center ${i === steps.length - 1 ? 'flex-none' : 'flex-1'}`;

      const circleBtn = document.createElement('button');
      circleBtn.type = 'button';
      circleBtn.className =
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 text-sm font-semibold cursor-pointer';
      circleBtn.addEventListener('click', () => this.#select(i));

      const label = document.createElement('span');
      label.textContent = step.getAttribute('label') || '';
      label.className = 'ml-2 mr-3 whitespace-nowrap text-sm';

      const line = document.createElement('span');
      line.className = 'h-0.5 flex-1 bg-base-200';

      wrap.append(circleBtn, label);
      if (i < steps.length - 1) wrap.appendChild(line);
      header.appendChild(wrap);
      return { circleBtn, label, line };
    });

    this.prepend(header);
    this.#select(activeIndex, false);
  }

  #select(index, emit = true) {
    this._activeIndex = index;
    this._steps.forEach((step, i) => step.toggleAttribute('active', i === index));
    this._circles.forEach(({ circleBtn, label, line }, i) => {
      const state = i < index ? 'done' : i === index ? 'active' : 'upcoming';
      circleBtn.className = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 text-sm font-semibold cursor-pointer ${
        state === 'upcoming' ? 'bg-base-100 text-base-500' : 'bg-brand-900 text-brand-fg'
      }`;
      circleBtn.innerHTML =
        state === 'done'
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
          : String(i + 1);
      label.className = `ml-2 mr-3 whitespace-nowrap text-sm ${
        state === 'upcoming' ? 'text-base-400' : 'text-base-900'
      } ${state === 'active' ? 'font-semibold' : 'font-medium'}`;
      if (line) line.className = `h-0.5 flex-1 ${i < index ? 'bg-brand-900' : 'bg-base-200'}`;
    });
    if (emit) this.dispatchEvent(new CustomEvent('ui-stepper-change', { bubbles: true, composed: true, detail: { index } }));
  }

  next() {
    if (this._activeIndex < this._steps.length - 1) this.#select(this._activeIndex + 1);
  }

  back() {
    if (this._activeIndex > 0) this.#select(this._activeIndex - 1);
  }
}

window.__uiwc.register('stepper', UiStepper);
