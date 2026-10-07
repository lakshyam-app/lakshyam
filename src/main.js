/* Lakshyam start-up: wires the shell (top bar, tabs), the screens and the
   service worker. Each feature only registers its screen here. */
import { html, onAction } from "./core/dom.js";
import { t, setLocale } from "./core/i18n.js";
import { registerScreen, listTabs, startRouter, go } from "./core/router.js";
import { registerServiceWorker } from "./core/sw-client.js";
import { requestPersistence } from "./core/storage-health.js";
import { toast } from "./core/toast.js";
import { icons } from "./core/icons.js";

import { todayScreen } from "./features/today/today.js";
import { libraryScreen } from "./features/library/library.js";
import { progressScreen } from "./features/progress/progress.js";
import { notesScreen } from "./features/notes/notes.js";
import { settingsScreen } from "./features/settings/settings.js";

[todayScreen, libraryScreen, progressScreen, notesScreen, settingsScreen].forEach(registerScreen);

function renderTabbar(activeId) {
  const bar = document.getElementById("tabbar");
  bar.innerHTML = html`${listTabs().map((tab) => html`
    <button type="button" class="tab ${tab.id === activeId ? "active" : ""}"
        data-action="go" data-to="${tab.id}" aria-current="${tab.id === activeId ? "page" : "false"}">
      <span class="tab-icon">${icons[tab.id]}</span>
      <span>${t(`tabs.${tab.id}`)}</span>
    </button>`)}`;
}

function renderTopbar(activeId) {
  document.getElementById("syllabusName").textContent = t("top.noSyllabus");
  document.getElementById("searchBtn").setAttribute("aria-label", t("top.search"));
  const settings = document.getElementById("settingsBtn");
  settings.setAttribute("aria-label", t("top.settings"));
  settings.classList.toggle("active", activeId === "settings");
}

function boot() {
  setLocale("en");
  document.title = t("app.name");

  onAction(document.getElementById("app"), {
    go: (el) => go(el.dataset.to),
    "open-search": () => toast(t("search.soon")),
    "open-syllabus": () => toast(t("syllabus.soon"))
  });

  startRouter(document.getElementById("screen"), (activeId) => {
    renderTabbar(activeId);
    renderTopbar(activeId);
  });

  registerServiceWorker();
  // Quietly ask once; Chrome decides based on how the app is used.
  requestPersistence();
}

boot();
