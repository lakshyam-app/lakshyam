/* Small promise-based dialogs shown in the bottom sheet.
   They leave the sheet open when they resolve, so a flow can show the next
   step in the same sheet; wrap the flow in runFlow() so the sheet closes
   at the end. A dialog resolves null/false if the sheet is closed instead. */
import { html } from "./dom.js";
import { t } from "./i18n.js";
import { openSheet, closeSheet, sheetBody } from "./sheet.js";

function show(content, handlers, label, finish) {
  return openSheet(content, handlers, { label, onClose: () => finish(null) });
}

function once(resolve) {
  let done = false;
  return (value) => { if (!done) { done = true; resolve(value); } };
}

/** Runs a multi-step flow; the sheet closes when it ends (or fails). */
export async function runFlow(fn) {
  try { return await fn(); }
  finally { closeSheet(); }
}

/** items: [{ id, label, sub?, danger?, current? }] → chosen id or null. */
export function chooseAction({ title, sub = "", items }) {
  return new Promise((resolve) => {
    const finish = once(resolve);
    show(html`<h2>${title}</h2>${sub ? html`<p class="hint">${sub}</p>` : ""}
      <div class="menu">${items.filter(Boolean).map((it) => html`
        <button type="button" class="menu-item ${it.danger ? "danger" : ""} ${it.current ? "is-current" : ""}" data-action="pick" data-id="${it.id}">
          <span class="row-main"><span>${it.label}</span>${it.sub ? html`<span class="row-sub">${it.sub}</span>` : ""}</span>
          ${it.current ? html`<span class="tick">✓</span>` : ""}
        </button>`)}</div>`,
    { pick: (el) => finish(el.dataset.id) }, title, finish);
  });
}

/** Text field. Resolves the trimmed text, or null if cancelled. */
export function askText({ title, hint = "", value = "", placeholder = "", confirmLabel = t("common.save"), multiline = false, allowEmpty = false, inputMode = "text" }) {
  return new Promise((resolve) => {
    const finish = once(resolve);
    const field = multiline
      ? html`<textarea class="field" id="dlgText" rows="8" placeholder="${placeholder}">${value}</textarea>`
      : html`<input class="field" id="dlgText" type="text" inputmode="${inputMode}" value="${value}" placeholder="${placeholder}" autocomplete="off">`;
    const submit = () => {
      const text = sheetBody().querySelector("#dlgText").value.trim();
      if (!text && !allowEmpty) { sheetBody().querySelector("#dlgText").focus(); return; }
      finish(text);
    };
    const body = show(html`<h2>${title}</h2>${hint ? html`<p class="hint">${hint}</p>` : ""}${field}
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="ok">${confirmLabel}</button>
      </div>`, { ok: submit, cancel: () => finish(null) }, title, finish);
    const input = body.querySelector("#dlgText");
    if (!multiline) input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    setTimeout(() => { input.focus(); if (!multiline) input.select(); }, 60);
  });
}

/** Yes/no. Resolves true only when confirmed. */
export function confirmAction({ title, body = "", confirmLabel = t("common.ok"), danger = false }) {
  return new Promise((resolve) => {
    const finish = once((v) => resolve(Boolean(v)));
    show(html`<h2>${title}</h2>${body ? html`<p>${body}</p>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : ""}" data-action="ok">${confirmLabel}</button>
      </div>`, { ok: () => finish(true), cancel: () => finish(false) }, title, finish);
  });
}

/** A message with one button. */
export function showMessage({ title, body = "", extra = "" }) {
  return new Promise((resolve) => {
    const finish = once(resolve);
    show(html`<h2>${title}</h2>${body ? html`<p>${body}</p>` : ""}${extra}
      <div class="sheet-actions"><button type="button" class="btn" data-action="ok">${t("common.close")}</button></div>`,
    { ok: () => finish(true) }, title, finish);
  });
}
