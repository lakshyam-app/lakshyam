/* "How to use Lakshyam" — one source for the in-app demo and the PDF (tools/gen-guide.mjs).
   Each step: a small illustrated scene, a title, 3–4 short points, one tip, and (in the app)
   a "Try it" button that opens the real screen. Pure data + markup; no app state. */

export const GUIDE_LANGS = ["en", "ml"];

export const UI = {
  en: {
    title: "How to use Lakshyam", sub: "The best way to prepare, in 11 short steps", step: "Step {n} of {of}",
    prev: "Back", next: "Next", done: "Start studying", tryIt: "Try it", tip: "Tip",
    pdfView: "View as PDF", pdfDownload: "Download PDF", lang: "Language", close: "Close",
    footer: "Lakshyam · lakshyam-app.github.io/lakshyam"
  },
  ml: {
    title: "Lakshyam എങ്ങനെ ഉപയോഗിക്കാം", sub: "ഏറ്റവും നന്നായി പഠിക്കാൻ, 11 ചെറിയ ഘട്ടങ്ങൾ", step: "{of}-ൽ {n}-ാം ഘട്ടം",
    prev: "പിന്നോട്ട്", next: "അടുത്തത്", done: "പഠിക്കാൻ തുടങ്ങാം", tryIt: "ചെയ്തുനോക്കൂ", tip: "ടിപ്പ്",
    pdfView: "PDF ആയി കാണുക", pdfDownload: "PDF ഡൗൺലോഡ്", lang: "ഭാഷ", close: "അടയ്ക്കുക",
    footer: "Lakshyam · lakshyam-app.github.io/lakshyam"
  }
};

/* Scenes: tiny drawings of the app built from boxes and emoji (same in both languages,
   with a word or two in the chosen language). `l` = language. */
const chip = (text, cls = "") => `<span class="gs-chip ${cls}">${text}</span>`;
const card = (inner, cls = "") => `<div class="gs-card ${cls}">${inner}</div>`;

const SCENES = {
  cover: () => `<div class="gs-big">🎯</div><div class="gs-row">${chip("📅 92")}${chip("🔁 15")}${chip("🗺 35%")}${chip("😊")}</div>`,
  loop: (l) => {
    const w = l === "ml" ? ["പ്ലാൻ", "പരിശീലനം", "റിവ്യൂ", "വിലയിരുത്തൽ"] : ["Plan", "Practise", "Review", "Reflect"];
    return `<div class="gs-loop"><span class="gl gl1">🗓<b>${w[0]}</b></span><span class="gl gl2">✍️<b>${w[1]}</b></span><span class="gl gl3">🔁<b>${w[2]}</b></span><span class="gl gl4">😊<b>${w[3]}</b></span><span class="gl-ring"></span></div>`;
  },
  setup: () => `<div class="gs-grid">${["📄", "📅", "🗓", "☁", "🎨"].map((e, i) => card(`<span class="gs-n">${i + 1}</span><span class="gs-e">${e}</span>`, "sm")).join("")}</div>`,
  morning: (l) => card(`<span class="gs-k">${l === "ml" ? "ഇന്നത്തെ സെഷൻ" : "TODAY’S SESSION"}</span><b>25 ${l === "ml" ? "ചോദ്യങ്ങൾ" : "questions"} · 23 min</b><span>🔁 15 · 🎯 10</span><span class="gs-btn">▶</span>`, "accent"),
  study: (l) => `${card(`<span class="gs-k">${l === "ml" ? "ഇപ്പോൾ" : "NOW"} · 7:00–8:00</span><b>📚 ${l === "ml" ? "കേരള ചരിത്രം" : "Kerala History"}</b><span>☑ ☑ ☐</span>`)}${chip("📖 +1", "ok")}${chip("▶ Quick 10", "brand")}`,
  test: () => `<div class="gs-opts">${card("<i>A</i> Defence", "opt")}${card("<i>B</i> Commerce", "opt on")}${card("<i>C</i> <s>Home</s>", "opt off")}${card("<i>D</i> <s>Dalawa</s>", "opt off")}</div><div class="gs-row">${chip("🤔")}${chip("✕")}${chip("⏱ 18:40")}</div>`,
  after: (l) => `${card(`<span class="gs-x">✗</span><b>${l === "ml" ? "തെറ്റി" : "Wrong"}</b><span>🤖 ${l === "ml" ? "വിശദീകരണം" : "Explain"} · 🧠 ${l === "ml" ? "ഓർമ്മസൂത്രം" : "Trick"}</span>`)}<div class="gs-days">${[1, 3, 7, 21].map((d) => `<span>${d}<small>${l === "ml" ? "ദി" : "d"}</small></span>`).join("<i>→</i>")}</div>`,
  night: () => `<div class="gs-faces">😫 😕 😐 <b>🙂</b> 🤩</div><div class="gs-strip">${["g", "g", "y", "g", "r", "g", "g"].map((c) => `<span class="d-${c}"></span>`).join("")}</div>`,
  week: () => `<div class="gs-map">${["g", "g", "y", "n", "r", "g", "n", "y", "g", "n", "n", "g"].map((c) => `<span class="m-${c}"></span>`).join("")}</div><div class="gs-row">${chip("🗺")}${chip("🔎")}${chip("📝 Mock")}</div>`,
  final: (l) => `<div class="gs-count"><b>30</b><span>${l === "ml" ? "ദിവസം" : "days"}</span></div><div class="gs-row">${chip("📝 ×10")}${chip("🔁")}${chip("😴")}</div>`,
  rules: () => `<div class="gs-big">🏆</div><div class="gs-row">${chip("1")}${chip("2")}${chip("3")}${chip("4")}${chip("5")}</div>`
};

