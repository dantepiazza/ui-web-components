window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-video-playlist-item src="clip.mp4" poster="thumb.jpg" title="Intro">` — one
 * entry in a `<ui-video-playlist>`. Not rendered by itself; the playlist reads its
 * attributes to build its thumbnail list.
 */
export class UiVideoPlaylistItem extends HTMLElement {
  connectedCallback() {
    this.hidden = true;
  }

  get src() {
    return this.getAttribute('src') || '';
  }

  get poster() {
    return this.getAttribute('poster') || '';
  }

  get label() {
    return this.getAttribute('title') || this.src;
  }
}

window.__uiwc.register('video-playlist-item', UiVideoPlaylistItem);
