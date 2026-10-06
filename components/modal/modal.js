window.__uiwc = window.__uiwc || { prefix: 'ui' };

// Un mismo <dialog> nativo cubre los 3 layouts con solo cambiar sus clases — se
// mantiene el foco atrapado / top-layer / Escape-to-close nativos también para el
// caso "drawer". En mobile SIEMPRE pasa a pantalla completa, sea cual sea `position`
// — es la diferencia central con `<ui-dialog>`, que nunca cambia de forma.
const POSITION_CLASSES = {
  center:
    'rounded-md max-w-lg w-[90vw] max-md:fixed max-md:inset-0 max-md:m-0 max-md:h-full max-md:max-h-full max-md:w-full max-md:max-w-none max-md:rounded-none',
  left: 'fixed inset-y-0 left-0 m-0 h-full w-96 max-w-[90vw] rounded-none max-md:w-full max-md:max-w-none',
  right: 'fixed inset-y-0 right-0 m-0 h-full w-96 max-w-[90vw] rounded-none max-md:w-full max-md:max-w-none',
};

/**
 * `<ui-modal position="right">` wrapping a `<template>` with WHATEVER markup you
 * want — a form, a video, another component, arbitrary HTML. Unlike `<ui-dialog>`
 * (fixed "message box" shape, for confirmations and small forms), the modal defines
 * no title/body/footer structure of its own: it only knows how to open, close, and
 * carry data in and out. You own everything inside.
 *
 * `position`: `"center"` (default) — centered panel, full-screen on mobile.
 * `"left"` / `"right"` — slides in from that edge instead, ALSO full-screen on
 * mobile (a drawer that stays a thin sidebar on a phone doesn't work).
 *
 * Built on a native `<dialog>` shown via `showModal()` — focus trap, top-layer
 * stacking and `Escape`-to-close come for free, including for the drawer variants.
 * The `<template>` is cloned once (not reparsed HTML) so nested interactive content
 * keeps working and its state survives across open/close in the same page load.
 *
 * Data flow — the modal doesn't know what its content means, only passes it through:
 *   - `.show(data)` stores `data` on `.data` before opening, so your template's own
 *     script (or whatever renders into it) can read `modal.data` for initial values.
 *   - `.close(result)` closes and carries `result` in the `ui-modal-close` event's
 *     `detail.result` — however your content decides to call `.close(...)` (a save
 *     button, a form submit handler, whatever).
 *
 * Toggle via the `open` attribute, or call `.show()` / `.close()`.
 * Emits `ui-modal-close` with `{ result }` when it closes (Escape, backdrop click,
 * or `.close(result)`).
 */
export class UiModal extends HTMLElement {
  static get observedAttributes() {
    return ['open'];
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.data = null;

    const template = this.querySelector('template');
    const content = template ? template.content.cloneNode(true) : document.createDocumentFragment();
    template?.remove();

    const position = POSITION_CLASSES[this.getAttribute('position')] ? this.getAttribute('position') : 'center';

    const dialog = document.createElement('dialog');
    dialog.className = `${window.__uiwc.prefix}-modal-native border-0 bg-surface shadow-2xl backdrop:bg-base-900/40 ${POSITION_CLASSES[position]}`;
    dialog.appendChild(content);
    dialog.addEventListener('close', () => {
      this.removeAttribute('open');
      this.dispatchEvent(
        new CustomEvent('ui-modal-close', { bubbles: true, composed: true, detail: { result: this._result } })
      );
      this._result = undefined;
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });

    this._dialog = dialog;
    this.appendChild(dialog);

    if (this.hasAttribute('open')) dialog.showModal();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name !== 'open' || !this._dialog) return;
    if (newVal !== null && !this._dialog.open) this._dialog.showModal();
    if (newVal === null && this._dialog.open) this._dialog.close();
  }

  show(data) {
    this.data = data ?? null;
    this.setAttribute('open', '');
  }

  close(result) {
    this._result = result;
    this.removeAttribute('open');
  }
}

window.__uiwc.register('modal', UiModal);
