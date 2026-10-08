/* Notes tab: every listing note in one place, with search and a link back. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { richText, noteText } from "../../domain/text.js";
import * as store from "../../data/store.js";
import { noteTarget, editNote, viewNote } from "./note-editor.js";

let term = "";

export const notesScreen = {
  id: "notes",
  tab: 4,
  render(container) {
    const notes = store.all("notes").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!notes.length) {
      container.innerHTML = html`<section class="empty"><h1>${t("notes.emptyTitle")}</h1><p>${t("notes.emptyBody")}</p></section>`;
      return;
    }
    container.innerHTML = html`<section class="notes">
      <h1 class="page-title">${t("tabs.notes")}</h1>
      <input type="search" class="search" id="noteSearch" placeholder="${t("notes.search")}" value="${term}" autocomplete="off">
      <div class="note-list" id="noteRows"></div>
    </section>`;
    const rowsEl = container.querySelector("#noteRows");
    const draw = () => {
      const q = term.trim().toLowerCase();
      const rows = notes.map((n) => ({ n, target: noteTarget(n) }))
        .filter(({ n, target }) => !q || `${n.text} ${target?.name || n.label || ""}`.toLowerCase().includes(q));
      rowsEl.innerHTML = rows.length ? html`${rows.map(({ n, target }) => html`
        <article class="note-card">
          <header class="qcard-meta"><span>${target ? `${target.kind} · ${target.name}` : (n.label || t("notes.kind.other"))}</span></header>
          <div class="note-body-btn" data-action="read" data-id="${n.id}">
            <div class="qtext note-body ai-answer ${n.text.length > 600 || n.text.split("\n").length > 10 ? "is-long" : ""}">${noteText(n.text)}</div></div>
          <div class="row-actions">
            <button type="button" class="link" data-action="read" data-id="${n.id}">📖 ${t("notes.read")}</button>
            ${target ? html`<button type="button" class="link" data-action="open" data-id="${n.id}">${t("notes.open")}</button>` : ""}
            <button type="button" class="link" data-action="edit" data-id="${n.id}">${t("common.edit")}</button>
          </div>
        </article>`)}` : html`<p class="hint pad">${t("library.nothingFound", { q: term })}</p>`;
    };
    draw();
    let timer = null;
    container.querySelector("#noteSearch").addEventListener("input", (e) => { term = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 120); });
    onAction(container, {
      read: (el) => { const n = store.byId("notes", el.dataset.id); viewNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || ""); },
      open: (el) => { const target = noteTarget(store.byId("notes", el.dataset.id)); go(target.to, target.params); },
      edit: (el) => {
        const n = store.byId("notes", el.dataset.id);
        editNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || "");
      }
    });
  }
};
