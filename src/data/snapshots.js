/* Automatic safety copies kept inside the app, taken before any action that
   replaces or merges data (import, restore, erase). The last few are kept so
   the action can be undone with one tap. */
import * as db from "./db.js";
import { makeBackup, readBackup } from "./backup.js";
import { isEmpty, commitRecords } from "./store.js";

const KEEP = 5;

/** reason: "import" | "restore" | "undo". Skipped when there is nothing to protect. */
export async function takeSnapshot(reason) {
  if (isEmpty()) return null;
  const backup = makeBackup();
  const record = { id: `snap:${Date.now()}`, at: Date.now(), reason, counts: backup.counts, backup };
  await db.put("snapshots", record);
  const all = (await db.getAll("snapshots")).sort((a, b) => b.at - a.at);
  const extra = all.slice(KEEP).map((s) => s.id);
  if (extra.length) await db.writeAll({ snapshots: { delete: extra } });
  return record;
}

export async function listSnapshots() {
  return (await db.getAll("snapshots")).sort((a, b) => b.at - a.at)
    .map(({ id, at, reason, counts }) => ({ id, at, reason, counts }));
}

/** Puts the data back exactly as it was in the snapshot. */
export async function restoreSnapshot(id) {
  const snap = await db.get("snapshots", id);
  if (!snap) throw new Error("snapshot-missing");
  const parsed = readBackup(snap.backup);
  if (!parsed.ok) throw new Error(parsed.error);
  await takeSnapshot("undo");
  await commitRecords(parsed.records, "replace");
  return parsed.report.counts;
}

export async function logImport(entry) {
  await db.put("importLog", { id: `log:${Date.now()}`, at: Date.now(), ...entry });
}

export async function importHistory() {
  return (await db.getAll("importLog")).sort((a, b) => b.at - a.at);
}
