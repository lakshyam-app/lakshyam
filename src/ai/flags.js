/* 🚩 Flags: you mark something an AI made as wrong, and the app counts the flags for each AI model
   (and the preset it came from), so you can see which AI makes more mistakes.
   Kept in the "aiFlags" setting as a list (it goes into your backups; no keys in it):
   { ref, by, presetId, preset, kind, at }
   ref: what was flagged (e.g. "expl:<question id>:<time>"), so flagging the same thing twice is one flag
   and tapping again takes it back. by: the model's label as shown ("gemma-4-31b-it"). */
import * as store from "../data/store.js";
import * as presets from "./presets.js";

const KEY = "aiFlags";
const MAX = 3000; // oldest flags drop off after this (a few hundred KB at most)

export const flagList = () => { const v = store.setting(KEY); return Array.isArray(v?.list) ? v.list : []; };
export const isFlagged = (ref) => Boolean(ref) && flagList().some((f) => f.ref === ref);

async function save(list) { await store.quietly(() => store.setSetting(KEY, { list: list.slice(-MAX) })); }

/** The preset a model label most likely came from: the one using that model (or named so). */
export function presetFor(by, list) {
  const b = String(by || "").trim().toLowerCase();
  if (!b) return null;
  return list.find((p) => String(p.model || "").toLowerCase() === b) || list.find((p) => String(p.name || "").toLowerCase() === b) || null;
}

/** Flags it, or takes the flag back if it was flagged. → true when it is flagged now. */
export async function toggleFlag({ ref, by, kind = "", presetId = "" }) {
  if (!ref) return false;
  const list = flagList();
  if (list.some((f) => f.ref === ref)) { await save(list.filter((f) => f.ref !== ref)); return false; }
  const all = await presets.getPresets();
  const p = (presetId && all.find((x) => x.id === presetId)) || presetFor(by, all);
  await save([...list, { ref, by: String(by || p?.model || "").slice(0, 120), presetId: p?.id || "", preset: p?.name || "", kind: String(kind).slice(0, 30), at: Date.now() }]);
  return true;
}

/** Flags counted per AI model, most first: [{ by, n, kinds: { kind: n }, last }]. */
export function flagCounts(list = flagList()) {
  const m = new Map();
  for (const f of list) {
    const k = f.by || f.preset || "?";
    const e = m.get(k) || { by: k, n: 0, kinds: {}, last: 0 };
    e.n++; if (f.kind) e.kinds[f.kind] = (e.kinds[f.kind] || 0) + 1; e.last = Math.max(e.last, f.at || 0);
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last);
}

/** Flags of one preset: those made with it, or (older ones without a preset) with its model. */
export function presetFlags(p, list = flagList()) {
  const model = String(p.model || "").toLowerCase();
  return list.filter((f) => (f.presetId ? f.presetId === p.id : model && String(f.by).toLowerCase() === model)).length;
}

export async function clearFlags() { const prev = flagList(); await save([]); return prev; }
export async function restoreFlags(list) { await save(list); }
