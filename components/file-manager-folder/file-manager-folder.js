window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-file-manager-folder path="Proyectos/2026" name="2026">` — DATA, not UI: one entry
 * of the folder tree shown in `<ui-file-manager>`'s left bar. It renders nothing itself
 * (it's hidden); the manager reads these and draws the tree. Declare them FLAT, in the
 * order you want siblings shown — the hierarchy comes from `path` ("a/b/c" is a child of
 * "a/b"), so no nesting, no reparenting, and any framework can render them as a plain
 * list. Missing ancestors are filled in from the path.
 *
 * `path`: full path ("" is the root and implicit). `name`: label (defaults to the last
 * path segment). `has-children`: this folder has subfolders you haven't declared yet
 * (lazy loading) — it gets an expand arrow, and expanding it emits `ui-fm-expand`.
 */
export class UiFileManagerFolder extends HTMLElement {
  connectedCallback() {
    this.setAttribute('data-uiwc-fm-folder', '');
    window.__uiwc.syncClasses(this, [`${window.__uiwc.prefix}-file-manager-folder`, 'hidden']);
  }
}

window.__uiwc.register('file-manager-folder', UiFileManagerFolder);
