/* Settings → Syllabuses: add, rename, marking scheme (exact fraction) and an
   optional exam pattern (number of questions and minutes for mocks). */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { runFlow, askText, confirmAction, showMessage } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { markingText } from "../../domain/scoring.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";

export function syllabiBlock() {
  return html`${store.syllabi().map((s) => {
    const mk = markingText(s.marking);
    const pattern = s.pattern?.questions ? t("syllabi.patternShort", { n: s.pattern.questions, m: s.pattern.minutes || "–" }) : null;
    return html`<button type="button" class="row" data-action="syl-edit" data-id="${s.id}">
      <span class="row-main"><span class="row-title">${s.name}</span>
      <span class="row-sub">${[t("syllabi.markingShort", { right: mk.right, wrong: mk.wrong }), pattern].filter(Boolean).join(" · ")}</span></span>
      <span class="chev-txt">›</span></button>`;
  })}
  <button type="button" class="link" data-action="syl-add">${t("syllabi.add")}</button>`;
}

export function addSyllabusFlow() {
  return runFlow(async () => {
    const name = await askText({ title: t("syllabi.add"), placeholder: t("syllabi.namePlaceholder"), confirmLabel: t("common.add") });
    if (!name) return;
    const syl = await mut.addSyllabus(name);
    toast(t("syllabi.added", { name: syl.name }));
  });
}

const num = (v, fallback) => { const n = Number(String(v).trim()); return Number.isFinite(n) ? n : fallback; };

export function editSyllabusFlow(id) {
  const s = store.syllabi().find((x) => x.id === id);
  if (!s) return;
  const body = openSheet(html`<h2>${t("syllabi.editTitle")}</h2>
    <label class="field-label">${t("syllabi.name")}<input class="field" id="sName" type="text" value="${s.name}"></label>
    <h3>${t("syllabi.marking")}</h3>
    <div class="marking-grid">
      <label class="field-label">${t("syllabi.pos")}<input class="field" id="sPos" type="number" inputmode="decimal" step="0.25" min="0" value="${s.marking.pos}"></label>
      <label class="field-label">${t("syllabi.negNum")}<input class="field" id="sNum" type="number" inputmode="decimal" step="1" min="0" value="${s.marking.negNum}"></label>
      <label class="field-label">${t("syllabi.negDen")}<input class="field" id="sDen" type="number" inputmode="numeric" step="1" min="1" value="${s.marking.negDen}"></label>
    </div>
    <p class="hint" id="sMarkWords"></p>
    <p class="hint">${t("syllabi.markingNote")}</p>
    <h3>${t("syllabi.pattern")}</h3>
    <p class="hint">${t("syllabi.patternHint")}</p>
    <div class="marking-grid two">
      <label class="field-label">${t("syllabi.patternQuestions")}<input class="field" id="sPq" type="number" inputmode="numeric" min="1" value="${s.pattern?.questions || ""}" placeholder="—"></label>
      <label class="field-label">${t("syllabi.patternMinutes")}<input class="field" id="sPm" type="number" inputmode="numeric" min="1" value="${s.pattern?.minutes || ""}" placeholder="—"></label>
    </div>
    <button type="button" class="link danger" data-action="delete">${t("syllabi.delete")}</button>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="save">${t("common.save")}</button>
    </div>`, {
    cancel: () => closeSheet(),
    save: async () => {
      const name = body.querySelector("#sName").value.trim();
      const marking = { pos: num(body.querySelector("#sPos").value, 1), negNum: num(body.querySelector("#sNum").value, 0), negDen: num(body.querySelector("#sDen").value, 1) };
      if (!name || marking.pos <= 0 || marking.negNum < 0 || marking.negDen <= 0) { toast(t("syllabi.invalid")); return; }
      const pq = Math.round(num(body.querySelector("#sPq").value, 0)); const pm = Math.round(num(body.querySelector("#sPm").value, 0));
      const pattern = pq > 0 ? { questions: pq, minutes: pm > 0 ? pm : null } : null;
      await mut.updateSyllabus(s, { name, marking, pattern });
      closeSheet();
      toast(t("syllabi.saved"));
    },
    delete: () => runFlow(async () => {
      const use = mut.syllabusUse(s.id);
      if (use.papers || use.tests) {
        await showMessage({ title: t("syllabi.cantDelete"), body: t("syllabi.cantDeleteBody", { papers: t("common.papers", { n: use.papers }), tests: t("common.tests", { n: use.tests }) }) });
        return;
      }
      if (store.syllabi().length < 2) { await showMessage({ title: t("syllabi.cantDelete"), body: t("syllabi.lastOne") }); return; }
      const ok = await confirmAction({ title: t("syllabi.deleteTitle", { name: s.name }), body: t("syllabi.deleteBody"), confirmLabel: t("common.delete"), danger: true });
      if (ok) { await mut.deleteSyllabus(s); toast(t("syllabi.deleted")); }
    })
  }, { label: t("syllabi.editTitle") });
  const words = () => {
    const m = { pos: num(body.querySelector("#sPos").value, 0), negNum: num(body.querySelector("#sNum").value, 0), negDen: num(body.querySelector("#sDen").value, 1) || 1 };
    const mk = markingText(m);
    body.querySelector("#sMarkWords").textContent = t("syllabi.markingWords", { right: mk.right, wrong: mk.wrong });
  };
  ["#sPos", "#sNum", "#sDen"].forEach((sel) => body.querySelector(sel).addEventListener("input", words));
  words();
}
