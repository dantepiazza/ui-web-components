window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-kanban-label color="#7c3aed">Diseño</ui-kanban-label>` — chip whose color comes
 * from data (any CSS color: a label colour a user picked, stored in a DB). Background
 * is that colour at ~13% over transparent, text is the colour itself — works on light
 * and dark surfaces. Without `color`, falls back to the neutral `base` text colour.
 *
 * Not tied to the Kanban: use it anywhere a chip needs a runtime colour (the fixed
 * `variant`s of `ui-tag`/`ui-badge` can't). Children render as authored (no capture).
 */
export class UiKanbanLabel extends HTMLElement {
  static get observedAttributes() {
    return ['color', 'remove-class'];
  }

  connectedCallback() {
    this._built = true;
    this.#apply();
  }

  attributeChangedCallback() {
    if (this._built) this.#apply();
  }

  #apply() {
    const color = this.getAttribute('color');
    if (color) this.style.setProperty('--uiwc-c', color);
    else this.style.removeProperty('--uiwc-c');

    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-kanban-label`,
      'inline-flex', 'items-center', 'rounded', 'px-1.5', 'py-0.5', 'text-xs', 'font-medium', 'leading-none',
      'bg-[color-mix(in_srgb,var(--uiwc-c,rgb(var(--ui-base-500,113_113_122)))_13%,transparent)]',
      'text-[color:var(--uiwc-c,rgb(var(--ui-base-600,82_82_91)))]',
    ]);
  }
}

window.__uiwc.register('kanban-label', UiKanbanLabel);
