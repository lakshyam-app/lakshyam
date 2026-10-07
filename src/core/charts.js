/* Small inline-SVG charts. Colour never carries meaning alone: every bar has its
   number beside it, and the marks bar has a legend.
   Colours come from CSS tokens (--c-*) checked for colour-blind separation. */
import { html, raw } from "./dom.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Accuracy band used everywhere: good ≥ 70 %, fair 40–69 %, weak < 40 %. */
export const band = (pct) => (pct === null || pct === undefined ? "none" : pct >= 0.7 ? "good" : pct >= 0.4 ? "fair" : "weak");

/** A thin horizontal bar with its percentage text (text is the value; colour is the band). */
export function accBar(pct, { muted = false } = {}) {
  const w = pct === null ? 0 : Math.max(2, Math.round(pct * 100));
  return html`<span class="accbar ${muted ? "muted" : ""} b-${band(pct)}" aria-hidden="true"><span style="width:${w}%"></span></span>`;
}

/**
 * Sparkline of values 0–1 (oldest first). Each point has a <title> for screen readers
 * and long-press. The last point is marked.
 */
export function sparkline(points, { width = 280, height = 56, label = "" } = {}) {
  if (points.length < 2) return "";
  const pad = 6;
  const x = (i) => pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v) => pad + (1 - v) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const dots = points.map((p, i) => `<circle class="spark-hit" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="9"><title>${esc(p.title || "")}</title></circle>`).join("");
  return raw(`<svg class="spark" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">
    <line class="spark-mid" x1="${pad}" x2="${width - pad}" y1="${y(0.5)}" y2="${y(0.5)}"/>
    <path class="spark-line" d="${d}" vector-effect="non-scaling-stroke"/>
    <circle class="spark-end" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4"/>
    ${dots}
  </svg>`);
}

/**
 * Where marks go, per 100 questions: questions right / wrong / left.
 * parts: [{ key, share 0–100, label }] — drawn left to right with 2px gaps.
 */
export function marksBar(parts, label) {
  const shown = parts.filter((p) => p.share > 0);
  return html`<div class="marksbar" role="img" aria-label="${label}">${shown.map((p) => html`<span class="mb-${p.key}" style="flex:${p.share} 0 0" title="${p.label}"></span>`)}</div>
    <ul class="legend">${parts.map((p) => html`<li><span class="swatch mb-${p.key}"></span>${p.label}</li>`)}</ul>`;
}
