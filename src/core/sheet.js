/* Bottom sheet: the one pattern used for choices, forms and reports.
   openSheet(markup, handlers) shows it; handlers work like onAction.
   The phone's Back button closes the sheet instead of leaving the screen.
   Opening a sheet while one is open replaces its content (one history entry). */
import { html, onAction } from "./dom.js";

let current = null;
// closeSheet() goes Back asynchronously; a sheet opened meanwhile must wait for
// that Back to finish before adding its own history entry.
let backPending = false;
let pushWaiting = false;

function pushEntry() {
  if (!current) return;
  history.pushState({ sheet: true }, "");
  window.addEventListener("popstate", current.onPop, { once: true });
}

export function openSheet(content, handlers = {}, { dismissible = true, label = "", onClose = null } = {}) {
  if (current) {
    current.dismissible = dismissible;
    current.onClose = onClose;
    return updateSheet(content, handlers);
  }
  const root = document.getElementById("sheetRoot");
  root.innerHTML = html`<div class="sheet-backdrop" data-sheet-backdrop="1">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-body">${content}</div>
    </div>
  </div>`;
  const backdrop = root.firstElementChild;
  const body = backdrop.querySelector(".sheet-body");

  current = { dismissible, onClose, onPop: () => closeSheet(true) };
  if (backPending) pushWaiting = true; else pushEntry();

  backdrop.addEventListener("click", (event) => {
    if (current?.dismissible && event.target === backdrop) closeSheet();
  });
  onAction(body, handlers);
  requestAnimationFrame(() => backdrop.classList.add("open"));
  return body;
}

/** Replaces what the open sheet shows (for multi-step flows). */
export function updateSheet(content, handlers = {}, { onClose } = {}) {
  const body = document.querySelector("#sheetRoot .sheet-body");
  if (!body || !current) return openSheet(content, handlers, { onClose: onClose ?? null });
  if (onClose !== undefined) current.onClose = onClose;
  const fresh = body.cloneNode(false);
  body.replaceWith(fresh);
  fresh.innerHTML = String(content);
  onAction(fresh, handlers);
  fresh.scrollTop = 0;
  return fresh;
}

export const sheetBody = () => document.querySelector("#sheetRoot .sheet-body");
export const isSheetOpen = () => Boolean(current);

export function setSheetDismissible(value) {
  if (current) current.dismissible = value;
}

/** fromPopState: the Back button already removed the history entry. */
export function closeSheet(fromPopState = false) {
  const root = document.getElementById("sheetRoot");
  if (!current) { root.replaceChildren(); return; }
  const { onPop, onClose } = current;
  current = null;
  window.removeEventListener("popstate", onPop);
  pushWaiting = false;
  if (!fromPopState && history.state?.sheet) {
    backPending = true;
    window.addEventListener("popstate", () => {
      backPending = false;
      if (pushWaiting) { pushWaiting = false; pushEntry(); }
    }, { once: true });
    history.back();
  }
  root.replaceChildren();
  onClose?.();
}
