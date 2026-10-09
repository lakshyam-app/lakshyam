// മലയാളം: 1.13 — AI ഉണ്ടാക്കുന്ന സ്ക്രീനുകൾ ലളിതമാക്കി (കൂടുതൽ ഓപ്ഷനുകൾ മടക്കി, "എവിടെ നിന്ന്" ബട്ടൺ, ഘട്ടങ്ങൾ).
export default {
  pdf: {
    steps: { label: "ഘട്ടങ്ങൾ", choose: "തിരഞ്ഞെടുക്കുക", writing: "എഴുതുന്നു", writingNote: "എഴുതുന്നു", review: "പരിശോധിച്ച് സേവ്" },
    moreOptions: "കൂടുതൽ ഓപ്ഷനുകൾ",
    howItWorks: "ഇത് എങ്ങനെ പ്രവർത്തിക്കുന്നു",
    pagesHeadShort: "പേജുകൾ",
    pagesAll: "എല്ലാ {n} പേജുകളും",
    pagesFromTo: "പേജ് {from}–{to}",
    styleView: "കാണുക / മാറ്റുക",
    styleHide: "മറയ്ക്കുക",
    sum: { styleDefault: "സാധാരണ ശൈലി", styleSaved: "സ്റ്റൈൽ ഗൈഡ് {date}-ന് സേവ് ചെയ്തത്", styleOwn: "നിങ്ങളുടെ സ്റ്റൈൽ ഗൈഡ്", patternOn: "🎯 പാറ്റേൺ ഓൺ", patternOff: "🎯 പാറ്റേൺ ഓഫ്", checkOn: "ഇരട്ട പരിശോധന ഓൺ", checkOff: "ഇരട്ട പരിശോധന ഓഫ്" }
  },
  ai: {
    madeLabel: "AI ഉണ്ടാക്കിയത്",
    aboutThis: "ഇതിനെക്കുറിച്ച്",
    from: { short: "എവിടെ നിന്ന്:", items: "{n} എണ്ണം" },
    make: {
      more: "കൂടുതൽ ഉണ്ടാക്കുക",
      title: { questions: "AI ചോദ്യങ്ങൾ ഉണ്ടാക്കുക", cards: "ഫ്ലാഷ്‌കാർഡുകൾ ഉണ്ടാക്കുക", note: "റിവിഷൻ നോട്ട് ഉണ്ടാക്കുക" },
      fromPdf: { questions: "ഈ PDF-ലെ വാചകത്തിൽ നിന്ന് മാത്രം ചോദ്യങ്ങൾ", cards: "ഈ PDF-ലെ വാചകത്തിൽ നിന്ന് മാത്രം കാർഡുകൾ", note: "ഈ PDF-ലെ വാചകത്തിൽ നിന്ന് മാത്രം നോട്ട്" },
      addPdf: "ഒരു സ്റ്റഡി PDF ചേർക്കുക",
      addPdfSub: "എന്നിട്ട് അതിൽ നിന്ന് ഉണ്ടാക്കാം",
      general: "AI-യുടെ പൊതുവിജ്ഞാനത്തിൽ നിന്ന്",
      generalSub: "PDF വേണ്ട; ഉത്തരങ്ങൾ പരിശോധിക്കുക"
    }
  },
  view: { showHead: "കാണിക്കുന്ന രീതി" },
  question: { pageShort: "പേ. {n}", sourceLine: "ഉറവിട വരി" }
};
