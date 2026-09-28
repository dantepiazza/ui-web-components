window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-split-pane>` — one side of a `<ui-split-panel>`. Plain custom element with no
 * template of its own; its content stays live, and `<ui-split-panel>` controls its size.
 */
export class UiSplitPane extends HTMLElement {
  connectedCallback() {
    this.style.overflow = 'auto';
    this.style.minWidth = '0';
    this.style.minHeight = '0';
  }
}

window.__uiwc.register('split-pane', UiSplitPane);
