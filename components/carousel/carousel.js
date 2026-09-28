window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-carousel>` wrapping `<ui-carousel-slide>` children — horizontal scroll-snap
 * carousel with prev/next buttons and dot indicators. Uses native CSS scroll-snap
 * instead of reimplementing drag/swipe physics, so touch scrolling works for free.
 * Emits `ui-carousel-change` with `{ index }`.
 */
export class UiCarousel extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    const slides = [...this.querySelectorAll(`${window.__uiwc.prefix}-carousel-slide`)];
    if (!slides.length) return;
    this._slides = slides;

    const track = document.createElement('div');
    track.className = 'flex overflow-x-auto rounded-xl snap-x snap-mandatory scroll-smooth';
    slides.forEach((slide) => track.appendChild(slide));
    track.addEventListener('scroll', () => this.#syncFromScroll());
    this._track = track;

    const prevBtn = this.#navButton('‹', () => this.goTo(this._index - 1));
    const nextBtn = this.#navButton('›', () => this.goTo(this._index + 1));
    prevBtn.classList.add('left-2');
    nextBtn.classList.add('right-2');

    const dots = document.createElement('div');
    dots.className = 'mt-3 flex justify-center gap-1.5';
    this._dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Ir a slide ${i + 1}`);
      dot.className = 'h-2 w-2 shrink-0 cursor-pointer rounded-full border-0 bg-base-300 p-0';
      dot.addEventListener('click', () => this.goTo(i));
      dots.appendChild(dot);
      return dot;
    });

    const stage = document.createElement('div');
    stage.className = 'relative';
    stage.append(track, prevBtn, nextBtn);

    this.append(stage, dots);
    this._index = 0;
    this.#updateDots();
  }

  #navButton(symbol, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = symbol;
    btn.className =
      'absolute top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center ' +
      'rounded-full border-0 bg-surface/90 text-xl leading-none text-base-900 shadow shadow-base-950/20';
    btn.addEventListener('click', onClick);
    return btn;
  }

  goTo(index) {
    const clamped = Math.max(0, Math.min(this._slides.length - 1, index));
    this._slides[clamped].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  #syncFromScroll() {
    const trackRect = this._track.getBoundingClientRect();
    let closest = 0;
    let closestDist = Infinity;
    this._slides.forEach((slide, i) => {
      const dist = Math.abs(slide.getBoundingClientRect().left - trackRect.left);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    if (closest !== this._index) {
      this._index = closest;
      this.#updateDots();
      this.dispatchEvent(new CustomEvent('ui-carousel-change', { bubbles: true, composed: true, detail: { index: closest } }));
    }
  }

  #updateDots() {
    this._dots.forEach((dot, i) => {
      dot.classList.toggle('bg-brand-900', i === this._index);
      dot.classList.toggle('bg-base-300', i !== this._index);
    });
  }
}

window.__uiwc.register('carousel', UiCarousel);
