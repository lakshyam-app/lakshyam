/* Shows a list of question cards in one of two layouts:
   "scroll" – all cards, 30 at a time with "Show more"
   "single" – one card at a time, a number bar to jump, fixed ‹ Prev / Next › bar, swipe left/right.
   Used by Library listings, test results and the test itself. */
import { html } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { typesetMath } from "../../core/math.js";

const PAGE = 30;
const placeBy = new Map(); // key → shown count (scroll) or index (single), kept across redraws

/**
 * opts: { key, items: [{ id }], card(item, i) → html, layout, marks(item) → "answered"|"right"|…|"" ,
 *         onIndex(i) (single layout: called when the visible question changes) }
 * Returns { refresh(id), remove(id), index() }.
 */
export function mountCards(host, { key, items, card, layout = "scroll", marks = () => "", onIndex = () => {}, empty = "" }) {
  if (!items.length) {
    host.innerHTML = html`<p class="hint pad">${empty || t("library.noQuestions")}</p>`;
    return { refresh() {}, remove() {}, index: () => 0, go() {} };
  }
  // Each layout remembers its own place (a scroll count is not a question number).
  return layout === "single" ? single(host, { key: `${key}|single`, items, card, marks, onIndex }) : scroll(host, { key: `${key}|scroll`, items, card });
}

export const forgetPlace = (key) => { placeBy.delete(`${key}|single`); placeBy.delete(`${key}|scroll`); };
/** layout: "single" (value = question index) or "scroll" (value = how many to show). */
export const setPlace = (key, value, layout = "scroll") => placeBy.set(`${key}|${layout}`, value);

function render(markup) {
  const holder = document.createElement("div");
  holder.innerHTML = String(markup);
  typesetMath(holder);
  return holder;
}

function scroll(host, { key, items, card }) {
  host.innerHTML = html`<div class="qlist"></div><button type="button" class="btn btn-quiet more" hidden></button>`;
  const listEl = host.querySelector(".qlist");
  const more = host.querySelector(".more");
  let shown = 0;
  const drawMore = (n = PAGE) => {
    const next = items.slice(shown, shown + n);
    listEl.append(...render(html`${next.map((it, j) => card(it, shown + j))}`).children);
    shown += next.length;
    placeBy.set(key, shown);
    const left = items.length - shown;
    more.hidden = left <= 0;
    more.textContent = t("common.showMore", { n: Math.min(PAGE, left) });
  };
  more.addEventListener("click", () => drawMore());
  drawMore(Math.max(PAGE, placeBy.get(key) || 0));
  const find = (id) => listEl.querySelector(`[data-qid="${CSS.escape(id)}"]`);
  return {
    refresh(id) {
      const el = find(id); if (!el) return;
      const i = items.findIndex((x) => x.id === id);
      const fresh = render(card(items[i], i)).firstElementChild;
      if (el.querySelector("details[open]")) fresh.querySelector("details")?.setAttribute("open", "");
      el.replaceWith(fresh);
    },
    remove(id) { find(id)?.remove(); },
    index: () => 0,
    go() {}
  };
}

function single(host, { key, items, card, marks, onIndex }) {
  let index = Math.min(Math.max(0, placeBy.get(key) || 0), items.length - 1);
  host.innerHTML = html`<div class="jumpbar" role="tablist"></div><div class="single-card"></div>
    <nav class="pager-bar"><button type="button" class="btn btn-quiet" data-pg="prev">‹ ${t("pager.prev")}</button>
      <span class="pager-pos"></span>
      <button type="button" class="btn btn-quiet" data-pg="next">${t("pager.next")} ›</button></nav>`;
  const bar = host.querySelector(".jumpbar");
  const slot = host.querySelector(".single-card");
  const pos = host.querySelector(".pager-pos");
  const prev = host.querySelector('[data-pg="prev"]');
  const next = host.querySelector('[data-pg="next"]');

  const drawBar = () => {
    bar.innerHTML = html`${items.map((it, i) => html`<button type="button" class="jump ${i === index ? "current" : ""} ${marks(it)}" data-jump="${i}" aria-label="${t("pager.goTo", { n: i + 1 })}">${i + 1}</button>`)}`;
    bar.querySelector(".current")?.scrollIntoView({ inline: "center", block: "nearest" });
  };
  const draw = () => {
    slot.replaceChildren(...render(card(items[index], index)).children);
    pos.textContent = t("pager.pos", { n: index + 1, of: items.length });
    prev.disabled = index === 0;
    next.disabled = index === items.length - 1;
    placeBy.set(key, index);
  };
  const goTo = (i) => {
    if (i < 0 || i >= items.length || i === index) return;
    index = i;
    draw(); drawBar();
    onIndex(index);
    window.scrollTo(0, 0);
  };
  drawBar(); draw();
  onIndex(index);

  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-jump]"); if (b) goTo(Number(b.dataset.jump)); });
  prev.addEventListener("click", () => goTo(index - 1));
  next.addEventListener("click", () => goTo(index + 1));
  let sx = null; let sy = null;
  slot.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  slot.addEventListener("touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  return {
    refresh(id) {
      if (items[index]?.id === id) draw();
      drawBar();
    },
    remove(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return;
      items.splice(i, 1);
      if (!items.length) { host.innerHTML = html`<p class="hint pad">${t("library.noQuestions")}</p>`; return; }
      index = Math.min(index, items.length - 1);
      draw(); drawBar();
    },
    index: () => index,
    go: goTo
  };
}
