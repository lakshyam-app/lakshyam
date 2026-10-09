/* Reminders, in the service worker (a plain script: service workers here aren't modules).
   - A wake-up from your reminder script carries NO content. The app has already written the
     reminders (setting "notifyPlan", on this phone only); the nearest one not shown yet is shown.
   - Buttons: "Done / Skipped" on a block and "Good / Tough" on the day review are saved to
     setting "notifyInbox" (no app window needed); the app applies them the next time it opens.
     "Answer key" shows the answer. Other buttons and taps open the app at the right place.
   Reads and writes only those three settings, and reads today's activity count. */
/* global self, indexedDB, clients */
(function () {
  const DB = "lakshyam-db";
  const WINDOW_MS = 20 * 60000;
  const RECORD = ["done", "skipped", "good", "tough"];
  const OPEN = { session: "#/today?go=session", quick: "#/today?go=quick" };
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  async function withStore(name, mode, fn) {
    const db = await req(indexedDB.open(DB)); // no version: never upgrades the database
    try {
      if (!db.objectStoreNames.contains(name)) return null;
      const tx = db.transaction(name, mode);
      const out = await fn(tx.objectStore(name));
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
      return out;
    } finally { db.close(); }
  }
  const getSetting = (id) => withStore("settings", "readonly", async (s) => { const r = await req(s.get(id)); return r ? r.value : null; });
  const putSetting = (id, value) => withStore("settings", "readwrite", (s) => req(s.put({ id, value, updatedAt: Date.now() })));
  const pad = (n) => String(n).padStart(2, "0");
  const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  /** The nearest planned reminder not shown yet, within 20 minutes (same rule as domain/reminders.js). */
  function pick(items, shownIds, now) {
    const shown = new Set(shownIds || []);
    const near = (items || []).filter((x) => !shown.has(x.id) && Math.abs(x.at - now) <= WINDOW_MS)
      .sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now));
    return near[0] || null;
  }

  async function onPush() {
    const now = Date.now();
    const plan = (await getSetting("notifyPlan")) || {};
    const texts = plan.texts || {};
    const shown = (await getSetting("notifyShown")) || [];
    let it = pick(plan.items, shown, now);
    if (it && it.kind === "rescue") {
      // Studied since the plan was made: say so softly instead of nagging.
      const act = await withStore("activity", "readonly", (s) => req(s.get(localDate(now))));
      if (act && ((act.count || 0) > 0 || (act.questions || 0) > 0)) it = { ...it, title: texts.safeTitle || "✓", body: texts.safeBody || "", actions: [], silent: true };
    }
    if (!it) it = { id: `wake:${now}`, kind: "wake", title: texts.wakeTitle || "Lakshyam", body: texts.wakeBody || "", actions: [], url: "#/today", data: {}, silent: true };
    await putSetting("notifyShown", [...shown, it.id].slice(-300));
    await self.registration.showNotification(it.title, {
      body: it.body || "", tag: `lakshyam-${it.kind}`, renotify: true, silent: Boolean(it.silent),
      icon: "icons/icon-192.png", badge: "icons/badge-96.png", timestamp: it.at || now,
      actions: (it.actions || []).slice(0, 2),
      data: { ...(it.data || {}), id: it.id, kind: it.kind, url: it.url || "#/today", keyTitle: texts.keyTitle || "", answerTitle: texts.answerTitle || "" }
    });
  }

  async function tellApp(msg) {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    all.forEach((c) => c.postMessage(msg));
    return all;
  }

  async function onClick(e) {
    const n = e.notification; const d = n.data || {}; const a = e.action || "";
    n.close();
    if (RECORD.includes(a)) {
      const inbox = (await getSetting("notifyInbox")) || [];
      inbox.push({ action: a, kind: d.kind, id: d.id, data: { ttId: d.ttId, date: d.date, bid: d.bid }, at: Date.now() });
      await putSetting("notifyInbox", inbox.slice(-200));
      await tellApp({ type: "lakshyam-inbox" });
      return;
    }
    if (a === "later") return;
    if (a === "key") {
      await self.registration.showNotification(d.keyTitle || "✓", {
        body: d.key || "", tag: "lakshyam-question", icon: "icons/icon-192.png", badge: "icons/badge-96.png",
        actions: [{ action: "answer", title: d.answerTitle || "Open" }], data: { ...d, kind: "answer" }
      });
      return;
    }
    const hash = OPEN[a] || d.url || "#/today";
    const url = new URL(hash, self.registration.scope).href;
    const all = await tellApp({ type: "lakshyam-go", hash });
    const win = all.find((c) => "focus" in c);
    if (win) { await win.focus(); return; }
    await clients.openWindow(url);
  }

  self.addEventListener("push", (e) => e.waitUntil(onPush().catch(() => self.registration.showNotification("Lakshyam", { tag: "lakshyam-wake", icon: "icons/icon-192.png" }))));
  self.addEventListener("notificationclick", (e) => e.waitUntil(onClick(e)));
  self.lakshyamNotify = { pick, localDate, onPush, onClick }; // also used by the tests
})();
