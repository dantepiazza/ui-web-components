window.__uiwc = window.__uiwc || { prefix: 'ui' };

// Siempre el mismo layout: caja centrada. A diferencia de `<ui-modal>`, el dialog
// NUNCA pasa a pantalla completa ni se convierte en drawer — es a propósito: un
// dialog es para mensajes/confirmaciones/un form chico, y esa forma no cambia según
// el viewport. En mobile se limita el alto y scrollea adentro en vez de ocupar todo.
const DIALOG_CLASS =
  'rounded-xl p-6 max-w-md w-[90vw] max-h-[85vh] overflow-y-auto';

/**
 * `<ui-dialog>` wrapping a `<template>` with the dialog's markup — built on a native
 * `<dialog>` shown via `showModal()`, which gives focus trap, top-layer stacking and
 * `Escape`-to-close for free. Using `<template>` (cloned once, not reparsed HTML)
 * keeps any nested form/interactive content working and its state across open/close
 * within the same page load.
 *
 * Siempre se ve como una caja de diálogo centrada — nunca pantalla completa, nunca
 * drawer. Es para mensajes, confirmaciones y a lo sumo un form chico que siempre
 * tiene esa forma. Si necesitás un panel flotante genérico (cualquier contenido,
 * cualquier tamaño, que además pueda deslizarse desde un borde o ir pantalla
 * completa en mobile), usá `<ui-modal>` — son componentes distintos a propósito.
 *
 * Toggle via the `open` attribute, or call `.show()` / `.close()`.
 * Emits `ui-dialog-close` when it closes (Escape, backdrop click, or `.close()`).
 *
 * Also ships a confirm/prompt convenience API, so you don't have to hand-build a
 * `<template>` for the common case — see `UiDialog.confirm()` / `UiDialog.prompt()`
 * (or the `window.__uiwc.confirm()` / `.prompt()` shortcuts) below the class.
 */
export class UiDialog extends HTMLElement {
  static get observedAttributes() {
    return ['open'];
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const template = this.querySelector('template');
    const content = template ? template.content.cloneNode(true) : document.createDocumentFragment();
    template?.remove();

    const dialog = document.createElement('dialog');
    dialog.className = `${window.__uiwc.prefix}-dialog-native border-0 bg-surface shadow-2xl backdrop:bg-base-900/40 ${DIALOG_CLASS}`;
    dialog.appendChild(content);
    dialog.addEventListener('close', () => {
      this.removeAttribute('open');
      this.dispatchEvent(new CustomEvent('ui-dialog-close', { bubbles: true, composed: true }));
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

  show() {
    this.setAttribute('open', '');
  }

  close() {
    this.removeAttribute('open');
  }

  // ---- confirm/prompt convenience API — builds a one-off <ui-dialog> on the fly,
  // appends it to <body>, and resolves a Promise on close. Static methods (not global
  // `window.uiConfirm`-style functions) so the API stays consistent with how the rest
  // of the library works: a class with instance/class methods, not ambient globals.
  // For consumers using the classic (non-module) bundle who can't easily reach the
  // `UiDialog` class, `window.__uiwc.confirm()`/`.prompt()` below call the same code. ----

  static confirm(message, options = {}) {
    const { title = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'primary' } = options;
    return new Promise((resolve) => {
      const el = document.createElement(`${window.__uiwc.prefix}-dialog`);
      const template = document.createElement('template');
      const wrap = document.createElement('div');

      if (title) {
        const h = document.createElement('h3');
        h.className = 'mb-2 text-base font-semibold text-base-900';
        h.textContent = title;
        wrap.appendChild(h);
      }
      const p = document.createElement('p');
      p.className = 'mb-5 text-sm text-base-500';
      p.textContent = message;
      wrap.appendChild(p);

      const actions = document.createElement('div');
      actions.className = 'flex justify-end gap-2';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.dataset.role = 'cancel';
      cancelBtn.className = 'rounded bg-base-50 px-3.5 py-2 text-sm font-medium text-base-900 hover:bg-base-200';
      cancelBtn.textContent = cancelLabel;
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.dataset.role = 'confirm';
      confirmBtn.className = `rounded px-3.5 py-2 text-sm font-medium text-white ${variant === 'danger' ? 'bg-danger hover:bg-danger/90' : 'bg-base-900 hover:bg-base-800'}`;
      confirmBtn.textContent = confirmLabel;
      actions.append(cancelBtn, confirmBtn);
      wrap.appendChild(actions);

      template.content.appendChild(wrap);
      el.appendChild(template);
      document.body.appendChild(el);

      // `UiDialog.connectedCallback()` clona el <template> (`cloneNode(true)`) antes
      // de insertarlo en el <dialog> real — los botones que terminan en el DOM son
      // ese clon, NO `cancelBtn`/`confirmBtn` de acá arriba, así que un
      // `cancelBtn.addEventListener(...)` directo se perdería (cloneNode copia
      // atributos, no listeners). Por eso el listener va delegado en `el` — el host
      // nunca se clona — e identifica el botón clonado por `[data-role]` (un
      // atributo sí sobrevive el clone).
      let result = false;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-role]');
        if (!btn) return;
        result = btn.dataset.role === 'confirm';
        el.close();
      });
      el.addEventListener(
        'ui-dialog-close',
        () => {
          el.remove();
          resolve(result);
        },
        { once: true }
      );
      el.show();
      requestAnimationFrame(() => el.querySelector('[data-role="confirm"]')?.focus());
    });
  }

