/* Hash-based router (#/today, #/topic?id=…).
   Works on GitHub Pages with no server setup.
   A screen: { id, tab?, parent?, render(container, params) }.
   `tab` puts it in the bottom bar; `parent` says which tab stays lit. */

import { isSheetOpen, closeSheet, whenBackDone } from "./sheet.js";

const screens = new Map();
let onChange = () => {};
let container = null;
let cleanup = null; // a screen's render() may return a function to run when it is left or redrawn
let shown = null;   // { id, params } of the screen on show
let before = null;  // …and of the one shown before it (another screen, not a redraw)
/* The screens in this tab's Back history, as far as the app knows (oldest first), so a ‹ button
   whose screen is the one you came from goes Back instead of adding the screen again (which made
   the phone's Back go round in circles). Sheets add entries of their own and are not listed. */
let trail = [];
let ownMove = null; // the hash the app itself is moving to (its hashchange is not a Back)

export function registerScreen(screen) {
  screens.set(screen.id, screen);
}

export function listTabs() {
  return [...screens.values()].filter((s) => s.tab).sort((a, b) => a.tab - b.tab);
}

/** replace: the new screen takes the current one's place in the phone's Back history
    (e.g. a test's result replaces the finished test, so Back goes to where the test was started). */
export function go(id, params = {}, { replace = false } = {}) {
  whenBackDone(() => goNow(id, params, replace));
}

function goNow(id, params, replace = false) {
  const query = new URLSearchParams(params).toString();
  const target = `#/${id}${query ? `?${query}` : ""}`;
  // Leaving from inside a sheet: the sheet's history entry becomes the new screen,
  // so Back returns to the screen the sheet was opened on.
  const fromSheet = isSheetOpen() && history.state?.sheet;
  if (isSheetOpen()) closeSheet(true);
  if (location.hash === target) {
    if (fromSheet) history.back(); // drop the closed sheet's history entry
    rerender();
    return;
  }
  ownMove = target;
  if (fromSheet) { trail.push(target); location.replace(target); } // the sheet's entry becomes this screen
  else if (replace) { trail[Math.max(0, trail.length - 1)] = target; location.replace(target); }
  else { trail.push(target); location.hash = target; }
}

function parseHash(hash) {
  const [path, query = ""] = String(hash || "").replace(/^#\//, "").split("?");
  return { id: path, params: Object.fromEntries(new URLSearchParams(query)) };
}

/** For ‹ buttons: shows that screen. If it is the screen you came from, this goes Back to it (so the
    phone's Back keeps working as expected); otherwise it takes this screen's place. */
export function goBack(id, params = {}) {
  whenBackDone(() => {
    if (isSheetOpen()) { goNow(id, params); return; }
    const prev = trail.length >= 2 ? parseHash(trail[trail.length - 2]) : null;
    const same = prev && prev.id === id && Object.entries(params).every(([k, v]) => prev.params[k] === String(v));
    if (same) history.back();
    else goNow(id, params, true);
  });
}

function onHashChange() {
  const h = location.hash;
  if (ownMove === h) ownMove = null;
  else if (trail.length >= 2 && trail[trail.length - 2] === h) trail.pop(); // the phone's Back
  else if (trail[trail.length - 1] !== h) trail = [h]; // somewhere the app can't follow: start again
  render(true);
}

/** The screen shown before the current one ({ id, params }), or null. */
export const previous = () => before;

export function current() {
  const [path, query = ""] = location.hash.replace(/^#\//, "").split("?");
  const id = screens.has(path) ? path : "today";
  return { id, params: Object.fromEntries(new URLSearchParams(query)) };
}

/** Which tab is lit for a screen (itself, its parent, or none). */
export function tabFor(id) {
  const screen = screens.get(id);
  return screen?.tab ? id : screen?.parent || null;
}

export function startRouter(target, changed) {
  container = target;
  onChange = changed;
  window.addEventListener("hashchange", onHashChange);
  trail = [location.hash];
  render(true);
}

/** Draws the current screen again (e.g. after data changed), keeping scroll. */
export function rerender() {
  render(false);
}

function render(resetScroll) {
  const { id, params } = current();
  const screen = screens.get(id);
  if (shown && shown.id !== id) before = shown;
  shown = { id, params };
  const scrollY = window.scrollY;
  // Each render gets a fresh element, so event listeners from the previous
  // screen can never fire on this one.
  const host = document.createElement("div");
  host.className = "screen-host";
  if (cleanup) { try { cleanup(); } catch { /* never block navigation */ } cleanup = null; }
  container.replaceChildren(host);
  const result = screen.render(host, params);
  if (typeof result === "function") cleanup = result;
  if (resetScroll) window.scrollTo(0, 0);
  else window.scrollTo(0, scrollY);
  onChange(id);
}
