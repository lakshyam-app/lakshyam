/* Syllabus map: every topic of the syllabus on one screen, grouped by subject, coloured
   by how well you do in it (past-paper tests), with the share of past-paper questions you
   have covered. Colour is never the only signal: each tile says its % (or "not yet"). */
import { html, onAction } from "../../core/dom.js";
import { t, formatNumber } from "../../core/i18n.js";
import { go } from "../../core/router.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { nameHtml, label as nameLabel } from "../../core/names.js";
import { band } from "../../core/charts.js";
import * as store from "../../data/store.js";
import { answerRecords, pickByBasis, accuracyBy, LOW_N } from "../../domain/stats.js";
import { prefs, finishedTests } from "./data.js";
import { header, backHandler } from "../library/library.js";
import { quickTest } from "../test/start-sheet.js";

const FILTERS = ["all", "weak", "fair", "good", "none"];
let filter = "all";

/** Per topic: questions in papers, accuracy (first try by default), answers, studied count. */
export function mapData(syllabus) {
  const p = prefs();
  const tests = finishedTests(syllabus.id).filter((a) => a.kind !== "ai" && a.submittedAt >= p.resetAt);
  const acc = accuracyBy(pickByBasis(answerRecords(tests), p.basis), (r) => r.topicId);
  const subjects = new Map();
  store.topicsWithCounts(syllabus.id).forEach(({ topic, count, subject }) => {
    if (!subject) return;
    const a = acc[topic.id];
    const pct = a && a.total ? a.correct / a.total : null;
    const studied = store.topicStateFor(syllabus.id, topic.id)?.studiedCount || 0;
    const tile = { topic, count, pct, n: a?.total || 0, few: Boolean(a && a.total < LOW_N), studied, band: band(pct) };
    if (!subjects.has(subject.id)) subjects.set(subject.id, { subject, tiles: [] });
    subjects.get(subject.id).tiles.push(tile);
  });
  const groups = [...subjects.values()]
    .map((g) => ({ ...g, tiles: g.tiles.sort((x, y) => y.count - x.count || x.topic.name.localeCompare(y.topic.name)), total: g.tiles.reduce((s, x) => s + x.count, 0) }))
    .sort((a, b) => (a.subject.order ?? 0) - (b.subject.order ?? 0) || b.total - a.total);
  const tiles = groups.flatMap((g) => g.tiles);
  const qTotal = tiles.reduce((s, x) => s + x.count, 0);
  const qCovered = tiles.filter((x) => x.n > 0).reduce((s, x) => s + x.count, 0);
  const bands = { good: 0, fair: 0, weak: 0, none: 0 };
  tiles.forEach((x) => { bands[x.band]++; });
  return { groups, tiles, bands, qTotal, qCovered, basis: p.basis };
}

function tileHtml(x) {
  const pct = x.pct === null ? null : Math.round(x.pct * 100);
  return html`<button type="button" class="map-tile mt-${x.band} ${x.few ? "few" : ""}" data-action="tile" data-id="${x.topic.id}"
      aria-label="${nameLabel(x.topic)}: ${pct === null ? t("map.notYet") : `${pct}%`}, ${t("common.questions", { n: x.count })}">
    <span class="mt-name">${nameHtml(x.topic)}</span>
    <span class="mt-foot"><b>${pct === null ? t("map.notYet") : `${pct}%`}</b><span>${x.studied ? `📖${x.studied} · ` : ""}${formatNumber(x.count)} Q</span></span>
  </button>`;
}

function tileSheet(syllabus, x) {
  const pct = x.pct === null ? null : Math.round(x.pct * 100);
  openSheet(html`<h2>${nameHtml(x.topic)}</h2>
    <p class="hint">${nameLabel(store.subject(x.topic.subjectId))}</p>
    <p>${pct === null ? t("map.sheetNone", { q: x.count }) : t("map.sheetLine", { pct, n: x.n, q: x.count })}${x.few ? ` ${t("map.fewNote")}` : ""}</p>
    ${x.studied ? html`<p class="hint">${t("library.studied", { n: x.studied })}</p>` : ""}
    <div class="sheet-actions">
      <button type="button" class="btn btn-quiet" data-action="open">${t("next.open")}</button>
      <button type="button" class="btn" data-action="quick">▶ ${t("next.quick")}</button>
    </div>
    ${x.n ? html`<button type="button" class="link" data-action="stats">${t("map.stats")} ›</button>` : ""}`, {
    open: () => go("topic", { id: x.topic.id }),
    quick: () => { closeSheet(); quickTest(x.topic.id); },
    stats: () => go("stats-topic", { id: x.topic.id })
  }, { label: nameLabel(x.topic) });
}

export const mapScreen = {
  id: "syllabus-map",
  parent: "progress",
  render(container) {
    const syllabus = store.currentSyllabus();
    if (!syllabus) return go("progress");
    const d = mapData(syllabus);
    const share = d.qTotal ? Math.round((d.qCovered / d.qTotal) * 100) : 0;
    const total = d.tiles.length || 1;
    const shown = (x) => filter === "all" || x.band === filter;
    container.innerHTML = html`<section class="map-page">
      ${header({ backTo: "progress", backParams: {}, backLabel: t("tabs.progress"), title: `🗺 ${t("map.title")}`, sub: syllabus.name })}
      <div class="map-summary">
        <p class="map-big"><b>${share}%</b> ${t("map.covered")}</p>
        <p class="hint">${t("map.coveredSub", { n: d.tiles.length - d.bands.none, of: d.tiles.length })}</p>
        <div class="map-bar" role="img" aria-label="${["good", "fair", "weak", "none"].map((b) => `${t(`map.band.${b}`)} ${d.bands[b]}`).join(", ")}">
          ${["good", "fair", "weak", "none"].map((b) => (d.bands[b] ? html`<span class="mt-${b}" style="flex:${d.bands[b] / total} 0 0"></span>` : ""))}
        </div>
        <div class="chip-wrap map-filters" role="group">${FILTERS.map((f) => html`<button type="button" class="pill ${filter === f ? "on" : ""} ${f !== "all" ? `pf-${f}` : ""}" data-action="filter" data-v="${f}" aria-pressed="${String(filter === f)}">
          ${f === "all" ? t("map.all") : html`<span class="swatch mt-${f}"></span>${t(`map.band.${f}`)}`} <span class="count">${f === "all" ? d.tiles.length : d.bands[f]}</span></button>`)}</div>
        <p class="hint">${t("map.legend", { basis: t(`stats.basis.${d.basis}`) })}</p>
      </div>
      ${d.groups.map((g) => {
        const tiles = g.tiles.filter(shown);
        if (!tiles.length) return "";
        const done = g.tiles.filter((x) => x.n > 0).length;
        return html`<section class="map-group">
          <h2 class="map-subject">${nameHtml(g.subject)} <span class="hint">${t("map.groupSub", { n: done, of: g.tiles.length })}</span></h2>
          <div class="map-grid">${tiles.map(tileHtml)}</div>
        </section>`;
      })}
      ${d.tiles.some(shown) ? "" : html`<p class="hint pad">${t("map.noneHere")}</p>`}
    </section>`;
    onAction(container, {
      ...backHandler,
      filter: (el) => { filter = el.dataset.v; store.touch(); },
      tile: (el) => { const x = d.tiles.find((y) => y.topic.id === el.dataset.id); if (x) tileSheet(syllabus, x); }
    });
  }
};
