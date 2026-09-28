window.__uiwc = window.__uiwc || { prefix: 'ui' };

const PADDING = { none: 'p-0', sm: 'p-3', md: 'p-5', lg: 'p-7' };

/**
 * `<ui-card padding="md" no-border>` — content container. Structure it with
 * `<ui-card-header>`, `<ui-card-body>` and `<ui-card-footer>` for a divided
 * header/body/footer layout (header/footer add their own divider automatically) —
 * or skip all three and just put plain content directly inside, that still works.
 *
 * No wrapper `<div>`: this element styles itself directly. `padding`/`no-border` are
 * still reactive (change the attribute, the classes update) — since there's no `render()`
 * to let Lit diff a template, this only ever removes exactly the classes IT added
 * last time before adding the new ones, so a `class` you put on the tag yourself is
 * never touched.
 *
 * `remove-class="border p-5"` strips any of the classes above after they're computed
 * — the library-wide escape hatch (see `window.__uiwc.classes()` in the core banner)
 * for one-off tweaks that don't deserve their own attribute. Typical case: a
 * `<ui-table>` nested inside here doubles up borders/padding — trim one side instead
 * of the library trying to special-case that composition.
 */
export class UiCard extends HTMLElement {
  static get observedAttributes() {
    return ['padding', 'no-border', 'remove-class'];
  }

  connectedCallback() {
    if (!this._built) this._built = true;
    this.#applyClasses();
  }

  attributeChangedCallback() {
    if (this._built) this.#applyClasses();
  }

  #applyClasses() {
    const padding = PADDING[this.getAttribute('padding')] || PADDING.md;
    const borderClass = this.hasAttribute('no-border') ? '' : 'border border-base-200';
    const wanted = `${window.__uiwc.prefix}-card block rounded bg-surface ${borderClass} ${padding}`.split(/\s+/).filter(Boolean);
    const next = window.__uiwc.classes(wanted, this);

    if (this._ownClasses) this.classList.remove(...this._ownClasses);
    this.classList.add(...next);
    this._ownClasses = next;
  }
}

window.__uiwc.register('card', UiCard);
