import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

window.__uiwc = window.__uiwc || { prefix: 'ui' };

/**
 * `<ui-rich-text-editor>initial &lt;b&gt;HTML&lt;/b&gt;</ui-rich-text-editor>` — minimal
 * WYSIWYG editor: a `contenteditable` region with a formatting toolbar built on
 * `document.execCommand`. It's deprecated-but-still-broadly-supported and the simplest
 * thing that works for v1 — a real editor (e.g. content-model-based) is a bigger
 * project for a future version. Emits `ui-input` with `{ value }` (the HTML) on typing.
 */
export class UiRichTextEditor extends LitElement {
  static properties = {
    placeholder: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.placeholder = 'Escribí acá...';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML.trim();
      this.innerHTML = '';
    }
  }

  get value() {
    return this.querySelector('[contenteditable]')?.innerHTML ?? '';
  }

  #exec(command, value) {
    if (command === 'createLink') {
      const url = window.prompt('URL del link:');
      if (!url) return;
      document.execCommand(command, false, url);
    } else {
      document.execCommand(command, false, value);
    }
    this.querySelector('[contenteditable]')?.focus();
  }

  #handleInput(e) {
    this.dispatchEvent(new CustomEvent('ui-input', { bubbles: true, composed: true, detail: { value: e.target.innerHTML } }));
  }

  render() {
    const toolbarBtn = (icon, label, command, value) => html`
      <button
        type="button"
        class="rounded p-1.5 text-base-500 hover:bg-base-100 hover:text-base-900"
        @mousedown=${(e) => e.preventDefault()}
        @click=${() => this.#exec(command, value)}
        aria-label=${label}
        title=${label}
      >
        <uiwc-icon name=${icon} size="sm"></uiwc-icon>
      </button>
    `;

    return html`
      <div class="${window.__uiwc.prefix}-rich-text-editor rounded border border-base-300">
        <div class="flex items-center gap-0.5 border-b border-base-200 px-1 py-1">
          ${toolbarBtn('bold', 'Negrita', 'bold')}
          ${toolbarBtn('italic', 'Cursiva', 'italic')}
          ${toolbarBtn('underline', 'Subrayado', 'underline')}
          <span class="mx-1 h-4 w-px bg-base-200"></span>
          ${toolbarBtn('list', 'Lista', 'insertUnorderedList')}
          ${toolbarBtn('list', 'Lista numerada', 'insertOrderedList')}
          <span class="mx-1 h-4 w-px bg-base-200"></span>
          ${toolbarBtn('link', 'Insertar link', 'createLink')}
        </div>
        <div
          contenteditable="true"
          data-placeholder=${this.placeholder}
          class="ui-rte-content min-h-[8rem] px-3 py-2 text-sm text-base-900 focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-base-400"
          @input=${this.#handleInput}
        >${unsafeHTML(this._content || '')}</div>
      </div>
    `;
  }
}

window.__uiwc.register('rich-text-editor', UiRichTextEditor);
