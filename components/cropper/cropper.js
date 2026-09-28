import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-cropper aspect-ratio="1">` — pick an image via the upload button on the frame,
 * then pan (drag) and zoom (wheel or the slider) it inside a fixed-aspect frame, and
 * hit "Recortar" to apply. Emits `ui-cropper-change` on every pan/zoom, and
 * `ui-cropper-apply` with `{ dataURL }` when "Recortar" is clicked. `.getCroppedDataURL()`
 * is also callable directly if you want to trigger the crop from your own UI.
 */
export class UiCropper extends LitElement {
  static properties = {
    aspectRatio: { type: Number, attribute: 'aspect-ratio' },
    outputSize: { type: Number, attribute: 'output-size' },
    _imgSrc: { state: true },
    _zoom: { state: true },
    _offsetX: { state: true },
    _offsetY: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.aspectRatio = 1;
    this.outputSize = 400;
    this._imgSrc = '';
    this._zoom = 1;
    this._offsetX = 0;
    this._offsetY = 0;
    this._dragging = false;
  }

  #handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this._imgSrc = reader.result;
      this._zoom = 1;
      this._offsetX = 0;
      this._offsetY = 0;
    };
    reader.readAsDataURL(file);
  }

  #handleWheel(e) {
    e.preventDefault();
    this._zoom = Math.max(1, Math.min(4, this._zoom - e.deltaY * 0.001));
    this.#emitChange();
  }

  #handlePointerDown(e) {
    this._dragging = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  #handlePointerMove(e) {
    if (!this._dragging) return;
    this._offsetX += e.clientX - this._lastX;
    this._offsetY += e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this.#emitChange();
  }

  #handlePointerUp() {
    this._dragging = false;
  }

  #emitChange() {
    this.dispatchEvent(
      new CustomEvent('ui-cropper-change', {
        bubbles: true,
        composed: true,
        detail: { zoom: this._zoom, offsetX: this._offsetX, offsetY: this._offsetY },
      })
    );
  }

  /** Renders the current crop onto an offscreen canvas and returns a data: URL (PNG). */
  getCroppedDataURL() {
    const img = this.querySelector('.ui-cropper-img');
    const frame = this.querySelector('.ui-cropper-frame');
    if (!img || !frame || !this._imgSrc) return null;

    const frameRect = frame.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.width = this.outputSize;
    canvas.height = this.outputSize / this.aspectRatio;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      (frameRect.left - imgRect.left) * (img.naturalWidth / imgRect.width),
      (frameRect.top - imgRect.top) * (img.naturalHeight / imgRect.height),
      frameRect.width * (img.naturalWidth / imgRect.width),
      frameRect.height * (img.naturalHeight / imgRect.height),
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL('image/png');
  }

  #handleApply() {
    const dataURL = this.getCroppedDataURL();
    this.dispatchEvent(new CustomEvent('ui-cropper-apply', { bubbles: true, composed: true, detail: { dataURL } }));
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-cropper flex flex-col gap-3" style="width:16rem">
        <div
          class="ui-cropper-frame relative overflow-hidden rounded bg-base-900 touch-none"
          style="aspect-ratio:${this.aspectRatio};cursor:${this._imgSrc ? (this._dragging ? 'grabbing' : 'grab') : 'default'}"
          @wheel=${this._imgSrc ? this.#handleWheel : null}
          @pointerdown=${this._imgSrc ? this.#handlePointerDown : null}
          @pointermove=${this._imgSrc ? this.#handlePointerMove : null}
          @pointerup=${this._imgSrc ? this.#handlePointerUp : null}
        >
          ${this._imgSrc
            ? html`
                <img
                  class="ui-cropper-img absolute left-1/2 top-1/2 max-w-none select-none"
                  src=${this._imgSrc}
                  style="transform:translate(-50%,-50%) translate(${this._offsetX}px,${this._offsetY}px) scale(${this._zoom});width:100%"
                  draggable="false"
                  alt="Imagen a recortar"
                />
              `
            : ''}
          <input
            id="${this._id || (this._id = `ui-cropper-file-${Math.random().toString(36).slice(2)}`)}"
            type="file"
            accept="image/*"
            class="sr-only"
            @change=${this.#handleFile}
          />
          <label
            for=${this._id}
            class="absolute bottom-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-surface text-base-700 shadow hover:bg-base-50"
            title="Elegir imagen"
          >
            <uiwc-icon name="upload" size="sm"></uiwc-icon>
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            .value=${String(this._zoom)}
            class="flex-1 accent-base-900 disabled:opacity-40"
            aria-label="Zoom"
            ?disabled=${!this._imgSrc}
            @input=${(e) => {
              this._zoom = Number(e.target.value);
              this.#emitChange();
            }}
          />
          <button
            type="button"
            class="shrink-0 rounded bg-base-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-base-800 disabled:opacity-40 disabled:pointer-events-none"
            ?disabled=${!this._imgSrc}
            @click=${this.#handleApply}
          >
            Recortar
          </button>
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('cropper', UiCropper);
