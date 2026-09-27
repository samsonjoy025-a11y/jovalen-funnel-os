/* =====================================================================
 * Design system style guide — runtime behaviour only.
 *
 * There is no framework here on purpose. The whole point of the design
 * system is that behaviour is a token concern and styling is a token
 * concern; the only state this file owns is (a) the active theme,
 * (b) the active density, and (c) nav scroll-spy.
 *
 * Everything else you can see on the page is static markup, which means
 * the page is the component reference, not a demo of a component library.
 * ===================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------------------------------------------------------------- *
   * 1. Theme
   *
   * Light is the default declared in tokens.css (:root). Dark is an
   * override block, so all this does is set one attribute. That is the
   * whole reason the token pipeline emits var() chains rather than
   * inlined values — an override has to be able to reach the component
   * and chart layers, not just the semantic layer.
   * ---------------------------------------------------------------- */
  var THEME_KEY = 'funnelos.theme';

  function currentTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function setTheme(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* private mode — the toggle still works for this session */
    }
    syncThemeButton();
  }

  var themeButton = document.querySelector('[data-theme-toggle]');

  function syncThemeButton() {
    if (!themeButton) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.lastChild.textContent = dark ? ' Light' : ' Dark';
  }

  if (themeButton) {
    var stored = currentTheme();
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    } else {
      syncThemeButton();
    }

    themeButton.addEventListener('click', function () {
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------------------------------------------------------------- *
   * 2. Density
   *
   * ADR 0017: density is a token axis, not a component variant. The
   * toggle writes one attribute and the table row height follows from
   * --ds-density-row-*. No component in this file changes.
   * ---------------------------------------------------------------- */
  var DENSITY_KEY = 'funnelos.density';
  var densityButtons = Array.prototype.slice.call(document.querySelectorAll('[data-density-set]'));

  function setDensity(density) {
    root.setAttribute('data-density', density);
    densityButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-density-set') === density));
    });
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch (e) {
      /* ignore */
    }
  }

  densityButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setDensity(button.getAttribute('data-density-set'));
    });
  });

  var storedDensity = null;
  try {
    storedDensity = localStorage.getItem(DENSITY_KEY);
  } catch (e) {
    /* ignore */
  }
  setDensity(storedDensity === 'compact' ? 'compact' : 'comfortable');

  /* ---------------------------------------------------------------- *
   * 3. Nav scroll-spy
   *
   * Proves the anchors resolve and gives a long page some orientation.
   * ---------------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.sg__nav a'));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute('href');
      return id && id.length > 1 ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  function markCurrent(id) {
    navLinks.forEach(function (link) {
      var match = link.getAttribute('href') === '#' + id;
      if (match) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function spy() {
    var best = null;
    var bestTop = Infinity;
    for (var i = 0; i < sections.length; i += 1) {
      var top = sections[i].getBoundingClientRect().top;
      if (top <= 96 && top < bestTop) {
        best = sections[i];
        bestTop = top;
      }
    }
    if (best) markCurrent(best.id);
  }

  if (sections.length) {
    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          spy();
          ticking = false;
        });
      },
      { passive: true },
    );
    spy();
  }
})();
