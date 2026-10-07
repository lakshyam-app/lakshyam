/* Settings: your data (import, backup, restore, undo, erase), storage, display, app. */
import { html, onAction } from "../../core/dom.js";
import { t, locale, LANGUAGES } from "../../core/i18n.js";
import { APP_VERSION } from "../../core/version.js";
import { isPersisted, requestPersistence, usage, formatBytes } from "../../core/storage-health.js";
import { checkForUpdate } from "../../core/sw-client.js";
import { toast } from "../../core/toast.js";
import { openSheet, updateSheet, closeSheet, setSheetDismissible } from "../../core/sheet.js";
import * as store from "../../data/store.js";
import { downloadBackup } from "../../data/backup.js";
import { takeSnapshot, listSnapshots, restoreSnapshot } from "../../data/snapshots.js";
import { startImport } from "../import/import-flow.js";
import { syllabiBlock, addSyllabusFlow, editSyllabusFlow } from "./syllabi.js";
import { runFlow, askText } from "../../core/dialogs.js";
import { aiBlock, openAiSettings } from "../ai/ai-settings.js";
import { namesBlock, namesHandlers } from "./names.js";
import { autoTimesLine, openAutoTimes } from "./difficulty-times.js";
import { editExam, examOf } from "../today/countdown.js";
import { can } from "../../core/entitlements.js";

const when = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

async function storageBlock() {
  const persisted = await isPersisted();
  const space = await usage();
  return html`
    <p>${persisted ? t("settings.persistentOn") : t("settings.persistentOff")}</p>
    ${persisted ? "" : html`<button type="button" class="btn btn-quiet" data-action="persist">${t("settings.persistentAsk")}</button>`}
    <p class="hint">${space
      ? t("settings.usage", { used: formatBytes(space.used), quota: formatBytes(space.quota) })
      : t("settings.usageUnknown")}</p>`;
}

function dataBlock() {
  const c = store.counts();
  const last = store.setting("lastBackupAt");
  if (store.isEmpty()) {
    return html`<p>${t("settings.importOldHint")}</p>
      <button type="button" class="btn" data-action="import">${t("settings.importOld")}</button>
      <button type="button" class="link" data-action="import">${t("settings.restore")}</button>
      <button type="button" class="link" data-action="undo">${t("settings.undo")}</button>`;
  }
  return html`
    <p>${t("settings.dataSummary", {
      papers: t("common.papers", { n: c.papers }), questions: t("common.questions", { n: c.questions }), tests: t("common.tests", { n: c.attempts })
    })}</p>
    <p class="hint">${last ? t("settings.lastBackup", { when: when(last) }) : t("settings.neverBackedUp")}</p>
    <button type="button" class="btn" data-action="backup">${t("settings.backupNow")}</button>
    <button type="button" class="link" data-action="import">${t("settings.importOld")}</button>
    <button type="button" class="link" data-action="import">${t("settings.restore")}</button>
    <button type="button" class="link" data-action="undo">${t("settings.undo")}</button>
    <button type="button" class="link danger" data-action="erase">${t("settings.erase")}</button>`;
}

async function openUndo() {
  const snaps = await listSnapshots();
  openSheet(html`<h2>${t("settings.undoTitle")}</h2>
    <p class="hint">${t("settings.undoBody")}</p>
    ${snaps.length ? html`<div class="rows">${snaps.map((s) => html`
      <button type="button" class="row" data-action="pick" data-id="${s.id}" data-at="${s.at}">
        <span class="row-main"><span class="row-title">${when(s.at)}</span>
          <span class="row-sub">${t(`settings.reason.${s.reason}`)} · ${t("common.questions", { n: s.counts.questions || 0 })} · ${t("common.tests", { n: s.counts.attempts || 0 })}</span></span>
      </button>`)}</div>` : html`<p>${t("settings.undoNone")}</p>`}
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button></div>`, {
    close: () => closeSheet(),
    pick: (el) => confirmUndo(el.dataset.id, Number(el.dataset.at))
  });
}

function confirmUndo(id, at) {
  updateSheet(html`<h2>${t("settings.undoConfirm", { when: when(at) })}</h2>
    <p>${t("settings.undoConfirmBody")}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="go">${t("settings.undoButton")}</button>
    </div>`, {
    cancel: () => closeSheet(),
    go: async () => {
      setSheetDismissible(false);
      await restoreSnapshot(id);
      setSheetDismissible(true);
      closeSheet();
      toast(t("settings.undoDone", { when: when(at) }));
    }
  });
}

