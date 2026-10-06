window.__uiwc = window.__uiwc || { prefix: 'ui' };

const OVERLAP = { sm: '-space-x-1.5', md: '-space-x-2', lg: '-space-x-3' };

/**
 * `<ui-avatar-group><ui-avatar name="Ana"></ui-avatar>...</ui-avatar-group>` —
 * overlapping avatar stack. No wrapper, no capture: children stay exactly as
 * authored (so a framework can render/re-render them freely); the group only
 * styles itself and ring-outlines each child so the overlap reads cleanly.
 */
export class UiAvatarGroup extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'remove-class'];
  }

  connectedCallback() {
    this._built = true;
    this.#apply();
  }

  attributeChangedCallback() {
    if (this._built) this.#apply();
  }

  #apply() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-avatar-group`,
      'inline-flex', 'items-center',
      OVERLAP[this.getAttribute('size')] || OVERLAP.md,
      '[&>*]:ring-2', '[&>*]:ring-surface', '[&>*]:shrink-0',
    ]);
  }
}

window.__uiwc.register('avatar-group', UiAvatarGroup);
