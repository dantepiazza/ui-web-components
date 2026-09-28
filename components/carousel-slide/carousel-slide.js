window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-carousel-slide>` — one slide inside `<ui-carousel>`. Plain custom element, no
 * template — content stays exactly as authored.
 */
export class UiCarouselSlide extends HTMLElement {
  connectedCallback() {
    this.classList.add('shrink-0', 'grow-0', 'basis-full', 'snap-start');
  }
}

window.__uiwc.register('carousel-slide', UiCarouselSlide);
