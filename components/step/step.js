window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-step label="Datos">contenido</ui-step>` — one step inside `<ui-stepper>`. Plain
 * custom element (no Lit template) so its content stays live between steps.
 */
export class UiStep extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  connectedCallback() {
    this.hidden = !this.hasAttribute('active');
  }

  attributeChangedCallback(name) {
    if (name === 'active') this.hidden = !this.hasAttribute('active');
  }

  get label() {
    return this.getAttribute('label') || '';
  }
}

window.__uiwc.register('step', UiStep);
