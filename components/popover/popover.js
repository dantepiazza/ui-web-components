window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-popover placement="bottom">` wrapping a trigger element plus a
 * `<template data-popover-content>` with the panel's markup — click the trigger to
 * toggle it. Using `<template>` (inert until cloned) instead of capturing/reparsing an
 * HTML string keeps any nested interactive content (forms, other components) working
 * normally once it's cloned into the open panel. Closes on outside click or `Escape`.
 * Emits `ui-popover-open` / `ui-popover-close`.
 */
export class UiPopover extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const template = this.querySelector('template[data-popover-content]');
    this._trigger = [...this.children].find((el) => el !== template);
    this._templateContent = template ? template.content : document.createDocumentFragment();
    template?.remove();

    if (!this._trigger) {
      console.warn('ui-popover: falta un elemento trigger (primer hijo, antes del <template>)');
      return;
    }

    this.classList.add('relative', 'inline-block');
    this._trigger.addEventListener('click', () => this.toggle());

    this._onDocClick = (e) => {
      if (this._open && !this.contains(e.target)) this.close();
    };
    this._onKeydown = (e) => {
      if (this._open && e.key === 'Escape') this.close();
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }

  get open() {
    return Boolean(this._open);
  }

  toggle() {
    this._open ? this.close() : this.show();
  }

  show() {
    if (this._open) return;
    this._open = true;
    const placement = this.getAttribute('placement') || 'bottom';
    const panel = document.createElement('div');
    const wanted = [
      `${window.__uiwc.prefix}-popover-panel`, 'absolute', 'z-10', 'min-w-48', 'rounded-xl',
      'border', 'border-base-200', 'bg-surface', 'p-3', 'shadow-lg', 'shadow-base-950/10',
      ...this.#placementClass(placement).split(' '),
    ];
    panel.className = window.__uiwc.classes(wanted, this).join(' ');
    panel.appendChild(this._templateContent.cloneNode(true));
    this.appendChild(panel);
    this._panel = panel;
    this.dispatchEvent(new CustomEvent('ui-popover-open', { bubbles: true, composed: true }));
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._panel?.remove();
    this._panel = null;
    this.dispatchEvent(new CustomEvent('ui-popover-close', { bubbles: true, composed: true }));
  }

  #placementClass(placement) {
    const map = {
      bottom: 'top-full left-0 mt-1.5',
      top: 'bottom-full left-0 mb-1.5',
      'bottom-end': 'top-full right-0 mt-1.5',
      'top-end': 'bottom-full right-0 mb-1.5',
    };
    return map[placement] || map.bottom;
  }
}

window.__uiwc.register('popover', UiPopover);
