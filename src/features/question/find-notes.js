/* 🔎 In my notes: from a question, find where your notes and study PDFs of the same subject say it.
   Done on the phone by a word search (domain/note-search.js); AI is only asked if you tap
   "Ask AI which one answers it", and then it sees just the passages found. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { go, current } from "../../core/router.js";
import { openedFrom } from "../../core/back.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { can } from "../../core/entitlements.js";
import * as store from "../../data/store.js";
import { label as nameLabel } from "../../core/names.js";
import { listPdfs } from "../../pdf/pdf-store.js";
import { passagesOf, queryOf, rank, snippet } from "../../domain/note-search.js";
import { viewNote } from "../notes/note-editor.js";
import * as P from "../../ai/prompts.js";
import { askInSheet } from "../ai/ai-ui.js";
import { plainQuestion } from "../ai/ai-actions.js";

/** Every note and study PDF of a subject, as search sources. */
export async function subjectSources(subjectId) {
  const topicIds = new Set(store.all("topics").filter((x) => x.subjectId === subjectId).map((x) => x.id));
  const pdfs = (await listPdfs()).filter((p) => (p.owner?.type === "subject" && p.owner.id === subjectId) || (p.owner?.type === "topic" && topicIds.has(p.owner.id)));
  const sources = pdfs.map((p) => ({ kind: "pdf", ref: p.id, name: p.name, pages: (p.pages || []).map((pg, i) => ({ n: i + 1, t: pg?.t || "" })).filter((x) => x.t) }));
  store.all("notes").forEach((n) => {
    const tg = n.target || {};
    const mine = (tg.type === "topic" && topicIds.has(tg.id)) || (tg.type === "subject" && tg.id === subjectId)
      || (tg.type === "pdfnote" && topicIds.has(tg.topicId)) || (tg.type === "question" && store.question(tg.id)?.subjectId === subjectId);
    if (!mine || !n.text) return;
    const text = `${n.text}${n.tricks?.text ? `\n${n.tricks.text}` : ""}`;
    sources.push({ kind: tg.type === "pdfnote" ? "pdfnote" : "note", ref: n.id, type: tg.type, id: tg.id, name: n.label || "", pages: [{ n: null, t: text }] });
  });
  return { sources, pdfCount: pdfs.length, noteCount: sources.length - pdfs.length };
}

const where = (r) => (r.src.kind === "pdf" ? `📄 ${String(r.src.name).replace(/\.pdf$/i, "")} · ${t("question.pageShort", { n: r.page })}`
  : r.src.kind === "pdfnote" ? `🧾 ${t("find.revNote")} · ${String(r.src.name).replace(/\.pdf$/i, "")}`
    : `📝 ${t("find.myNote")}${r.src.type === "topic" ? ` · ${nameLabel(store.topic(r.src.id))}` : ""}`);

export async function findInNotes(q) {
  const subject = store.subject(q.subjectId);
  openSheet(html`<h2>🔎 ${t("find.title")}</h2><p class="sheet-status">${t("find.looking")}</p>`, {}, { label: t("find.title") });
  const { sources, pdfCount, noteCount } = await subjectSources(q.subjectId);
  const hits = rank(passagesOf(sources), queryOf(q), { limit: 6 });
  const here = current();
  const from = openedFrom(here.id, here.params);
  const draw = () => openSheet(html`<h2>🔎 ${t("find.title")}</h2>
    <p class="hint clamp">${q.text}</p>
    <p class="hint">${t("find.scope", { subject: nameLabel(subject) || "—", pdfs: pdfCount, notes: noteCount })}</p>
    ${hits.length ? html`<div class="rows find-hits">${hits.map((r, i) => html`<button type="button" class="row find-hit" data-action="open" data-i="${i}">
        <span class="row-main"><span class="row-sub">${where(r)}${r.hasAnswer ? html` · <span class="mini-chip">✓ ${t("find.hasAnswer")}</span>` : ""}</span>
        <span class="find-snip">${snippet(r.text, r.hits)}</span></span><span class="chev-txt">›</span></button>`)}</div>`
      : html`<p class="warn-box">${sources.length ? t("find.none") : t("find.noSources")}</p>`}
    <div class="sheet-actions">
      ${hits.length && can("ai") ? html`<button type="button" class="btn btn-quiet" data-action="ai">🤖 ${t("find.askAi")}</button>` : ""}
      <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    close: () => closeSheet(),
    open: (el) => {
      const r = hits[Number(el.dataset.i)];
      if (r.src.kind === "pdf") go("pdf-view", { id: r.src.ref, n: r.page || 1, ...from });
      else { const n = store.byId("notes", r.src.ref); if (n) viewNote(n.target.type, n.target.id, n.label || ""); }
    },
    ai: async () => {
      const list = hits.map((r, i) => ({ n: i + 1, where: where(r).replace(/^\S+\s/, ""), text: r.text.slice(0, 1200) }));
      await askInSheet({
        title: `🤖 ${t("find.askAi")}`, sub: q.text.slice(0, 100),
        system: (l) => P.tutorSystem(l), user: (l) => P.inLang(P.notesFindTask(plainQuestion(q), list), l), maxTokens: (l) => (l === "en" ? 900 : 2000)
      });
    }
  }, { label: t("find.title") });
  draw();
}
