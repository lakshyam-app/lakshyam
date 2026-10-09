/* Settings: a search box and eight groups. Each group opens on its own page
   (#/settings?section=<group>); search also finds settings that live on other
   screens (Progress ⚙, the AI sheet, the timetable) and takes you straight there. */
import { html, onAction } from "../../core/dom.js";
import { t, locale, LANGUAGES } from "../../core/i18n.js";
import { APP_VERSION } from "../../core/version.js";
import { isPersisted, requestPersistence, usage, formatBytes } from "../../core/storage-health.js";
import { checkForUpdate } from "../../core/sw-client.js";
import { toast } from "../../core/toast.js";
import { go } from "../../core/router.js";
import { THEMES, TEXT_SIZES } from "../../core/theme.js";
import { AWAKE_MODES, awakeSupported } from "../../core/wake.js";
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
import { allExams } from "../../data/exams.js";
import { upcoming } from "../../domain/exams.js";
import { openStatsSettings } from "../progress/progress.js";
import { can } from "../../core/entitlements.js";
import * as presets from "../../ai/presets.js";
import { header, backHandler } from "../library/library.js";
import { driveBlock, driveHandlers, driveConfig, paintBackgroundLine } from "./drive.js";
import { settingsBlock as pdfCloudBlock, settingsHandlers as pdfCloudHandlers } from "../pdfs/pdf-cloud.js";
import { openGuideSheet } from "../guide/guide.js";
import { remindersState } from "../reminders/reminders.js";
import { SETTINGS_INDEX, CATEGORIES, CATEGORY_ICON, searchSettings } from "./settings-index.js";

const when = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const GOALS = [10, 20, 30, 50, 75, 100];
const SIZES = [10, 25, 50, 100];
const ALIASES = { display: "look" };
let query = ""; // the search box; kept in the address (?q=) so Back from a group returns to the same results

const testDefaults = () => ({ timerOn: false, layout: "single", count: 25, ...(store.setting("testDefaults") || {}) });
const on = (key) => store.setting(key, true) !== false;
const seg = (items, cls = "") => html`<div class="segmented ${items.length === 3 ? "three" : "two"} ${cls}" role="group">${items.map((it) => html`<button type="button" class="${it.on ? "on" : ""}" data-action="${it.action}" data-v="${it.v}" aria-pressed="${String(Boolean(it.on))}" ${it.lang ? html`lang="${it.lang}"` : ""}>${it.label}</button>`)}</div>`;
const sw = (id, key, label, hint = "") => html`<label class="switch-row" data-set="${id}"><input type="checkbox" data-switch="${key}" ${on(key) ? "checked" : ""}><span>${label}${hint ? html`<span class="row-sub">${hint}</span>` : ""}</span></label>`;

