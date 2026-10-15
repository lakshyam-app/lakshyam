/* Asking AI with a web search, for things that must come from trustworthy sources.
   Only two kinds of preset can search the web here, both with your own key:
   - Google Gemini: "Grounding with Google Search" (the sources come back as links);
   - Groq with an openai/gpt-oss model: its built-in browser search.
   Other presets can't search; the caller then says so and offers the AI's own knowledge instead.
   The rules for which sites to trust are in the prompt (prompts.js WEB_RULES), and every source that
   comes back is also checked here against a list of trusted sites, so you can see which to double-check. */
import * as presets from "./presets.js";
import { AiError, stripThinking } from "./client.js";

const TIMEOUT_MS = 120000;
const GEMINI = /generativelanguage\.googleapis\.com/i;
const GROQ = /api\.groq\.com/i;

export const canSearch = (p) => Boolean(p?.apiKey && p.model && p.baseUrl && ((GEMINI.test(p.baseUrl)) || (GROQ.test(p.baseUrl) && /gpt-oss/i.test(p.model))));

/** The preset to search with: the one in use first (🤖 at the top), else the first other one that can. */
export async function webPreset() {
  const [list, cfg] = await Promise.all([presets.getPresets(), presets.getConfig()]);
  return presets.tryOrder(list, { ...cfg, fallback: true }).find(canSearch) || null;
}

/* Sites a PSC aspirant can rely on. "fair": fine to cross-check with. Everything else: check yourself. */
const TRUSTED = [/\.gov\.in$/, /\.nic\.in$/, /^gov\.in$/, /\.ac\.in$/, /\.edu$/, /(^|\.)britannica\.com$/, /(^|\.)thehindu\.com$/, /(^|\.)indianexpress\.com$/,
  /(^|\.)prsindia\.org$/, /(^|\.)rbi\.org\.in$/, /(^|\.)sebi\.gov\.in$/, /(^|\.)un\.org$/, /(^|\.)who\.int$/, /(^|\.)unesco\.org$/, /(^|\.)ncert\.nic\.in$/, /(^|\.)keralapsc\.gov\.in$/];
const FAIR = [/(^|\.)wikipedia\.org$/, /(^|\.)ncert\.org\.in$/, /(^|\.)pib\.gov\.in$/];
export function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return String(url || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0]; }
}
export function trustOf(domain) {
  const d = String(domain || "").toLowerCase().replace(/^www\./, "");
  if (TRUSTED.some((re) => re.test(d))) return "trusted";
  if (FAIR.some((re) => re.test(d))) return "fair";
  return "check";
}

/** Sources listed by the AI at the end ("SOURCES:" then "- [n] title — url"). The text without that list. */
export function splitSources(text) {
  const s = String(text || "");
  const at = s.search(/^\s*\**SOURCES:?\**\s*$/im);
  const body = at >= 0 ? s.slice(0, at).trim() : s.trim();
  const list = [];
  if (at >= 0) {
    s.slice(at).split("\n").slice(1).forEach((line) => {
      const m = /^\s*[-•*]?\s*\[?(\d+)?\]?\s*(.*?)\s*(?:[—–-]+\s*)?(https?:\/\/\S+)\s*$/.exec(line);
      if (m) list.push({ n: m[1] ? Number(m[1]) : list.length + 1, title: m[2].replace(/[—–-]\s*$/, "").trim(), url: m[3].replace(/[).,]+$/, "") });
    });
  }
  return { body, sources: list };
}

const withTrust = (list) => list.map((x) => { const domain = x.domain || domainOf(x.url); return { ...x, domain, trust: trustOf(domain) }; });

async function post(url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (e) { throw new AiError(e.name === "AbortError" ? "timeout" : "network"); } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new AiError(String(typeof m === "string" ? m : JSON.stringify(m)).slice(0, 240), { status: res.status, limit: res.status === 429 });
  }
  return data;
}

async function geminiSearch(p, system, user, maxTokens) {
  const data = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`,
    { "content-type": "application/json", "x-goog-api-key": p.apiKey },
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: maxTokens } });
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((x) => x.text || "").join("");
  const meta = cand?.groundingMetadata || {};
  // Google gives each page as a link through Google plus the site's name (title).
  const found = (meta.groundingChunks || []).map((c, i) => c.web && { n: i + 1, url: c.web.uri, title: c.web.title || "", domain: domainOf(c.web.title?.includes(".") ? `https://${c.web.title}` : c.web.uri) }).filter(Boolean);
  return { text, found, queries: meta.webSearchQueries || [] };
}

async function groqSearch(p, system, user, maxTokens) {
  const base = String(p.baseUrl).replace(/\/+$/, "");
  const data = await post(`${base}/chat/completions`, { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` }, {
    model: p.model, max_completion_tokens: maxTokens, reasoning_effort: "low",
    messages: [{ role: "system", content: system }, { role: "user", content: `${user}\n\nWrite your final answer after a line '=== ANSWER ===' (nothing from the search pages before it is shown).` }],
    tools: [{ type: "browser_search" }], tool_choice: "required"
  });
  let text = String(data?.choices?.[0]?.message?.content || "");
  const at = text.lastIndexOf("=== ANSWER ===");
  if (at >= 0) text = text.slice(at + "=== ANSWER ===".length);
  return { text: text.replace(/【[^】]*】/g, ""), found: [], queries: [] };
}

/**
 * Asks with a web search. → { text, sources: [{ n, url, title, domain, trust }], queries, preset, by }
 * Throws { noWeb: true } when no preset can search. Sources: from Google when it gives them, else the AI's own list.
 */
export async function askWeb(system, user, maxTokens = 3000) {
  const p = await webPreset();
  if (!p) throw new AiError("no-web", { noWeb: true });
  const r = GEMINI.test(p.baseUrl) ? await geminiSearch(p, system, user, maxTokens) : await groqSearch(p, system, user, maxTokens);
  const clean = stripThinking(r.text);
  if (!clean) throw new AiError("empty");
  await presets.updatePreset(p.id, { uses: (p.uses || 0) + 1, lastUsedAt: Date.now() });
  const { body, sources } = splitSources(clean);
  // With Google's own list of the pages it searched, the AI's numbered citations would not match it: they are dropped.
  const text = r.found.length ? body.replace(/\s?\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "") : body;
  return { text, sources: withTrust(r.found.length ? r.found : sources), listed: withTrust(sources), queries: r.queries, preset: p, by: p.model || p.name };
}
