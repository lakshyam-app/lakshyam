/* Registers the service worker and offers a "Refresh" when a new version
   has downloaded, instead of switching versions behind the user's back. */
import { toast } from "./toast.js";
import { t } from "./i18n.js";

let registration = null;

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  try {
    // updateViaCache "none": checking for an update always asks the server, never the browser cache.
    registration = await navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" });
  } catch {
    return; // app still works online without it
  }

  if (registration.waiting && navigator.serviceWorker.controller) offerRefresh(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const incoming = registration.installing;
    incoming?.addEventListener("statechange", () => {
      if (incoming.state === "installed" && navigator.serviceWorker.controller) offerRefresh(incoming);
    });
  });

  // Reload only when a NEW version takes over. On the very first visit the worker
  // also "takes control", and reloading then would interrupt whatever the user is doing.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

function offerRefresh(worker) {
  toast(t("update.ready"), {
    actionLabel: t("update.refresh"),
    onAction: () => worker.postMessage("SKIP_WAITING"),
    duration: 0
  });
}

/** Returns "offline" | "updating" | "ready" | "latest". "updating" and "ready" show their own message. */
export async function checkForUpdate() {
  if (!navigator.onLine) return "offline";
  if (!registration) return "latest";
  await registration.update();
  // Already downloaded: offer Refresh (again). Still downloading: say so now; the Refresh
  // offer replaces this message as soon as the download finishes.
  if (registration.waiting) { offerRefresh(registration.waiting); return "ready"; }
  if (registration.installing) { toast(t("settings.downloading"), { duration: 0 }); return "updating"; }
  return "latest";
}
