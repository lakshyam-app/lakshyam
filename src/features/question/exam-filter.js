/* "Choose exams to include" sheet with saved templates (per syllabus).
   Resolves: Set of paper IDs, null for "all", or undefined if cancelled. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";

export function pickExams({ papers, selected }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const chosen = new Set(selected || papers.map((p) => p.id));
    const syllabusId = store.currentSyllabus()?.id;
    let term = "";

    const visible = () => papers.filter((p) => !term || `${p.name} ${p.postName || ""}`.toLowerCase().includes(term.toLowerCase()));
    const templates = () => store.all("filterTemplates").filter((x) => x.syllabusId === syllabusId);

    const body = openSheet(html`<h2>${t("exams.title")}</h2>
      <p class="hint">${t("exams.hint")}</p>
      <input type="search" class="search" id="exSearch" placeholder="${t("exams.search")}" autocomplete="off">
      <div class="row-actions">
        <button type="button" class="link" data-action="all">${t("exams.selectAll")}</button>
        <button type="button" class="link" data-action="none">${t("exams.selectNone")}</button>
      </div>
      <div class="checks" id="exList"></div>
      <h3>${t("exams.templates")}</h3>
      <div id="exTpl"></div>
      <div class="inline-form">
        <input class="field" id="exTplName" type="text" placeholder="${t("exams.templateName")}" autocomplete="off">
        <button type="button" class="btn btn-quiet" data-action="save-tpl">${t("common.save")}</button>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="apply">${t("exams.apply")}</button>
      </div>`, {
      toggle: (el) => { const id = el.dataset.id; if (chosen.has(id)) chosen.delete(id); else chosen.add(id); drawList(); },
      all: () => { visible().forEach((p) => chosen.add(p.id)); drawList(); },
      none: () => { visible().forEach((p) => chosen.delete(p.id)); drawList(); },
      "apply-tpl": (el) => {
        const tpl = store.byId("filterTemplates", el.dataset.id);
        chosen.clear();
        tpl.paperIds.filter((id) => papers.some((p) => p.id === id)).forEach((id) => chosen.add(id));
        drawList();
        toast(t("exams.applied", { name: tpl.name }));
      },
      "del-tpl": async (el) => {
        await store.quietly(() => mut.deleteTemplate(store.byId("filterTemplates", el.dataset.id)));
        drawTemplates();
      },
      "save-tpl": async () => {
        const input = body.querySelector("#exTplName");
        if (!input.value.trim()) { input.focus(); return; }
        await store.quietly(() => mut.saveTemplate(syllabusId, input.value, [...chosen]));
        input.value = "";
        drawTemplates();
        toast(t("exams.saved"));
      },
      cancel: () => { finish(undefined); closeSheet(); },
      apply: () => {
        if (!chosen.size) { toast(t("exams.pickOne")); return; }
        finish(chosen.size === papers.length ? null : new Set(chosen));
        closeSheet();
      }
    }, { label: t("exams.title"), onClose: () => finish(undefined) });

    function drawList() {
      const rows = visible();
      body.querySelector("#exList").innerHTML = rows.length ? html`${rows.map((p) => html`
        <button type="button" class="check ${chosen.has(p.id) ? "on" : ""}" data-action="toggle" data-id="${p.id}" aria-pressed="${String(chosen.has(p.id))}">
          <span class="box">${chosen.has(p.id) ? "✓" : ""}</span>
          <span class="row-main"><span>${p.name}</span>
            <span class="row-sub">${[p.postName, t("common.questions", { n: p.count })].filter(Boolean).join(" · ")}</span></span>
        </button>`)}` : html`<p class="hint">${t("library.nothingFound", { q: term })}</p>`;
    }
    function drawTemplates() {
      const list = templates();
      body.querySelector("#exTpl").innerHTML = list.length ? html`${list.map((x) => html`<div class="tpl">
        <span class="row-main"><span>${x.name}</span><span class="row-sub">${t("common.papers", { n: x.paperIds.length })}</span></span>
        <button type="button" class="btn btn-quiet btn-small" data-action="apply-tpl" data-id="${x.id}">${t("exams.useTemplate")}</button>
        <button type="button" class="icon-sm" data-action="del-tpl" data-id="${x.id}" aria-label="${t("common.delete")}">✕</button>
      </div>`)}` : html`<p class="hint">${t("exams.noTemplates")}</p>`;
    }
    body.querySelector("#exSearch").addEventListener("input", (e) => { term = e.target.value; drawList(); });
    drawList();
    drawTemplates();
  });
}
