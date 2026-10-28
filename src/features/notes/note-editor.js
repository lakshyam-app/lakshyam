/* One note per listing (paper, subject, topic, bank, topic list).
   noteBlock() is the collapsed preview shown on a listing; openNote() shows the note to read
   (with Edit), or the editor when there is no note yet; editNote() is the editor. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { askText, runFlow } from "../../core/dialogs.js";
import { openSheet, closeSheet, sheetBody } from "../../core/sheet.js";
import { typesetMath } from "../../core/math.js";
import { noteText, plainPreview, aiText, titleFromText, bodyWithoutTitle } from "../../domain/text.js";
import { confirmAction } from "../../core/dialogs.js";
import { dateLocale } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { ids } from "../../data/ids.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import * as mut from "../../data/mutations.js";
import { testLabel } from "../../data/tests.js";
import { flagChip } from "../ai/flag-ui.js";

export const noteFor = (type, id) => store.byId("notes", ids.note(type, id)) || null;

/* ---------- 1.26.5: a topic's own notes — several, each with a name ---------- */

/** The topic's notes, most recently edited first. */
export const topicNotes = (topicId) => store.all("notes").filter((n) => n.target?.type === "topic" && n.target.id === topicId)
  .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
/** A note's name: the one you gave it, else its first heading or line. */
export const noteTitle = (n) => n?.title || titleFromText(n?.text) || t("notes.myNote");

