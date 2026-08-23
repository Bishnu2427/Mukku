/* Applies the saved theme before first paint so there is no flash of the wrong
   colour scheme. Kept as an external file rather than an inline <script> so the
   Content-Security-Policy can forbid inline scripts entirely (script-src 'self'
   with no 'unsafe-inline'), which is the single biggest XSS mitigation
   available to this app.

   Loaded synchronously in <head>; it is a few hundred bytes and same-origin. */
(function () {
  try {
    var t = localStorage.getItem('mukku_theme');
    if (t !== 'light' && t !== 'dark') {
      var h = new Date().getHours();
      t = h >= 6 && h < 18 ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
