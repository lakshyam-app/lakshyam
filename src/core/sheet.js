/* Bottom sheet: the one pattern used for choices, forms and reports.
   openSheet(markup, handlers) shows it; handlers work like onAction.
   The phone's Back button closes the sheet instead of leaving the screen. */
import { html, onAction } from "./dom.js";

let current = null;

export function openSheet(content, handlers = {}, { dismissible = true, label = "" } = {}) {
  closeSheet(true);
  const root = document.getElementById("sheetRoot");
  root.innerHTML = html`<div class="sheet-backdrop" data-sheet-backdrop="1">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-body">${content}</div>
    </div>
  </div>`;
  const backdrop = root.firstElementChild;
  const body = backdrop.querySelector(".sheet-body");

  current = { dismissible, onPop: () => closeSheet(true) };
  history.pushState({ sheet: true }, "");
  window.addEventListener("popstate", current.onPop, { once: true });

  backdrop.addEventListener("click", (event) => {
    if (dismissible && event.target === backdrop) closeSheet();
  });
  onAction(body, handlers);
  requestAnimationFrame(() => backdrop.classList.add("open"));
  return body;
}

/** Replaces what the open sheet shows (for multi-step flows). */
export function updateSheet(content, handlers = {}) {
  const body = document.querySelector("#sheetRoot .sheet-body");
  if (!body) return openSheet(content, handlers);
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  fresh.innerHTML = String(content);
  onAction(fresh, handlers);
  fresh.scrollTop = 0;
  return fresh;
}

export function setSheetDismissible(value) {
  if (current) current.dismissible = value;
}

/** fromPopState: the Back button already removed the history entry. */
export function closeSheet(fromPopState = false) {
  const root = document.getElementById("sheetRoot");
  if (!current) { root.replaceChildren(); return; }
  const { onPop } = current;
  current = null;
  window.removeEventListener("popstate", onPop);
  if (!fromPopState && history.state?.sheet) history.back();
  root.replaceChildren();
}
