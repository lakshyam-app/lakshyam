/* Settings. Phase 0: storage protection, theme note, version and update check. */
import { html, onAction } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { APP_VERSION } from "../../core/version.js";
import { isPersisted, requestPersistence, usage, formatBytes } from "../../core/storage-health.js";
import { checkForUpdate } from "../../core/sw-client.js";
import { toast } from "../../core/toast.js";

async function storageBlock() {
  const persisted = await isPersisted();
  const space = await usage();
  return html`
    <p>${persisted ? t("settings.persistentOn") : t("settings.persistentOff")}</p>
    ${persisted ? "" : html`<button type="button" class="btn" data-action="persist">${t("settings.persistentAsk")}</button>`}
    <p class="hint">${space
      ? t("settings.usage", { used: formatBytes(space.used), quota: formatBytes(space.quota) })
      : t("settings.usageUnknown")}</p>`;
}

export const settingsScreen = {
  id: "settings",
  async render(container) {
    container.innerHTML = html`
      <section class="settings">
        <h1>${t("settings.title")}</h1>
        <div class="group">
          <h2>${t("settings.sectionStorage")}</h2>
          <div id="storageBlock"></div>
        </div>
        <div class="group">
          <h2>${t("settings.sectionDisplay")}</h2>
          <p>${t("settings.theme")}</p>
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

    const refreshStorage = async () => {
      const block = container.querySelector("#storageBlock");
      if (block) block.innerHTML = await storageBlock();
    };
    await refreshStorage();

    onAction(container, {
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
        // "updating": the Refresh toast appears by itself once it's downloaded.
      }
    });
  }
};
