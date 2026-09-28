window.__uiwc = window.__uiwc || { prefix: 'ui' };

const SIZES = { sm: 'w-7 h-7 text-sm', md: 'w-9 h-9 text-base', lg: 'w-11 h-11 text-lg' };
const COLORS = {
  base: 'bg-base-100 text-base-700',
  brand: 'bg-brand-900/10 text-brand-900',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};

/**
 * `<ui-thumb color="brand" size="md"><ui-icon name="users"></ui-icon></ui-thumb>`
 * — fixed-size tinted box. Unlike `<ui-avatar>` (owns `src`/initials-fallback logic
 * for a *person*), Thumb doesn't know or care what's inside — an icon, initials typed
 * by hand, an `<img>`, a badge, whatever. It only sizes and tints the box; content is
 * 100% yours. Main use case: an icon on a colored background (a table cell, a list
 * row, a stat card).
 *
 * No wrapper `<div>`, no capture: children render exactly as authored, so a nested
 * `<ui-icon>`/`<ui-spinner>`/anything interactive stays alive and keeps its own state.
 */
export class UiThumb extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'color', 'shape', 'remove-class'];
  }

  connectedCallback() {
    if (!this._built) this._built = true;
    this.#applyClasses();
  }

  attributeChangedCallback() {
    if (this._built) this.#applyClasses();
  }

  #applyClasses() {
    const sizeClass = SIZES[this.getAttribute('size')] || SIZES.md;
    const colorClass = COLORS[this.getAttribute('color')] || COLORS.base;
    const shapeClass = this.getAttribute('shape') === 'circle' ? 'rounded-full' : 'rounded';

    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-thumb`,
      'inline-flex', 'shrink-0', 'items-center', 'justify-center', 'overflow-hidden', 'font-semibold',
      ...sizeClass.split(' '),
      ...colorClass.split(' '),
      shapeClass,
    ]);
  }
}

window.__uiwc.register('thumb', UiThumb);
