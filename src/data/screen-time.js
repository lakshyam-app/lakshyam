/* Screen time records, kept in the "diary" store (so they are in your backups):
   "screen:YYYY-MM-DD" { kind: "screen", date, apps: [{ name, key, min, share }], ignored, ignoredMin, from, at }
   Settings: "screenDefaults" (your usual answer per app), "screenLimit" { min, at },
   "screenPlan" { app, text, at } (your if–then plan for the biggest time-waster).
   Only numbers and app names are kept — never the screenshots. */
import * as store from "./store.js";
import * as T from "../domain/timetable.js";
import * as S from "../domain/screen-time.js";

export const screenId = (date) => `screen:${date}`;
export const screenOn = (date) => store.byId("diary", screenId(date)) || null;

/** All saved days between two dates (inclusive), oldest first. */
export function screenBetween(from, to) {
  return T.dateRange(from, to).map(screenOn).filter(Boolean);
}
/** The most recent days with data (up to n), oldest first. */
export function recentScreen(n = 14, until = T.isoDate()) {
  return store.all("diary").filter((x) => x.kind === "screen" && x.date <= until).sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
}

export async function saveScreen(date, { apps, ignored = 0, ignoredMin = 0, from = "" }) {
  const clean = apps.slice(0, 40).map((a) => ({ name: String(a.name).slice(0, 60), key: a.key || S.appKey(a.name), min: Math.max(0, Math.min(1440, Math.round(a.min))), share: S.SHARES.includes(a.share) ? a.share : null }));
  await store.apply({ diary: { put: [{ id: screenId(date), kind: "screen", date, apps: clean, ignored, ignoredMin, from: String(from).slice(0, 40), at: Date.now() }] } });
  await store.quietly(() => store.setSetting("screenDefaults", S.learnDefaults(store.setting("screenDefaults", {}), clean.filter((a) => a.share))));
}
export async function deleteScreen(date) {
  const prev = screenOn(date);
  if (prev) await store.apply({ diary: { delete: [screenId(date)] } });
  return prev;
}
export const restoreScreen = (rec) => store.apply({ diary: { put: [rec] } });

export const screenDefaults = () => store.setting("screenDefaults", {}) || {};
export const screenLimit = () => store.setting("screenLimit", null);
export const setScreenLimit = (min) => store.setSetting("screenLimit", min ? { min: Math.round(min), at: Date.now() } : null);
export const screenPlan = () => store.setting("screenPlan", null);
export const setScreenPlan = (plan) => store.setSetting("screenPlan", plan ? { ...plan, at: Date.now() } : null);
