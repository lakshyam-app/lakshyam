/* Every setting the search can find: where it lives (group), its name (already
   translated elsewhere in the app) and search words in English and in the app language.
   act: also run this when the hit is opened (e.g. open the AI sheet). */
import { t } from "../../core/i18n.js";
import en from "../../strings/en.js";

export const CATEGORIES = ["today", "look", "tests", "progress", "syllabi", "ai", "data", "about"];
export const CATEGORY_ICON = { today: "🎯", look: "🎨", tests: "📝", progress: "📊", syllabi: "📚", ai: "🤖", data: "💾", about: "ℹ️", elsewhere: "🗓", exam: "📅" };

const item = (id, cat, labelKey, act = null) => ({ id, cat, act, label: () => t(labelKey) });

export const SETTINGS_INDEX = [
  item("goal", "today", "settings.goal"),
  item("exam", "elsewhere", "cd.title", "exam"),
  item("countdown", "today", "exam.showSetting"),
  item("diary", "today", "diary.showSetting"),
  item("streak", "today", "settings.showStreak"),
  item("showGoal", "today", "settings.showGoal"),
  item("name", "today", "settings.name"),

  item("theme", "look", "setx.theme"),
  item("textSize", "look", "setx.textSize"),
  item("appLang", "look", "settings.appLang"),
  item("names", "look", "names.setting"),
  item("namesFile", "look", "names.import"),

  item("timer", "tests", "setx.timerDefault"),
  item("testLayout", "tests", "setx.testLayout"),
  item("testCount", "tests", "setx.testCount"),
  item("listView", "tests", "view.title"),
  item("listLayout", "tests", "setx.lists"),
  item("resultLayout", "tests", "setx.resultLayout"),
  item("keepAwake", "tests", "setx.keepAwake"),
  item("difficulty", "tests", "settings.difficulty"),
  item("diffTimes", "tests", "diffTimes.title", "diff-times"),

  item("basis", "progress", "stats.basisTitle"),
  item("fresh", "progress", "stats.freshTitle", "stats"),

  item("syllabi", "syllabi", "syllabi.title"),
  item("marking", "syllabi", "syllabi.marking"),
  item("pattern", "syllabi", "syllabi.pattern"),

  item("presets", "ai", "ai.manage", "ai-settings"),
  item("aiLang", "ai", "ai.lang", "ai-settings"),
  item("fallback", "ai", "ai.fallback", "ai-settings"),
  item("pause", "ai", "setx.pausePreset", "ai-settings"),
  item("aiOnCards", "ai", "ai.onCards"),
  item("removeKeys", "ai", "ai.removeAll", "ai-settings"),

  item("drive", "data", "drive.title"),
  item("backup", "data", "settings.backupNow"),
  item("restore", "data", "settings.restore"),
  item("importOld", "data", "settings.importOld"),
  item("undo", "data", "settings.undo", "undo"),
  item("erase", "data", "settings.erase"),
  item("protect", "data", "settings.sectionStorage"),

  item("update", "about", "settings.checkUpdate"),

  item("timetable", "elsewhere", "setx.timetable", "timetable")
];

const fold = (s) => String(s || "").toLowerCase().normalize("NFC");
const pick = (dict, key) => key.split(".").reduce((n, p) => n?.[p], dict);

/** Words for one entry: its name and group in the app language and in English, plus keywords in both. */
function haystack(it) {
  const catKey = it.cat === "elsewhere" ? "setx.elsewhere" : `setx.cat.${it.cat}`;
  return fold([it.label(), t(catKey), t(`setx.kw.${it.id}`), pick(en, `setx.kw.${it.id}`), pick(en, catKey)].join(" "));
}

/** Entries matching every word typed; name matches first. */
export function searchSettings(q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS_INDEX
    .map((it) => {
      const hay = haystack(it);
      if (!words.every((w) => hay.includes(w))) return null;
      const name = fold(it.label());
      return { it, score: words.filter((w) => name.includes(w)).length * 2 + (name.startsWith(words[0]) ? 1 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
}
