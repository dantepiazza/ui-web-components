import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

/**
 * `<ui-input-file label="Currículum" accept=".pdf">` — compact single-line file field:
 * a button plus the chosen filename, for a form row. For a drag-and-drop area with a
 * file list, use `<ui-file-upload>` instead. Emits `ui-input` with `{ file }`.
 */
export class UiInputFile extends LitElement {
  static properties = {
    label: { type: String },
    accept: { type: String },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
    _fileName: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.label = '';
    this.accept = '';
    this.disabled = false;
    this.name = '';
    this._fileName = '';
    this._id = `ui-input-file-${++idCounter}`;
  }

  #handleChange(e) {
    const file = e.target.files?.[0] || null;
    this._fileName = file?.name || '';
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { file } }));
  }

  #clear() {
    const input = this.querySelector('input');
    if (input) input.value = '';
    this._fileName = '';
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { file: null } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-input-file flex flex-col gap-1.5">
        ${this.label ? html`<label class="text-sm font-medium text-base-900">${this.label}</label>` : ''}
        <div class="flex items-center gap-2">
          <label
            for=${this._id}
            class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-base-300 bg-surface px-3 py-1.5 text-sm font-medium text-base-700 hover:bg-base-50 ${this.disabled ? 'pointer-events-none opacity-50' : ''}"
          >
            <uiwc-icon name="upload" size="sm"></uiwc-icon>
            Elegir archivo
          </label>
          <input id=${this._id} type="file" class="sr-only" accept=${this.accept || undefined} name=${this.name || ''} ?disabled=${this.disabled} @change=${this.#handleChange} />
          <span class="truncate text-sm text-base-500">${this._fileName || 'Sin archivo seleccionado'}</span>
          ${this._fileName
            ? html`
                <button type="button" class="shrink-0 rounded p-0.5 text-base-400 hover:bg-base-100 hover:text-base-600" aria-label="Quitar archivo" @click=${this.#clear}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              `
            : ''}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('input-file', UiInputFile);
