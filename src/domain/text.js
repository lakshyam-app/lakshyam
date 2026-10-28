/* Question/explanation text formatting, same rules as the old app:
   **highlight**, *italic*, line breaks kept (CSS pre-wrap), $maths$ left for KaTeX.
   Everything is escaped first, so imported text can't inject markup. */
import { escapeHtml, raw } from "../core/dom.js";

/* Maths ($…$, $$…$$, \[…\], \(…\)) is set aside before formatting, so line breaks, bullets or
   **bold** inside a formula can't split it, then put back whole (on one line) for KaTeX. */
const MATH = /\$\$[\s\S]{1,2000}?\$\$|\\\[[\s\S]{1,2000}?\\\]|\\\([\s\S]{1,1000}?\\\)|\$(?![\s$])[^$]{1,800}?(?<!\s)\$/g;
const M_OPEN = "\uE000"; const M_CLOSE = "\uE001";
export function protectMath(text) {
  const keep = [];
  const s = String(text ?? "").replace(MATH, (m) => { keep.push(m); return `${M_OPEN}${keep.length - 1}${M_CLOSE}`; });
  return { s, keep };
}
function restoreMath(html, keep) {
  if (!keep.length) return html;
  return html.replace(/\uE000(\d+)\uE001/g, (_, i) => `<span class="math">${escapeHtml(keep[Number(i)].replace(/\s*\n\s*/g, " "))}</span>`);
}

