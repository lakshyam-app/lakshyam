/* "Back to where I came from" for screens opened from several places (a test result, a
   group of tests). The opener adds openedFrom(screen, params); the screen reads it with backFrom. */
export const openedFrom = (screen, params = {}) => ({ bt: screen, bp: JSON.stringify(params) });

export function backFrom({ bt, bp } = {}, allowed, fallback) {
  if (!allowed.includes(bt)) return { to: fallback, params: {}, keep: {} };
  let params = {};
  try { params = JSON.parse(bp || "{}") || {}; } catch { params = {}; }
  return { to: bt, params, keep: { bt, bp: bp || "{}" } };
}
