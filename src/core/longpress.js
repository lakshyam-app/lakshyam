/* Press-and-hold on any [data-lp] element inside root calls handler(el).
   The click that follows a long-press is swallowed so the row doesn't open. */
const HOLD_MS = 500;
const MOVE_PX = 10;

export function onLongPress(root, handler) {
  let timer = null; let start = null; let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  root.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-lp]");
    if (!el || !root.contains(el)) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { fired = true; navigator.vibrate?.(15); handler(el); }, HOLD_MS);
  });
  root.addEventListener("pointermove", (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) cancel();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => root.addEventListener(type, cancel));
  root.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-lp]")) e.preventDefault(); });
  root.addEventListener("click", (e) => {
    if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
}
