/* Screen time (pure, unit-tested): your phone's own per-app times (read from a Digital Wellbeing or Samsung
   "Screen time" screenshot) and how much of each was study.

   Based on what research on habit change supports:
   - self-monitoring with honest feedback (you see study, needed and wasted minutes each day);
   - comparison with your own recent days, not an ideal;
   - a specific goal (a daily wasted-time limit) that starts from your own baseline and steps down gradually;
   - an "if–then" plan for your biggest time-waster (implementation intentions);
   - making the waste harder (a suggested Digital Wellbeing app timer);
   - low effort: your usual answer for an app is remembered, so you are only asked about mixed ones.

   Only apps used at least MIN_MINUTES in the day are kept (the rest are ignored).
   Each app's answer (share of it that was study):
     all 1 · most 0.75 · half 0.5 · little 0.25 · none 0 · needed (calls, banking: neither study nor wasted) */

export const MIN_MINUTES = 20;
export const SHARES = ["all", "most", "half", "little", "none", "needed"];
export const SHARE_VALUE = { all: 1, most: 0.75, half: 0.5, little: 0.25, none: 0, needed: null };
export const SHARE_ICON = { all: "✅", most: "🟢", half: "🟡", little: "🟠", none: "❌", needed: "⚪" };
export const BASELINE_DAYS = 7; // days of data before a limit is suggested

/** "1 hr, 20 mins", "1 h 19 m", "51 m", "31 minutes", "5 hrs 43 mins", "45s", "1:20" → minutes (rounded); null if not a time. */
export function parseDuration(s) {
  const t = String(s ?? "").toLowerCase().replace(/,/g, " ").trim();
  if (!t) return null;
  if (/less than|<\s*1/.test(t)) return 0;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  let min = 0; let found = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|മണിക്കൂർ)\b/.exec(t);
  if (h) { min += Number(h[1]) * 60; found = true; }
  const m = /(\d+)\s*(?:m|min|mins|minute|minutes|മിനിറ്റ്)\b/.exec(t);
  if (m) { min += Number(m[1]); found = true; }
  if (!found) {
    if (/^\d+\s*(?:s|sec|secs|second|seconds)\b/.test(t)) return 0;
    if (/^\d+$/.test(t)) return Number(t); // a bare number: minutes
    return null;
  }
  return Math.round(min);
}

