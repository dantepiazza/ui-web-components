import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

// Toast stays a fixed dark snackbar in both themes (literal colours on purpose) —
// only the leading icon carries the semantic tint.
const VARIANTS = {
  info: { box: 'bg-zinc-900 text-white', icon: 'info', iconClass: 'text-zinc-400' },
  success: { box: 'bg-zinc-900 text-white', icon: 'check', iconClass: 'text-emerald-400' },
  warning: { box: 'bg-zinc-900 text-white', icon: 'info', iconClass: 'text-amber-400' },
  danger: { box: 'bg-zinc-900 text-white', icon: 'x', iconClass: 'text-rose-400' },
};

/**
 * `<ui-toast variant="success" duration="4000">Guardado</ui-toast>` — self-dismissing
 * notification. Append it to the page (e.g. to a fixed corner container) to show it;
 * it removes itself from the DOM after `duration` ms, or immediately on close click.
 * Emits `ui-toast-dismiss` right before removing itself.
 *
 * Also ships an imperative convenience API for the common "just show a message"
 * case, so you don't have to hand-place a `<ui-toast>` yourself — see
 * `UiToast.show()` below the class (or the `window.__uiwc.toast()` shortcut for
 * consumers on the classic, non-module bundle). Same pattern as `UiDialog.confirm()`.
 */
export class UiToast extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    duration: { type: Number },
    heading: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.variant = 'info';
    this.duration = 4000;
    this.heading = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
    if (this.duration > 0) {
      this._timer = setTimeout(() => this.#dismiss(), this.duration);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._timer);
  }

  #dismiss() {
    this.dispatchEvent(new CustomEvent('ui-toast-dismiss', { bubbles: true, composed: true }));
    this.remove();
  }

  render() {
    const cfg = VARIANTS[this.variant] || VARIANTS.info;

    return html`
      <div class="${window.__uiwc.prefix}-toast flex items-start gap-3 rounded ${cfg.box} px-4 py-3 text-sm shadow-lg" role="status" aria-live="polite">
        <uiwc-icon name=${cfg.icon} class="${cfg.iconClass} shrink-0 mt-0.5"></uiwc-icon>
        <div class="flex-1">
          ${this.heading ? html`<p class="mb-0.5 font-semibold">${this.heading}</p>` : ''}
          ${unsafeHTML(this._content || '')}
        </div>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
          aria-label="Cerrar"
          @click=${this.#dismiss}
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;
  }
  // ---- imperative convenience API — creates a one-off <ui-toast>, drops it into a
  // shared fixed-position stack (created lazily, one per page), and lets it
  // self-dismiss as usual. Static method (not a global `window.uiToast`-style
  // function) so the API stays consistent with how the rest of the library works —
  // see the comment on `UiDialog.confirm()` in dialog.js for the same reasoning.
  // For consumers using the classic (non-module) bundle, `window.__uiwc.toast()`
  // below calls the same code. ----

  static show(message, options = {}) {
    const { variant = 'info', duration = 4000, heading = '' } = options;

    let stack = document.querySelector(`.${window.__uiwc.prefix}-toast-stack`);
    if (!stack) {
      stack = document.createElement('div');
      stack.className = `${window.__uiwc.prefix}-toast-stack fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[22rem] max-w-[calc(100vw-2rem)]`;
      document.body.appendChild(stack);
    }

    const toast = document.createElement(`${window.__uiwc.prefix}-toast`);
    toast.setAttribute('variant', variant);
    toast.setAttribute('duration', String(duration));
    if (heading) toast.setAttribute('heading', heading);
    toast.textContent = message;
    stack.appendChild(toast);
    return toast;
  }
}

window.__uiwc.register('toast', UiToast);

// Atajo ergonómico para el bundle clásico (sin import) — mismo motivo que
// `window.__uiwc.confirm()`/`.prompt()` en dialog.js.
window.__uiwc.toast = (message, options) => UiToast.show(message, options);
