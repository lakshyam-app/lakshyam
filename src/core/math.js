/* Maths rendering with KaTeX, stored inside the app (works offline).
   Loaded only when a screen actually contains $…$. */

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`load-failed:${src}`));
    document.head.appendChild(s);
  });
}

function loadKatex() {
  if (window.renderMathInElement) return Promise.resolve();
  if (!loading) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/katex/katex.min.css";
    document.head.appendChild(css);
    loading = loadScript("vendor/katex/katex.min.js")
      .then(() => loadScript("vendor/katex/contrib/auto-render.min.js"))
      .catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/** Typesets $…$ and $$…$$ inside container. Plain text stays readable if this fails. */
export async function typesetMath(container) {
  if (!container || !container.textContent.includes("$")) return;
  try {
    await loadKatex();
    window.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ],
      throwOnError: false
    });
  } catch {
    /* keep the raw text */
  }
}
