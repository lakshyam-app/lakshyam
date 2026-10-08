/* Question/explanation text formatting, same rules as the old app:
   **highlight**, *italic*, line breaks kept (CSS pre-wrap), $maths$ left for KaTeX.
   Everything is escaped first, so imported text can't inject markup. */
import { escapeHtml, raw } from "../core/dom.js";

export function richText(value) {
  let s = escapeHtml(value);
  s = s.replace(/\*\*(.+?)\*\*/g, '<mark class="hl">$1</mark>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  return raw(s);
}

export const letterFor = (i) => String.fromCharCode(65 + i);

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

export function aiText(value) {
  const lines = escapeHtml(String(value ?? "").replace(/\r/g, "")).split("\n");
  const out = []; // { type: "h" | "li" | "sub" | "p", html, n }
  // With "## " headings present, numbered lines are steps, never headings.
  const hashHeads = lines.some((l) => /^\s*#{1,4}\s/.test(l));
  for (const line of lines) {
    const t = line.trim();
    if (!t) { out.push({ type: "gap" }); continue; }
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
      if (heads >= 2) { if (inSec) html += "</div></details>"; html += `<details class="ai-sec" open><summary>${x.n ? `<span class="ai-n">${x.n}</span>` : ""}<span>${x.html}</span></summary><div class="ai-sec-body">`; inSec = true; }
      else html += `<h4 class="ai-h">${x.n ? `${x.n}. ` : ""}${x.html}</h4>`;
    } else if (x.type === "sub" && item !== null) {
      sub.push(x.html);
    } else if (x.type === "li" || x.type === "sub") {
      const kind = x.num ? "ol" : "ul";
      if (list !== kind) { closeList(); html += `<${kind} class="ai-list">`; list = kind; }
      flushItem(); item = x.html;
    } else if (x.type === "p") { closeList(); html += `<p>${x.html}</p>`; }
  }
  closeList();
  if (inSec) html += "</div></details>";
  return raw(html);
}

/** A note: AI write-ups saved into it ("## " parts) get the AI layout; your own writing stays as typed. */
export const noteText = (text) => (/^\s*#{1,4}\s/m.test(String(text || "")) ? aiText(text) : richText(text));
