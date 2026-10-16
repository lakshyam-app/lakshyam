/* Swipe left / right on a screen to move between its tabs (like most Android apps).
   Not started near the screen edges (Android's back gesture), in text fields, on rows that scroll
   sideways, or with two fingers; a mostly up-and-down move is a scroll, not a swipe. */
const EDGE = 24;      // px from the screen edge left to the phone's back gesture
const MIN_X = 70;     // px the finger must travel sideways
const MAX_MS = 700;   // a slow drag is not a swipe

function scrollsSideways(node, stop) {
  for (let n = node; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const o = getComputedStyle(n).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
  }
  return false;
}

/** el: the screen's content; left() runs on a swipe to the left (next tab), right() to the right (previous). */
export function onSwipe(el, { left, right }) {
  let start = null;
  el.addEventListener("touchstart", (e) => {
    start = null;
    if (e.touches.length !== 1) return;
    const p = e.touches[0];
    if (p.clientX < EDGE || p.clientX > innerWidth - EDGE) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable], [data-no-swipe]") || scrollsSideways(e.target, el)) return;
    start = { x: p.clientX, y: p.clientY, at: Date.now() };
  }, { passive: true });
  el.addEventListener("touchmove", (e) => { if (start && e.touches.length !== 1) start = null; }, { passive: true });
  el.addEventListener("touchcancel", () => { start = null; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    const s = start; start = null;
    if (!s) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - s.x; const dy = p.clientY - s.y;
    if (Date.now() - s.at > MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (String(getSelection?.() || "")) return; // selecting text
    (dx < 0 ? left : right)?.();
  }, { passive: true });
}
