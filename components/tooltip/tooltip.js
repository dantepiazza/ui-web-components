window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<button ui-tooltip="Guardar cambios">...</button>` — NOT a wrapping component:
 * a global attribute. Put it on ANY element (button, icon, plain text, whatever) and
 * it shows a small floating tooltip on hover/focus, no markup nesting required.
 *
 * Optional `ui-tooltip-placement` ("top" default, or "bottom"/"left"/"right")
 * controls which side it appears on. Both attribute names follow the runtime prefix
 * like everything else in the library (`wc-tooltip` if you called
 * `defineComponents('wc')`).
 *
 * One shared tooltip element handles every instance on the page — nothing to
 * register per-element, works on content added after page load too, since it's a
 * single pair of delegated listeners on `document`, not a per-instance component.
 */
(function () {
  let tipEl = null;
  let currentTarget = null;
  let idCounter = 0;

  function attr(name) {
    return `${window.__uiwc.prefix}-${name}`;
  }

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = `uiwc-tooltip-${++idCounter}`;
    tipEl.setAttribute('role', 'tooltip');
    tipEl.className =
      'pointer-events-none fixed z-50 max-w-xs rounded bg-base-900 px-2 py-1 text-xs text-white shadow-lg';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function position(target, placement) {
    const tip = ensureTip();
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 6;
    let top;
    let left;

    if (placement === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tipRect.width / 2;
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - tipRect.height / 2;
      left = rect.left - tipRect.width - gap;
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - tipRect.height / 2;
      left = rect.right + gap;
    } else {
      top = rect.top - tipRect.height - gap;
      left = rect.left + rect.width / 2 - tipRect.width / 2;
    }

    tip.style.top = `${Math.max(4, top)}px`;
    tip.style.left = `${Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))}px`;
  }

  function show(target) {
    const text = target.getAttribute(attr('tooltip'));
    if (!text) return;
    currentTarget = target;

    const tip = ensureTip();
    tip.textContent = text;
    tip.hidden = false;
    position(target, target.getAttribute(attr('tooltip-placement')) || 'top');
    target.setAttribute('aria-describedby', tip.id);
  }

  function hide() {
    if (tipEl) tipEl.hidden = true;
    currentTarget?.removeAttribute('aria-describedby');
    currentTarget = null;
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest(`[${attr('tooltip')}]`);
    if (el && el !== currentTarget) show(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest(`[${attr('tooltip')}]`);
    if (el && el === currentTarget) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest(`[${attr('tooltip')}]`);
    if (el) show(el);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target.closest(`[${attr('tooltip')}]`);
    if (el && el === currentTarget) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
})();