/* ---------- blocks ---------- */

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
      <button type="button" class="btn" data-action="import" data-set="importOld">${t("settings.importOld")}</button>
      <button type="button" class="link" data-action="import" data-set="restore">${t("settings.restore")}</button>
      <button type="button" class="link" data-action="undo" data-set="undo">${t("settings.undo")}</button>`;
  }
  return html`
    <p>${t("settings.dataSummary", {
      papers: t("common.papers", { n: c.papers }), questions: t("common.questions", { n: c.questions }), tests: t("common.tests", { n: c.attempts })
    })}</p>
    <p class="hint">${last ? t("settings.lastBackup", { when: when(last) }) : t("settings.neverBackedUp")}</p>
    <button type="button" class="btn" data-action="backup" data-set="backup">${t("settings.backupNow")}</button>
    <button type="button" class="link" data-action="import" data-set="importOld">${t("settings.importOld")}</button>
    <button type="button" class="link" data-action="import" data-set="restore">${t("settings.restore")}</button>
    <button type="button" class="link" data-action="undo" data-set="undo">${t("settings.undo")}</button>
    <button type="button" class="link danger" data-action="erase" data-set="erase">${t("settings.erase")}</button>`;
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

/* ---------- one page per group ---------- */

const PAGES = {
  today() {
    const goalNow = Number(store.setting("dailyGoal", 30)) || 30;
    const custom = !GOALS.includes(goalNow);
    return html`<div class="group" data-set="goal">
        <p class="field-label">${t("settings.goal")}</p>
        <div class="chip-wrap">${GOALS.map((n) => html`<button type="button" class="pill ${goalNow === n ? "on" : ""}" data-action="goal" data-n="${n}">${n}</button>`)}
          <button type="button" class="pill ${custom ? "on" : ""}" data-action="goal-custom">${custom ? goalNow : t("settings.goalOther")}</button></div>
        <p class="hint">${t("settings.goalHint")}</p>
      </div>
      <div class="group">
        <button type="button" class="row" data-action="exam" data-set="exam"><span class="row-main"><span class="row-title">📅 ${t("cd.title")}</span>
          <span class="row-sub">${t("cd.settingsSub", { n: upcoming(allExams()).length })}</span></span><span class="chev-txt">›</span></button>
        <button type="button" class="row" data-action="reminders" data-set="reminders"><span class="row-main"><span class="row-title">🔔 ${t("rem.title")}</span>
          <span class="row-sub">${t("rem.rowSub", { state: t(`rem.state${{ off: "Off", on: "On", paused: "Paused", stopped: "Stopped" }[remindersState()]}`) })}</span></span><span class="chev-txt">›</span></button>
        ${sw("countdown", "showCountdown", t("exam.showSetting"))}
        ${sw("diary", "showDiary", t("diary.showSetting"))}
        ${sw("streak", "showStreak", t("settings.showStreak"))}
        ${sw("showGoal", "showGoal", t("settings.showGoal"))}
      </div>
      <div class="group" data-set="name">
        <label class="field-label">${t("settings.name")}<input class="field" id="userName" type="text" value="${store.setting("userName", "")}" placeholder="${t("settings.namePlaceholder")}" autocomplete="off"></label>
      </div>`;
  },

  look() {
    const theme = store.setting("theme", "system");
    return html`<div class="group" data-set="theme">
        <h3>${t("setx.theme")}</h3>
        <div class="theme-pick" role="group" aria-label="${t("setx.theme")}">${THEMES.map((v) => html`<button type="button" class="${theme === v ? "on" : ""}" data-action="theme" data-v="${v}" aria-pressed="${String(theme === v)}">
          <span class="tp-swatch tp-${v}" aria-hidden="true"><i></i><i></i></span><span class="tp-name">${t(`setx.themes.${v}`)}</span></button>`)}</div>
        <p class="hint">${t("setx.themeHint")}</p>
      </div>
      <div class="group" data-set="textSize">
        <h3>${t("setx.textSize")}</h3>
        ${seg(TEXT_SIZES.map((v) => ({ action: "text-size", v, on: store.setting("textSize", "m") === v, label: t(`setx.sizes.${v}`) })))}
        <p class="text-preview">${t("setx.textPreview")}</p>
        <p class="hint">${t("setx.textSizeHint")}</p>
      </div>
      <div class="group" data-set="appLang">
        <h3>${t("settings.appLang")}</h3>
        ${seg(LANGUAGES.map((l) => ({ action: "app-lang", v: l.code, on: locale() === l.code, label: l.name, lang: l.code })))}
        <p class="hint">${t("settings.appLangHint")}</p>
      </div>
      ${can("malayalamNames") ? html`<div class="group" data-set="names namesFile">${namesBlock()}</div>` : ""}`;
  },

  tests() {
    const d = testDefaults();
    const view = store.setting("questionView", "study");
    const listLayout = store.setting("listLayout", "scroll");
    const resLayout = store.setting("resultLayout", null);
    const diffOn = on("difficultyEnabled");
    return html`<div class="group">
        <h3>${t("setx.testDefaults")}</h3>
        <p class="field-label" data-set="timer">${t("setx.timerDefault")}</p>
        ${seg([{ action: "td-timer", v: "0", on: !d.timerOn, label: t("start.timerOff") }, { action: "td-timer", v: "1", on: d.timerOn, label: t("start.timerOn") }])}
        <p class="field-label" data-set="testLayout">${t("setx.testLayout")}</p>
        ${seg(["single", "scroll"].map((v) => ({ action: "td-layout", v, on: d.layout === v, label: t(`layout.${v}`) })))}
        <p class="field-label" data-set="testCount">${t("setx.testCount")}</p>
        <div class="chip-wrap">${SIZES.map((n) => html`<button type="button" class="pill ${d.count === n ? "on" : ""}" data-action="td-count" data-n="${n}">${n}</button>`)}</div>
        <p class="hint">${t("setx.testDefaultsHint")}</p>
      </div>
      <div class="group">
        <h3>${t("setx.lists")}</h3>
        <p class="field-label" data-set="listView">${t("setx.listView")}</p>
        ${seg(["study", "selftest"].map((v) => ({ action: "q-view", v, on: view === v, label: t(`view.${v}`) })))}
        <p class="field-label" data-set="listLayout">${t("setx.listLayout")}</p>
        ${seg(["scroll", "single"].map((v) => ({ action: "l-layout", v, on: listLayout === v, label: t(`layout.${v}`) })))}
        <p class="field-label" data-set="resultLayout">${t("setx.resultLayout")}</p>
        ${seg([{ action: "r-layout", v: "", on: !resLayout, label: t("setx.resultSame") }, ...["scroll", "single"].map((v) => ({ action: "r-layout", v, on: resLayout === v, label: t(`layout.${v}`) }))])}
      </div>
      <div class="group" data-set="keepAwake">
        <h3>${t("setx.keepAwake")}</h3>
        <div class="menu">${AWAKE_MODES.map((v) => html`<button type="button" class="menu-item ${store.setting("keepAwake", "tests") === v ? "is-current" : ""}" data-action="keep-awake" data-v="${v}">
          <span class="row-main"><span>${t(`setx.awake.${v}`)}</span></span>${store.setting("keepAwake", "tests") === v ? html`<span class="tick">✓</span>` : ""}</button>`)}</div>
        <p class="hint">${awakeSupported() ? t("setx.awakeHint") : t("setx.awakeNo")}</p>
      </div>
      <div class="group">${sw("focusCheck", "focusCheck", t("setx.focusCheck"), t("setx.focusCheckHint"))}</div>
      <div class="group">
        ${sw("difficulty", "difficultyEnabled", t("settings.difficulty"), t("settings.difficultyHint"))}
        ${diffOn ? html`<p class="hint">${autoTimesLine()}</p>
        <button type="button" class="link" data-action="diff-times" data-set="diffTimes">${t("diffTimes.change")}</button>` : ""}
      </div>`;
  },

  progress() {
    const basis = ["first", "latest", "all"].includes(store.setting("statsBasis")) ? store.setting("statsBasis") : "first";
    return html`<div class="group" data-set="basis">
        <h3>${t("stats.basisTitle")}</h3>
        <div class="menu">${["first", "latest", "all"].map((b) => html`<button type="button" class="menu-item ${basis === b ? "is-current" : ""}" data-action="basis" data-v="${b}">
          <span class="row-main"><span>${t(`stats.basis.${b}`)}</span><span class="row-sub">${t(`stats.basisInfo.${b}`)}</span></span>${basis === b ? html`<span class="tick">✓</span>` : ""}</button>`)}</div>
      </div>
      <div class="group" data-set="fresh">
        <h3>${t("stats.freshTitle")}</h3>
        <p class="hint">${t("stats.freshInfo")}</p>
        <button type="button" class="btn btn-quiet" data-action="stats">${t("setx.statsFresh")}</button>
      </div>`;
  },

  syllabi() {
    return html`<div class="group" data-set="syllabi marking pattern"><div class="rows">${syllabiBlock()}</div></div>`;
  },

  ai() {
    return html`<div class="group" data-set="presets aiLang fallback pause removeKeys"><div id="aiBlock"></div></div>
      <div class="group">${sw("aiOnCards", "aiOnCards", t("ai.onCards"), t("ai.onCardsHint"))}</div>`;
  },

  data() {
    return html`${store.isEmpty() ? "" : driveBlock()}
      <div class="group">${dataBlock()}</div>
      <div class="group" data-set="pdfCloud" id="pdfCloudBlock"></div>
      <div class="group" data-set="protect">
        <h3>${t("settings.sectionStorage")}</h3>
        <div id="storageBlock"></div>
      </div>`;
  },

  about() {
    return html`<div class="group" data-set="update">
        <p>${t("app.name")}, ${t("settings.version", { version: APP_VERSION }).toLowerCase()}</p>
        <button type="button" class="btn btn-quiet" data-action="update">${t("settings.checkUpdate")}</button>
      </div>`;
  }
};

/* ---------- the start page ---------- */

function catSubs(aiSummary) {
  const d = testDefaults();
  const syl = store.currentSyllabus();
  const last = store.setting("lastBackupAt");
  const basis = ["first", "latest", "all"].includes(store.setting("statsBasis")) ? store.setting("statsBasis") : "first";
  return {
    today: t("setx.catSub.today", { goal: Number(store.setting("dailyGoal", 30)) || 30, exam: upcoming(allExams()).length || t("setx.examNone") }),
    look: t("setx.catSub.look", { theme: t(`setx.themes.${store.setting("theme", "system")}`), lang: LANGUAGES.find((l) => l.code === locale())?.name || "" }),
    tests: t("setx.catSub.tests", { timer: d.timerOn ? t("setx.on") : t("setx.off"), layout: t(`layout.${d.layout === "scroll" ? "scroll" : "singleShort"}`), diff: on("difficultyEnabled") ? t("setx.on") : t("setx.off") }),
    progress: t("setx.catSub.progress", { basis: t(`stats.basis.${basis}`) }),
    syllabi: t("setx.catSub.syllabi", { n: store.syllabi().length, current: syl?.name || "–" }),
    ai: aiSummary,
    data: `${driveConfig().connected ? "☁ " : ""}${last ? t("settings.lastBackup", { when: when(last) }) : t("settings.neverBackedUp")}`,
    about: t("setx.catSub.about", { version: APP_VERSION })
  };
}

function resultsHtml(q) {
  const hits = searchSettings(q);
  if (!hits.length) return html`<p class="hint pad">${t("setx.noMatch", { q })}</p>`;
  return html`<p class="hint">${t("setx.results", { n: hits.length })}</p>
    <div class="rows">${hits.map((it) => html`<button type="button" class="row" data-action="hit" data-id="${it.id}">
      <span class="set-icon" aria-hidden="true">${CATEGORY_ICON[it.id] || CATEGORY_ICON[it.cat] || "↗"}</span>
      <span class="row-main"><span class="row-title">${it.label()}</span><span class="row-sub">${it.cat === "elsewhere" ? t("setx.elsewhere") : t(`setx.cat.${it.cat}`)}</span></span>
      <span class="chev-txt">›</span></button>`)}</div>`;
}

function homeHtml(subs) {
  return html`<section class="settings">
    <h1>${t("settings.title")}</h1>
    <div class="set-search">
      <input class="field" type="search" id="setSearch" value="${query}" placeholder="${t("setx.searchHint")}" aria-label="${t("setx.search")}" autocomplete="off" enterkeyhint="search">
    </div>
    <button type="button" class="row guide-row" data-action="guide"><span class="set-icon" aria-hidden="true">📖</span>
      <span class="row-main"><span class="row-title">${t("guide.title")}</span><span class="row-sub">${t("guide.rowSub")}</span></span><span class="chev-txt">›</span></button>
    <div id="setBody">${query.trim() ? resultsHtml(query.trim()) : catList(subs)}</div>
  </section>`;
}

function catList(subs) {
  return html`<div class="rows set-cats">${CATEGORIES.map((c) => html`<button type="button" class="row" data-action="cat" data-id="${c}">
      <span class="set-icon" aria-hidden="true">${CATEGORY_ICON[c]}</span>
      <span class="row-main"><span class="row-title">${t(`setx.cat.${c}`)}</span><span class="row-sub" data-sub="${c}">${subs[c] || ""}</span></span>
      <span class="chev-txt">›</span></button>`)}</div>
    <h3 class="rows-head">${t("setx.elsewhere")}</h3>
    <div class="rows"><button type="button" class="row" data-action="hit" data-id="exam">
      <span class="set-icon" aria-hidden="true">📅</span>
      <span class="row-main"><span class="row-title">${t("cd.title")}</span><span class="row-sub">${t("cd.settingsSub", { n: upcoming(allExams()).length })}</span></span>
      <span class="chev-txt">›</span></button><button type="button" class="row" data-action="hit" data-id="reminders">
      <span class="set-icon" aria-hidden="true">🔔</span>
      <span class="row-main"><span class="row-title">${t("rem.title")}</span><span class="row-sub">${t("rem.rowSub", { state: t(`rem.state${{ off: "Off", on: "On", paused: "Paused", stopped: "Stopped" }[remindersState()]}`) })}</span></span>
      <span class="chev-txt">›</span></button><button type="button" class="row" data-action="hit" data-id="timetable">
      <span class="set-icon" aria-hidden="true">🗓</span>
      <span class="row-main"><span class="row-title">${t("setx.timetable")}</span><span class="row-sub">${t("setx.timetableSub")}</span></span>
      <span class="chev-txt">›</span></button></div>`;
}

async function aiSummaryText() {
  const list = await presets.getPresets();
  const cfg = await presets.getConfig();
  const active = list.find((p) => p.id === cfg.activeId) || list[0];
  return list.length ? t("ai.summary", { n: list.length, active: active?.name || "" }) : t("ai.none");
}

/* ---------- actions ---------- */

const ACTIONS = {
  exam: () => go("exams"),
  reminders: () => go("reminders"),
  "ai-settings": () => openAiSettings(),
  undo: () => openUndo(),
  "diff-times": () => openAutoTimes(),
  stats: () => openStatsSettings(),
  guide: () => openGuideSheet(),
  timetable: () => go("timetable"),
  "names-import": () => namesHandlers["names-import"](),
  erase: () => confirmErase()
};

/** A search hit: run its action, or open its group with the setting highlighted. */
function openHit(id) {
  const it = SETTINGS_INDEX.find((x) => x.id === id);
  if (!it) return;
  if (it.cat !== "elsewhere") go("settings", { section: it.cat, focus: it.id });
  if (it.act) setTimeout(() => ACTIONS[it.act]?.(), it.cat === "elsewhere" ? 0 : 120);
}

function handlers(container, goalNow) {
  return {
    ...backHandler,
    ...namesHandlers,
    ...driveHandlers,
    cat: (el) => go("settings", { section: el.dataset.id }),
    hit: (el) => openHit(el.dataset.id),
    guide: () => openGuideSheet(),
    import: startImport,
    undo: openUndo,
    erase: confirmErase,
    exam: () => go("exams"),
    reminders: () => go("reminders"),
    stats: () => openStatsSettings(),
    "diff-times": () => openAutoTimes(),
    "ai-settings": () => openAiSettings(),
    "app-lang": (el) => store.setSetting("appLang", el.dataset.v),
    theme: (el) => store.setSetting("theme", el.dataset.v),
    "text-size": (el) => store.setSetting("textSize", el.dataset.v),
    "keep-awake": (el) => store.setSetting("keepAwake", el.dataset.v),
    goal: (el) => store.setSetting("dailyGoal", Number(el.dataset.n)),
    "goal-custom": () => runFlow(async () => {
      const v = await askText({ title: t("settings.goal"), hint: t("settings.goalHint"), value: String(goalNow), inputMode: "numeric" });
      const n = Math.round(Number(v));
      if (v !== null && n >= 1 && n <= 500) await store.setSetting("dailyGoal", n);
      else if (v !== null) toast(t("settings.goalInvalid"));
    }),
    "td-timer": (el) => store.setSetting("testDefaults", { ...testDefaults(), timerOn: el.dataset.v === "1" }),
    "td-layout": (el) => store.setSetting("testDefaults", { ...testDefaults(), layout: el.dataset.v }),
    "td-count": (el) => store.setSetting("testDefaults", { ...testDefaults(), count: Number(el.dataset.n) }),
    "q-view": (el) => store.setSetting("questionView", el.dataset.v),
    "l-layout": (el) => store.setSetting("listLayout", el.dataset.v),
    "r-layout": (el) => store.setSetting("resultLayout", el.dataset.v || null),
    basis: (el) => store.setSetting("statsBasis", el.dataset.v),
    "syl-add": addSyllabusFlow,
    "syl-edit": (el) => editSyllabusFlow(el.dataset.id),
    backup: async () => {
      // Saved first, so the backup itself records when it was made.
      await store.setSetting("lastBackupAt", Date.now());
      downloadBackup();
      toast(t("settings.backupSaved"));
    },
    persist: async () => {
      const granted = await requestPersistence();
      toast(granted ? t("settings.persistentGranted") : t("settings.persistentDenied"), { duration: 5000 });
      const block = container.querySelector("#storageBlock");
      if (block) block.innerHTML = await storageBlock();
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
  };
}

export const settingsScreen = {
  id: "settings",
  async render(container, params = {}) {
    const section = ALIASES[params.section] || params.section;
    const goalNow = Number(store.setting("dailyGoal", 30)) || 30;

    if (!PAGES[section]) {
      query = params.q || "";
      container.innerHTML = homeHtml(catSubs(""));
      aiSummaryText().then((s) => { const el = container.querySelector('[data-sub="ai"]'); if (el) el.textContent = s; });
      const input = container.querySelector("#setSearch");
      input.addEventListener("input", () => {
        query = input.value;
        history.replaceState(history.state, "", query.trim() ? `#/settings?q=${encodeURIComponent(query)}` : "#/settings");
        const body = container.querySelector("#setBody");
        body.innerHTML = query.trim() ? resultsHtml(query.trim()) : catList(catSubs(""));
        if (!query.trim()) aiSummaryText().then((s) => { const el = container.querySelector('[data-sub="ai"]'); if (el) el.textContent = s; });
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { const first = container.querySelector('#setBody [data-action="hit"]'); if (first) { e.preventDefault(); openHit(first.dataset.id); } }
      });
      onAction(container, handlers(container, goalNow));
      return;
    }

    container.innerHTML = html`<section class="settings set-page">
      ${header({ backTo: "settings", backParams: query.trim() ? { q: query } : {}, backLabel: t("setx.back"), title: `${CATEGORY_ICON[section]} ${t(`setx.cat.${section}`)}` })}
      ${PAGES[section]()}
    </section>`;

    container.querySelectorAll("[data-switch]").forEach((box) => box.addEventListener("change", () => store.setSetting(box.dataset.switch, box.checked)));
    container.querySelector("#userName")?.addEventListener("change", (e) => store.quietly(() => store.setSetting("userName", e.target.value.trim().slice(0, 40))).then(() => toast(t("settings.saved"))));
    if (section === "ai") aiBlock().then((markup) => { const el = container.querySelector("#aiBlock"); if (el) el.innerHTML = String(markup); });
    if (section === "data") paintBackgroundLine(container);
    if (section === "data") storageBlock().then((markup) => { const el = container.querySelector("#storageBlock"); if (el) el.innerHTML = String(markup); });
    // Study PDFs: space on this phone, move all to Google Drive, add back from Drive.
    const paintPdfCloud = () => pdfCloudBlock().then((markup) => { const el = container.querySelector("#pdfCloudBlock"); if (el) el.innerHTML = String(markup); })
      .then(() => storageBlock()).then((markup) => { const el = container.querySelector("#storageBlock"); if (el) el.innerHTML = String(markup); });
    if (section === "data") { paintPdfCloud(); onAction(container, pdfCloudHandlers(container, paintPdfCloud)); }
    // One-off requests (open the AI sheet, highlight a search hit) are removed from the
    // address, so a redraw after a change doesn't repeat them.
    if (params.open || params.focus) history.replaceState(history.state, "", `#/settings?section=${section}`);
    if (section === "ai" && params.open === "1") setTimeout(() => openAiSettings(), 50);

    if (params.focus) {
      // Search hit: bring the setting into view and light it up briefly.
      const target = container.querySelector(`[data-set~="${CSS.escape(params.focus)}"]`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.classList.add("set-flash");
        setTimeout(() => target.classList.remove("set-flash"), 1800);
      }
    }
    onAction(container, handlers(container, goalNow));
  }
};
