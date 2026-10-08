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
import { restoreFromJson, startImport } from "../import/import-flow.js";
import * as R from "../../cloud/relay.js";
import { scriptFor, MANIFEST, newRelayKey, isRelayUrl, RELAY_ROOT } from "../../cloud/relay-script.js";
import { copyText } from "../../core/clipboard.js";

const DAY = 86400000;
export const EVERY = [1, 3, 7];

/* mode "signin": Lakshyam signs in to Google (a tap when the sign-in has expired).
   mode "relay": your own script in your Google account receives the backups (no sign-in). */
export const driveConfig = () => ({ connected: false, mode: "signin", phoneId: null, phoneName: "", email: "", folderId: null, relayUrl: "", relayKey: "", pendingKey: "", every: 1, lastAt: 0, lastName: "", lastSize: 0, lastError: "", ...(store.setting("drive") || {}) });
export const isRelay = (c = driveConfig()) => c.connected && c.mode === "relay" && c.relayUrl && c.relayKey;
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
    if (isRelay(c)) return relayBackup(c);
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

async function relayBackup(c) {
  try {
    const backup = makeBackup();
    const r = await R.relayUpload(c.relayUrl, c.relayKey, JSON.stringify(backup), {
      phoneId: c.phoneId, phone: c.phoneName, questions: backup.counts.questions, tests: backup.counts.attempts, app: APP_VERSION
    });
    const now = Date.now();
    await saveConfig({ lastAt: now, lastName: r.name, lastSize: Number(r.size) || 0, lastError: "" });
    await store.quietly(() => store.setSetting("lastBackupAt", now));
    store.touch();
    return { status: "done", file: { name: r.name, size: r.size } };
  } catch (e) {
    await saveConfig({ lastError: `relay-${e.kind || "other"}` });
    store.touch();
    return { status: "error", error: { kind: `relay-${e.kind || "other"}`, message: e.message } };
  }
}

/** Called when the app opens or comes back: back up quietly if due and possible. */
export async function autoDriveBackup() {
  if (!driveDue() || !navigator.onLine) return;
  if (!isRelay() && !D.hasToken()) return;
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
    await saveConfig({ connected: true, mode: "signin", email: me.email, phoneName: name.slice(0, 40), phoneId: c.phoneId || newId("phone"), folderId, lastError: "" });
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
  if (!(await confirmAction({ title: t("drive.disconnectTitle"), body: isRelay() ? t("relay.disconnectBody") : t("drive.disconnectBody"), confirmLabel: t("drive.disconnect") }))) return;
  if (isRelay()) await disableBackground();
  else await D.signOut().catch(() => {});
  await saveConfig({ connected: false, mode: "signin", relayUrl: "", relayKey: "", pendingKey: "", folderId: null, lastError: "" });
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
  if (!isRelay(c)) setTimeout(D.preload, 300);
  if (!c.connected) {
    return html`<div class="group drive-box" data-set="drive">
      <h3>☁ ${t("drive.title")}</h3>
      <p>${t("drive.pitch")}</p>
      <button type="button" class="btn" data-action="drive-connect">${t("drive.connect")}</button>
      <button type="button" class="link" data-action="relay-setup">⚡ ${t("relay.offer")}</button>
      <p class="hint">${t("drive.privacy")}</p>
    </div>`;
  }
  const relay = isRelay(c);
  return html`<div class="group drive-box on" data-set="drive">
    <h3>☁ ${t("drive.title")}${relay ? html` <span class="pill-mini">⚡ ${t("relay.badge")}</span>` : ""}</h3>
    <p>${relay ? t("relay.connectedAs", { phone: c.phoneName, folder: RELAY_ROOT }) : t("drive.connectedAs", { email: c.email || "?", phone: c.phoneName })}</p>
    <p class="hint">${c.lastAt ? t("drive.last", { when: when(c.lastAt), size: kb(c.lastSize) }) : t("drive.never")}${c.lastError ? html` · <span class="danger-text">${t(`drive.err.${c.lastError}`, { detail: "" })}</span>` : ""}</p>
    <p class="field-label">${t("drive.every")}</p>
    <div class="segmented three" role="group">${EVERY.map((n) => html`<button type="button" class="${c.every === n ? "on" : ""}" data-action="drive-every" data-n="${n}" aria-pressed="${String(c.every === n)}">${t(`drive.everyN.${n}`)}</button>`)}</div>
    <p class="hint">${relay ? t("relay.howAuto") : t("drive.howAuto", { keep: D.KEEP })}</p>
    ${relay ? html`<p class="hint" id="bgLine"></p>` : ""}
    <div class="actions-row">
      <button type="button" class="btn" data-action="drive-now">${t("drive.now")}</button>
      <button type="button" class="btn btn-quiet" data-action="drive-restore">${t("drive.restore")}</button>
    </div>
    ${relay ? "" : html`<button type="button" class="link" data-action="relay-setup">⚡ ${t("relay.offer")}</button>`}
    <button type="button" class="link" data-action="drive-rename">${t("drive.rename")}</button>
    <button type="button" class="link danger" data-action="drive-disconnect">${t("drive.disconnect")}</button>
  </div>`;
}

/* ---------- automatic backup through your own script ---------- */

const SCRIPT_NEW = "https://script.google.com/home/projects/create";

