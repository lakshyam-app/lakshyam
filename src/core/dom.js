/* Small DOM helpers.
   `html` is a tagged template that escapes every interpolated value,
   so text from imports or the user can never inject markup.
   Use raw() only for markup this app produced itself. */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

class RawHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Marks trusted, app-generated markup so html`` won't escape it. */
export function raw(value) {
  return new RawHtml(String(value ?? ""));
}

function renderValue(value) {
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  if (value === false || value === null || value === undefined) return "";
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
  return new RawHtml(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** Event delegation: one listener handles every [data-action] inside root. */
export function onAction(root, handlers) {
  root.addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action];
    if (handler) {
      event.preventDefault();
      handler(el, event);
    }
  });
}
