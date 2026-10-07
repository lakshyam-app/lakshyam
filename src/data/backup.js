/* Lakshyam's own backup file: create, check and read back.
   AI keys, PDFs and safety snapshots are never included. */
import { BACKUP_STORES } from "./schema.js";
import { DB_VERSION } from "./schema.js";
import { APP_VERSION } from "../core/version.js";
import { exportRecords } from "./store.js";

export const BACKUP_FORMAT = "lakshyam-backup";

/** FNV-1a hash: detects a damaged or hand-edited file (not a security feature). */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function makeBackup(records = exportRecords()) {
  const data = Object.fromEntries(BACKUP_STORES.map((name) => [name, records[name] || []]));
  const body = JSON.stringify(data);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: DB_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(BACKUP_STORES.map((name) => [name, data[name].length])),
    checksum: checksum(body),
    data
  };
}

function localDateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Saves the backup as a .json file in the phone's Downloads. */
export function downloadBackup(backup = makeBackup()) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lakshyam-backup-${localDateStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return backup;
}

export function isLakshyamBackup(json) {
  return json && typeof json === "object" && json.format === BACKUP_FORMAT;
}

/** Checks a Lakshyam backup before restoring. Returns { ok, error?, records, report }. */
export function readBackup(json) {
  if (!isLakshyamBackup(json)) return { ok: false, error: "not-lakshyam" };
  if (Number(json.schemaVersion) > DB_VERSION) return { ok: false, error: "newer-version" };
  if (!json.data || typeof json.data !== "object") return { ok: false, error: "damaged" };

  const data = Object.fromEntries(BACKUP_STORES.map((name) => [name, Array.isArray(json.data[name]) ? json.data[name] : []]));
  const checksumOk = checksum(JSON.stringify(data)) === json.checksum;
  const problems = [];
  BACKUP_STORES.forEach((name) => {
    const seen = new Set();
    data[name] = data[name].filter((record) => {
      const valid = record && typeof record === "object" && typeof record.id === "string" && !seen.has(record.id);
      if (valid) seen.add(record.id); else problems.push(name);
      return valid;
    });
  });
  const counts = Object.fromEntries(BACKUP_STORES.map((name) => [name, data[name].length]));
  const countsMatch = BACKUP_STORES.every((name) => (json.counts?.[name] ?? counts[name]) === counts[name]);
  return {
    ok: true,
    records: data,
    report: {
      exportedAt: json.exportedAt, appVersion: json.appVersion, counts,
      checksumOk, countsMatch, skippedRecords: problems.length
    }
  };
}
