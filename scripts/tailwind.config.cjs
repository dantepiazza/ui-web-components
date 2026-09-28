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
