/* Keeps the screen on (Screen Wake Lock) while you want it: during tests by default.
   Android releases the lock when the app goes to the background; it is taken again
   when you come back. Does nothing where the browser doesn't support it. */
let lock = null;
let want = false;

async function acquire() {
  if (!want || lock || document.hidden || !navigator.wakeLock) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => { lock = null; });
  } catch { lock = null; /* e.g. battery saver: just leave the screen to the phone */ }
}

export function setAwake(on) {
  want = Boolean(on);
  if (want) acquire();
  else if (lock) { const l = lock; lock = null; l.release().catch(() => {}); }
}

export const awakeSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) acquire(); });

export const AWAKE_MODES = ["tests", "always", "never"];
/** Screens counted as "studying" for the default mode. */
const STUDY_SCREENS = new Set(["test", "pdf-page"]);
export const wantAwake = (mode, screenId) => mode === "always" || (mode !== "never" && STUDY_SCREENS.has(screenId));
