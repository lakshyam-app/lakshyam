/* #/ai-import?topic=…&kind=questions|cards|note
   1.27 · Bring in questions, flashcards or a revision note you made with an AI elsewhere (Claude, ChatGPT, Gemini…),
   with no study PDF needed. They go where PDF-made ones go (the topic's AI / Cards / Notes tabs, "From: not from a PDF").
   1) Copy the instructions for your AI (they ask for a format the app reads) → 2) paste its reply → 3) check, untick any → Save.
   Nothing is saved until you tap Save. Everything pasted is checked (see domain/ai-import.js). */
import { html, onAction } from "../../core/dom.js";
import { t, locale } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { toast } from "../../core/toast.js";
import { typesetMath } from "../../core/math.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import { richText, noteText, titleFromText, letterFor } from "../../domain/text.js";
import { readQuestions, readCards, readNote, promptFor } from "../../domain/ai-import.js";
import { aiModelOf } from "../../domain/made-by.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { header, backHandler } from "../library/library.js";

const KINDS = ["questions", "cards", "note"];
const MODE = { questions: "ai", cards: "cards", note: "notes" };
// What you pasted and read, kept while the app is open (per topic and kind), so a redraw never loses it.
const state = new Map();

export const aiImportScreen = {
  id: "ai-import",
  parent: "library",
  render(container, { topic: topicId, kind: kind0 }) {
    const topic = store.topic(topicId);
    if (!topic) return go("library");
    const kind = KINDS.includes(kind0) ? kind0 : "questions";
    const key = `${topicId}:${kind}`;
    const s = state.get(key) || { text: "", by: store.setting("aiImportBy", "") || "", read: null, keep: null, name: "" };
    state.set(key, s);
    const subject = store.subject(topic.subjectId);
    const r = s.read;
    const problems = r ? Object.entries(r.problems || {}).filter(([, n]) => n) : [];
    container.innerHTML = html`${header({ backTo: "topic", backParams: { id: topicId, mode: MODE[kind] }, backLabel: nameLabel(topic), title: html`📥 ${t("aiImport.title")}`, sub: html`${nameHtml(topic)}${subject ? html` · ${nameHtml(subject)}` : ""}` })}
      <div class="segmented three" role="tablist">${KINDS.map((k) => html`<button type="button" role="tab" aria-selected="${String(k === kind)}" class="${k === kind ? "on" : ""}" data-action="kind" data-k="${k}">${t(`aiImport.kind.${k}`)}</button>`)}</div>
      <p class="hint">${t("aiImport.intro")}</p>
      <section class="win-box"><h3>1 · ${t("aiImport.step1")}</h3>
        <p class="hint">${t("aiImport.step1Hint")}</p>
        <button type="button" class="btn btn-quiet" data-action="copy-prompt">📋 ${t("aiImport.copyPrompt")}</button>
        <details class="explain"><summary>${t("aiImport.seePrompt")}</summary><pre class="prompt-box">${promptFor(kind, { subject: subject?.name || "", topic: topic.name, lang: locale() })}</pre></details></section>
      <section class="win-box"><h3>2 · ${t("aiImport.step2")}</h3>
        <textarea class="field note-area" id="aiPaste" rows="10" placeholder="${t(`aiImport.pastePh.${kind}`)}">${s.text}</textarea>
        <label class="field-label">${t("aiImport.madeWith")}<input class="field" id="aiBy" type="text" maxlength="40" value="${s.by}" placeholder="${t("aiImport.madeWithPh")}" autocomplete="off"></label>
        <button type="button" class="btn" data-action="read">${t("aiImport.read")}</button></section>
      ${r ? html`<section class="ai-import-result"><h3>3 · ${t("aiImport.step3")}</h3>
        ${kind === "note" ? (r.text ? html`<label class="field-label">${t("notes.noteName")}<input class="field" id="aiName" type="text" maxlength="120" value="${s.name}"></label>
            <div class="ai-answer note-view note-card">${noteText(r.text)}</div>` : html`<p class="warn-box">${t("aiImport.nothing")}</p>`)
          : r.items.length ? html`<p class="hint">${t("aiImport.found", { n: r.items.length, kept: s.keep.size })}${problems.length ? ` ${t("aiImport.leftOut", { list: problems.map(([k, n]) => `${n} ${t(`aiImport.problem.${k}`)}`).join(", ") })}` : ""}</p>
            <div class="actions-row"><button type="button" class="link" data-action="all">${s.keep.size === r.items.length ? t("aiImport.none") : t("aiImport.all")}</button></div>
            ${r.items.map((it, i) => html`<article class="qcard gen ${s.keep.has(i) ? "" : "off"}">
              <label class="switch-row"><input type="checkbox" data-i="${i}" ${s.keep.has(i) ? "checked" : ""}><strong>${i + 1}.</strong></label>
              ${kind === "cards" ? html`<div class="qtext"><strong>Q:</strong> ${richText(it.front)}</div><div class="qtext"><strong>A:</strong> ${richText(it.back)}</div>`
                : html`<div class="qtext">${richText(it.text)}</div>
                  <ol class="options">${it.options.map((o, j) => html`<li class="${j === it.answerIndex ? "right" : ""}"><span class="opt-letter">${letterFor(j)}</span><span class="opt-text">${richText(o)}</span>${j === it.answerIndex ? html`<span class="tick">✓</span>` : ""}</li>`)}</ol>
                  ${it.explanation ? html`<p class="hint">${richText(it.explanation)}</p>` : ""}`}</article>`)}`
            : html`<p class="warn-box">${t("aiImport.nothing")}${problems.length ? ` ${t("aiImport.leftOut", { list: problems.map(([k, n]) => `${n} ${t(`aiImport.problem.${k}`)}`).join(", ") })}` : ""}</p>`}
        <p class="warn-box">${t("aiImport.check")}</p>
        <div class="sheet-actions sticky"><button type="button" class="btn btn-quiet" data-action="clear">${t("common.clear")}</button>
          <button type="button" class="btn" data-action="save" ${(kind === "note" ? r.text : s.keep.size) ? "" : "disabled"}>${t("aiImport.save", { n: kind === "note" ? 1 : s.keep.size })}</button></div></section>` : ""}`;
    typesetMath(container);
    const paste = container.querySelector("#aiPaste");
    paste.addEventListener("input", () => { s.text = paste.value; });
    container.querySelector("#aiBy").addEventListener("input", (e) => { s.by = e.target.value; });
    container.querySelector("#aiName")?.addEventListener("input", (e) => { s.name = e.target.value; });
    container.querySelectorAll("[data-i]").forEach((el) => el.addEventListener("change", () => {
      const i = Number(el.dataset.i); if (el.checked) s.keep.add(i); else s.keep.delete(i);
      el.closest(".qcard").classList.toggle("off", !el.checked);
      const btn = container.querySelector('[data-action="save"]'); btn.textContent = t("aiImport.save", { n: s.keep.size }); btn.disabled = !s.keep.size;
    }));
    onAction(container, {
      ...backHandler,
      kind: (el) => go("ai-import", { topic: topicId, kind: el.dataset.k }, { replace: true }),
      "copy-prompt": async () => {
        try { await navigator.clipboard.writeText(promptFor(kind, { subject: subject?.name || "", topic: topic.name, lang: locale() })); toast(t("aiImport.copied")); } catch { toast(t("common.copyFailed")); }
      },
      read: () => {
        if (!s.text.trim()) { toast(t("aiImport.pasteFirst")); paste.focus(); return; }
        s.read = kind === "questions" ? readQuestions(s.text) : kind === "cards" ? readCards(s.text) : readNote(s.text);
        s.keep = new Set((s.read.items || []).map((_, i) => i));
        if (kind === "note") s.name = titleFromText(s.read.text) || topic.name;
        store.touch();
        setTimeout(() => document.querySelector(".ai-import-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      },
      all: () => { s.keep = s.keep.size === s.read.items.length ? new Set() : new Set(s.read.items.map((_, i) => i)); store.touch(); },
      clear: () => { state.delete(key); store.touch(); },
      save: async (el) => {
        el.disabled = true;
        const by = s.by.trim().slice(0, 40);
        if (by) await store.quietly(() => store.setSetting("aiImportBy", by));
        const syllabus = store.currentSyllabus();
        const ref = { pasted: true, ...(by ? { from: by } : {}) };
        if (kind === "note") {
          await mut.savePdfNote({ topicId, pdfId: null, pdfName: (s.name || "").trim() || titleFromText(r.text) || topic.name, text: r.text, models: by ? [by] : null, pasted: true });
          toast(t("aiImport.savedNote"));
        } else {
          const chosen = r.items.filter((_, i) => s.keep.has(i));
          if (kind === "cards") await mut.saveCards(syllabus.id, topic.subjectId, topicId, chosen.map((it) => ({ front: it.front, back: it.back, sourceRef: ref, aiModel: aiModelOf(by) })));
          else await mut.saveAiQuestions(syllabus, topic.subjectId, topicId, chosen.map((it) => ({ ...it, sourceRef: ref, aiModel: aiModelOf(by) })));
          toast(t("aiImport.saved", { n: chosen.length }));
        }
        state.delete(key);
        go("topic", { id: topicId, mode: MODE[kind] });
      }
    });
  }
};
