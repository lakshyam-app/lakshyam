/* Study tracking: "mark as studied" with spaced review, and local-date helpers.
   Review gaps are the same as the old app: 1, 2, 4, 7, 14, 30, 60 days. */

export const REVIEW_INTERVALS_DAYS = [1, 2, 4, 7, 14, 30, 60];
const DAY = 86400000;

/** Today's date on the phone's own clock (fixes the old UTC streak bug). */
export function localDate(ms = Date.now()) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** New topic state after +1 (studied once more) or −1 (undo). */
export function stepStudied(state, delta, now = Date.now()) {
  const count = Math.max(0, (state?.studiedCount || 0) + delta);
  let lastStudiedAt = state?.lastStudiedAt ?? null;
  if (delta > 0) lastStudiedAt = now;
  if (count === 0) return { studiedCount: 0, lastStudiedAt: null, nextReviewAt: null };
  const gap = REVIEW_INTERVALS_DAYS[Math.min(count - 1, REVIEW_INTERVALS_DAYS.length - 1)];
  return { studiedCount: count, lastStudiedAt, nextReviewAt: lastStudiedAt ? lastStudiedAt + gap * DAY : null };
}

export const isDue = (state, now = Date.now()) => Boolean(state?.nextReviewAt && now >= state.nextReviewAt);
