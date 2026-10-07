/* Timetable logic (pure: no screen, no database), unit-tested.

   A timetable = day plans + a schedule that says which plan applies on which date.
     dayPlans: [{ id, name, blocks: [{ id, start "HH:MM", end "HH:MM", kind, subjectId?, topicIds?, label?, breakType? }] }]
     schedule: { mode: "daily" | "weekly" | "cycle",
                 daily: planId,                      every day the same
                 weekly: { 1..7: planId | "off" },   Monday = 1 … Sunday = 7 (e.g. 5 days one plan, 2 days another)
                 cycle: [planId | "off", …], cycleStart: "YYYY-MM-DD" (e.g. alternate days = a 2-day cycle) }
     overrides: { "YYYY-MM-DD": planId | "off" }      one date changed (a holiday, "today only" edits)
     startDate / endDate: at most 6 months ahead. */

export const KINDS = ["study", "revision", "test", "break", "custom"];
export const BREAKS = ["food", "bath", "rest", "exercise", "sleep", "travel", "work", "other"];
export const MAX_DAYS = 183; // about 6 months
export const OFF = "off";

/* ---------- time and dates ---------- */

export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}
export const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const durationMin = (b) => Math.max(0, (toMin(b.end) ?? 0) - (toMin(b.start) ?? 0));

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); }
/** Whole days from a to b (b − a). */
export function daysFrom(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000); }
/** Monday = 1 … Sunday = 7. */
export function weekday(iso) { const d = parseIso(iso).getDay(); return d === 0 ? 7 : d; }
export function dateRange(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }

/** The latest end date allowed (6 months from today). */
export const maxEndDate = (today = isoDate()) => addDays(today, MAX_DAYS);
export function clampEnd(start, end, today = isoDate()) {
  const cap = maxEndDate(today);
  let e = end && end >= start ? end : start;
  if (e > cap) e = cap;
  return e;
}

/* ---------- blocks ---------- */

/** Sorted by start time. */
export const sortBlocks = (blocks) => blocks.slice().sort((a, b) => (toMin(a.start) ?? 0) - (toMin(b.start) ?? 0) || (toMin(a.end) ?? 0) - (toMin(b.end) ?? 0));

/** Problems in a day plan: bad time, ends before it starts, overlaps. */
export function blockIssues(blocks) {
  const issues = [];
  const list = sortBlocks(blocks);
  list.forEach((b, i) => {
    const s = toMin(b.start); const e = toMin(b.end);
    if (s === null || e === null) { issues.push({ blockId: b.id, type: "bad-time" }); return; }
    if (e <= s) issues.push({ blockId: b.id, type: "ends-before" });
    const next = list[i + 1];
    if (next && toMin(next.start) !== null && toMin(next.start) < e) issues.push({ blockId: next.id, type: "overlap", with: b.id });
  });
  blocks.forEach((b) => { if (!KINDS.includes(b.kind)) issues.push({ blockId: b.id, type: "kind" }); });
  return issues;
}

/** Minutes per kind, and study/revision minutes per subject. */
export function planMinutes(blocks) {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const bySubject = {};
  blocks.forEach((b) => {
    const m = durationMin(b);
    byKind[b.kind] = (byKind[b.kind] || 0) + m;
    if ((b.kind === "study" || b.kind === "revision") && b.subjectId) bySubject[b.subjectId] = (bySubject[b.subjectId] || 0) + m;
  });
  return { byKind, bySubject, focus: byKind.study + byKind.revision + byKind.test };
}

/* ---------- which plan on which date ---------- */

/** planId, "off" (a day off), or null (outside the timetable's dates). */
export function planIdFor(tt, iso) {
  if (!tt || iso < tt.startDate || iso > tt.endDate) return null;
  if (tt.overrides && Object.prototype.hasOwnProperty.call(tt.overrides, iso)) return tt.overrides[iso];
  const s = tt.schedule || {};
  if (s.mode === "weekly") return s.weekly?.[weekday(iso)] ?? OFF;
  if (s.mode === "cycle" && Array.isArray(s.cycle) && s.cycle.length) {
    const k = daysFrom(s.cycleStart || tt.startDate, iso);
    return s.cycle[((k % s.cycle.length) + s.cycle.length) % s.cycle.length] ?? OFF;
  }
  return s.daily ?? OFF;
}

export function planFor(tt, iso) {
  const id = planIdFor(tt, iso);
  if (!id || id === OFF) return null;
  return tt.dayPlans.find((p) => p.id === id) || null;
}

/** "Running late": blocks starting at or after `from` move later by `by` minutes. */
export function shiftBlocks(blocks, shift) {
  if (!shift?.by) return blocks;
  return blocks.map((b) => {
    const s = toMin(b.start); const e = toMin(b.end);
    if (s === null || s < shift.from) return b;
    return { ...b, start: fromMin(Math.min(1440, s + shift.by)), end: fromMin(Math.min(1440, e + shift.by)), shifted: true };
  });
}

