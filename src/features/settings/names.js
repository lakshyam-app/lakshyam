/* Malayalam names for subjects and topics.
   - Settings → Display: English · മലയാളം · Both, plus (when not English)
     add names from the Kerala PSC syllabus, import / export a names file,
     and "Check names" for names marked for review
   - The name editor (⋯ → Rename): English and Malayalam fields and "Checked"
   Nothing Malayalam-related shows anywhere while the setting is English. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { openSheet, closeSheet, isSheetOpen, sheetBody } from "../../core/sheet.js";
import { confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { pickJsonFile } from "../../core/files.js";
import { nameMode, NAME_MODES, label } from "../../core/names.js";
import * as store from "../../data/store.js";
import * as mut from "../../data/mutations.js";
import { planNames, exportNames } from "../../data/ml-names.js";
import { renameTopicTo, renameSubjectTo } from "../library/topic-actions.js";

export const SEED_URL = "content/taxonomy-ml.json";

const counts = () => {
  const all = [...store.all("subjects"), ...store.all("topics")];
  return { total: all.length, named: all.filter((r) => r.nameMl).length, review: all.filter((r) => r.nameMl && r.nameMlStatus !== "official").length };
};

/** The block inside Settings → Display. */
export function namesBlock() {
  const mode = nameMode();
  const c = counts();
  return html`<h3>${t("names.setting")}</h3>
    <div class="segmented three" role="group" aria-label="${t("names.setting")}">${NAME_MODES.map((m) => html`<button type="button" class="${mode === m ? "on" : ""}" data-action="name-mode" data-v="${m}" aria-pressed="${String(mode === m)}" ${m === "ml" ? html`lang="ml"` : ""}>${t(`names.mode.${m}`)}</button>`)}</div>
    ${mode === "en" ? html`<p class="hint">${t("names.offHint")}</p>` : html`
      <p class="hint">${t("names.summary", { named: c.named, total: c.total })}${c.review ? ` ${t("names.reviewCount", { n: c.review })}` : ""}</p>
      <button type="button" class="btn btn-quiet" data-action="names-seed">${t("names.seed")}</button>
      ${c.review ? html`<button type="button" class="link" data-action="names-review">${t("names.check", { n: c.review })}</button>` : ""}
      <button type="button" class="link" data-action="names-import">${t("names.import")}</button>
      ${c.named ? html`<button type="button" class="link" data-action="names-export">${t("names.export")}</button>` : ""}`}`;
}

export const namesHandlers = {
  "name-mode": (el) => store.setSetting("nameLang", el.dataset.v),
  "names-seed": () => importNames("seed"),
  "names-import": () => importNames("file"),
  "names-export": () => exportNamesFile(),
  "names-review": () => reviewSheet()
};

/* ---------- import (from the syllabus seed or your file) ---------- */

async function loadSource(source) {
  if (source === "seed") {
    const res = await fetch(SEED_URL, { credentials: "same-origin" });
    if (!res.ok) throw new Error(t("names.seedMissing"));
    return { name: t("names.seedName"), json: await res.json() };
  }
  const file = await pickJsonFile();
  if (!file) return null;
  if (file.error) throw new Error(t("names.fileBad"));
  return { name: file.name, json: file.json };
}

