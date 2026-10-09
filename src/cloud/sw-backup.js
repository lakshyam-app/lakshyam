/* Background backup, run by the service worker when Android wakes the app
   (Periodic Background Sync; installed app only, Android decides when — not guaranteed).
   A plain script (service workers here aren't modules), so it repeats the small part of
   data/backup.js it needs; tests/relay.test.mjs checks the two make the same backup.
   Only works with "Automatic backup (your own script)"; reads the database, never changes
   anything except the backup's own date and status. */
/* global self, indexedDB, CompressionStream */
(function () {
  const DB = "lakshyam-db";
  // Must equal BACKUP_STORES in src/data/schema.js (checked by tests).
  const STORES = ["syllabi", "subjects", "topics", "papers", "questions", "flashcards",
    "questionState", "topicState", "attempts", "sets", "topicLists", "labels",
    "notes", "filterTemplates", "flashcardState", "activity", "settings",
    "timetables", "ttLog", "diary"];
  const PHONE_ONLY = ["drive", "reminders", "notifyPlan", "notifyShown", "notifyInbox"]; // = PHONE_ONLY_SETTINGS in data/store.js
  const DAY = 86400000;

  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  function checksum(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function buildBackup(records, schemaVersion, appVersion, now = new Date()) {
    const data = {};
    STORES.forEach((n) => { data[n] = (records[n] || []).filter((r) => n !== "settings" || !PHONE_ONLY.includes(r.id)); });
    const counts = {};
    STORES.forEach((n) => { counts[n] = data[n].length; });
    return { format: "lakshyam-backup", schemaVersion, appVersion, exportedAt: now.toISOString(), counts, checksum: checksum(JSON.stringify(data)), data };
  }

  async function gzipBase64(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function run(appVersion) {
    const db = await req(indexedDB.open(DB)); // no version number: never upgrades the database
    try {
      if (!STORES.every((n) => db.objectStoreNames.contains(n))) return "old-db";
      const tx = db.transaction(STORES, "readonly");
      const lists = await Promise.all(STORES.map((n) => req(tx.objectStore(n).getAll())));
      const records = {};
      STORES.forEach((n, i) => { records[n] = lists[i]; });
      const drive = (records.settings.find((r) => r.id === "drive") || {}).value || {};
      if (!(drive.connected && drive.mode === "relay" && drive.relayUrl && drive.relayKey)) return "off";
      if (drive.lastAt && Date.now() - drive.lastAt < (drive.every || 1) * DAY - 2 * 3600000) return "not-due";
      const backup = buildBackup(records, db.version, appVersion);
      const data = await gzipBase64(JSON.stringify(backup));
      let j;
      try {
        const r = await fetch(drive.relayUrl, {
          method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ key: drive.relayKey, phoneId: drive.phoneId, phone: drive.phoneName, questions: backup.counts.questions, tests: backup.counts.attempts, app: appVersion, data })
        });
        j = await r.json();
      } catch { j = { ok: false, error: "unreachable" }; }
      const now = Date.now();
      const w = db.transaction(["settings"], "readwrite");
      const st = w.objectStore("settings");
      st.put({ id: "drive", value: j.ok ? { ...drive, lastAt: now, lastName: j.name, lastSize: Number(j.size) || 0, lastError: "", lastBackground: now } : { ...drive, lastError: `relay-${j.error || "other"}` } });
      if (j.ok) st.put({ id: "lastBackupAt", value: now });
      await new Promise((resolve) => { w.oncomplete = resolve; w.onerror = resolve; w.onabort = resolve; });
      return j.ok ? "done" : "error";
    } finally { db.close(); }
  }

  self.lakshyamBackup = { run, buildBackup, checksum, STORES, PHONE_ONLY };
})();
