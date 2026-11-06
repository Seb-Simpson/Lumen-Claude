// Classic (non-module) script loaded in <head> so the theme is set before paint.
(function () {
  var pref = 'system';
  try {
    var raw = localStorage.getItem('lumen:settings');
    if (raw) pref = JSON.parse(raw).theme || 'system';
  } catch (e) { /* storage unavailable: fall back to system */ }
  var dark = pref === 'dark' ||
    (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