export async function importNames(source) {
  let src;
  try { src = await loadSource(source); } catch (e) { toast(e.message, { duration: 5000 }); return; }
  if (!src) return;
  const opts = { replace: false, official: false };
  const draw = () => {
    const plan = planNames(src.json, store.all("subjects"), store.all("topics"), opts);
    const r = plan.report;
    if (!r.ok) {
      openSheet(html`<h2>${t("names.importTitle")}</h2><p class="warn-box">${t("names.fileBad")}</p>
        <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
      return;
    }
    const changes = plan.subjects.length + plan.topics.length;
    const list = (items, n = 8) => (items.length ? html`<ul class="name-list">${items.slice(0, n).map((x) => html`<li>${x}</li>`)}${items.length > n ? html`<li class="hint">${t("names.andMore", { n: items.length - n })}</li>` : ""}</ul>` : "");
    openSheet(html`<h2>${t("names.importTitle")}</h2>
      <p class="hint">${src.name}${source === "seed" ? html`<br>${src.json.source || ""}` : ""}</p>
      <table class="report"><tbody>
        <tr><th>${t("names.r.filled")}</th><td>${r.filled}</td></tr>
        ${r.replaced ? html`<tr><th>${t("names.r.replaced")}</th><td>${r.replaced}</td></tr>` : ""}
        ${r.statusOnly ? html`<tr><th>${t("names.r.statusOnly")}</th><td>${r.statusOnly}</td></tr>` : ""}
        <tr><th>${t("names.r.same")}</th><td>${r.same}</td></tr>
        <tr><th>${t("names.r.kept")}</th><td>${r.kept.length}</td></tr>
        <tr><th>${t("names.r.notFound")}</th><td>${r.notFound.length}</td></tr>
        ${r.invalid.length ? html`<tr><th>${t("names.r.invalid")}</th><td>${r.invalid.length}</td></tr>` : ""}
      </tbody></table>
      ${r.kept.length ? html`<details><summary>${t("names.keptList")}</summary>${list(r.kept.map((k) => html`${k.name}: <span lang="ml">${k.have}</span> → <span lang="ml">${k.file}</span>`))}</details>` : ""}
      ${r.notFound.length ? html`<details><summary>${t("names.notFoundList")}</summary><p class="hint">${t("names.notFoundHint")}</p>${list(r.notFound, 30)}</details>` : ""}
      ${r.invalid.length ? html`<details><summary>${t("names.invalidList")}</summary>${list(r.invalid)}</details>` : ""}
      ${r.kept.length || opts.replace ? html`<label class="switch-row"><input type="checkbox" data-opt="replace" ${opts.replace ? "checked" : ""}><span>${t("names.optReplace")}</span></label>` : ""}
      ${source === "file" ? html`<label class="switch-row"><input type="checkbox" data-opt="official" ${opts.official ? "checked" : ""}><span>${t("names.optOfficial")}<span class="row-sub">${t("names.optOfficialHint")}</span></span></label>`
        : html`<p class="hint">${t("names.seedNote")}</p>`}
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="apply" ${changes ? "" : "disabled"}>${changes ? t("names.apply", { n: changes }) : t("names.nothing")}</button></div>`, {
      close: () => closeSheet(),
      apply: async () => {
        const before = await mut.saveNames(plan);
        closeSheet();
        toast(t("names.applied", { n: changes }), { actionLabel: t("common.undo"), onAction: () => mut.restoreRecords(before), duration: 8000 });
      }
    }, { label: t("names.importTitle") });
    sheetBody().querySelectorAll("input[data-opt]").forEach((c) => c.addEventListener("change", () => { opts[c.dataset.opt] = c.checked; draw(); }));
  };
  draw();
}

function exportNamesFile() {
  const data = { format: "lakshyam-names", exportedAt: new Date().toISOString(), ...exportNames(store.all("subjects"), store.all("topics")) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "lakshyam-malayalam-names.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(t("names.exported"));
}

/* ---------- names marked for review ---------- */

function reviewSheet() {
  const subs = store.all("subjects").filter((r) => r.nameMl && r.nameMlStatus !== "official").map((r) => ({ kind: "subjects", r }));
  const tps = store.all("topics").filter((r) => r.nameMl && r.nameMlStatus !== "official")
    .sort((a, b) => label(store.subject(a.subjectId)).localeCompare(label(store.subject(b.subjectId))) || a.name.localeCompare(b.name)).map((r) => ({ kind: "topics", r }));
  const rows = [...subs, ...tps];
  if (!rows.length) { if (isSheetOpen()) closeSheet(); toast(t("names.allChecked")); return; }
  openSheet(html`<h2>${t("names.reviewTitle")}</h2><p class="hint">${t("names.reviewHint")}</p>
    <div class="menu">${rows.map(({ kind, r }) => html`<button type="button" class="menu-item" data-action="edit" data-kind="${kind}" data-id="${r.id}">
      <span class="row-main"><span>${r.name}</span><span class="row-sub" lang="ml">⚠ ${r.nameMl}</span>
      ${kind === "topics" ? html`<span class="row-sub">${store.subject(r.subjectId)?.name || ""}</span>` : ""}</span></button>`)}</div>
    <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    edit: (el) => {
      const rec = el.dataset.kind === "subjects" ? store.subject(el.dataset.id) : store.topic(el.dataset.id);
      const isSub = el.dataset.kind === "subjects";
      editNames(isSub ? "subject" : "topic", rec, { then: reviewSheet, onEnglish: (name) => (isSub ? renameSubjectTo(rec, name, { quiet: true }) : renameTopicTo(rec, name, { quiet: true })) });
    },
    close: () => closeSheet()
  }, { label: t("names.reviewTitle") });
}

/* ---------- the name editor ---------- */

/**
 * English + Malayalam names with a "Checked" switch.
 * onEnglish(newName) runs the normal rename (with merge) when the English name changed;
 * it returns the record that now holds the names (the merge target, if merged).
 * then: called after saving (e.g. back to the review list); otherwise the sheet closes.
 */
export function editNames(kind, rec, { onEnglish = null, then = null } = {}) {
  return new Promise((resolve) => {
    const body = openSheet(html`<h2>${t(kind === "subject" ? "subjectMenu.rename" : "topicMenu.rename")}</h2>
      ${kind === "topic" ? html`<p class="hint">${store.subject(rec.subjectId)?.name || ""}</p>` : ""}
      <label class="field-label">${t("names.english")}<input class="field" id="nmEn" type="text" value="${rec.name}" autocomplete="off"></label>
      ${onEnglish ? html`<p class="hint">${t("topicMenu.renameHint")}</p>` : ""}
      <label class="field-label">${t("names.malayalam")}<input class="field" id="nmMl" type="text" lang="ml" value="${rec.nameMl || ""}" autocomplete="off" placeholder="${t("names.mlPlaceholder")}"></label>
      ${rec.nameMl && rec.nameMlStatus !== "official" ? html`<p class="hint">⚠ ${t("names.needsReview")}</p>` : ""}
      <label class="switch-row"><input type="checkbox" id="nmOk" ${rec.nameMlStatus === "official" ? "checked" : ""}><span>${t("names.checked")}<span class="row-sub">${t("names.checkedHint")}</span></span></label>
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
        <button type="button" class="btn" data-action="save">${t("common.save")}</button></div>`, {
      cancel: () => { if (then) then(); else closeSheet(); resolve(false); },
      save: async () => {
        const en = body.querySelector("#nmEn").value.trim();
        const ml = body.querySelector("#nmMl").value.normalize("NFC").replace(/\s+/g, " ").trim();
        const status = body.querySelector("#nmOk").checked ? "official" : "review";
        if (!en) { body.querySelector("#nmEn").focus(); return; }
        if (ml.length > 200) { toast(t("names.tooLong")); return; }
        let target = rec;
        if (en !== rec.name) {
          if (!onEnglish) { toast(t("names.renameElsewhere")); return; }
          target = await onEnglish(en);
          if (!target) { resolve(false); return; } // merge cancelled
        }
        const fresh = (kind === "subject" ? store.subject(target.id) : store.topic(target.id)) || target;
        const mergedKeepsOwn = target.id !== rec.id && fresh.nameMl && fresh.nameMl !== ml;
        if (!mergedKeepsOwn && ((fresh.nameMl || "") !== ml || (ml && (fresh.nameMlStatus || "review") !== status))) {
          await mut.setMlName(kind === "subject" ? "subjects" : "topics", fresh, ml, status);
        }
        toast(t("names.saved"));
        if (then) then(); else if (isSheetOpen()) closeSheet();
        resolve(true);
      }
    }, { label: t("names.editTitle"), onClose: () => resolve(false) });
  });
}

/** Opens Settings at the Display section. */
export const openNameSettings = () => go("settings", { section: "display" });
