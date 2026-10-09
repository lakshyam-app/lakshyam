/* Reminders: what to show and when, worked out on the phone from your own data.
   Pure functions. The reminder script only ever gets the times (see push-script.js).
   Rules: nothing in quiet hours, at most `max` a day (most useful kinds first), at least
   SPACING apart, and nothing already done (a block you marked, a day you reviewed). */

export const SPACING_MIN = 6;
export const KINDS = ["block", "rescue", "morning", "review", "question", "weekly", "backup"]; // most useful first
export const DEFAULT_PREFS = {
  on: false,
  kinds: { block: true, morning: true, question: 2, rescue: true, review: true, weekly: true, backup: true },
  times: { morning: "07:00", rescue: "20:30", review: "21:45", questions: ["11:00", "16:30", "19:00"], weekly: "09:00", backup: "19:30" },
  quiet: { from: "22:30", to: "06:30" },
  max: 8,
  pauseUntil: null
};
const MILESTONES = [60, 30, 14, 7, 3, 1];
const DAY = 86400000;

export function normalizePrefs(p = {}) {
  const d = DEFAULT_PREFS;
  const hhmm = (v, f) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : f);
  const times = { ...d.times, ...(p.times || {}) };
  return {
    on: Boolean(p.on),
    kinds: { ...d.kinds, ...(p.kinds || {}), question: Math.max(0, Math.min(3, Math.round(Number(p.kinds?.question ?? d.kinds.question)) || 0)) },
    times: {
      morning: hhmm(times.morning, d.times.morning), rescue: hhmm(times.rescue, d.times.rescue), review: hhmm(times.review, d.times.review),
      weekly: hhmm(times.weekly, d.times.weekly), backup: hhmm(times.backup, d.times.backup),
      questions: (Array.isArray(times.questions) ? times.questions : d.times.questions).map((v, i) => hhmm(v, d.times.questions[i] || "12:00")).slice(0, 3)
    },
    quiet: { from: hhmm(p.quiet?.from, d.quiet.from), to: hhmm(p.quiet?.to, d.quiet.to) },
    max: Math.max(1, Math.min(20, Math.round(Number(p.max ?? d.max)) || d.max)),
    pauseUntil: Number(p.pauseUntil) || null
  };
}

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const atOn = (iso, hhmm) => { const [y, mo, da] = iso.split("-").map(Number); const m = toMin(hhmm); return new Date(y, mo - 1, da, Math.floor(m / 60), m % 60).getTime(); };
export function inQuiet(ms, quiet) {
  const d = new Date(ms); const m = d.getHours() * 60 + d.getMinutes();
  const a = toMin(quiet.from); const b = toMin(quiet.to);
  return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
}
const clip = (s, n) => { const x = String(s || "").replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const L = (i) => String.fromCharCode(65 + i);

/**
 * input: {
 *   now, prefs, say(key, vars) → text,
 *   days: [{ date, blocks: [{ id, start, end, kind, title, topics, marked }], ttId, studied, reviewed }]  (today first)
 *   exams: [{ name, at }], dueCount, streak, questions: [{ id, text, options, answerIndex }], lastBackupAt
 * } → items sorted by time: { id, at, kind, title, body, actions: [{ action, title }], url, data }
 */
export function buildPlan(input) {
  const prefs = normalizePrefs(input.prefs);
  const { now, say } = input;
  if (!prefs.on) return [];
  const out = [];
  const qs = (input.questions || []).slice();
  let qi = 0;
  (input.days || []).forEach((day, di) => {
    const items = [];
    const push = (kind, at, rest) => { if (at > now + 60000) items.push({ id: `${kind}:${day.date}:${rest.idPart || at}`, at, kind, ...rest }); };
    // A block check-in when each study / revision / test block ends.
    if (prefs.kinds.block) (day.blocks || []).filter((b) => b.kind !== "break" && !b.marked).forEach((b) => {
      push("block", atOn(day.date, b.end), {
        idPart: b.id, title: say("rem.block.title", { what: b.title }),
        body: [`${b.start}–${b.end}`, b.topics].filter(Boolean).join(" · "),
        actions: [{ action: "done", title: say("rem.act.done") }, { action: "skipped", title: say("rem.act.skipped") }],
        url: "#/today", data: { ttId: day.ttId, date: day.date, bid: b.id }
      });
    });
    // Morning plan (with an exam milestone when one falls on this day).
    if (prefs.kinds.morning) {
      const at = atOn(day.date, prefs.times.morning);
      const mile = (input.exams || []).map((e) => ({ e, left: Math.round((new Date(new Date(e.at).toDateString()) - new Date(new Date(at).toDateString())) / DAY) })).find((x) => MILESTONES.includes(x.left));
      const planned = (day.blocks || []).filter((b) => b.kind !== "break").length;
      const lines = [planned ? say("rem.morning.blocks", { n: planned }) : null, di === 0 && input.dueCount ? say("rem.morning.due", { n: input.dueCount }) : null].filter(Boolean);
      push("morning", at, {
        title: mile ? say("rem.morning.milestone", { n: mile.left, exam: mile.e.name }) : say("rem.morning.title"),
        body: lines.join(" · ") || say("rem.morning.free"),
        actions: [{ action: "session", title: say("rem.act.session") }, { action: "open", title: say("rem.act.today") }],
        url: "#/today", data: {}
      });
    }
    // Questions in free moments: due mistakes first, then weak topics.
    for (let k = 0; k < prefs.kinds.question; k++) {
      const q = qs[qi];
      if (!q) break;
      const at = atOn(day.date, prefs.times.questions[k] || "12:00");
      if (at <= now + 60000) continue;
      qi++;
      const opts = (q.options || []).map((o, i) => `${L(i)}) ${clip(o, 40)}`).join("   ");
      push("question", at, {
        idPart: String(k), title: say("rem.question.title"),
        body: `${clip(q.text, 150)}\n${opts}`,
        actions: [{ action: "answer", title: say("rem.act.answer") }, { action: "key", title: say("rem.act.key") }],
        url: `#/today?go=q&id=${encodeURIComponent(q.id)}`,
        data: { qid: q.id, key: Number.isInteger(q.answerIndex) ? `${L(q.answerIndex)}) ${clip(q.options[q.answerIndex], 80)}` : "" }
      });
    }
    // Streak rescue: only on a day nothing has been studied yet.
    if (prefs.kinds.rescue && !day.studied) push("rescue", atOn(day.date, prefs.times.rescue), {
      title: say("rem.rescue.title"),
      body: input.streak > 1 ? say("rem.rescue.streak", { n: input.streak }) : say("rem.rescue.body"),
      actions: [{ action: "quick", title: say("rem.act.quick") }, { action: "later", title: say("rem.act.tomorrow") }],
      url: "#/today", data: {}
    });
    // Day review.
    if (prefs.kinds.review && !day.reviewed) push("review", atOn(day.date, prefs.times.review), {
      title: say("rem.review.title"), body: say("rem.review.body"),
      actions: [{ action: "good", title: say("rem.act.good") }, { action: "tough", title: say("rem.act.tough") }],
      url: "#/today?go=review", data: { date: day.date }
    });
    // Sunday: the weekly report.
    if (prefs.kinds.weekly && new Date(atOn(day.date, "12:00")).getDay() === 0) push("weekly", atOn(day.date, prefs.times.weekly), {
      title: say("rem.weekly.title"), body: say("rem.weekly.body"), actions: [{ action: "open", title: say("rem.act.open") }], url: "#/diary", data: {}
    });
    // A backup reminder once, if the last backup is more than a week old.
    if (prefs.kinds.backup && di <= 1 && (!input.lastBackupAt || now - input.lastBackupAt > 7 * DAY) && !out.some((x) => x.kind === "backup")) {
      const at = atOn(day.date, prefs.times.backup);
      if (at > now + 60000) push("backup", at, { title: say("rem.backup.title"), body: say("rem.backup.body"), actions: [{ action: "open", title: say("rem.act.backup") }], url: "#/settings?section=data", data: {} });
    }
    out.push(...limitDay(items, prefs, now));
  });
  return out.sort((a, b) => a.at - b.at);
}

/** Quiet hours, paused days, spacing, and the daily limit (most useful kinds win). */
function limitDay(items, prefs, now) {
  const open = items.filter((x) => !inQuiet(x.at, prefs.quiet) && !(prefs.pauseUntil && x.at < prefs.pauseUntil));
  const chosen = open.slice().sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.at - b.at).slice(0, prefs.max);
  chosen.sort((a, b) => a.at - b.at);
  const gap = SPACING_MIN * 60000;
  const spaced = [];
  chosen.forEach((x) => {
    const prev = spaced[spaced.length - 1];
    let at = x.at;
    if (prev && at - prev.at < gap) at = prev.at + gap;
    if (inQuiet(at, prefs.quiet) || at <= now + 60000) return;
    spaced.push({ ...x, at });
  });
  return spaced;
}

/** Which planned reminder a wake-up is for: the nearest one not shown yet, within 20 minutes. */
export function pickForWake(items, shownIds, now) {
  const shown = new Set(shownIds || []);
  const near = (items || []).filter((x) => !shown.has(x.id) && Math.abs(x.at - now) <= 20 * 60000)
    .sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now));
  return near[0] || null;
}
