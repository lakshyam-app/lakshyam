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
