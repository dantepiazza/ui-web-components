window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-speeddial-item icon="user-plus" label="Nuevo postulante">` — one action inside
 * a `<ui-speeddial>`. Plain data holder: `<ui-speeddial>` reads its `icon`/`label`
 * attributes and builds the visible button itself, then hides the original element.
 */
export class UiSpeeddialItem extends HTMLElement {
  connectedCallback() {
    this.hidden = true;
  }
}

window.__uiwc.register('speeddial-item', UiSpeeddialItem);
