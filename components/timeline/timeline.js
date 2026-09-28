window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-timeline>` — wraps `<ui-timeline-item>` children as-is (no content capture).
 */
export class UiTimeline extends HTMLElement {
  connectedCallback() {
    this.classList.add(`${window.__uiwc.prefix}-timeline`, 'block');
    this.setAttribute('role', 'list');
  }
}

window.__uiwc.register('timeline', UiTimeline);
