// മലയാളം interface text. Simple everyday Malayalam; familiar English words (PYQ, AI, ടെസ്റ്റ്) are kept.
// Any key not here falls back to English automatically (see core/i18n.js).
import p1 from "./ml-1.js";
import p2 from "./ml-2.js";
import p3 from "./ml-3.js";
import p4 from "./ml-4.js";
import p5 from "./ml-5.js";
import p6 from "./ml-6.js";
import p7 from "./ml-7.js";
import p8 from "./ml-8.js";
import p9 from "./ml-9.js";
import p10 from "./ml-10.js";

/** Later parts may add keys inside groups an earlier part started (e.g. "import", "start"). */
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a?.[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v;
  }
  return out;
}

export default [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10].reduce(deepMerge, {});
