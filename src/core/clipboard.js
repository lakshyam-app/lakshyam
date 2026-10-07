/* Copy text to the clipboard (with a fallback for older WebViews). */
import { toast } from "./toast.js";
import { t } from "./i18n.js";

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("common.copied"));
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    toast(ok ? t("common.copied") : t("common.copyFailed"));
  }
}
