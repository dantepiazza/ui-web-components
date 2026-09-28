import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

let idCounter = 0;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * `<ui-file-upload accept="image/*" multiple>` — drag-and-drop dropzone over a hidden
 * native file input, with a list of selected files and per-file remove.
 * Emits `ui-input` with `{ files }` (a `File[]`).
 */
export class UiFileUpload extends LitElement {
  static properties = {
    accept: { type: String },
    multiple: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
    _files: { state: true },
    _dragOver: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.accept = '';
    this.multiple = false;
    this.disabled = false;
    this.label = 'Arrastrá archivos acá, o hacé click para elegir';
    this._files = [];
    this._dragOver = false;
    this._id = `ui-file-upload-${++idCounter}`;
  }

  #setFiles(fileList) {
    const incoming = [...fileList];
    this._files = this.multiple ? [...this._files, ...incoming] : incoming.slice(0, 1);
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { files: this._files } }));
  }

  #removeAt(index) {
    this._files = this._files.filter((_, i) => i !== index);
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { files: this._files } }));
  }

  #handleDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    if (!this.disabled) this.#setFiles(e.dataTransfer.files);
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-file-upload flex flex-col gap-2">
        <label
          for=${this._id}
          class="flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-4 py-8 text-center cursor-pointer
            ${this._dragOver ? 'border-base-900 bg-base-100' : 'border-base-300 hover:border-base-400'}
            ${this.disabled ? 'opacity-50 pointer-events-none' : ''}"
          @dragover=${(e) => {
            e.preventDefault();
            this._dragOver = true;
          }}
          @dragleave=${() => (this._dragOver = false)}
          @drop=${this.#handleDrop}
        >
          <uiwc-icon name="copy" size="lg" class="text-base-400"></uiwc-icon>
          <span class="text-sm text-base-500">${this.label}</span>
          <input
            id=${this._id}
            type="file"
            class="sr-only"
            accept=${this.accept || undefined}
            ?multiple=${this.multiple}
            ?disabled=${this.disabled}
            @change=${(e) => this.#setFiles(e.target.files)}
          />
        </label>
        ${this._files.length
          ? html`
              <ul class="flex flex-col gap-1.5">
                ${this._files.map(
                  (file, i) => html`
                    <li class="flex items-center justify-between gap-2 rounded border border-base-200 px-3 py-1.5 text-sm">
                      <span class="truncate text-base-900">${file.name}</span>
                      <span class="shrink-0 text-xs text-base-400">${formatSize(file.size)}</span>
                      <button
                        type="button"
                        class="shrink-0 rounded p-0.5 text-base-400 hover:bg-base-50 hover:text-base-500"
                        aria-label="Quitar ${file.name}"
                        @click=${() => this.#removeAt(i)}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </li>
                  `
                )}
              </ul>
            `
          : ''}
      </div>
    `;
  }
}

window.__uiwc.register('file-upload', UiFileUpload);
