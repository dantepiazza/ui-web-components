import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-video-playlist>` with `<ui-video-playlist-item>` children — a `<ui-video>`
 * player plus a thumbnail list below it; clicking a thumbnail switches the source.
 */
export class UiVideoPlaylist extends LitElement {
  static properties = {
    _activeIndex: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._items = [];
    this._activeIndex = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._items.length === 0) {
      this._items = [...this.querySelectorAll(`${window.__uiwc.prefix}-video-playlist-item`)].map((el) => ({
        src: el.getAttribute('src') || '',
        poster: el.getAttribute('poster') || '',
        label: el.getAttribute('title') || el.getAttribute('src') || '',
      }));
    }
  }

  render() {
    if (!this._items.length) return html``;
    const active = this._items[this._activeIndex];

    return html`
      <div class="${window.__uiwc.prefix}-video-playlist flex flex-col gap-3">
        <video class="block w-full rounded bg-black" src=${active.src} poster=${active.poster || undefined} controls playsinline></video>
        <div class="flex gap-2 overflow-x-auto pb-1">
          ${this._items.map(
            (item, i) => html`
              <button
                type="button"
                class="shrink-0 overflow-hidden rounded border-2 ${i === this._activeIndex ? 'border-base-900' : 'border-transparent'}"
                @click=${() => (this._activeIndex = i)}
              >
                <img src=${item.poster} alt=${item.label} style="width:6rem;height:3.5rem;object-fit:cover;display:block" />
              </button>
            `
          )}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('video-playlist', UiVideoPlaylist);
