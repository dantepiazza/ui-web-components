import { LitElement, html } from 'lit';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-video src="movie.mp4" poster="thumb.jpg">` — styled wrapper around a native
 * `<video controls>`. v1 keeps the browser's own control bar (captions, fullscreen,
 * volume, scrubbing all work out of the box) rather than rebuilding custom chrome.
 */
export class UiVideo extends LitElement {
  static properties = {
    src: { type: String },
    poster: { type: String },
    autoplay: { type: Boolean, reflect: true },
    loop: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.src = '';
    this.poster = '';
    this.autoplay = false;
    this.loop = false;
  }

  get videoElement() {
    return this.querySelector('video');
  }

  render() {
    return html`
      <video
        class="${window.__uiwc.prefix}-video block w-full rounded bg-black"
        src=${this.src}
        poster=${this.poster || undefined}
        controls
        ?autoplay=${this.autoplay}
        ?loop=${this.loop}
        playsinline
      ></video>
    `;
  }
}

window.__uiwc.register('video', UiVideo);
