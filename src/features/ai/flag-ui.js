/* 🚩 The flag button shown next to everything an AI made, and the "AI flags" sheet (Settings → AI).
   The button works anywhere (on a screen or in a sheet): one listener for the whole app. */
import { html } from "../../core/dom.js";
import { t, dateLocale } from "../../core/i18n.js";
import { openSheet, closeSheet } from "../../core/sheet.js";
import { confirmAction } from "../../core/dialogs.js";
import { toast } from "../../core/toast.js";
import * as flags from "../../ai/flags.js";

/** A fresh reference for an answer that is only shown (not saved anywhere yet). */
export const answerRef = (kind) => `${kind}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 🚩 button. ref: what is flagged; by: the model label shown; kind: what it is (explain, facts, analysis…). */
export function flagChip({ ref, by = "", kind = "", presetId = "" }) {
  if (!ref) return "";
  const on = flags.isFlagged(ref);
  return html`<button type="button" class="flag-chip${on ? " on" : ""}" data-ai-flag data-ref="${ref}" data-by="${by}" data-kind="${kind}" data-preset="${presetId}" aria-pressed="${String(on)}" title="${t("flag.hint")}">🚩 ${on ? t("flag.flagged") : t("flag.flag")}</button>`;
}

function paint(ref, on) {
  document.querySelectorAll("[data-ai-flag]").forEach((b) => {
    if (b.dataset.ref !== ref) return;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.textContent = `🚩 ${on ? t("flag.flagged") : t("flag.flag")}`;
  });
}

let busy = false;
if (typeof document !== "undefined") {
  document.addEventListener("click", async (e) => {
    const b = e.target.closest?.("[data-ai-flag]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    busy = true;
    try {
      const { ref, by, kind, preset } = b.dataset;
      const on = await flags.toggleFlag({ ref, by, kind, presetId: preset });
      paint(ref, on);
      const name = by || t("flag.thisAi");
      const n = flags.flagCounts().find((x) => x.by === (flags.flagList().find((f) => f.ref === ref)?.by || by))?.n || 0;
      toast(on ? t("flag.added", { name, n }) : t("flag.removed"));
    } finally { busy = false; }
  }, true);
}

const kindLabel = (k) => { const s = t(`flag.kind.${k}`); return s && !s.startsWith("flag.kind.") ? s : k; };

/** Settings → AI → 🚩 AI flags: which AI got the most flags, and what for. */
export function openFlags(back) {
  const counts = flags.flagCounts();
  const total = counts.reduce((s, x) => s + x.n, 0);
  openSheet(html`<h2>🚩 ${t("flag.title")}</h2>
    <p class="hint">${t("flag.about")}</p>
    ${counts.length ? html`<div class="menu">${counts.map((c, i) => html`<div class="flag-row">
        <span class="flag-rank">${i + 1}</span>
        <span class="row-main"><span class="row-title">🤖 ${c.by}</span>
          <span class="row-sub">${Object.entries(c.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${kindLabel(k)} ${n}`).join(" · ")}${c.last ? ` · ${t("flag.last", { date: new Date(c.last).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }) })}` : ""}</span></span>
        <span class="flag-n">🚩 ${c.n}</span></div>`)}</div>
      <p class="hint">${t("flag.total", { n: total })}</p>` : html`<p class="hint pad">${t("flag.none")}</p>`}
    <div class="sheet-actions">${counts.length ? html`<button type="button" class="btn btn-quiet push-left danger" data-action="clear">${t("flag.clear")}</button>` : ""}
      <button type="button" class="btn" data-action="close">${t("common.done")}</button></div>`, {
    close: () => (back ? back() : closeSheet()),
    clear: async () => {
      if (!(await confirmAction({ title: t("flag.clearTitle"), confirmLabel: t("common.clear"), danger: true }))) { openFlags(back); return; }
      const prev = await flags.clearFlags();
      toast(t("flag.cleared"), { actionLabel: t("common.undo"), duration: 8000, onAction: () => flags.restoreFlags(prev) });
      openFlags(back);
    }
  }, { label: t("flag.title") });
}
