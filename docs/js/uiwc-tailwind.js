/* Config para el Play CDN de Tailwind (cdn.tailwindcss.com) en las páginas de
   documentación. Espeja scripts/tailwind.config.cjs: define la paleta semántica
   (base / brand / surface / success·warning·danger·info) respaldada por CSS custom
   properties, con fallback a los valores de zinc. Los defaults de las variables y el
   bloque .dark viven en docs/css/docs.css.

   Va JUSTO DESPUÉS del <script src="https://cdn.tailwindcss.com"> en cada página. */
(function () {
  var channel = function (v, fb) { return 'rgb(var(' + v + ', ' + fb + ') / <alpha-value>)'; };
  var ZINC = {
    50: '250 250 250', 100: '244 244 245', 200: '228 228 231', 300: '212 212 216',
    400: '161 161 170', 500: '113 113 122', 600: '82 82 91', 700: '63 63 70',
    800: '39 39 42', 900: '24 24 27', 950: '9 9 11',
  };
  var ramp = function (name) {
    var o = {};
    Object.keys(ZINC).forEach(function (k) { o[k] = channel('--ui-' + name + '-' + k, ZINC[k]); });
    return o;
  };
  var brand = ramp('brand');
  brand.fg = channel('--ui-brand-fg', '255 255 255');

  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          base: ramp('base'),
          brand: brand,
          surface: channel('--ui-surface', '255 255 255'),
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
  };
})();
