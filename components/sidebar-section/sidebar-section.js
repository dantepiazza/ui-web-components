window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-sidebar-section>Infraestructura</ui-sidebar-section>` — a small uppercase group
 * label between `<a>` links inside `<ui-sidebar>` (or `<ui-sidebar-group>`). Plain
 * text content, no capture needed — it just styles itself.
 */
export class UiSidebarSection extends HTMLElement {
  static get observedAttributes() {
    return ['remove-class'];
  }

  connectedCallback() {
    this.#applyClasses();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#applyClasses();
  }

  #applyClasses() {
    window.__uiwc.syncClasses(this, [
      `${window.__uiwc.prefix}-sidebar-section`,
      'block', 'pb-1', 'pt-4', 'text-[12px]', 'font-semibold', 'text-brand-fg/50',
    ]);
  }
}

window.__uiwc.register('sidebar-section', UiSidebarSection);
