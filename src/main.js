/* Lakshyam start-up: opens the data, wires the shell (top bar, tabs),
   registers screens and the service worker. */
import { html, onAction } from "./core/dom.js";
import { t, setLocale } from "./core/i18n.js";
import { applyTheme, applyTextSize } from "./core/theme.js";
import { setAwake, wantAwake } from "./core/wake.js";
import { registerScreen, listTabs, startRouter, rerender, go, tabFor } from "./core/router.js";
import { registerServiceWorker } from "./core/sw-client.js";
import { requestPersistence } from "./core/storage-health.js";
import { icons } from "./core/icons.js";
import { openSheet, closeSheet } from "./core/sheet.js";
import * as store from "./data/store.js";

import { todayScreen } from "./features/today/today.js";
import { examsScreen } from "./features/today/countdown.js";
import { mapScreen } from "./features/progress/map.js";
import { guideScreen, guidePdfScreen } from "./features/guide/guide.js";
import { autoDriveBackup } from "./features/settings/drive.js";
import { libraryScreen, subjectScreen, subjectAllScreen, topicScreen, paperScreen } from "./features/library/library.js";
import { bankScreen, bankAddScreen } from "./features/library/banks.js";
import { searchScreen } from "./features/search/search.js";
import { aiHubScreen } from "./features/ai/content.js";
import { pdfsScreen, pdfScreen, pdfPageScreen, pdfMakeScreen } from "./features/pdfs/pdfs.js";
import { insightsScreen, insightTopicScreen } from "./features/insights/insights.js";
import { timetableScreen, ttListScreen } from "./features/timetable/timetable.js";
import { ttPlansScreen, ttPlanScreen, ttScheduleScreen } from "./features/timetable/tt-edit.js";
import { ttNewScreen, ttReviewScreen } from "./features/timetable/tt-new.js";
import { diaryScreen } from "./features/diary/diary.js";
import { progressScreen, historyScreen, testsScreen } from "./features/progress/progress.js";
import { statsSubjectScreen, statsTopicScreen, statsTopicsScreen } from "./features/progress/drill.js";
import { statsTablesScreen } from "./features/progress/tables.js";
import { testScreen } from "./features/test/test-screen.js";
import { resultScreen } from "./features/test/results.js";
import { notesScreen } from "./features/notes/notes.js";
import { settingsScreen } from "./features/settings/settings.js";
import { remindersScreen, remindersOnOpen, syncSoon, listenToWorker } from "./features/reminders/reminders.js";

[todayScreen, libraryScreen, subjectScreen, subjectAllScreen, topicScreen, paperScreen, bankScreen, bankAddScreen,
  searchScreen, aiHubScreen, pdfsScreen, pdfScreen, pdfPageScreen, pdfMakeScreen, insightsScreen, insightTopicScreen, timetableScreen, ttListScreen, ttPlansScreen, ttPlanScreen, ttScheduleScreen, ttNewScreen, ttReviewScreen, diaryScreen, progressScreen, historyScreen, testsScreen, statsSubjectScreen, statsTopicScreen, statsTopicsScreen, statsTablesScreen, testScreen, resultScreen, notesScreen, settingsScreen, remindersScreen, examsScreen, mapScreen, guideScreen, guidePdfScreen]
  .forEach(registerScreen);

function renderTabbar(activeId) {
  const lit = tabFor(activeId);
  document.getElementById("tabbar").innerHTML = html`${listTabs().map((tab) => html`
    <button type="button" class="tab ${tab.id === lit ? "active" : ""}"
        data-action="go" data-to="${tab.id}" aria-current="${tab.id === lit ? "page" : "false"}">
      <span class="tab-icon">${icons[tab.id]}</span>
      <span>${t(`tabs.${tab.id}`)}</span>
    </button>`)}`;
}

function renderTopbar(activeId) {
  const syllabus = store.currentSyllabus();
  document.getElementById("syllabusName").textContent = syllabus ? syllabus.name : t("top.noSyllabus");
  const search = document.getElementById("searchBtn");
  search.setAttribute("aria-label", t("top.search"));
  search.classList.toggle("active", activeId === "search");
  const settings = document.getElementById("settingsBtn");
  settings.setAttribute("aria-label", t("top.settings"));
  settings.classList.toggle("active", activeId === "settings");
}

function openSyllabusPicker() {
  const list = store.syllabi();
  if (!list.length) { go("settings"); return; }
  const currentId = store.currentSyllabus()?.id;
  openSheet(html`<h2>${t("syllabus.title")}</h2>
    <p class="hint">${t("syllabus.hint")}</p>
    <div class="rows">${list.map((s) => html`
      <button type="button" class="row ${s.id === currentId ? "is-current" : ""}" data-action="pick" data-id="${s.id}">
        <span class="row-main"><span class="row-title">${s.name}</span>
          <span class="row-sub">${t("common.papers", { n: store.papersOf(s.id).length })}</span></span>
        ${s.id === currentId ? html`<span class="tick">✓</span>` : ""}
      </button>`)}</div>`, {
    pick: async (el) => {
      closeSheet();
      if (el.dataset.id !== currentId) await store.setSetting("currentSyllabusId", el.dataset.id);
    }
  }, { label: t("syllabus.title") });
}

async function boot() {
  setLocale("en");
  document.title = t("app.name");
  const screen = document.getElementById("screen");
  screen.innerHTML = html`<p class="hint pad">${t("app.loading")}</p>`;

  try {
    await store.load();
    setLocale(store.setting("appLang", "en"));
    applyTheme(store.setting("theme", "system"));
    applyTextSize(store.setting("textSize", "m"));
    document.title = t("app.name");
  } catch {
    screen.innerHTML = html`<section class="empty"><p>${t("app.dbError")}</p></section>`;
    return;
  }

  onAction(document.getElementById("app"), {
    go: (el) => go(el.dataset.to),
    "open-search": () => go("search"),
    "open-syllabus": openSyllabusPicker
  });

  let screenNow = "today";
  const awake = () => setAwake(wantAwake(store.setting("keepAwake", "tests"), screenNow));
  startRouter(screen, (activeId) => {
    screenNow = activeId;
    renderTabbar(activeId);
    renderTopbar(activeId);
    awake();
  });
  // Any data change (import, restore, syllabus switch) redraws the screen.
  store.onChange(() => { setLocale(store.setting("appLang", "en")); applyTheme(store.setting("theme", "system")); applyTextSize(store.setting("textSize", "m")); awake(); rerender(); syncSoon(); });

  registerServiceWorker();
  requestPersistence();
  // Google Drive backup when due (quietly, only if Google's sign-in is still valid).
  setTimeout(autoDriveBackup, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(autoDriveBackup, 1500); });
  // Reminders: save buttons pressed on notifications, and plan the next ones.
  listenToWorker();
  setTimeout(remindersOnOpen, 1200);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(remindersOnOpen, 800); });
}

boot();