/** The block running at `minute` (0–1440) and the next one. */
export function blockAt(blocks, minute) {
  const list = sortBlocks(blocks);
  const current = list.find((b) => toMin(b.start) <= minute && minute < toMin(b.end)) || null;
  const next = list.find((b) => toMin(b.start) > minute) || null;
  return { current, next };
}

/** Study minutes per subject between two dates (inclusive). */
export function rangeMinutes(tt, from, to) {
  const bySubject = {}; let focus = 0; let days = 0;
  dateRange(from, to).forEach((d) => {
    const p = planFor(tt, d);
    if (!p) return;
    days++;
    const m = planMinutes(p.blocks);
    focus += m.focus;
    Object.entries(m.bySubject).forEach(([k, v]) => { bySubject[k] = (bySubject[k] || 0) + v; });
  });
  return { bySubject, focus, days };
}

/* ---------- building a plan in code (no AI) ---------- */

/**
 * Fills study windows with sessions and short breaks; subjects share the time by weight,
 * never the same subject twice in a row when avoidable; the last session of the day is revision.
 * opts: { windows: [{ start, end }], session (min), gap (min), subjects: [{ id, weight }], revision: bool, newId }
 */
export function autoBlocks({ windows, session = 50, gap = 10, subjects, revision = true, newId }) {
  const slots = [];
  windows.map((w) => ({ s: toMin(w.start), e: toMin(w.end) })).filter((w) => w.s !== null && w.e !== null && w.e > w.s)
    .sort((a, b) => a.s - b.s).forEach((w) => {
      let t = w.s;
      while (w.e - t >= Math.min(25, session)) {
        const end = Math.min(w.e, t + session);
        slots.push({ s: t, e: end });
        t = end;
        if (w.e - t >= gap + 25) { slots.push({ s: t, e: t + gap, rest: true }); t += gap; } else break;
      }
    });
  const study = slots.filter((x) => !x.rest);
  if (!study.length || !subjects.length) return [];
  const useRevision = revision && study.length >= 3;
  const n = study.length - (useRevision ? 1 : 0);
  // Largest-remainder shares of the sessions.
  const total = subjects.reduce((a, s) => a + Math.max(0.01, s.weight), 0);
  const raw = subjects.map((s) => ({ id: s.id, q: (n * Math.max(0.01, s.weight)) / total }));
  const share = raw.map((r) => ({ id: r.id, k: Math.floor(r.q), rem: r.q - Math.floor(r.q) }));
  let left = n - share.reduce((a, x) => a + x.k, 0);
  share.slice().sort((a, b) => b.rem - a.rem).forEach((x) => { if (left > 0) { x.k++; left--; } });
  // Interleave: always take the subject with most sessions left that wasn't just used.
  const order = []; let last = null;
  for (let i = 0; i < n; i++) {
    const pick = share.filter((x) => x.k > 0).sort((a, b) => (a.id === last) - (b.id === last) || b.k - a.k)[0];
    if (!pick) break;
    order.push(pick.id); pick.k--; last = pick.id;
  }
  let si = 0;
  return slots.map((x) => {
    if (x.rest) return { id: newId(), start: fromMin(x.s), end: fromMin(x.e), kind: "break", breakType: "rest" };
    const isLast = useRevision && x === study[study.length - 1];
    if (isLast) return { id: newId(), start: fromMin(x.s), end: fromMin(x.e), kind: "revision" };
    return { id: newId(), start: fromMin(x.s), end: fromMin(x.e), kind: "study", subjectId: order[si++] || subjects[0].id };
  });
}

/* ---------- reading an AI draft ---------- */

/**
 * Turns the AI's JSON into a timetable draft, checking everything.
 * find: { subject(name) → id | null, topic(subjectId, name) → id | null, newId() }
 * → { dayPlans, schedule, issues: [text keys] }
 */
