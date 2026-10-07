/* Flashcards with light spaced repetition (same two buttons as before).
   "Know it" brings a card back after 1 → 3 → 7 → 14 → 30 days;
   "Again" keeps it in today's round. Pure functions. */

export const KNOW_DAYS = [1, 3, 7, 14, 30];
const DAY = 86400000;

export function know(state, now = Date.now()) {
  const streak = (state?.streak || 0) + 1;
  const days = KNOW_DAYS[Math.min(streak - 1, KNOW_DAYS.length - 1)];
  return { ...state, status: "known", streak, reviews: (state?.reviews || 0) + 1, lastAt: now, dueAt: now + days * DAY };
}

export function again(state, now = Date.now()) {
  return { ...state, status: "again", streak: 0, reviews: (state?.reviews || 0) + 1, lastAt: now, dueAt: now };
}

/** New and "again" cards are always due; known cards when their day comes
    (cards marked known before spaced repetition existed have no date and stay known). */
export function isDue(state, now = Date.now()) {
  if (!state || state.status === "new" || state.status === "again") return true;
  return Boolean(state.dueAt && state.dueAt <= now);
}
