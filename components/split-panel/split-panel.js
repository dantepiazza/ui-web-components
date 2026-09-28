window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-split-panel split="40" orientation="horizontal">` wrapping exactly two
 * `<ui-split-pane>` children — resizable two-pane layout with a draggable divider.
 * Plain custom element: panes keep their live content, only sizes are managed.
 * Emits `ui-split-resize` with `{ split }` (percent of the first pane) while dragging.
 */
export class UiSplitPanel extends HTMLElement {
  static get observedAttributes() {
    return ['split'];
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const panes = [...this.querySelectorAll(`${window.__uiwc.prefix}-split-pane`)];
    if (panes.length !== 2) {
      console.warn('ui-split-panel: se esperan exactamente dos <ui-split-pane> hijos');
      return;
    }
    this._panes = panes;

    const vertical = this.getAttribute('orientation') === 'vertical';
    this._vertical = vertical;

    this.classList.add('flex', vertical ? 'flex-col' : 'flex-row', 'w-full');
    if (!this.style.height) this.classList.add('h-96');

    const divider = document.createElement('div');
    divider.className =
      `${window.__uiwc.prefix}-split-divider shrink-0 bg-base-200 hover:bg-base-400 transition-colors ` +
      (vertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize');
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
    divider.tabIndex = 0;
    divider.addEventListener('mousedown', (e) => this.#startDrag(e));
    divider.addEventListener('keydown', (e) => this.#handleKeydown(e));
    this._divider = divider;

    panes[0].after(divider);
    this.#applySplit(Number(this.getAttribute('split')) || 50);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'split' && this._panes && oldVal !== null) this.#applySplit(Number(newVal) || 50);
  }

  #applySplit(percent) {
    const clamped = Math.min(90, Math.max(10, percent));
    this._panes[0].style.flex = `0 0 ${clamped}%`;
    this._panes[1].style.flex = '1 1 0%';
    this._split = clamped;
  }

  #startDrag(e) {
    e.preventDefault();
    this._dragging = true;
    this._divider.classList.add('!bg-base-500');
    const onMove = (moveEvent) => {
      const rect = this.getBoundingClientRect();
      const pos = this._vertical ? moveEvent.clientY - rect.top : moveEvent.clientX - rect.left;
      const size = this._vertical ? rect.height : rect.width;
      const percent = (pos / size) * 100;
      this.#applySplit(percent);
      this.dispatchEvent(new CustomEvent('ui-split-resize', { bubbles: true, composed: true, detail: { split: this._split } }));
    };
    const onUp = () => {
      this._dragging = false;
      this._divider.classList.remove('!bg-base-500');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  #handleKeydown(e) {
    const step = 5;
    if ((!this._vertical && e.key === 'ArrowLeft') || (this._vertical && e.key === 'ArrowUp')) {
      e.preventDefault();
      this.#applySplit(this._split - step);
    } else if ((!this._vertical && e.key === 'ArrowRight') || (this._vertical && e.key === 'ArrowDown')) {
      e.preventDefault();
      this.#applySplit(this._split + step);
    }
  }
}

window.__uiwc.register('split-panel', UiSplitPanel);