/** A stable key for an app name ("YouTube ", "youtube" → "youtube"). */
export const appKey = (name) => String(name || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The AI's reply (JSON) → { date, apps: [{ name, min }] } (apps without a readable time are dropped). */
export function readReply(raw) {
  const obj = Array.isArray(raw) ? { apps: raw } : raw || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(obj.date || "")) ? obj.date : null;
  const apps = (Array.isArray(obj.apps) ? obj.apps : []).map((a) => {
    const name = String(a?.name ?? a?.app ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const min = Number.isFinite(a?.minutes) ? Math.round(a.minutes) : parseDuration(a?.time ?? a?.duration ?? a?.minutes);
    return name && Number.isFinite(min) && min >= 0 && min <= 24 * 60 ? { name, min } : null;
  }).filter(Boolean);
  return { date, apps };
}

/** Several screenshots of one day → one list (an app seen twice keeps its larger time), most used first. */
export function mergeApps(lists) {
  const by = new Map();
  for (const list of lists) for (const a of list || []) {
    const k = appKey(a.name);
    if (!k) continue;
    const prev = by.get(k);
    if (!prev || a.min > prev.min) by.set(k, { name: prev?.name || a.name, min: a.min, key: k });
  }
  return [...by.values()].sort((a, b) => b.min - a.min);
}

/** Splits into the apps kept (≥ MIN_MINUTES) and how many were left out. */
export function keepBig(apps, min = MIN_MINUTES) {
  const kept = apps.filter((a) => a.min >= min);
  return { kept, ignored: apps.length - kept.length, ignoredMin: apps.filter((a) => a.min < min).reduce((s, a) => s + a.min, 0) };
}

/** A day's figures from its saved apps [{ name, key, min, share }]. Apps not yet answered count as "unsorted". */
export function daySummary(entry) {
  const apps = entry?.apps || [];
  let study = 0; let wasted = 0; let needed = 0; let unsorted = 0;
  const waste = [];
  for (const a of apps) {
    const v = SHARE_VALUE[a.share];
    if (a.share === "needed") needed += a.min;
    else if (v === undefined) unsorted += a.min;
    else {
      study += a.min * v; wasted += a.min * (1 - v);
      if (a.min * (1 - v) > 0) waste.push({ name: a.name, key: a.key || appKey(a.name), min: Math.round(a.min * (1 - v)) });
    }
  }
  const total = apps.reduce((s, a) => s + a.min, 0);
  return { total, study: Math.round(study), wasted: Math.round(wasted), needed, unsorted, top: waste.sort((a, b) => b.min - a.min).slice(0, 3) };
}

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

/** Summary of several days (only days with data count): averages per day, ratios, worst apps, days under a limit. */
export function periodSummary(entries, limit = null) {
  const days = entries.filter((e) => e?.apps?.length).map((e) => ({ date: e.date, ...daySummary(e) }));
  const n = days.length;
  const sum = (k) => days.reduce((s, d) => s + d[k], 0);
  const per = new Map();
  for (const e of entries) for (const a of e?.apps || []) {
    const v = SHARE_VALUE[a.share];
    if (v === undefined || v === null) continue;
    const k = a.key || appKey(a.name);
    const w = a.min * (1 - v);
    const p = per.get(k) || { name: a.name, key: k, wasted: 0, total: 0, days: 0 };
    p.wasted += w; p.total += a.min; p.days++;
    per.set(k, p);
  }
  const apps = [...per.values()].map((p) => ({ ...p, wasted: Math.round(p.wasted), avgTotal: Math.round(p.total / Math.max(1, p.days)), avgWasted: Math.round(p.wasted / Math.max(1, n)) }))
    .filter((p) => p.wasted > 0).sort((a, b) => b.wasted - a.wasted);
  const study = sum("study"); const wasted = sum("wasted");
  return {
    days: n,
    avgTotal: n ? Math.round(sum("total") / n) : 0,
    avgStudy: n ? Math.round(study / n) : 0,
    avgWasted: n ? Math.round(wasted / n) : 0,
    avgNeeded: n ? Math.round(sum("needed") / n) : 0,
    studyShare: study + wasted ? Math.round((study / (study + wasted)) * 100) : null,
    underLimit: limit ? days.filter((d) => d.wasted <= limit).length : null,
    best: n ? days.reduce((a, b) => (b.wasted < a.wasted ? b : a)) : null,
    worst: n ? days.reduce((a, b) => (b.wasted > a.wasted ? b : a)) : null,
    apps
  };
}

/**
 * A daily wasted-time limit from your own recent days (the last BASELINE_DAYS with data):
 * about 20% under your usual (median) day, so it is reachable, then stepping down again
 * when you keep under it on most days. null until there are enough days.
 */
export function suggestLimit(recent, current = null) {
  const days = recent.filter((e) => e?.apps?.length).slice(-BASELINE_DAYS).map((e) => daySummary(e).wasted);
  if (days.length < BASELINE_DAYS) return null;
  const usual = median(days);
  if (!current) return round5(usual * 0.8);
  const kept = days.filter((w) => w <= current).length;
  if (kept >= 5) return Math.max(15, round5(current * 0.9)); // kept it on most days: a little lower
  return current; // not yet: keep the same goal
}

/** For an app that is mostly waste: a Digital Wellbeing app timer about 25% under its usual daily time. */
export function timerFor(app) {
  if (!app || app.avgTotal < 30 || app.wasted / Math.max(1, app.total) < 0.5) return null;
  return round5(app.avgTotal * 0.75);
}

/** Your usual answer for each app: after the same answer on 2 days in a row it is filled in for you. */
export function learnDefaults(defaults, apps) {
  const out = { ...(defaults || {}) };
  for (const a of apps) {
    if (!SHARES.includes(a.share)) continue;
    const k = a.key || appKey(a.name);
    const p = out[k];
    out[k] = p && p.last === a.share ? { last: a.share, n: Math.min(9, (p.n || 1) + 1) } : { last: a.share, n: 1 };
  }
  return out;
}
export const usualShare = (defaults, key) => (defaults?.[key]?.n >= 2 ? defaults[key].last : null);

/** Minutes as "1h 05m" for small figure boxes. */
export const hmShort = (min) => { const m = Math.max(0, Math.round(min || 0)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };
/** Minutes as "1 h 05 m" / "45 m". */
export const hm = (min) => { const m = Math.max(0, Math.round(min || 0)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m` : `${m} m`; };
