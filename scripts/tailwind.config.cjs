// Config para compilar components/dist/ui-web-components.css (el CSS "pre-armado"
// para consumidores que no quieren depender del CDN de Tailwind ni correr su
// propio build).
//
// PALETA: los componentes NO usan `zinc`/`emerald`/... directo. Usan una paleta
// SEMÁNTICA respaldada por CSS custom properties:
//   - `base-50..950`  → escala neutra (texto, bordes, fondos, superficies)
//   - `surface`        → fondo de superficies elevadas (cards, inputs, modales)
//   - `brand-50..950`  → color de acento/acción (botón primary, estados activos,
//                        focus rings) — por DEFAULT es igual a `base` (neutro)
//   - `brand-fg`       → texto/ícono sobre un fondo `brand`
//   - `success|warning|danger|info` (+ `-fg`) → estados semánticos
//
// Cada token es `rgb(var(--ui-TOKEN, <default>) / <alpha-value>)`, así:
//   1. funciona el modificador de opacidad (`bg-brand-600/10`),
//   2. si nadie define la variable, cae al default (valores nativos de Tailwind),
//   3. se re-tematiza redefiniendo `--ui-*` en `:root` (ver tailwind-input.css y
//      la sección "Personalizar colores" del README) — sin recompilar nada.
//
// Los defaults de abajo son los canales RGB de la paleta `zinc` de Tailwind (+
// blanco para superficies) — o sea, el look de fábrica es idéntico al anterior.
/** @type {import('tailwindcss').Config} */

const channel = (v, fallback) => `rgb(var(${v}, ${fallback}) / <alpha-value>)`;

const ramp = (name, fallbacks) =>
  Object.fromEntries(
    Object.entries(fallbacks).map(([k, rgb]) => [k, channel(`--ui-${name}-${k}`, rgb)])
  );

// Canales RGB de `zinc` (Tailwind v3) — default tanto de `base` como de `brand`.
const ZINC = {
  50: '250 250 250',
  100: '244 244 245',
  200: '228 228 231',
  300: '212 212 216',
  400: '161 161 170',
  500: '113 113 122',
  600: '82 82 91',
  700: '63 63 70',
  800: '39 39 42',
  900: '24 24 27',
  950: '9 9 11',
};

module.exports = {
  content: ['components/**/*.js', '!components/dist/**'],
  // El CSS precompilado solo trae las clases que algún componente escribe. Lo único
  // custom que ofrece la librería es la paleta (`base`, `brand`, `surface`, estados),
  // así que se publica ENTERA: quien construye encima puede usar `bg-brand-700`,
  // `border-base-300`, `hover:text-brand-600`... aunque ningún componente la use.
  // Incluye los modificadores de opacidad (`bg-brand-500/50`, `text-sidebar-fg/70`)
  // en pasos de 5/10/20/…/95 para las utilidades de color más comunes.
  safelist: [
    {
      pattern: /^(bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|accent|caret|decoration|shadow)-(base|brand)-(50|100|200|300|400|500|600|700|800|900|950)$/,
      variants: ['hover', 'focus', 'focus-visible', 'active', 'disabled'],
    },
    {
      pattern: /^(bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|accent|caret|decoration|shadow)-(brand-fg|surface|sidebar|sidebar-fg|rail|success|success-fg|warning|warning-fg|danger|danger-fg|info|info-fg)$/,
      variants: ['hover', 'focus', 'focus-visible', 'active', 'disabled'],
    },
    {
      pattern: /^(bg|text|border|ring|outline|divide|fill|stroke)-(base-(50|100|200|300|400|500|600|700|800|900|950)|brand-(50|100|200|300|400|500|600|700|800|900|950)|brand-fg|surface|sidebar|sidebar-fg|rail|success|success-fg|warning|warning-fg|danger|danger-fg|info|info-fg)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/,
      variants: ['hover', 'focus'],
    },
  ],
  // Class-based, driven by `class="dark"` on <html> — lo que togglea el atributo
  // global `ui-theme-toggle`.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: ramp('base', ZINC),
        brand: {
          ...ramp('brand', ZINC),
          fg: channel('--ui-brand-fg', '255 255 255'),
        },
        surface: channel('--ui-surface', '255 255 255'),
        // Sidebar y rail tienen su propio color (no siguen a `brand`): en dark suelen
        // ser un escalón MÁS OSCURO que la marca, mientras el botón primary no.
        sidebar: channel('--ui-sidebar', '39 39 42'),
        rail: channel('--ui-rail', '24 24 27'),
        'sidebar-fg': channel('--ui-sidebar-fg', '255 255 255'),
        success: channel('--ui-success', '4 120 87'),
        'success-fg': channel('--ui-success-fg', '255 255 255'),
        warning: channel('--ui-warning', '245 158 11'),
        'warning-fg': channel('--ui-warning-fg', '69 26 3'),
        danger: channel('--ui-danger', '225 29 72'),
        'danger-fg': channel('--ui-danger-fg', '255 255 255'),
        info: channel('--ui-info', '37 99 235'),
        'info-fg': channel('--ui-info-fg', '255 255 255'),
      },
    },
  },
  plugins: [],
};
