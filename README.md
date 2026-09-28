# UI Web Components

Librería de Web Components liviana, agnóstica de framework, 100% MIT — de por vida. Construida
sobre [Lit](https://lit.dev), en Light DOM, estilada exclusivamente con **tokens nativos de
Tailwind**, con una capa fina de tokens semánticos (`--ui-*`) para theming y modo oscuro.

Este README es técnico y breve a propósito: no repite la documentación de cada componente (eso
vive en `docs/index.html` → grilla de componentes, y en `components/<nombre>/<nombre>.html`).
Es la referencia para **construir sobre la librería o agregarle componentes** — humano o asistido
por IA — siguiendo siempre las mismas reglas.

## Por qué existe

Nació de un problema concreto: el mismo panel construido en varios microservicios, cada uno con
su propio framework, reimplementando el mismo botón y el mismo modal una y otra vez, atados a la
licencia y al vocabulario de props de turno. La solución fue escribir el componente **una vez**,
como Web Component real, y consumirlo igual en cualquier stack.

## Comparativa

Lo que otras librerías reservan para su tier Pro (de pago), acá está completo desde el día uno:

| Componente | PrimeNG | Web Awesome | Flux | UI Web Components |
|---|---|---|---|---|
| Divider / Icon / Badge / Tag / Avatar | ✅ | ✅ free | ✅ free | ✅ |
| Spinner / Skeleton / Progress Bar | ✅ | ✅ free | ✅ free | ✅ |
| Chip / Callout / Card / Fieldset / Toolbar | ✅ | parcial | parcial | ✅ |
| Button / Button Group / Splitbutton / Copy Button | ✅ | parcial | parcial | ✅ |
| Tooltip / Checkbox / Radio / Switch | ✅ | ✅ free | ✅ free | ✅ |
| Input / Textarea / Toast / Breadcrumb / Pagination | ✅ | ✅ free | ✅ free | ✅ |
| Table (básica) / OTP Input / Number Input / Rating | ✅ | ✅ free | parcial | ✅ |
| Color Picker / Time Picker | ✅ | ✅ free | ✅ **pro** | ✅ |
| Pillbox / Flag | parcial | — | ✅ **pro** | ✅ |
| Accordion / Tabs | ✅ | ✅ free | ✅ **pro** | ✅ |
| Select / MultiSelect / Split Panel | ✅ | parcial | — | ✅ |
| Popover / Dialog / Modal (+ drawer) / Context Menu | ✅ | parcial | ✅ **pro** | ✅ |
| Slider / Knob | ✅ | parcial | ✅ **pro** | ✅ |
| AutoComplete / Command Palette | ✅ | ✅ **pro** | ✅ **pro** | ✅ |
| Tree / Menu / Navbar / Stepper | ✅ | parcial | ✅ **pro** | ✅ |
| Carousel / Timeline / Kanban | parcial | parcial | ✅ **pro** | ✅ |
| Calendar / Date Picker | ✅ | ✅ **pro** | ✅ **pro** | ✅ |
| Composer / Rich Text Editor | — | — | ✅ **pro** | ✅ |
| File Upload / Cropper | parcial | ✅ **pro** | ✅ **pro** | ✅ |
| Data Grid / Charts / Video | parcial | ✅ **pro** | parcial | ✅ |
| **Licencia** | Gratis | Core gratis / **Pro pago** | Core gratis / **Pro pago** | **MIT, todo gratis** |
| **Agnóstico de framework** | ❌ (Angular only) | ✅ | ❌ (Livewire only) | ✅ |

79 componentes en total. Detalle completo, fuente por fuente, en `brief-roadmap-ui-web-components.md`.

## Arquitectura — reglas no negociables

Quien agregue o edite un componente sigue esto siempre, sin excepción:

### 1. Motor y renderizado
- **Lit**, con `createRenderRoot() { return this; }` — Light DOM, no Shadow DOM. Así el CSS/Tailwind
  global del proyecto que consume la librería aplica sin fricción.
- Prefijo de tag `ui-*` por defecto (`<ui-button>`, `<ui-badge>`...), **configurable en runtime**:
  ```html
  <script src=".../dist/register.js"></script>
  <script>defineComponents('wc');</script>       <!-- antes de cargar el resto -->
  <script src=".../dist/button.js" defer></script> <!-- ahora registra <wc-button> -->
  ```
  `register.js` y la llamada a `defineComponents(...)` van **sin** `defer` (síncronos, corren ya) —
  solo los bundles de componentes en sí quedan `defer`. La clase CSS de extensión del host sigue el
  mismo prefijo (`wc-button`, no `ui-button`). Cada componente trae además una línea idempotente
  (`window.__uiwc = window.__uiwc || { prefix: 'ui' }`) que garantiza el default `ui-*` aunque
  `register.js` nunca se cargue.
- **Si un componente renderiza otro componente de la librería adentro** (ej. Badge con un ícono,
  Button con un spinner mientras `loading`), esa referencia interna **nunca** hardcodea el tag
  público (`<ui-icon>`) — se rompería si alguien cambió el prefijo. Usa en cambio el alias interno
  fijo `uiwc-<nombre>` (`<uiwc-icon>`, `<uiwc-spinner>`), que el componente aliasado registra además
  de su tag público:
  ```js
  customElements.define(`${window.__uiwc.prefix}-icon`, UiIcon);
  // un constructor no se puede registrar dos veces en el mismo registry, ni con otro nombre —
  // el alias necesita su propia subclase trivial:
  if (!customElements.get('uiwc-icon')) customElements.define('uiwc-icon', class extends UiIcon {});
  ```

### 2. Estilos: paleta semántica sobre tokens de Tailwind
- **Nunca** hex hardcodeado (`bg-[#4f46e5]`), **nunca** una hoja de CSS custom por componente. Todo
  color/radio/spacing sale de clases de Tailwind.
- Los colores **no** son `zinc`/`emerald`/... directo — son una **paleta semántica** (`base`,
  `brand`, `surface`, `success`/`warning`/`danger`/`info`) respaldada por CSS custom properties
  (`--ui-*`). Redefiniendo esas variables se re-tematiza toda la librería, **incluso con el CSS ya
  compilado y sin recompilar nada**. Ver **[Personalizar colores](#personalizar-colores)** abajo.
- Radios: `rounded` (4px) por defecto en botones/inputs/tags; `rounded-full` solo en circulares
  reales (avatar, dots, chip-remove, switch).
- Excepción: los componentes con **opción** de color literal (`badge color="blue"`, `chip`, `tag`,
  `rating`, `metergroup`) siguen usando nombres nativos de Tailwind — ahí el color es un valor
  elegido por el consumidor, no parte del tema.

### 3. Cómo exponer contenido del usuario (Light DOM no tiene `<slot>` real)

Tres patrones, según qué tan "vivo" necesita quedar el contenido — elegir mal rompe el componente:

- **Contenido simple y estático** (texto, un ícono adentro de un badge): capturar una sola vez en
  `connectedCallback`, vaciar el host, reinyectar con `unsafeHTML` en el `render()`.
  ```js
  connectedCallback() {
    super.connectedCallback();
    if (this._content === undefined) {
      this._content = this.innerHTML;
      this.innerHTML = '';
    }
  }
  // render(): ${unsafeHTML(this._content || '')}
  ```
  Lit memoiza `unsafeHTML` por valor — si el string no cambia entre renders, no vuelve a parsear el
  DOM, así que el estado de formularios simples adentro sobrevive re-renders por otras props.

- **Contenido rico que puede tener estado propio** (un formulario dentro de un Dialog o un Modal, el
  panel de un Popover): va en un `<template>` nativo, **no** en el slot capturado — su contenido es inerte
  hasta que se clona explícitamente, así que se clona una sola vez al conectar y ese nodo persiste
  entre aperturas.
  - **Trampa:** `cloneNode(true)` copia atributos, **no** copia listeners agregados con
    `addEventListener`. Si le agregás un listener a un elemento *antes* de que termine dentro de un
    `<template>` que el componente clona (el caso de `UiDialog.confirm()`/`.prompt()`, que arman sus
    botones así), ese listener se pierde — el nodo que termina en el DOM es el clon, no el original.
    La forma correcta es delegar: un listener en el host (`el.addEventListener('click', ...)`, que
    nunca se clona) que en cada evento mira `e.target.closest(...)` — por `id`/`class`/`[data-role]`,
    que sí sobreviven el clone. Es el mismo motivo por el que las demos de Dialog/Modal usan
    `document.addEventListener('click', (e) => { if (e.target.closest('#mi-boton')) ... })` en vez de
    `miBoton.addEventListener(...)` directo.

- **Composición de hijos vivos** (Accordion, Tabs, Tree, Kanban, Stepper, Split Panel): el
  contenedor **nunca** captura ni reprocesa a sus hijos — son otros custom elements que deben
  seguir vivos con su propio estado. El contenedor es un `HTMLElement` plano (no Lit) que solo
  coordina: arma su propio header/chrome de forma imperativa y deja a los hijos donde están.

### 4. `remove-class` — convención no negociable, no una prop por componente

Cualquier componente que le pone clases propias a su tag principal (el host self-styling,
o un wrapper interno que controla por completo — el `<div>` de `<ui-table>`, el panel de
`<ui-popover>`) tiene que soportar el atributo **`remove-class="clase-a clase-b"`**
(separadas por espacio): saca esas clases de las que el componente calcula, después de
calcularlas.

**Por qué existe:** sin esto, cada combinación incómoda de componentes (`<ui-table>` adentro
de `<ui-card>` → doble borde y doble padding; un `<ui-popover>` con una card adentro → sombra
duplicada) empuja a agregar una prop nueva por caso (`padding="none"`, `no-border`,
`no-shadow`...) — no escala, y para el día que alguien encuentre una combinación que nadie
previó, no hay escape hatch. `remove-class` es ese escape hatch genérico: el consumidor saca
lo que no quiere sin que el componente tenga que anticipar la combinación.

**Cómo implementarlo** (todo vive en `scripts/uiwc-core-banner.js`, disponible en runtime como
`window.__uiwc.classes()` / `window.__uiwc.syncClasses()`):

- Plain `HTMLElement` self-styling (Rail, Sidebar, Topbar, Main, Card...): agregar
  `'remove-class'` a `observedAttributes`, y en vez de `this.classList.add(...clases)` directo,
  `window.__uiwc.syncClasses(this, [...clases])` — filtra por `remove-class` y además
  recuerda qué agregó la última vez para sacarlo antes de reaplicar (un `class` que el
  consumidor puso a mano en el tag nunca se toca).
- Lit con wrapper interno (`<ui-table>`, `<ui-sidebar-header>`...): declarar
  `removeClass: { type: String, attribute: 'remove-class' }` como property (así Lit
  re-renderiza cuando cambia) y en `render()` armar la clase con
  `window.__uiwc.classes([...], this).join(' ')` en vez de un template string fijo.
- Nunca inventar `no-<algo>`/`<algo>="none"` para "sacar una clase puntual" — eso es
  exactamente lo que `remove-class` reemplaza. Una prop dedicada sigue teniendo sentido para
  algo con más de dos estados (`padding="none"|"sm"|"md"|"lg"`), no para un simple on/off.

Cubierto hoy: `ui-card` (+ `-header`/`-body`/`-footer`), `ui-table`, `ui-topbar`, `ui-main`,
`ui-rail` (+ `-first`/`-last`), `ui-sidebar` (+ `-header`/`-footer`/`-section`), `ui-popover`.
Pendiente en el resto de los self-styling (`ui-tree-item`, `ui-carousel`, `ui-split-panel`...)
— se suma a medida que alguien lo necesite ahí; ver ROADMAP.

### 5. Estructura de carpetas

```
components/
  <nombre>/
    <nombre>.js     ← el componente (Lit o HTMLElement plano, ver regla 3)
    <nombre>.html    ← doc: solo <main> (sin sidebar) con demo, props, slots,
                         eventos, integración Angular/Livewire, checklist a11y
  dist/
    <nombre>.js       ← bundle compilado (Lit incluido, sin imports)
docs/
  css/docs.css        ← chrome compartido (sidebar, tabs, tablas) — NO es parte
                          de la librería distribuible, es solo para este sitio
  js/docs.js
  index.html            ← landing (este archivo lo genera/edita quien mantiene el sitio)
  components.html        ← shell con sidebar + iframe para navegar toda la doc
```

### 6. Por qué hay un paso de build

Los componentes se escriben como módulos ES (`import { LitElement } from 'lit'`), pero un `.html`
abierto por `file://` no puede cargar `type="module"` que importe de `node_modules` — Chrome lo
bloquea por CORS bajo el origen `null`. `npm run build` (esbuild) compila cada componente junto
con Lit en un script clásico sin imports, cargado con `<script src="../dist/<nombre>.js" defer>`.
El `defer` es obligatorio: sin él, el script corre antes de que el parser inserte el contenido de
las etiquetas, y el componente se "upgradea" vacío.

**Regla:** después de tocar cualquier `<nombre>.js`, correr `npm run build` antes de abrir su doc.

## Personalizar colores

Los componentes **no** usan `bg-zinc-900` / `text-emerald-600` directo. Usan una **paleta semántica**
que resuelve a CSS custom properties:

| Token | Para qué | Default (fábrica) |
|---|---|---|
| `base-50` … `base-950` | Escala neutra: texto, bordes, fondos, rellenos, disabled | paleta `zinc` |
| `surface` | Fondo de superficies elevadas: cards, inputs, modales, popovers, topbar | `white` |
| `brand-50` … `brand-950` | Acento / acción: botón primary, estados activos (checked, tab, paso), focus rings, slider/progress | = `base` (neutro) |
| `brand-fg` | Texto/ícono **encima** de un fondo `brand` | `white` |
| `success` · `warning` · `danger` · `info` (+ `-fg`) | Estados semánticos (callout, toast, validación de inputs, progress) | emerald · amber · rose · blue |

El **sidebar** usa `bg-brand-800` + `text-brand-fg` y el **rail** `bg-brand-900` — siguen la marca. Con el default (brand = zinc) se ven negro/gris como siempre; con una marca de color, se tiñen. En modo oscuro heredan lo que definas para `--ui-brand-*` bajo `.dark` (si querés un sidebar oscuro en dark, poné valores oscuros ahí — el `.dark` de fábrica invierte `brand`, pensado para la marca neutra).

Cada token es `rgb(var(--ui-TOKEN, <default>) / <alpha-value>)`, así:
1. funciona el modificador de opacidad (`bg-brand-600/10`),
2. si no definís la variable, cae al default de fábrica,
3. redefiniendo `--ui-*` re-tematizás **sin recompilar**.

Los valores son **canales RGB separados por espacio** (`24 24 27`), no `#hex` ni `rgb()`.

### Opción A — con el CSS ya compilado (integración de dos tags)

Cargá tu `:root` **después** de `ui-web-components.css` y redefiní lo que quieras:

```css
:root {
  /* marca azul — solo el acento, el texto/neutro no se toca */
  --ui-brand-50:  239 246 255;
  --ui-brand-100: 219 234 254;
  --ui-brand-500: 59 130 246;
  --ui-brand-600: 37 99 235;
  --ui-brand-700: 29 78 216;
  --ui-brand-900: 30 58 138;
  --ui-brand-fg:  255 255 255;

  /* opcional: retintar el neutro (gris con temperatura fría) */
  --ui-base-50: 248 250 252;
  --ui-base-200: 226 232 240;
  --ui-base-500: 100 116 139;
  --ui-base-900: 15 23 42;
}
```

El botón primary usa `brand-900`. Si tu marca es un mid-tone (ej. `#005ffe` ≈ `blue-600`) y no querés
que quede oscuro, poné ese valor en el slot `900` de tu rampa — o pisá solo el botón:
`.ui-button.bg-brand-900 { background-color: #005ffe }`.

### Opción B — con tu propio build de Tailwind

Extendé el `theme.extend.colors` de tu `tailwind.config` con los mismos nombres (`base`, `brand`,
`surface`, `sidebar`, `success`…) apuntando a tus valores o a tus propias variables, y agregá los
`.js` de la librería al `content`. El bloque `:root` de referencia está en
[`scripts/tailwind-input.css`](scripts/tailwind-input.css).

### Opción C — sobre el Play CDN (`cdn.tailwindcss.com`)

El CDN no conoce los nombres semánticos (`bg-brand-900`, `bg-sidebar`…) → hay que registrarlos.
Cargá el helper **justo después** del `<script>` del CDN, y tu `:root` de tema:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src=".../components/dist/ui-web-components.tailwind.js"></script>
<style>:root { --ui-brand-900: 0 95 254; /* … */ }</style>
```

> Si NO hacés esto, solo se renderizan las partes con color literal de Tailwind (nada tokenizado) —
> por eso conviene la Opción A: el CSS compilado ya trae todo.

### Modo oscuro

La librería trae `class="dark"` como disparador: bajo `.dark` la escala `base`/`brand` se **invierte**
(50 = lo más oscuro, 950 = lo más claro) y los estados semánticos se aclaran. Todo componente que use
`bg-base-*` / `text-base-*` se re-tematiza solo.

- **Disparador:** el atributo global `ui-theme-toggle` en cualquier elemento (`<button ui-theme-toggle>`),
  o `window.__uiwc.setTheme('dark'|'light')`. Persiste en `localStorage` (`uiwc-theme`).
- **Si togglés `.dark` vos mismo**: Chromium se queda con el valor viejo de una propiedad con
  `transition` cuyo color `rgb(var(--x) / …)` cambió solo porque cambió `--x`
  ([crbug.com/1226629](https://crbug.com/1226629)). El fix: agregá una clase que ponga
  `transition: none !important`, flipeá `.dark`, forzá un reflow (`document.documentElement.offsetHeight`),
  sacá la clase en el próximo frame. `ui-theme-toggle` ya lo hace; la clase `.uiwc-theme-switching`
  viene en el CSS compilado.
- Personalizá el dark redefiniendo `--ui-*` dentro de tu propio bloque `.dark { … }`.

## Contribuir

El proyecto está abierto a PRs — humanos o asistidos por IA. Un componente nuevo o corregido se
acepta si:

1. Sigue las 5 reglas de arquitectura de arriba, sin excepciones "por esta vez".
2. Trae su `<nombre>.html` con demo en vivo, tabla de props/slots/eventos, ejemplo Angular y
   Livewire/Blade, y checklist de accesibilidad — mismo formato que cualquier componente existente
   (usá uno parecido como plantilla).
3. Corre `npm run build` sin errores y el bundle nuevo queda commiteado en `dist/`.
4. No introduce una dependencia de runtime nueva — Lit es la única.

### Esta librería fue escrita con IA, para que una IA la siga mejorando

Las reglas de arriba no son una guía de estilo opcional: son lo que le permite a un asistente leer
un componente existente y construir el siguiente sin inventar una convención nueva cada vez. Vamos
a publicar una **skill** de este proyecto para que cualquier asistente (Claude, Copilot, etc.)
sepa de memoria cómo agregar o mejorar un componente respetando estas reglas.

## Licencia

MIT.

