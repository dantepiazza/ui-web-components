window.__uiwc = window.__uiwc || { prefix: 'ui' };

const THRESHOLD = 64; // px of pull (after resistance) needed to trigger a refresh
const MAX_PULL = 96; // clamp on how far the indicator travels
const RESISTANCE = 0.5; // finger travel → indicator travel ratio (rubber-band feel)

/**
 * `<ui-pull-refresh>` — wrap scrollable content; on touch devices, dragging down
 * from the very top reveals a spinner and, past a threshold, fires a `ui-refresh`
 * event (bubbles). The spinner stays until you call `.complete()` on the element —
 * same flow as Ionic's `ion-refresher`.
 *
 *   <ui-pull-refresh id="feed"> ...list... </ui-pull-refresh>
 *   <script>
 *     feed.addEventListener('ui-refresh', async () => {
 *       await reloadData();
 *       feed.complete();
 *     });
 *   </script>
 *
 * No wrapper `<div>`: the host itself becomes the scroll container (adds
 * `overflow-y-auto`); only a small indicator element is prepended. Touch only —
 * with a mouse there's no pull gesture, the content just scrolls normally.
 */
export class UiPullRefresh extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    const prefix = window.__uiwc.prefix;

    this.classList.add(
      `${prefix}-pull-refresh`,
      'relative', 'block', 'overflow-y-auto', 'overscroll-y-contain'
    );

    this._indicator = document.createElement('div');
    this._indicator.className =
      'pointer-events-none absolute inset-x-0 top-0 z-10 flex h-16 -translate-y-16 items-center justify-center';
    this._indicator.innerHTML = `<uiwc-spinner size="sm"></uiwc-spinner>`;
    this._spinnerEl = this._indicator.firstElementChild;
    this._spinnerEl.style.opacity = '0';
    this.prepend(this._indicator);

    this.#initGestures();
  }

  disconnectedCallback() {
    this._gestureCleanup?.();
  }

  complete() {
    this._refreshing = false;
    this._indicator.style.transition = 'transform .2s ease';
    this._indicator.style.transform = '';
    this._spinnerEl.style.opacity = '0';
  }

  #initGestures() {
    let startY = 0;
    let active = false;
    let claimed = false;
    let distance = 0;

    const snapBack = () => {
      this._indicator.style.transition = 'transform .2s ease';
      this._indicator.style.transform = '';
      this._spinnerEl.style.opacity = '0';
    };

    const onStart = (e) => {
      if (this._refreshing || this.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      active = true;
      claimed = false;
      distance = 0;
    };

    const onMove = (e) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;

      if (!claimed) {
        if (dy < 6) { if (dy < -2) active = false; return; }
        if (this.scrollTop > 0) { active = false; return; }
        claimed = true;
        this._indicator.style.transition = 'none';
      }

      if (dy <= 0) { active = false; snapBack(); return; }
      e.preventDefault();
      distance = Math.min(MAX_PULL, dy * RESISTANCE);
      this._indicator.style.transform = `translateY(${distance}px)`;
      this._spinnerEl.style.opacity = String(Math.min(1, distance / THRESHOLD));
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (!claimed) return;
      if (distance >= THRESHOLD) this.#startRefresh();
      else snapBack();
    };

    this.addEventListener('touchstart', onStart, { passive: true });
    this.addEventListener('touchmove', onMove, { passive: false });
    this.addEventListener('touchend', onEnd);
    this.addEventListener('touchcancel', onEnd);
    this._gestureCleanup = () => {
      this.removeEventListener('touchstart', onStart);
      this.removeEventListener('touchmove', onMove);
      this.removeEventListener('touchend', onEnd);
      this.removeEventListener('touchcancel', onEnd);
    };
  }

  #startRefresh() {
    this._refreshing = true;
    this._indicator.style.transition = 'transform .2s ease';
    this._indicator.style.transform = `translateY(${THRESHOLD}px)`;
    this._spinnerEl.style.opacity = '1';
    this.dispatchEvent(new CustomEvent(`${window.__uiwc.prefix}-refresh`, { bubbles: true }));
  }
}

window.__uiwc.register('pull-refresh', UiPullRefresh);