async function relaySetup() {
  let c = driveConfig();
  if (!c.pendingKey) { await saveConfig({ pendingKey: newRelayKey() }); c = driveConfig(); }
  const key = c.pendingKey;
  const stepRow = (n, title, body) => html`<li class="rs-step"><span class="rs-n">${n}</span><div><b>${title}</b>${body}</div></li>`;
  const body = openSheet(html`<h2>⚡ ${t("relay.title")}</h2>
    <p class="hint">${t("relay.intro")}</p>
    <ol class="rs-steps">
      ${stepRow(1, t("relay.s1"), html`<p class="hint">${t("relay.s1h")}</p><a class="btn btn-quiet btn-small" href="${SCRIPT_NEW}" target="_blank" rel="noopener">${t("relay.s1b")} ↗</a>`)}
      ${stepRow(2, t("relay.s2"), html`<p class="hint">${t("relay.s2h")}</p><button type="button" class="btn btn-quiet btn-small" data-action="copy-script">📋 ${t("relay.s2b")}</button>`)}
      ${stepRow(3, t("relay.s3"), html`<p class="hint">${t("relay.s3h")}</p><button type="button" class="btn btn-quiet btn-small" data-action="copy-manifest">📋 ${t("relay.s3b")}</button>`)}
      ${stepRow(4, t("relay.s4"), html`<p class="hint">${t("relay.s4h")}</p>`)}
      ${stepRow(5, t("relay.s5"), html`<p class="hint">${t("relay.s5h")}</p>
        <label class="field-label">${t("relay.url")}<input class="field" id="rsUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${c.relayUrl || ""}"></label>
        <label class="field-label">${t("drive.phoneTitle")}<input class="field" id="rsPhone" type="text" maxlength="40" value="${c.phoneName || t("drive.phoneDefault")}"></label>`)}
    </ol>
    <p class="warn-box" id="rsMsg" hidden></p>
    <p class="hint">${t("relay.safety")}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="test">${t("relay.test")}</button></div>`, {
    close: () => closeSheet(),
    "copy-script": () => copyText(scriptFor(key)),
    "copy-manifest": () => copyText(MANIFEST),
    test: async (el) => {
      const url = body.querySelector("#rsUrl").value.trim();
      const phone = body.querySelector("#rsPhone").value.trim().slice(0, 40) || t("drive.phoneDefault");
      const msg = body.querySelector("#rsMsg");
      const say = (text, ok = false) => { msg.hidden = false; msg.textContent = text; msg.classList.toggle("ok-box", ok); };
      if (!isRelayUrl(url)) { say(t("relay.badUrl")); return; }
      el.disabled = true; el.textContent = t("relay.testing");
      try {
        await R.relayPing(url, key);
        await saveConfig({ connected: true, mode: "relay", relayUrl: url, relayKey: key, pendingKey: "", phoneName: phone, phoneId: c.phoneId || newId("phone"), lastError: "" });
        closeSheet();
        toast(t("relay.saved"));
        enableBackground();
        await backupTap();
      } catch (e) {
        el.disabled = false; el.textContent = t("relay.test");
        say(t(`drive.err.relay-${e.kind || "other"}`, { detail: e.message }));
      }
    }
  }, { label: t("relay.title") });
}

/** Asks Android to wake the app now and then to back up in the background (installed app only). */
export async function enableBackground() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !("periodicSync" in reg)) return "unsupported";
    const st = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (st.state !== "granted") return "not-installed";
    await reg.periodicSync.register("lakshyam-backup", { minInterval: 12 * 3600000 });
    return "on";
  } catch { return "unsupported"; }
}

async function disableBackground() {
  try { const reg = await navigator.serviceWorker?.ready; await reg?.periodicSync?.unregister("lakshyam-backup"); } catch { /* fine */ }
}

/** Fills the "background backups" line in the Drive box. */
export async function paintBackgroundLine(root) {
  const el = root.querySelector("#bgLine");
  if (!el) return;
  const state = await enableBackground();
  el.textContent = t(`relay.bg.${state}`);
}

function relayRestore() {
  const c = driveConfig();
  openSheet(html`<h2>${t("drive.restoreTitle")}</h2>
    <p>${t("relay.restoreHow", { folder: RELAY_ROOT, phone: c.phoneName })}</p>
    <div class="sheet-actions"><button type="button" class="btn btn-quiet" data-action="close">${t("common.cancel")}</button>
      <button type="button" class="btn" data-action="pick">${t("relay.restorePick")}</button></div>`, {
    close: () => closeSheet(),
    pick: () => { closeSheet(); startImport(); }
  }, { label: t("drive.restoreTitle") });
}

export const driveHandlers = {
  "drive-connect": () => runFlow(connect),
  "relay-setup": () => relaySetup(),
  "drive-now": () => backupTap(),
  "drive-restore": () => (isRelay() ? relayRestore() : restoreSheet()),
  "drive-rename": () => runFlow(rename),
  "drive-disconnect": () => runFlow(disconnect),
  "drive-every": (el) => { saveConfig({ every: Number(el.dataset.n) }).then(() => store.touch()); },
  "drive-backup": () => backupTap()
};

/** Today: a one-tap row when a Drive backup is due (or the last one failed). */
export function driveTodayRow() {
  const c = driveConfig();
  if (!c.connected || (!driveDue(c) && !c.lastError)) return "";
  // With your own script, backups run by themselves; ask only if one failed or is a day late.
  if (isRelay(c) && !c.lastError && c.lastAt && Date.now() - c.lastAt < (c.every + 1) * DAY) return "";
  if (!isRelay(c)) setTimeout(D.preload, 300);
  const days = c.lastAt ? Math.floor((Date.now() - c.lastAt) / DAY) : null;
  return html`<button type="button" class="row drive-row" data-action="drive-backup">
    <span class="row-main"><span class="row-title">☁ ${t("drive.todayTitle")}</span>
    <span class="row-sub">${c.lastError ? t(`drive.err.${c.lastError}`, { detail: "" }) : days === null ? t("drive.never") : t("drive.daysAgo", { n: days })}</span></span>
    <span class="chev-txt">›</span></button>`;
}
