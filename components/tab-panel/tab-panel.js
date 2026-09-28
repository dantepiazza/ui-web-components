window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-tab-panel label="General">contenido</ui-tab-panel>` — a single tab's content.
 * Used inside `<ui-tabs>`, which builds the tab list from each panel's `label` and
 * toggles panels via the `active` attribute. Plain custom element (no Lit template) so
 * its children stay live — safe to nest forms, other components, anything interactive.
 */
export class UiTabPanel extends HTMLElement {
  static get observedAttributes() {
    return ['active'];
  }

  connectedCallback() {
    this.setAttribute('role', 'tabpanel');
    this.hidden = !this.hasAttribute('active');
  }

  attributeChangedCallback(name) {
    if (name === 'active') this.hidden = !this.hasAttribute('active');
  }

  get label() {
    return this.getAttribute('label') || '';
  }
}

window.__uiwc.register('tab-panel', UiTabPanel);
