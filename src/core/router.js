/* Hash-based router (#/today, #/topic?id=…).
   Works on GitHub Pages with no server setup.
   A screen: { id, tab?, parent?, render(container, params) }.
   `tab` puts it in the bottom bar; `parent` says which tab stays lit. */

import { isSheetOpen, closeSheet } from "./sheet.js";

const screens = new Map();
let onChange = () => {};
let container = null;

export function registerScreen(screen) {
  screens.set(screen.id, screen);
}

export function listTabs() {
  return [...screens.values()].filter((s) => s.tab).sort((a, b) => a.tab - b.tab);
}

export function go(id, params = {}) {
  const query = new URLSearchParams(params).toString();
  const target = `#/${id}${query ? `?${query}` : ""}`;
  // Leaving from inside a sheet: the sheet's history entry becomes the new screen,
  // so Back returns to the screen the sheet was opened on.
  const fromSheet = isSheetOpen() && history.state?.sheet;
  if (isSheetOpen()) closeSheet(true);
  if (location.hash === target) {
    if (fromSheet) history.back(); // drop the closed sheet's history entry
    rerender();
  } else if (fromSheet) location.replace(target);
  else location.hash = target;
}

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
  window.addEventListener("hashchange", () => render(true));
  render(true);
}

/** Draws the current screen again (e.g. after data changed), keeping scroll. */
export function rerender() {
  render(false);
}

function render(resetScroll) {
  const { id, params } = current();
  const screen = screens.get(id);
  const scrollY = window.scrollY;
  // Each render gets a fresh element, so event listeners from the previous
  // screen can never fire on this one.
  const host = document.createElement("div");
  host.className = "screen-host";
  container.replaceChildren(host);
  screen.render(host, params);
  if (resetScroll) window.scrollTo(0, 0);
  else window.scrollTo(0, scrollY);
  onChange(id);
}
