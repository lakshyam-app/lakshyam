/* Settings → Backup & data → Google Drive, the Today reminder, and the automatic run.
   A backup runs by itself when the app opens (or comes back to the screen) if one is
   due and Google's sign-in from earlier today is still valid; otherwise Today shows a
   one-tap "Back up to Google Drive" (Google needs a tap to show its sign-in). */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet, updateSheet, setSheetDismissible } from "../../core/sheet.js";
import { runFlow, askText, confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as store from "../../data/store.js";
import { makeBackup } from "../../data/backup.js";
import { DB_VERSION } from "../../data/schema.js";
import { APP_VERSION } from "../../core/version.js";
import { newId } from "../../data/ids.js";
import * as D from "../../cloud/drive.js";
import { restoreFromJson } from "../import/import-flow.js";

const DAY = 86400000;
export const EVERY = [1, 3, 7];

export const driveConfig = () => ({ connected: false, phoneId: null, phoneName: "", email: "", folderId: null, every: 1, lastAt: 0, lastName: "", lastSize: 0, lastError: "", ...(store.setting("drive") || {}) });
const saveConfig = (patch) => store.quietly(() => store.setSetting("drive", { ...driveConfig(), ...patch }));

export const driveDue = (c = driveConfig(), now = Date.now()) => c.connected && (!c.lastAt || now - c.lastAt >= c.every * DAY - 2 * 3600000);

const when = (ms) => new Date(ms).toLocaleString(dateLocale(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const errorText = (e) => t(`drive.err.${e?.kind || "other"}`, { detail: e?.message || "" });

let running = null;

/** The backup itself. interactive: may open Google's sign-in (only from a tap). */
export async function backupToDrive({ interactive = false } = {}) {
  if (running) return running;
  running = (async () => {
    let c = driveConfig();
    if (!c.connected) return { status: "off" };
    try {
      if (!D.hasToken()) {
        if (!interactive) return { status: "needs-tap" };
        await D.signIn({ hint: c.email });
        const me = await D.whoAmI();
        if (me.email && c.email && me.email !== c.email) { await saveConfig({ email: me.email, folderId: null }); c = driveConfig(); }
      }
      const backup = makeBackup();
      const text = JSON.stringify(backup);
      const props = { phoneId: c.phoneId, phone: c.phoneName, questions: backup.counts.questions, tests: backup.counts.attempts, app: APP_VERSION, schema: DB_VERSION };
      let folderId = c.folderId || await D.phoneFolder(c.phoneName);
      let file;
      try { file = await D.uploadBackup(folderId, text, props); } catch (e) {
        if (e.kind !== "http" || !/^404/.test(e.message.split(": ")[1] || "")) throw e;
        folderId = await D.phoneFolder(c.phoneName); // the folder was deleted in Drive: make it again
        file = await D.uploadBackup(folderId, text, props);
      }
      await D.prune(c.phoneId);
      const now = Date.now();
      await saveConfig({ folderId, lastAt: now, lastName: file.name, lastSize: Number(file.size) || 0, lastError: "" });
      await store.quietly(() => store.setSetting("lastBackupAt", now));
      store.touch();
      return { status: "done", file };
    } catch (e) {
      await saveConfig({ lastError: e.kind || "other" });
      store.touch();
      return { status: "error", error: e };
    }
  })();
  try { return await running; } finally { running = null; }
}

/** Called when the app opens or comes back: back up quietly if due and possible. */
export async function autoDriveBackup() {
  if (!driveDue() || !D.hasToken() || !navigator.onLine) return;
  const r = await backupToDrive();
  if (r.status === "done") toast(t("drive.autoDone"));
}

async function backupTap() {
  toast(t("drive.working"), { duration: 2500 });
  const r = await backupToDrive({ interactive: true });
  if (r.status === "done") toast(t("drive.done", { size: kb(Number(r.file.size) || 0) }));
  else if (r.status === "error" && r.error.kind !== "closed") toast(errorText(r.error), { duration: 6000 });
}

/* ---------- connect / disconnect ---------- */

async function connect() {
  const c = driveConfig();
  const name = await askText({ title: t("drive.phoneTitle"), hint: t("drive.phoneHint"), value: c.phoneName || t("drive.phoneDefault"), confirmLabel: t("drive.connectGo") });
  if (!name) return;
  try {
    await D.signIn({ consent: true });
    const me = await D.whoAmI();
    const folderId = await D.phoneFolder(name.slice(0, 40));
    await saveConfig({ connected: true, email: me.email, phoneName: name.slice(0, 40), phoneId: c.phoneId || newId("phone"), folderId, lastError: "" });
    toast(t("drive.connected", { email: me.email }));
    await backupTap();
  } catch (e) {
    if (e.kind !== "closed") toast(errorText(e), { duration: 6000 });
  }
}

async function rename() {
  const c = driveConfig();
  const name = await askText({ title: t("drive.phoneTitle"), hint: t("drive.renameHint"), value: c.phoneName });
  if (!name || name === c.phoneName) return;
  await saveConfig({ phoneName: name.slice(0, 40), folderId: null }); // next backup goes to a folder with the new name
  store.touch();
}

async function disconnect() {
  if (!(await confirmAction({ title: t("drive.disconnectTitle"), body: t("drive.disconnectBody"), confirmLabel: t("drive.disconnect") }))) return;
  await D.signOut().catch(() => {});
  await saveConfig({ connected: false, folderId: null, lastError: "" });
  store.touch();
}

/* ---------- restore ---------- */

async function restoreSheet() {
  openSheet(html`<p class="sheet-status">${t("drive.listing")}</p>`, {}, { label: t("drive.restoreTitle") });
  try {
    if (!D.hasToken()) await D.signIn({ hint: driveConfig().email });
    const files = await D.listBackups();
    const c = driveConfig();
    const groups = new Map();
    files.forEach((f) => {
      const id = f.appProperties?.phoneId || "?";
      if (!groups.has(id)) groups.set(id, { id, phone: f.appProperties?.phone || t("drive.unknownPhone"), files: [] });
      groups.get(id).files.push(f);
    });
    const ordered = [...groups.values()].sort((a, b) => (a.id === c.phoneId ? -1 : b.id === c.phoneId ? 1 : a.phone.localeCompare(b.phone)));
    const fileRow = (f, g) => html`<button type="button" class="row" data-action="pick" data-id="${f.id}" data-phone="${g.phone}" data-mine="${g.id === c.phoneId ? "1" : "0"}">
      <span class="row-main"><span class="row-title">${when(Date.parse(f.createdTime))}</span>
      <span class="row-sub">${t("common.questions", { n: Number(f.appProperties?.questions) || 0 })} · ${t("common.tests", { n: Number(f.appProperties?.tests) || 0 })} · ${kb(Number(f.size) || 0)}</span></span><span class="chev-txt">›</span></button>`;
    updateSheet(html`<h2>${t("drive.restoreTitle")}</h2>
      <p class="hint">${t("drive.restoreHint", { email: c.email })}</p>
      ${ordered.length ? ordered.map((g) => html`<h3 class="rows-head">📱 ${g.phone}${g.id === c.phoneId ? ` · ${t("drive.thisPhone")}` : ""}</h3>
        <div class="rows">${g.files.map((f) => fileRow(f, g))}</div>`) : html`<p>${t("drive.none")}</p>`}
      <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.close")}</button></div>`, {
      close: () => closeSheet(),
      pick: async (el) => {
        setSheetDismissible(false);
        updateSheet(html`<p class="sheet-status">${t("drive.downloading")}</p>`);
        try {
          const text = await D.downloadBackupText(el.dataset.id);
          setSheetDismissible(true);
          const warning = el.dataset.mine === "1" ? "" : t("drive.otherPhone", { phone: el.dataset.phone });
          restoreFromJson(JSON.parse(text), `Google Drive · ${el.dataset.phone}`, { warning });
        } catch (e) {
          setSheetDismissible(true);
          updateSheet(html`<p class="warn-box">${e instanceof SyntaxError ? t("import.notJson") : errorText(e)}</p>
            <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
        }
      }
    });
  } catch (e) {
    if (e.kind === "closed") { closeSheet(); return; }
    updateSheet(html`<p class="warn-box">${errorText(e)}</p>
      <div class="sheet-actions"><button type="button" class="btn" data-action="close">${t("common.close")}</button></div>`, { close: () => closeSheet() });
  }
}

/* ---------- Settings block, Today row ---------- */

export function driveBlock() {
  const c = driveConfig();
  setTimeout(D.preload, 300);
  if (!c.connected) {
    return html`<div class="group drive-box" data-set="drive">
      <h3>☁ ${t("drive.title")}</h3>
      <p>${t("drive.pitch")}</p>
      <button type="button" class="btn" data-action="drive-connect">${t("drive.connect")}</button>
      <p class="hint">${t("drive.privacy")}</p>
    </div>`;
  }
  return html`<div class="group drive-box on" data-set="drive">
    <h3>☁ ${t("drive.title")}</h3>
    <p>${t("drive.connectedAs", { email: c.email || "?", phone: c.phoneName })}</p>
    <p class="hint">${c.lastAt ? t("drive.last", { when: when(c.lastAt), size: kb(c.lastSize) }) : t("drive.never")}${c.lastError ? html` · <span class="danger-text">${t(`drive.err.${c.lastError}`, { detail: "" })}</span>` : ""}</p>
    <p class="field-label">${t("drive.every")}</p>
    <div class="segmented three" role="group">${EVERY.map((n) => html`<button type="button" class="${c.every === n ? "on" : ""}" data-action="drive-every" data-n="${n}" aria-pressed="${String(c.every === n)}">${t(`drive.everyN.${n}`)}</button>`)}</div>
    <p class="hint">${t("drive.howAuto", { keep: D.KEEP })}</p>
    <div class="actions-row">
      <button type="button" class="btn" data-action="drive-now">${t("drive.now")}</button>
      <button type="button" class="btn btn-quiet" data-action="drive-restore">${t("drive.restore")}</button>
    </div>
    <button type="button" class="link" data-action="drive-rename">${t("drive.rename")}</button>
    <button type="button" class="link danger" data-action="drive-disconnect">${t("drive.disconnect")}</button>
  </div>`;
}

export const driveHandlers = {
  "drive-connect": () => runFlow(connect),
  "drive-now": () => backupTap(),
  "drive-restore": () => restoreSheet(),
  "drive-rename": () => runFlow(rename),
  "drive-disconnect": () => runFlow(disconnect),
  "drive-every": (el) => { saveConfig({ every: Number(el.dataset.n) }).then(() => store.touch()); },
  "drive-backup": () => backupTap()
};

/** Today: a one-tap row when a Drive backup is due (or the last one failed). */
export function driveTodayRow() {
  const c = driveConfig();
  if (!c.connected || (!driveDue(c) && !c.lastError)) return "";
  setTimeout(D.preload, 300);
  const days = c.lastAt ? Math.floor((Date.now() - c.lastAt) / DAY) : null;
  return html`<button type="button" class="row drive-row" data-action="drive-backup">
    <span class="row-main"><span class="row-title">☁ ${t("drive.todayTitle")}</span>
    <span class="row-sub">${c.lastError ? t(`drive.err.${c.lastError}`, { detail: "" }) : days === null ? t("drive.never") : t("drive.daysAgo", { n: days })}</span></span>
    <span class="chev-txt">›</span></button>`;
}
