/* Hash-based router (#/today, #/library …).
   Works on GitHub Pages with no server setup.
   Each feature registers a screen: { id, tab?, render(container, params) }. */

const screens = new Map();
let onChange = () => {};

export function registerScreen(screen) {
  screens.set(screen.id, screen);
}

export function listTabs() {
  return [...screens.values()].filter((s) => s.tab).sort((a, b) => a.tab - b.tab);
}

export function go(id, params = {}) {
  const query = new URLSearchParams(params).toString();
  const target = `#/${id}${query ? `?${query}` : ""}`;
  if (location.hash === target) render();
  else location.hash = target;
}

export function current() {
  const [path, query = ""] = location.hash.replace(/^#\//, "").split("?");
  const id = screens.has(path) ? path : "today";
  return { id, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function startRouter(container, changed) {
  onChange = changed;
  window.addEventListener("hashchange", () => render(container));
  render(container);
}

function render(container = document.getElementById("screen")) {
  const { id, params } = current();
  const screen = screens.get(id);
  container.replaceChildren();
  screen.render(container, params);
  container.scrollTop = 0;
  window.scrollTo(0, 0);
  onChange(id);
}
