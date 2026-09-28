import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-profile-card avatar-src="" avatar-text="DP" title="Dante Piazza" subtitle="Frontend">`
 * — avatar + title + subtitle row, generic on purpose: a person, a workspace, a
 * product, a team — anything with a picture, a name and one line of context. A
 * default slot renders extra content below (meta rows, tags, an action button).
 * Migrated from panel-assets' `.candidate-card`, generalized (candidate from the
 * comparison pass — was named "Candidate Card" there).
 */
export class UiProfileCard extends LitElement {
  static properties = {
    avatarSrc: { type: String, attribute: 'avatar-src' },
    avatarText: { type: String, attribute: 'avatar-text' },
    title: { type: String },
    subtitle: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.avatarSrc = '';
    this.avatarText = '';
    this.title = '';
    this.subtitle = '';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML.trim();
      this.innerHTML = '';
    }
  }

  render() {
    return html`
      <div class="${window.__uiwc.prefix}-profile-card flex items-start gap-3 rounded border border-base-200 bg-surface p-4">
        <uiwc-avatar src=${this.avatarSrc || undefined} name=${this.avatarText || this.title} size="md"></uiwc-avatar>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate font-semibold text-base-900">${this.title}</span>
          </div>
          ${this.subtitle ? html`<div class="text-sm text-base-500">${this.subtitle}</div>` : ''}
          ${this._content ? html`<div class="mt-2">${unsafeHTML(this._content)}</div>` : ''}
        </div>
      </div>
    `;
  }
}

window.__uiwc.register('profile-card', UiProfileCard);
