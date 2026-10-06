window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-file-manager-action value="rename" label="Renombrar" icon="edit" for="file folder">`
 * — DATA, not UI: one extra entry for `<ui-file-manager>`'s context menu (the manager
 * already provides Abrir / Vista previa and Descargar). Hidden; the manager reads it and
 * emits `ui-fm-action` `{ value, ids, itemId }` when it's chosen — the operation itself
 * is yours.
 *
 * `value` (id sent in the event), `label`, `icon` (optional), `for`: which targets show it —
 * space-separated `file`, `folder`, `multiple` (several items selected); omit to show it
 * always. `danger`: red entry (e.g. delete).
 */
export class UiFileManagerAction extends HTMLElement {
  connectedCallback() {
    this.setAttribute('data-uiwc-fm-action', '');
    window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-file-manager-action`, 'hidden']);
  }
}

window.__uiwc.register('file-manager-action', UiFileManagerAction);
