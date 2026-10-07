/* Runs before the page is drawn (a plain script, not a module), so the first paint
   already has the right colours. Your choice lives in the database; this file reads a
   copy of it kept in localStorage under "lakshyam-theme" (this device only).
   "system" (default) follows the phone and changes with it; "paper" is a warm
   light theme with dark text, made for reading questions. */
(function () {
  var KEY = "lakshyam-theme";
  var COLORS = { light: "#F6F7F5", dark: "#0F1513", paper: "#F4EEE1" };
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function read() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function apply(choice) {
    var c = choice === "light" || choice === "dark" || choice === "paper" ? choice : "system";
    var mode = c === "system" ? (media && media.matches ? "dark" : "light") : c;
    var root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-theme-choice", c);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", COLORS[mode]);
    try { if (c === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch (e) { /* private mode: still works for this visit */ }
  }
  if (media) {
    var onChange = function () { if (document.documentElement.getAttribute("data-theme-choice") === "system") apply("system"); };
    if (media.addEventListener) media.addEventListener("change", onChange); else if (media.addListener) media.addListener(onChange);
  }
  window.lakshyamTheme = apply;
  apply(read());
})();
