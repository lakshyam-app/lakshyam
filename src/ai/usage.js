/* How much each AI preset has been used: requests and tokens today and in all, counted by this app from
   the replies (each reply says how many tokens it used). Nothing extra is sent anywhere to count them.
   "Left" is shown only where the provider says it:
   - Groq (and others that send them): x-ratelimit-* headers on each reply, if the browser lets the app read them;
   - OpenRouter: its key-info address (/api/v1/key), asked when you open Settings → AI.
   Google Gemini doesn't tell apps how much is left (only its own page, ai.dev/rate-limit). */

/** Tokens a reply says it used (OpenAI-style, Anthropic or Google Gemini replies); 0 if it doesn't say. */
export function tokensOf(data) {
  const u = data?.usage;
  if (u) {
    if (Number.isFinite(u.total_tokens)) return u.total_tokens;
    const io = (Number(u.prompt_tokens ?? u.input_tokens) || 0) + (Number(u.completion_tokens ?? u.output_tokens) || 0);
    if (io) return io;
  }
  const g = data?.usageMetadata;
  if (g) return Number(g.totalTokenCount) || ((Number(g.promptTokenCount) || 0) + (Number(g.candidatesTokenCount) || 0) + (Number(g.thoughtsTokenCount) || 0));
  return 0;
}

/** What the provider says is left, from its rate-limit headers (null if none could be read). */
export function rateOf(headers) {
  const get = (k) => { try { const v = headers?.get?.(k); return v === null || v === undefined || v === "" ? null : Number(v); } catch { return null; } };
  const r = { reqLeft: get("x-ratelimit-remaining-requests"), reqLimit: get("x-ratelimit-limit-requests"), tokLeft: get("x-ratelimit-remaining-tokens"), tokLimit: get("x-ratelimit-limit-tokens") };
  return Object.values(r).some((v) => Number.isFinite(v)) ? r : null;
}

const pad = (n) => String(n).padStart(2, "0");
/** Today on this phone (your local day), e.g. "2026-10-16". */
export function dayKey(now = Date.now()) { const d = new Date(now); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** The usage record after one more reply. Requests counted before 1.22 (preset.uses) start the total. */
export function addUsage(preset, { tokens = 0, rate = null } = {}, now = Date.now()) {
  const u = { ...(preset.usage || { totReq: preset.uses || 0, totTok: 0, since: now }) };
  const day = dayKey(now);
  if (u.day !== day) { u.day = day; u.dayReq = 0; u.dayTok = 0; }
  u.dayReq = (u.dayReq || 0) + 1; u.dayTok = (u.dayTok || 0) + (Number(tokens) || 0);
  u.totReq = (u.totReq || 0) + 1; u.totTok = (u.totTok || 0) + (Number(tokens) || 0);
  if (rate) u.rate = { ...rate, at: now };
  return u;
}

/** What to show: today's numbers are 0 on a new day (until the first request). */
export function usageView(preset, now = Date.now()) {
  const u = preset.usage;
  if (!u) return { dayReq: 0, dayTok: 0, totReq: preset.uses || 0, totTok: 0, since: null, rate: null };
  const today = u.day === dayKey(now);
  return { dayReq: today ? u.dayReq || 0 : 0, dayTok: today ? u.dayTok || 0 : 0, totReq: u.totReq || 0, totTok: u.totTok || 0, since: u.since || null, rate: u.rate || null };
}

/** OpenRouter's own figures for a key (free-model requests today, credit left). → null if it can't be asked. */
export async function openRouterKey(p, fetchFn = fetch) {
  if (!/openrouter\.ai/i.test(p?.baseUrl || "") || !p.apiKey) return null;
  try {
    const res = await fetchFn("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${p.apiKey}` }, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const d = (await res.json())?.data;
    if (!d) return null;
    const f = d.free_model_daily_requests;
    return {
      freeUsed: Number.isFinite(f?.used) ? f.used : null, freeLimit: Number.isFinite(f?.limit) ? f.limit : null, freeLeft: Number.isFinite(f?.remaining) ? f.remaining : null,
      creditLeft: Number.isFinite(d.limit_remaining) ? d.limit_remaining : null, creditLimit: Number.isFinite(d.limit) ? d.limit : null, usedToday: Number.isFinite(d.usage_daily) ? d.usage_daily : null
    };
  } catch { return null; }
}