function confirmErase() {
  openSheet(html`<h2>${t("settings.eraseTitle")}</h2>
    <p>${t("settings.eraseBody")}</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="cancel">${t("common.cancel")}</button>
      <button type="button" class="btn btn-danger" data-action="go">${t("settings.eraseButton")}</button>
    </div>`, {
    cancel: () => closeSheet(),
    go: async () => {
      setSheetDismissible(false);
      await takeSnapshot("erase");
      await store.commitRecords({}, "replace");
      setSheetDismissible(true);
      closeSheet();
      toast(t("settings.erased"));
    }
  });
}

export const settingsScreen = {
  id: "settings",
  async render(container, params = {}) {
    const goalNow = Number(store.setting("dailyGoal", 30)) || 30;
    container.innerHTML = html`
      <section class="settings">
        <h1>${t("settings.title")}</h1>
        <div class="group" id="sec-today">
          <h2>${t("settings.sectionToday")}</h2>
          <p class="field-label">${t("settings.goal")}</p>
          <div class="chip-wrap">${[10, 20, 30, 50, 75, 100].map((n) => html`<button type="button" class="pill ${goalNow === n ? "on" : ""}" data-action="goal" data-n="${n}">${n}</button>`)}
            <button type="button" class="pill ${[10, 20, 30, 50, 75, 100].includes(goalNow) ? "" : "on"}" data-action="goal-custom">${[10, 20, 30, 50, 75, 100].includes(goalNow) ? t("settings.goalOther") : goalNow}</button></div>
          <p class="hint">${t("settings.goalHint")}</p>
          <label class="field-label">${t("settings.name")}<input class="field" id="userName" type="text" value="${store.setting("userName", "")}" placeholder="${t("settings.namePlaceholder")}" autocomplete="off"></label>
          <label class="switch-row"><input type="checkbox" id="showCountdown" ${store.setting("showCountdown", true) !== false ? "checked" : ""}><span>${t("exam.showSetting")}</span></label>
          <button type="button" class="link" data-action="exam">📅 ${examOf(store.currentSyllabus()) ? t("exam.change") : t("exam.set")}</button>
          <label class="switch-row"><input type="checkbox" id="showDiary" ${store.setting("showDiary", true) !== false ? "checked" : ""}><span>${t("diary.showSetting")}</span></label>
          <label class="switch-row"><input type="checkbox" id="showStreak" ${store.setting("showStreak", true) !== false ? "checked" : ""}><span>${t("settings.showStreak")}</span></label>
          <label class="switch-row"><input type="checkbox" id="showGoal" ${store.setting("showGoal", true) !== false ? "checked" : ""}><span>${t("settings.showGoal")}</span></label>
        </div>
        <div class="group">
          <h2>${t("settings.sectionData")}</h2>
          ${dataBlock()}
        </div>
        ${store.syllabi().length ? html`<div class="group">
          <h2>${t("syllabi.title")}</h2>
          <div class="rows">${syllabiBlock()}</div>
        </div>` : ""}
        <div class="group" id="sec-ai">
          <h2>${t("ai.title")}</h2>
          <div id="aiBlock"></div>
          <label class="switch-row"><input type="checkbox" id="aiOnCards" ${store.setting("aiOnCards", true) !== false ? "checked" : ""}><span>${t("ai.onCards")}<span class="row-sub">${t("ai.onCardsHint")}</span></span></label>
        </div>
        <div class="group">
          <h2>${t("settings.sectionStorage")}</h2>
          <div id="storageBlock"></div>
        </div>
        <div class="group" id="sec-display">
          <h2>${t("settings.sectionDisplay")}</h2>
          <h3>${t("settings.appLang")}</h3>
          <div class="segmented two" role="group" aria-label="${t("settings.appLang")}">${LANGUAGES.map((l) => html`<button type="button" class="${locale() === l.code ? "on" : ""}" data-action="app-lang" data-v="${l.code}" lang="${l.code}" aria-pressed="${String(locale() === l.code)}">${l.name}</button>`)}</div>
          <p class="hint">${t("settings.appLangHint")}</p>
          <p>${t("settings.theme")}</p>
          ${can("malayalamNames") ? namesBlock() : ""}
          <label class="switch-row"><input type="checkbox" id="diffToggle" ${store.setting("difficultyEnabled", true) !== false ? "checked" : ""}>
            <span>${t("settings.difficulty")}<span class="row-sub">${t("settings.difficultyHint")}</span></span></label>
          ${store.setting("difficultyEnabled", true) !== false ? html`<p class="hint">${autoTimesLine()}</p>
          <button type="button" class="link" data-action="diff-times">${t("diffTimes.change")}</button>` : ""}
        </div>
        <div class="group">
          <h2>${t("settings.sectionApp")}</h2>
          <p>${t("app.name")}, ${t("settings.version", { version: APP_VERSION }).toLowerCase()}</p>
          <button type="button" class="btn btn-quiet" data-action="update">${t("settings.checkUpdate")}</button>
        </div>
        <div class="group quiet">
          <h2>${t("settings.comingTitle")}</h2>
          <p>${t("settings.coming")}</p>
        </div>
      </section>`;

    container.querySelector("#diffToggle").addEventListener("change", (e) => store.setSetting("difficultyEnabled", e.target.checked));
    container.querySelector("#aiOnCards").addEventListener("change", (e) => store.setSetting("aiOnCards", e.target.checked));
    container.querySelector("#showCountdown").addEventListener("change", (e) => store.setSetting("showCountdown", e.target.checked));
    container.querySelector("#showDiary").addEventListener("change", (e) => store.setSetting("showDiary", e.target.checked));
    container.querySelector("#showStreak").addEventListener("change", (e) => store.setSetting("showStreak", e.target.checked));
    container.querySelector("#showGoal").addEventListener("change", (e) => store.setSetting("showGoal", e.target.checked));
    container.querySelector("#userName").addEventListener("change", (e) => store.quietly(() => store.setSetting("userName", e.target.value.trim().slice(0, 40))).then(() => toast(t("settings.saved"))));
    aiBlock().then((markup) => { const el = container.querySelector("#aiBlock"); if (el) el.innerHTML = String(markup); });
    if (params.section) container.querySelector(`#sec-${params.section}`)?.scrollIntoView({ block: "start" });
    if (params.section === "ai") setTimeout(() => openAiSettings(), 50);

    const refreshStorage = async () => {
      const block = container.querySelector("#storageBlock");
      if (block) block.innerHTML = await storageBlock();
    };
    refreshStorage();

    onAction(container, {
      import: startImport,
      undo: openUndo,
      ...namesHandlers,
      "diff-times": () => openAutoTimes(),
      "app-lang": (el) => store.setSetting("appLang", el.dataset.v),
      exam: () => editExam(),
      "ai-settings": () => openAiSettings(),
      goal: (el) => store.setSetting("dailyGoal", Number(el.dataset.n)),
      "goal-custom": () => runFlow(async () => {
        const v = await askText({ title: t("settings.goal"), hint: t("settings.goalHint"), value: String(goalNow), inputMode: "numeric" });
        const n = Math.round(Number(v));
        if (v !== null && n >= 1 && n <= 500) await store.setSetting("dailyGoal", n);
        else if (v !== null) toast(t("settings.goalInvalid"));
      }),
      "syl-add": addSyllabusFlow,
      "syl-edit": (el) => editSyllabusFlow(el.dataset.id),
      erase: confirmErase,
      backup: async () => {
        // Saved first, so the backup itself records when it was made.
        await store.setSetting("lastBackupAt", Date.now());
        downloadBackup();
        toast(t("settings.backupSaved"));
      },
      persist: async () => {
        const granted = await requestPersistence();
        toast(granted ? t("settings.persistentGranted") : t("settings.persistentDenied"), { duration: 5000 });
        refreshStorage();
      },
      update: async (button) => {
        button.disabled = true;
        button.textContent = t("settings.checking");
        const result = await checkForUpdate();
        button.disabled = false;
        button.textContent = t("settings.checkUpdate");
        if (result === "offline") toast(t("settings.offlineNow"));
        else if (result === "latest") toast(t("settings.upToDate"));
      }
    });
  }
};
