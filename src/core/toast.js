/* One toast at a time, with an optional action button. */
import { html } from "./dom.js";

let timer = null;

export function toast(message, { actionLabel, onAction, duration = 3200 } = {}) {
  const root = document.getElementById("toastRoot");
  clearTimeout(timer);
  root.innerHTML = html`<div class="toast" role="status">
    <span>${message}</span>
    ${actionLabel ? html`<button type="button" class="toast-action">${actionLabel}</button>` : ""}
  </div>`;
  const button = root.querySelector(".toast-action");
  if (button) {
    button.addEventListener("click", () => {
      root.replaceChildren();
      onAction?.();
    });
  }
  if (duration > 0) timer = setTimeout(() => root.replaceChildren(), duration);
}
