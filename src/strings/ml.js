// മലയാളം interface text. Simple everyday Malayalam; familiar English words (PYQ, AI, ടെസ്റ്റ്) are kept.
// Any key not here falls back to English automatically (see core/i18n.js).
import p1 from "./ml-1.js";
import p2 from "./ml-2.js";
import p3 from "./ml-3.js";
import p4 from "./ml-4.js";
import p5 from "./ml-5.js";
import p6 from "./ml-6.js";

// Part 6 adds keys inside "import", so it is merged into part 5's section.
export default { ...p1, ...p2, ...p3, ...p4, ...p5, import: { ...p5.import, ...p6.import } };
