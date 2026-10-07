/* All interface text goes through t('key', {vars}).
   English is the only language now; a second language is one more file
   in /src/strings/ plus an entry in LOCALES. */

import en from "../strings/en.js";
import ml from "../strings/ml.js";

const LOCALES = { en, ml };
export const LANGUAGES = [{ code: "en", name: "English" }, { code: "ml", name: "മലയാളം" }];
let current = "en";

export function setLocale(code) {
  if (LOCALES[code]) {
    current = code;
    document.documentElement.lang = code;
  }
}

export function locale() { return current; }

/** Locale for dates and times shown on screen (Malayalam month and day names in മലയാളം). */
export const dateLocale = () => (current === "ml" ? "ml-IN" : "en-IN");

/** Looks up a dotted key; falls back to English, then to the key itself. */
export function t(key, vars = {}) {
  const pick = (dict) => key.split(".").reduce((node, part) => node?.[part], dict);
  let value = pick(LOCALES[current]) ?? pick(en) ?? key;
  if (typeof value === "function") value = value(vars);
  return String(value).replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in vars)) return `{${name}}`;
    const v = vars[name];
    return typeof v === "number" ? formatNumber(v) : v;
  });
}

/** Numbers formatted for the current language (e.g. 1,234). */
export function formatNumber(n, options) {
  return new Intl.NumberFormat(current === "en" ? "en-IN" : current, options).format(n);
}
