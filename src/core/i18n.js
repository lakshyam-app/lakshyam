/* All interface text goes through t('key', {vars}).
   English is the only language now; a second language is one more file
   in /src/strings/ plus an entry in LOCALES. */

import en from "../strings/en.js";

const LOCALES = { en };
let current = "en";

export function setLocale(code) {
  if (LOCALES[code]) {
    current = code;
    document.documentElement.lang = code;
  }
}

export function locale() { return current; }

/** Looks up a dotted key; falls back to English, then to the key itself. */
export function t(key, vars = {}) {
  const pick = (dict) => key.split(".").reduce((node, part) => node?.[part], dict);
  let value = pick(LOCALES[current]) ?? pick(en) ?? key;
  if (typeof value === "function") value = value(vars);
  return String(value).replace(/\{(\w+)\}/g, (_, name) => (name in vars ? vars[name] : `{${name}}`));
}

/** Numbers formatted for the current language (e.g. 1,234). */
export function formatNumber(n, options) {
  return new Intl.NumberFormat(current === "en" ? "en-IN" : current, options).format(n);
}