export function richText(value) {
  const { s: src, keep } = protectMath(value);
  let s = escapeHtml(src);
  s = s.replace(/\*\*(.+?)\*\*/g, '<mark class="hl">$1</mark>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  return raw(restoreMath(s, keep));
}

export const letterFor = (i) => String.fromCharCode(65 + i);

/** A short fingerprint of a text: tells whether a saved explanation is still the one the AI wrote. */
export function textSig(value) {
  const s = String(value ?? "").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
}

/* AI answers, laid out for reading on a phone. Everything is escaped first.
   - "## 1. Title", "1. **Title**" or a short "1. Title" line → a section (collapsible card)
   - "- point" (or "• point", "* point") → a bullet; indented → a sub-bullet
   - a bullet that starts "Key phrase: rest" → the key phrase in bold
   - **bold**, *italic*; other lines → paragraphs; $maths$ left for KaTeX */
const inline = (s) => s
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
const leadBold = (s) => {
  if (/^<strong>/.test(s)) return s;
  const m = /^([^:<>]{2,70}?):\s+(\S.*)$/.exec(s);
  return m ? `<strong>${m[1]}</strong>: ${m[2]}` : s;
};

export function aiText(value, { sections = true } = {}) {
  const prot = protectMath(String(value ?? "").replace(/\r/g, ""));
  const keep = prot.keep;
  // 1.26.6: Markdown escapes from a copied answer ("1\\. Third Mysore War", "\\*") show as the plain character.
  const src = prot.s.replace(/\\([.*_#+\-!|`~>()[\]])/g, "$1");
  const lines = escapeHtml(src).split("\n");
  const out = []; // { type: "h" | "li" | "sub" | "p", html, n }
  // With "## " headings present, numbered lines are steps, never headings.
  const hashHeads = !sections || lines.some((l) => /^\s*#{1,4}\s/.test(l));
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const t = line.trim();
    if (!t) { out.push({ type: "gap" }); continue; }
    // 1.26.5: a Markdown table ("| a | b |" rows with a "|---|---|" line under the first) and a "---" rule.
    if (/^\|.*\|$/.test(t) && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test((lines[li + 1] || "").trim())) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const head = cells(t); const body = [];
      li += 2;
      while (li < lines.length && /^\|.*\|$/.test(lines[li].trim())) body.push(cells(lines[li++]));
      li--;
      out.push({ type: "table", html: `<div class="ai-table-wrap"><table class="ai-table"><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` });
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push({ type: "hr" }); continue; }
    let m = /^#{1,4}\s+(?:(\d+)[.)]\s*)?(.+)$/.exec(t);
    if (m) { out.push({ type: "h", n: m[1] || "", html: inline(m[2].replace(/^\*\*(.+)\*\*:?$/, "$1").replace(/:$/, "")) }); continue; }
    m = /^(\d+)[.)]\s+(.+)$/.exec(t);
    if (m) {
      const bare = m[2].replace(/\*\*/g, "").trim();
      const isHead = !hashHeads && (/^\*\*[^*]+\*\*:?$/.test(m[2].trim()) || (bare.length <= 48 && !/[.?!:]$/.test(bare)));
      if (isHead) { out.push({ type: "h", n: m[1], html: inline(bare.replace(/:$/, "")) }); continue; }
      out.push({ type: "li", html: leadBold(inline(m[2])), num: m[1] }); continue;
    }
    m = /^(\s*)[-•*]\s+(.+)$/.exec(line);
    if (m) { out.push({ type: m[1].length >= 2 ? "sub" : "li", html: leadBold(inline(m[2].trim())) }); continue; }
    out.push({ type: "p", html: inline(t) });
  }
  // Build: sections (when there are 2+ headings), lists (numbered steps → <ol>), paragraphs.
  const heads = out.filter((x) => x.type === "h").length;
  let html = ""; let list = null; let item = null; let sub = []; let inSec = false;
  const flushItem = () => { if (item !== null) { html += `<li>${item}${sub.length ? `<ul class="ai-sub">${sub.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}</li>`; item = null; sub = []; } };
  const closeList = () => { flushItem(); if (list) { html += `</${list}>`; list = null; } };
  for (const x of out) {
    if (x.type === "h") {
      closeList();
      if (sections && heads >= 2) { if (inSec) html += "</div></details>"; html += `<details class="ai-sec" open><summary>${x.n ? `<span class="ai-n">${x.n}</span>` : ""}<span>${x.html}</span></summary><div class="ai-sec-body">`; inSec = true; }
      else html += `<h4 class="ai-h">${x.n ? `${x.n}. ` : ""}${x.html}</h4>`;
    } else if (x.type === "sub" && item !== null) {
      sub.push(x.html);
    } else if (x.type === "li" || x.type === "sub") {
      const kind = x.num ? "ol" : "ul";
      if (list !== kind) { closeList(); html += `<${kind} class="ai-list">`; list = kind; }
      flushItem(); item = x.html;
    } else if (x.type === "p") { closeList(); html += `<p>${x.html}</p>`; }
    else if (x.type === "table") { closeList(); html += x.html; }
    else if (x.type === "hr") { closeList(); html += "<hr class=\"ai-hr\">"; }
  }
  closeList();
  if (inSec) html += "</div></details>";
  return raw(restoreMath(html, keep));
}

/** Text that may have bullets or headings (an explanation, your own note): shown as lists and
    headings when it has them, otherwise exactly as typed. No collapsible cards. */
export function smartText(text) {
  const s = String(text ?? "");
  return /^\s*([-•*]|#{1,4}|\d+[.)])\s+\S|^\s*\|.*\|\s*$/m.test(s) ? aiText(s, { sections: false }) : richText(s);
}

/** A note's name: its first heading ("## Warren Hastings…"), else its first line, short. */
export function titleFromText(text, max = 80) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const head = lines.find((l) => /^#{1,4}\s+\S/.test(l));
  const pick = head || lines[0] || "";
  return pick.replace(/^#{1,4}\s+/, "").replace(/^[-•*]\s+/, "").replace(/\*\*|__/g, "").replace(/^\*(.+)\*$/, "$1").trim().slice(0, max);
}
/** The text to show under a note's name: without its first line when that line is the name (it would show twice). */
export function bodyWithoutTitle(text, title) {
  const s = String(text ?? "").replace(/\r/g, "");
  const m = /^\s*(#{1,4}\s+)?([^\n]*)\n?/.exec(s);
  if (!m || !title) return s;
  const first = m[2].replace(/\*\*|__/g, "").trim();
  return first === String(title).trim() ? s.slice(m[0].length).replace(/^\s*\n/, "") : s;
}

/** A note: AI write-ups saved into it ("## " parts, or marked 🤖) get the full AI layout. */
export const noteText = (text) => (/^\s*#{1,4}\s/m.test(String(text || "")) ? aiText(text) : smartText(text));

/** Plain one-line preview of formatted text (no ##, ** or bullets). */
export const plainPreview = (text, max = 140) => String(text ?? "").split("\n").map((l) => l.replace(/^\s*(#{1,4}|[-•*]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim()).filter(Boolean).join(" · ").slice(0, max);