  static prompt(message, options = {}) {
    const { title = '', placeholder = '', value = '', confirmLabel = 'Aceptar', cancelLabel = 'Cancelar' } = options;
    return new Promise((resolve) => {
      const el = document.createElement(`${window.__uiwc.prefix}-dialog`);
      const template = document.createElement('template');
      const wrap = document.createElement('div');

      if (title) {
        const h = document.createElement('h3');
        h.className = 'mb-2 text-base font-semibold text-base-900';
        h.textContent = title;
        wrap.appendChild(h);
      }
      if (message) {
        const p = document.createElement('p');
        p.className = 'mb-3 text-sm text-base-500';
        p.textContent = message;
        wrap.appendChild(p);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = placeholder;
      input.dataset.role = 'input';
      input.className =
        'mb-5 w-full rounded border border-base-300 bg-surface px-3 py-2 text-sm text-base-900 focus:outline-none focus:ring-2 focus:ring-brand-900 focus:border-brand-900';
      wrap.appendChild(input);

      const actions = document.createElement('div');
      actions.className = 'flex justify-end gap-2';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.dataset.role = 'cancel';
      cancelBtn.className = 'rounded bg-base-50 px-3.5 py-2 text-sm font-medium text-base-900 hover:bg-base-200';
      cancelBtn.textContent = cancelLabel;
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.dataset.role = 'confirm';
      confirmBtn.className = 'rounded bg-base-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-base-800';
      confirmBtn.textContent = confirmLabel;
      actions.append(cancelBtn, confirmBtn);
      wrap.appendChild(actions);

      template.content.appendChild(wrap);
      el.appendChild(template);
      document.body.appendChild(el);

      // Mismo motivo que en confirm(): el <template> se clona en connectedCallback,
      // así que los listeners van delegados en `el` (nunca se clona) y los elementos
      // se ubican en cada evento por `[data-role]`, no por la referencia original
      // `input`/`cancelBtn`/`confirmBtn` de acá arriba (esa es del nodo pre-clon).
      const getInput = () => el.querySelector('[data-role="input"]');
      let result = null;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-role="cancel"], [data-role="confirm"]');
        if (!btn) return;
        result = btn.dataset.role === 'confirm' ? getInput().value : null;
        el.close();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.dataset.role === 'input') {
          result = getInput().value;
          el.close();
        }
      });
      el.addEventListener(
        'ui-dialog-close',
        () => {
          el.remove();
          resolve(result);
        },
        { once: true }
      );
      el.show();
      requestAnimationFrame(() => getInput()?.focus());
    });
  }
}

window.__uiwc.register('dialog', UiDialog);

// Atajos ergonómicos para el bundle clásico (sin import), en el mismo namespace que ya
// usa el sistema de prefijos — no se pisan con nada del consumidor, a diferencia de un
// window.uiConfirm/uiPrompt suelto.
window.__uiwc.confirm = (message, options) => UiDialog.confirm(message, options);
window.__uiwc.prompt = (message, options) => UiDialog.prompt(message, options);