export const STEPS = [
  {
    id: "cover", tone: "brand", scene: "cover",
    title: { en: "Your exam, one calm day at a time", ml: "നിങ്ങളുടെ പരീക്ഷ, ഓരോ ദിവസവും ശാന്തമായി" },
    points: {
      en: ["Lakshyam plans your day, picks what to practise, and brings back what you forget.", "You only need about 2 minutes each morning and 3 minutes each night to steer it.", "Swipe through these steps once. Come back any time from Settings."],
      ml: ["Lakshyam നിങ്ങളുടെ ദിവസം പ്ലാൻ ചെയ്യും, എന്ത് പരിശീലിക്കണമെന്ന് തിരഞ്ഞെടുക്കും, മറന്നത് വീണ്ടും കൊണ്ടുവരും.", "രാവിലെ 2 മിനിറ്റും രാത്രി 3 മിനിറ്റും മതി ഇത് നയിക്കാൻ.", "ഈ ഘട്ടങ്ങൾ ഒരിക്കൽ നോക്കൂ. സെറ്റിങ്സിൽ നിന്ന് എപ്പോൾ വേണമെങ്കിലും തിരികെ വരാം."]
    },
    tip: { en: "Swipe left, or tap Next.", ml: "ഇടത്തോട്ട് സ്വൈപ്പ് ചെയ്യൂ, അല്ലെങ്കിൽ “അടുത്തത്” തൊടൂ." }
  },
  {
    id: "loop", tone: "gold", scene: "loop",
    title: { en: "The daily loop", ml: "ദിവസേനയുള്ള ചക്രം" },
    points: {
      en: ["Plan: your timetable says what to study and when.", "Practise: short tests on that topic, right after studying it.", "Review: your mistakes come back on their own until you know them.", "Reflect: one emoji and one line at night. Repeat tomorrow."],
      ml: ["പ്ലാൻ: എന്ത്, എപ്പോൾ പഠിക്കണമെന്ന് ടൈംടേബിൾ പറയും.", "പരിശീലനം: പഠിച്ച ഉടൻ ആ ടോപ്പിക്കിൽ ചെറിയ ടെസ്റ്റ്.", "റിവ്യൂ: തെറ്റിയവ ഉറയ്ക്കുന്നതുവരെ സ്വയം തിരികെ വരും.", "വിലയിരുത്തൽ: രാത്രി ഒരു ഇമോജിയും ഒരു വരിയും. നാളെ ആവർത്തിക്കുക."]
    },
    tip: { en: "Small and daily beats long and rare.", ml: "ദിവസവും കുറച്ച് എന്നതാണ് ഇടയ്ക്കിടെ കൂടുതൽ എന്നതിനേക്കാൾ നല്ലത്." }
  },
  {
    id: "setup", tone: "brand", scene: "setup",
    title: { en: "Set up once (10 minutes)", ml: "ഒരിക്കൽ ഒരുക്കുക (10 മിനിറ്റ്)" },
    points: {
      en: ["1 · Bring in your papers: import, or Library → Papers → Add paper (with “Copy instructions for AI”).", "2 · Add your exam dates: Today → Set your exam date (up to 20 exams).", "3 · Make a timetable: Progress → My timetable. Let AI draft it, then check and approve.", "4 · Connect Google Drive backup, and pick a theme and text size you like."],
      ml: ["1 · പേപ്പറുകൾ ചേർക്കുക: ഇംപോർട്ട്, അല്ലെങ്കിൽ ലൈബ്രറി → പേപ്പറുകൾ → പേപ്പർ ചേർക്കുക (“AI-ക്കുള്ള നിർദ്ദേശങ്ങൾ കോപ്പി ചെയ്യുക” ഉപയോഗിച്ച്).", "2 · പരീക്ഷാ തീയതികൾ ചേർക്കുക: ഇന്ന് → പരീക്ഷാ തീയതി (20 വരെ).", "3 · ടൈംടേബിൾ: പുരോഗതി → എന്റെ ടൈംടേബിൾ. AI തയ്യാറാക്കട്ടെ, നിങ്ങൾ പരിശോധിച്ച് അംഗീകരിക്കൂ.", "4 · Google Drive ബാക്കപ്പ് ബന്ധിപ്പിക്കുക; ഇഷ്ടമുള്ള തീമും അക്ഷര വലിപ്പവും തിരഞ്ഞെടുക്കുക."]
    },
    tip: { en: "The Paper theme makes questions easiest to read for long sessions.", ml: "ദീർഘനേരം വായിക്കാൻ “പേപ്പർ” തീമാണ് ഏറ്റവും സുഖം." },
    go: { to: "settings", label: { en: "Open Settings", ml: "സെറ്റിങ്സ് തുറക്കുക" } }
  },
  {
    id: "morning", tone: "brand", scene: "morning",
    title: { en: "Every morning: one tap (2 minutes)", ml: "എല്ലാ രാവിലെയും: ഒറ്റ ടാപ്പ് (2 മിനിറ്റ്)" },
    points: {
      en: ["Open Today. Look at the countdown: it keeps you serious.", "Tap ▶ Today’s session. It mixes your mistakes that are due with today’s topic.", "Do it before anything else, while your mind is fresh."],
      ml: ["“ഇന്ന്” തുറക്കുക. കൗണ്ട്ഡൗൺ നോക്കൂ: അത് ഗൗരവം നിലനിർത്തും.", "▶ ഇന്നത്തെ സെഷൻ തൊടൂ. സമയമായ തെറ്റുകളും ഇന്നത്തെ ടോപ്പിക്കും ചേർന്നതാണത്.", "മനസ്സ് തെളിഞ്ഞിരിക്കുമ്പോൾ, മറ്റെന്തിനും മുമ്പ് ഇത് ചെയ്യൂ."]
    },
    tip: { en: "No time today? Even one session keeps your streak and your memory alive.", ml: "ഇന്ന് സമയമില്ലേ? ഒരു സെഷൻ മതി തുടർച്ചയും ഓർമ്മയും നിലനിർത്താൻ." },
    go: { to: "today", label: { en: "Open Today", ml: "ഇന്ന് തുറക്കുക" } }
  },
  {
    id: "study", tone: "gold", scene: "study",
    title: { en: "Study blocks: learn, then test at once", ml: "പഠന സമയം: പഠിക്കുക, ഉടൻ പരീക്ഷിക്കുക" },
    points: {
      en: ["The timetable’s “Now” card on Today shows the block and topics.", "Study from your notes or Study PDFs (AI can make questions and flashcards from them).", "Tick the topics you finished, or tap 📖 Studied +1.", "Then tap ▶ Quick 10 on that topic straight away."],
      ml: ["ടൈംടേബിളിലെ “ഇപ്പോൾ” കാർഡ് ഏത് സമയം, ഏത് ടോപ്പിക് എന്ന് കാണിക്കും.", "നോട്ടുകളിൽ നിന്നോ പഠന PDF-കളിൽ നിന്നോ പഠിക്കുക (അവയിൽ നിന്ന് AI ചോദ്യങ്ങളും ഫ്ലാഷ്കാർഡുകളും ഉണ്ടാക്കും).", "പഠിച്ചുതീർന്ന ടോപ്പിക്കുകൾ ടിക്ക് ചെയ്യുക, അല്ലെങ്കിൽ 📖 പഠിച്ചു +1.", "ഉടൻ ആ ടോപ്പിക്കിൽ ▶ Quick 10 ചെയ്യൂ."]
    },
    tip: { en: "Testing yourself right after reading makes it stick far better than reading it again.", ml: "വീണ്ടും വായിക്കുന്നതിനേക്കാൾ, വായിച്ച ഉടൻ സ്വയം പരീക്ഷിക്കുന്നതാണ് ഓർമ്മയിൽ ഉറപ്പിക്കാൻ നല്ലത്." },
    go: { to: "timetable", label: { en: "Open my timetable", ml: "ടൈംടേബിൾ തുറക്കുക" } }
  },
  {
    id: "test", tone: "brand", scene: "test",
    title: { en: "In a test: act like it’s the real exam", ml: "ടെസ്റ്റിൽ: യഥാർത്ഥ പരീക്ഷ പോലെ" },
    points: {
      en: ["Keep the timer on. The screen stays awake by itself.", "✕ Cross out options you know are wrong (or long-press an option).", "Mark 🤔 every guess, honestly. That is how the guess coach learns.", "With negative marks, guess only after crossing out at least two options."],
      ml: ["ടൈമർ ഓണാക്കി വെക്കുക. സ്ക്രീൻ സ്വയം ഓണായിരിക്കും.", "തെറ്റാണെന്ന് ഉറപ്പുള്ള ഓപ്ഷനുകൾ ✕ വെട്ടുക (അല്ലെങ്കിൽ അമർത്തിപ്പിടിക്കുക).", "ഓരോ ഊഹവും സത്യസന്ധമായി 🤔 മാർക്ക് ചെയ്യുക. അങ്ങനെയാണ് ഗസ് കോച്ച് പഠിക്കുന്നത്.", "നെഗറ്റീവ് മാർക്കുള്ളപ്പോൾ, കുറഞ്ഞത് രണ്ട് ഓപ്ഷൻ വെട്ടിയ ശേഷം മാത്രം ഊഹിക്കുക."]
    },
    tip: { en: "With PSC’s usual marking, a blank costs nothing and a wrong answer costs ⅓ mark.", ml: "PSC-യുടെ സാധാരണ മാർക്കിങ്ങിൽ, ഒഴിച്ചിട്ടാൽ നഷ്ടമില്ല; തെറ്റിയാൽ ⅓ മാർക്ക് പോകും." },
    go: { to: "start-test", label: { en: "Start a test", ml: "ടെസ്റ്റ് തുടങ്ങുക" } }
  },
  {
    id: "after", tone: "red", scene: "after",
    title: { en: "After a test: mistakes are gold", ml: "ടെസ്റ്റിന് ശേഷം: തെറ്റുകളാണ് സ്വർണം" },
    points: {
      en: ["Open the result and tap Wrong.", "On each one: 🤖 Explain or 🧠 Memory trick. Save the useful ones as a note.", "Don’t try to remember them all: Mistake review brings each one back after 1, 3, 7 and 21 days.", "Right at the 21-day check? It leaves the queue. You’ve learnt it."],
      ml: ["ഫലം തുറന്ന് “തെറ്റ്” തൊടൂ.", "ഓരോന്നിലും 🤖 വിശദീകരണം അല്ലെങ്കിൽ 🧠 ഓർമ്മസൂത്രം. ഉപകാരമുള്ളവ നോട്ടായി സേവ് ചെയ്യൂ.", "എല്ലാം ഓർക്കാൻ ശ്രമിക്കേണ്ട: തെറ്റുകളുടെ റിവ്യൂ ഓരോന്നിനെയും 1, 3, 7, 21 ദിവസങ്ങൾക്ക് ശേഷം തിരികെ കൊണ്ടുവരും.", "21-ാം ദിവസം ശരിയായോ? അത് ലിസ്റ്റിൽ നിന്ന് മാറും. നിങ്ങൾ അത് പഠിച്ചു."]
    },
    tip: { en: "A mistake you have reviewed a few times is far less likely to cost you a mark on exam day.", ml: "പല തവണ റിവ്യൂ ചെയ്ത തെറ്റ് പരീക്ഷാദിവസം മാർക്ക് കളയാനുള്ള സാധ്യത വളരെ കുറവാണ്." },
    go: { to: "history", label: { en: "Open test history", ml: "ടെസ്റ്റ് ചരിത്രം തുറക്കുക" } }
  },
  {
    id: "night", tone: "gold", scene: "night",
    title: { en: "Every night: review your day (3 minutes)", ml: "എല്ലാ രാത്രിയും: ദിവസം വിലയിരുത്തുക (3 മിനിറ്റ്)" },
    points: {
      en: ["Today’s checklist fills itself from your tests, ticks and timetable.", "Pick a face for the day and write one honest line.", "Green days are effective days. Aim for a green week.", "If Today asks, tap ☁ Back up to Google Drive."],
      ml: ["ഇന്നത്തെ ചെക്ക്‌ലിസ്റ്റ് ടെസ്റ്റുകളിൽ നിന്നും ടിക്കുകളിൽ നിന്നും ടൈംടേബിളിൽ നിന്നും സ്വയം നിറയും.", "ദിവസത്തിന് ഒരു മുഖം തിരഞ്ഞെടുത്ത് സത്യസന്ധമായി ഒരു വരി എഴുതൂ.", "പച്ച ദിവസങ്ങൾ ഫലപ്രദമായ ദിവസങ്ങൾ. ഒരു പച്ച ആഴ്ച ലക്ഷ്യമിടൂ.", "“ഇന്ന്” ചോദിച്ചാൽ ☁ Google Drive-ലേക്ക് ബാക്കപ്പ് തൊടൂ."]
    },
    tip: { en: "Missed the night? Fill it in next morning; it still counts.", ml: "രാത്രി വിട്ടുപോയോ? പിറ്റേന്ന് രാവിലെ എഴുതിയാലും മതി." },
    go: { to: "diary", label: { en: "Open study diary", ml: "പഠന ഡയറി തുറക്കുക" } }
  },
  {
    id: "week", tone: "brand", scene: "week",
    title: { en: "Every Sunday: look at the big picture", ml: "എല്ലാ ഞായറാഴ്ചയും: മുഴുവൻ ചിത്രം നോക്കുക" },
    points: {
      en: ["Open 🗺 Syllabus map. Pick 2 red (weak) and 1 grey (not yet) topic for next week.", "Put them in your timetable.", "Read 🔎 Smart insights and the weekly report in your diary.", "Take one full mock test under the timer."],
      ml: ["🗺 സിലബസ് മാപ്പ് തുറക്കുക. അടുത്ത ആഴ്ചയ്ക്ക് 2 ചുവപ്പ് (ദുർബലം), 1 ചാരനിറം (ഇതുവരെ ഇല്ല) ടോപ്പിക്കുകൾ തിരഞ്ഞെടുക്കുക.", "അവ ടൈംടേബിളിൽ ചേർക്കുക.", "🔎 സ്മാർട്ട് ഇൻസൈറ്റുകളും ഡയറിയിലെ ആഴ്ചറിപ്പോർട്ടും വായിക്കുക.", "ടൈമർ വെച്ച് ഒരു മുഴുവൻ മോക്ക് ടെസ്റ്റ് എഴുതുക."]
    },
    tip: { en: "Big topics come first on the map: they bring the most marks.", ml: "മാപ്പിൽ വലിയ ടോപ്പിക്കുകൾ ആദ്യം: അവയാണ് കൂടുതൽ മാർക്ക് തരുന്നത്." },
    go: { to: "syllabus-map", label: { en: "Open the syllabus map", ml: "സിലബസ് മാപ്പ് തുറക്കുക" } }
  },
  {
    id: "final", tone: "red", scene: "final",
    title: { en: "The last 30 days", ml: "അവസാന 30 ദിവസം" },
    points: {
      en: ["A full mock every 2–3 days, at the exam’s real time of day.", "Mistake review every single day. Don’t skip it.", "Revise weak topics; start nothing big and new in the final week.", "Sleep well the last three nights. A rested mind recalls more."],
      ml: ["2–3 ദിവസം കൂടുമ്പോൾ ഒരു മുഴുവൻ മോക്ക്, യഥാർത്ഥ പരീക്ഷയുടെ അതേ സമയത്ത്.", "എല്ലാ ദിവസവും തെറ്റുകളുടെ റിവ്യൂ. ഒഴിവാക്കരുത്.", "ദുർബല ടോപ്പിക്കുകൾ റിവൈസ് ചെയ്യുക; അവസാന ആഴ്ച വലിയ പുതിയ ടോപ്പിക്കുകൾ തുടങ്ങരുത്.", "അവസാന മൂന്ന് രാത്രി നന്നായി ഉറങ്ങുക. വിശ്രമിച്ച മനസ്സ് കൂടുതൽ ഓർക്കും."]
    },
    tip: { en: "Set the exam date so the countdown and the timetable can plan backwards.", ml: "പരീക്ഷാ തീയതി ചേർത്താൽ കൗണ്ട്ഡൗണും ടൈംടേബിളും പിന്നോട്ട് പ്ലാൻ ചെയ്യും." },
    go: { to: "exams", label: { en: "Open exam countdowns", ml: "പരീക്ഷാ കൗണ്ട്ഡൗൺ തുറക്കുക" } }
  },
  {
    id: "rules", tone: "gold", scene: "rules",
    title: { en: "Five golden rules", ml: "അഞ്ച് സുവർണ നിയമങ്ങൾ" },
    points: {
      en: ["1 · A little every day beats a lot once a week.", "2 · Past papers first: PSC asks the same ideas again.", "3 · Your mistakes are your best questions.", "4 · Mark guesses honestly; skip when you can’t cross out two.", "5 · Keep backups on: your effort is precious."],
      ml: ["1 · ആഴ്ചയിൽ ഒരിക്കൽ കൂടുതൽ എന്നതിനേക്കാൾ ദിവസവും കുറച്ച്.", "2 · മുൻ ചോദ്യപേപ്പറുകൾ ആദ്യം: PSC ഒരേ ആശയങ്ങൾ വീണ്ടും ചോദിക്കും.", "3 · നിങ്ങളുടെ തെറ്റുകളാണ് ഏറ്റവും നല്ല ചോദ്യങ്ങൾ.", "4 · ഊഹം സത്യസന്ധമായി മാർക്ക് ചെയ്യുക; രണ്ടെണ്ണം വെട്ടാനാകാത്തപ്പോൾ ഒഴിവാക്കുക.", "5 · ബാക്കപ്പ് ഓണാക്കി വെക്കുക: നിങ്ങളുടെ അധ്വാനം വിലപ്പെട്ടതാണ്."]
    },
    tip: { en: "You can do this. One calm day at a time. 🌱", ml: "നിങ്ങൾക്ക് കഴിയും. ഓരോ ദിവസവും ശാന്തമായി. 🌱" },
    go: { to: "today", label: { en: "Start studying", ml: "പഠിക്കാൻ തുടങ്ങാം" } }
  }
];

/** Markup of one step (trusted, app-made). `actions` adds the Try-it button (the app; not the PDF). */
export function stepHtml(step, i, lang, { actions = false } = {}) {
  const u = UI[lang];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<article class="g-step tone-${step.tone}" data-i="${i}" lang="${lang}">
    <div class="g-scene" aria-hidden="true">${SCENES[step.scene](lang)}</div>
    <p class="g-count">${esc(u.step.replace("{n}", i + 1).replace("{of}", STEPS.length))}</p>
    <h2 class="g-title">${esc(step.title[lang])}</h2>
    <ul class="g-points">${step.points[lang].map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <p class="g-tip"><b>💡 ${esc(u.tip)}:</b> ${esc(step.tip[lang])}</p>
    ${actions && step.go ? `<button type="button" class="btn btn-quiet g-try" data-action="g-try" data-to="${esc(step.go.to)}">${esc(step.go.label[lang])} ›</button>` : ""}
  </article>`;
}
