/* One note per listing (paper, subject, topic, bank, topic list).
   noteBlock() is the collapsed preview shown on a listing; openNote() shows the note to read
   (with Edit), or the editor when there is no note yet; editNote() is the editor. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { askText, runFlow } from "../../core/dialogs.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { typesetMath } from "../../core/math.js";
import { noteText, plainPreview } from "../../domain/text.js";
import { toast } from "../../core/toast.js";
import { ids } from "../../data/ids.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";

export const noteFor = (type, id) => store.byId("notes", ids.note(type, id)) || null;

/** Live name and screen for a note's listing (names follow renames). */
export function noteTarget(note) {
  const { type, id } = note.target || {};
  const s = store;
  switch (type) {
    case "topic": { const x = s.topic(id); return x ? { name: nameLabel(x), kind: t("notes.kind.topic"), sub: nameLabel(s.subject(x.subjectId)), to: "topic", params: { id } } : null; }
    case "subject": { const x = s.subject(id); return x ? { name: nameLabel(x), kind: t("notes.kind.subject"), to: "subject", params: { id } } : null; }
    case "paper": { const x = s.paper(id); return x ? { name: x.name, kind: t("notes.kind.paper"), sub: x.postName, to: "paper", params: { id } } : null; }
    case "bank": { const x = s.byId("sets", id); return x ? { name: x.name, kind: t("notes.kind.bank"), to: "bank", params: { id } } : null; }
    case "set": return { name: t(`banks.auto.${id === "auto:wrong" ? "wrong" : "flagged"}`), kind: t("notes.kind.bank"), to: "bank", params: { id } };
    case "list": { const x = s.byId("topicLists", id); return x ? { name: x.name, kind: t("notes.kind.list"), to: "library", params: { view: "topics", list: id } } : null; }
    case "question": { const q = s.question(id); const p = q && s.paper(q.paperId); return p ? { name: note.label || p.name, kind: t("notes.kind.question"), to: "paper", params: { id: p.id } } : null; }
    default: return null;
  }
}

export function noteBlock(type, id) {
  const note = noteFor(type, id);
  if (!note) return "";
  return html`<button type="button" class="note-preview" data-action="note-edit">
    <span class="note-label">${t("notes.myNote")} · ${t("notes.tapToRead")}</span>
    <span class="note-text">${plainPreview(note.text, 220)}</span>
  </button>`;
}

/** Reads a note, laid out (bullets, headings, bold); Edit and Copy from there. */
export function viewNote(type, id, label) {
  const note = noteFor(type, id);
  if (!note) return editNote(type, id, label);
  openSheet(html`<h2>${t("notes.myNote")}</h2>${label ? html`<p class="hint">${label}</p>` : ""}
    <div class="ai-answer note-view">${noteText(note.text)}</div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="copy">${t("question.copy")}</button>
      <button type="button" class="btn btn-quiet" data-action="edit">✎ ${t("common.edit")}</button>
      <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    copy: async () => { try { await navigator.clipboard.writeText(note.text); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    edit: () => { closeSheet(); editNote(type, id, label); },
    close: () => closeSheet()
  }, { label: t("notes.myNote") });
  typesetMath(sheetBody());
}

/** The note's own button on a listing: read it if there is one, else start writing. */
export const openNote = (type, id, label) => (noteFor(type, id) ? viewNote(type, id, label) : editNote(type, id, label));

/** Opens the editor; an empty note is removed. */
export function editNote(type, id, label) {
  return runFlow(async () => {
    const note = noteFor(type, id);
    const text = await askText({ title: t("notes.editTitle"), hint: label, value: note?.text || "", multiline: true, allowEmpty: true, placeholder: t("notes.placeholder") });
    if (text === null) return;
    if (!text && !note) return;
    const previous = note ? { ...note } : null;
    await mut.saveNote({ type, id }, label, text);
    if (!text && previous) toast(t("notes.removed"), { actionLabel: t("common.undo"), onAction: () => mut.saveNote(previous.target, previous.label, previous.text) });
    else toast(t("notes.saved"));
  });
}