/** Reads one of a topic's notes, laid out (headings, bold, bullets, tables); Edit, Copy and Delete from there. */
export function viewTopicNote(noteId, { onChange } = {}) {
  const n = store.byId("notes", noteId);
  if (!n) return;
  const title = noteTitle(n);
  const topic = store.topic(n.target.id);
  const when = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" }) : "";
  openSheet(html`<p class="tt-kicker">📝 ${t("notes.myNotes")}${topic ? ` · ${nameLabel(topic)}` : ""}${when ? ` · ${when}` : ""}</p><h2>${title}</h2>
    <div class="ai-answer note-view">${noteText(bodyWithoutTitle(n.text, title))}</div>
    <div class="sheet-actions note-actions">
      <button type="button" class="btn btn-quiet push-left" data-action="del" aria-label="${t("common.delete")}">🗑</button>
      <button type="button" class="btn btn-quiet" data-action="copy" aria-label="${t("question.copy")}" title="${t("question.copy")}">📋</button>
      <button type="button" class="btn btn-quiet" data-action="edit">✎ ${t("common.edit")}</button>
      <button type="button" class="btn" data-action="close">${t("common.done")}</button>
      <button type="button" class="btn btn-quiet fold-all" data-action="fold" hidden></button></div>`, {
    copy: async () => { try { await navigator.clipboard.writeText(n.text); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    // 1.26.6: close (or open) every part of the note at once.
    fold: () => { const secs = sections(); const open = secs.some((d) => d.open); secs.forEach((d) => { d.open = !open; }); foldLabel(); },
    edit: () => editTopicNote(n.target.id, n.id, { onChange }),
    del: () => runFlow(async () => {
      const ok = await confirmAction({ title: t("notes.deleteTitle", { name: title }), confirmLabel: t("common.delete"), danger: true });
      if (!ok) return;
      const prev = await mut.deleteNotes([n.id]);
      closeSheet(); onChange?.();
      toast(t("notes.removed"), { actionLabel: t("common.undo"), onAction: () => mut.putNotes(prev) });
    }),
    close: () => closeSheet()
  }, { label: title });
  const body = sheetBody();
  const sections = () => [...body.querySelectorAll(".note-view details.ai-sec")];
  const foldLabel = () => {
    const btn = body.querySelector('[data-action="fold"]');
    if (!btn) return;
    const secs = sections();
    btn.hidden = secs.length < 2;
    const open = secs.some((d) => d.open);
    btn.innerHTML = html`${open ? "▴" : "▾"}<span class="fold-txt"> ${open ? t("notes.closeAll") : t("notes.openAll")}</span>`;
    btn.title = open ? t("notes.closeAllLong") : t("notes.openAllLong");
    btn.setAttribute("aria-label", open ? t("notes.closeAllLong") : t("notes.openAllLong"));
  };
  foldLabel();
  body.querySelector(".note-view")?.addEventListener("toggle", foldLabel, true); // also when you open or close one part yourself
  typesetMath(body);
}

// What you typed but didn't save (closed by Back), so it isn't lost: shown again when you open the same note.
const drafts = new Map();

/** Writes a new note for the topic (noteId null), or edits one: a name and the text (paste from anywhere;
    Markdown headings, **bold**, bullets and tables are laid out when you read it). */
export function editTopicNote(topicId, noteId = null, { onChange } = {}) {
  const n = noteId ? store.byId("notes", noteId) : null;
  const key = noteId || `new:${topicId}`;
  const kept = drafts.get(key);
  let title = kept?.title ?? n?.title ?? "";
  let text = kept?.text ?? n?.text ?? "";
  let autoTitle = !title; // the name follows the text's first heading until you type a name yourself
  const topic = store.topic(topicId);
  openSheet(html`<h2>${n ? t("notes.editNote") : t("notes.newNote")}</h2>${topic ? html`<p class="hint">${nameLabel(topic)}</p>` : ""}
    ${kept ? html`<p class="ok-box">${t("notes.draftBack")}</p>` : ""}
    <label class="field-label">${t("notes.noteName")}<input class="field" id="nTitle" type="text" maxlength="120" value="${title || (text ? titleFromText(text) : "")}" placeholder="${t("notes.noteNamePh")}" autocomplete="off"></label>
    <label class="field-label">${t("notes.noteText")}<textarea class="field note-area" id="nText" rows="14" placeholder="${t("notes.noteTextPh")}">${text}</textarea></label>
    <p class="hint">${t("notes.formatHint")}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`, {
    cancel: async () => {
      const changed = text.trim() !== (n?.text || "").trim();
      if (changed && text.trim()) {
        const ok = await confirmAction({ title: t("notes.discardTitle"), confirmLabel: t("ai.discard"), danger: true });
        if (!ok) { drafts.set(key, { title, text }); return editTopicNote(topicId, noteId, { onChange }); }
      }
      drafts.delete(key); closeSheet();
    },
    save: async () => {
      if (!text.trim()) { toast(t("notes.emptyText")); sheetBody()?.querySelector("#nText")?.focus(); return; }
      const id = await mut.saveTopicNote(topicId, noteId, { title: title.trim() || titleFromText(text), text });
      drafts.delete(key);
      toast(t("notes.saved"));
      onChange?.();
      viewTopicNote(id, { onChange });
    }
  }, { label: n ? t("notes.editNote") : t("notes.newNote"), dismissible: false });
  const body = sheetBody();
  const tIn = body.querySelector("#nTitle"); const xIn = body.querySelector("#nText");
  if (!title && text) title = tIn.value;
  const keep = () => drafts.set(key, { title, text });
  tIn.addEventListener("input", () => { title = tIn.value; autoTitle = !title.trim(); keep(); });
  xIn.addEventListener("input", () => {
    text = xIn.value;
    if (autoTitle) { title = titleFromText(text); tIn.value = title; }
    keep();
  });
  if (!n) setTimeout(() => (title ? xIn : tIn).focus(), 60);
}

/** Any note from a list (Notes screen, search): a topic's own notes open as above, others as before. */
export function viewNoteRecord(n) {
  if (!n) return;
  if (n.target?.type === "topic") return viewTopicNote(n.id);
  return viewNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || "");
}
export function editNoteRecord(n) {
  if (!n) return;
  if (n.target?.type === "topic") return editTopicNote(n.target.id, n.id);
  return editNote(n.target.type, n.target.id, n.label || noteTarget(n)?.name || "");
}

/** Live name and screen for a note's listing (names follow renames). */
export function noteTarget(note) {
  const { type, id } = note.target || {};
  const s = store;
  switch (type) {
    case "topic": { const x = s.topic(id); return x ? { name: nameLabel(x), kind: t("notes.kind.topic"), sub: nameLabel(s.subject(x.subjectId)), to: "topic-notes", params: { id } } : null; }
    case "subject": { const x = s.subject(id); return x ? { name: nameLabel(x), kind: t("notes.kind.subject"), to: "subject", params: { id } } : null; }
    case "paper": { const x = s.paper(id); return x ? { name: x.name, kind: t("notes.kind.paper"), sub: x.postName, to: "paper", params: { id } } : null; }
    case "bank": { const x = s.byId("sets", id); return x ? { name: x.name, kind: t("notes.kind.bank"), to: "bank", params: { id } } : null; }
    case "set": return { name: t(`banks.auto.${id === "auto:wrong" ? "wrong" : "flagged"}`), kind: t("notes.kind.bank"), to: "bank", params: { id } };
    case "list": { const x = s.byId("topicLists", id); return x ? { name: x.name, kind: t("notes.kind.list"), to: "library", params: { view: "topics", list: id } } : null; }
    case "pdfnote": { const x = s.topic(note.target.topicId); return x ? { name: nameLabel(x), kind: t("notes.kind.pdfnote"), sub: `📄 ${note.label || ""}`, to: "topic", params: { id: x.id, mode: "notes" } } : null; }
    case "question": { const q = s.question(id); const p = q && s.paper(q.paperId); return p ? { name: note.label || p.name, kind: t("notes.kind.question"), to: "paper", params: { id: p.id } } : null; }
    case "test": { const a = s.byId("attempts", id); return a ? { name: note.label || testLabel(a) || t("test.title"), kind: t("notes.kind.test"), to: "result", params: { id } } : null; }
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
    ${note.tricks?.text ? html`<details class="explain ai-extra note-tricks" open><summary>🧠 ${t("ai.pnTricks")}</summary>
      <div class="ai-answer">${aiText(note.tricks.text, { sections: false })}</div>${note.tricks.by ? html`<p class="hint made-by">🤖 ${note.tricks.by} ${flagChip({ ref: `tricks:${note.id}:${note.tricks.at || ""}`, by: note.tricks.by, kind: "tricks" })}</p>` : ""}</details>` : ""}
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

/** Any laid-out text to read (e.g. several notes together), with Copy. */
export function viewText(title, text) {
  openSheet(html`<h2>${title}</h2><div class="ai-answer note-view">${noteText(text)}</div>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="copy">${t("question.copy")}</button>
      <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    copy: async () => { try { await navigator.clipboard.writeText(text); toast(t("common.copied")); } catch { toast(t("common.copyFailed")); } },
    close: () => closeSheet()
  }, { label: title });
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