export function readAiDraft(json, find) {
  const issues = [];
  const plansIn = Array.isArray(json?.day_plans) ? json.day_plans : Array.isArray(json?.dayPlans) ? json.dayPlans : [];
  if (!plansIn.length) return { dayPlans: [], schedule: null, issues: ["no-plans"] };
  const idByName = new Map();
  const dayPlans = plansIn.slice(0, 7).map((p, i) => {
    const id = find.newId();
    idByName.set(String(p.name || `Plan ${i + 1}`).trim().toLowerCase(), id);
    const blocks = [];
    (Array.isArray(p.blocks) ? p.blocks : []).slice(0, 40).forEach((b) => {
      const s = toMin(b.start); const e = toMin(b.end);
      if (s === null || e === null || e <= s) { issues.push("bad-time"); return; }
      const kind = KINDS.includes(b.kind) ? b.kind : (/break|meal|food|lunch|dinner|bath|rest/i.test(b.kind || b.label || "") ? "break" : "custom");
      const blk = { id: find.newId(), start: fromMin(s), end: fromMin(e), kind };
      if (kind === "break") blk.breakType = BREAKS.includes(b.break_type) ? b.break_type : guessBreak(b.label || b.kind);
      if (b.label) blk.label = String(b.label).slice(0, 60);
      if (kind === "study" || kind === "revision") {
        const sid = b.subject ? find.subject(String(b.subject)) : null;
        if (b.subject && !sid) { issues.push("unknown-subject"); blk.label ||= String(b.subject).slice(0, 60); }
        if (sid) {
          blk.subjectId = sid;
          const tids = (Array.isArray(b.topics) ? b.topics : []).map((x) => find.topic(sid, String(x))).filter(Boolean);
          if (tids.length) blk.topicIds = [...new Set(tids)].slice(0, 6);
        }
      }
      blocks.push(blk);
    });
    // Drop overlaps: keep the earlier block, trim or drop the later one.
    const clean = [];
    sortBlocks(blocks).forEach((b) => {
      const prev = clean[clean.length - 1];
      if (prev && toMin(b.start) < toMin(prev.end)) {
        issues.push("overlap");
        if (toMin(b.end) - toMin(prev.end) >= 15) clean.push({ ...b, start: prev.end });
        return;
      }
      clean.push(b);
    });
    return { id, name: String(p.name || `Plan ${i + 1}`).slice(0, 40), blocks: clean };
  });
  const ref = (name) => {
    if (name === null || name === undefined || /^(off|rest|holiday|none)$/i.test(String(name))) return OFF;
    return idByName.get(String(name).trim().toLowerCase()) || dayPlans[0].id;
  };
  const sIn = json.schedule || {};
  let schedule;
  if (sIn.mode === "weekly" && sIn.weekly && typeof sIn.weekly === "object") {
    const names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const weekly = {};
    for (let d = 1; d <= 7; d++) weekly[d] = ref(sIn.weekly[d] ?? sIn.weekly[String(d)] ?? sIn.weekly[names[d - 1]] ?? dayPlans[0].name);
    schedule = { mode: "weekly", weekly };
  } else if (sIn.mode === "cycle" && Array.isArray(sIn.cycle) && sIn.cycle.length >= 2) {
    schedule = { mode: "cycle", cycle: sIn.cycle.slice(0, 14).map(ref) };
  } else schedule = { mode: "daily", daily: dayPlans[0].id };
  return { dayPlans, schedule, issues: [...new Set(issues)] };
}

function guessBreak(text) {
  const s = String(text || "").toLowerCase();
  if (/food|meal|lunch|dinner|breakfast|tea|snack/.test(s)) return "food";
  if (/bath|shower/.test(s)) return "bath";
  if (/walk|exercise|yoga|gym/.test(s)) return "exercise";
  if (/sleep|nap/.test(s)) return "sleep";
  if (/travel|commute/.test(s)) return "travel";
  if (/work|job|office/.test(s)) return "work";
  return "rest";
}

/* ---------- calendar export (.ics) ---------- */

const icsEscape = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 bytes are folded, as the calendar format requires. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = ""; let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const stamp = (iso, hhmm) => `${iso.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;

/**
 * Calendar file for the dates from..to. Times are "floating" (your phone's local time).
 * opts: { kinds: Set of kinds to include, alarm: minutes before (0 = none), title(block) → text, describe(block) → text, now }
 */
export function buildIcs(tt, from, to, { kinds, alarm = 0, title, describe = () => "", now = new Date() }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lakshyam//Timetable//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(tt.name || "Lakshyam timetable")}`];
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  let count = 0;
  dateRange(from, to).forEach((d) => {
    const p = planFor(tt, d);
    if (!p) return;
    sortBlocks(p.blocks).forEach((b) => {
      if (kinds && !kinds.has(b.kind)) return;
      if (toMin(b.start) === null || toMin(b.end) === null || durationMin(b) <= 0) return;
      const end = b.end === "24:00" ? stamp(addDays(d, 1), "00:00") : stamp(d, b.end);
      lines.push("BEGIN:VEVENT", `UID:${tt.id}-${d}-${b.id}@lakshyam`, `DTSTAMP:${dtstamp}`, `DTSTART:${stamp(d, b.start)}`, `DTEND:${end}`, `SUMMARY:${icsEscape(title(b))}`);
      const desc = describe(b);
      if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
      if (alarm > 0) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title(b))}`, `TRIGGER:-PT${alarm}M`, "END:VALARM");
      lines.push("END:VEVENT");
      count++;
    });
  });
  lines.push("END:VCALENDAR");
  return { text: `${lines.map(fold).join("\r\n")}\r\n`, count };
}
