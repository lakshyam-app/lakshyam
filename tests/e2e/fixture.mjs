// A made-up "PSC Exam Vault" export for the browser smoke test: invented questions, tests and study history
// shaped like the old app's export file. Nothing in it comes from a real person's data. The same input
// always gives the same file (a fixed random seed), so test results don't change from run to run.
import { TAXONOMY_SEED } from "../../src/data/taxonomy-seed.js";

const DAY = 86400000;
const SUBJECTS = { "History": 5, "Geography": 4, "Indian Constitution": 4, "Current Affairs": 3, "Physics": 3, "Malayalam": 2 };

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const iso = (ms) => new Date(ms).toISOString();
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function makeVaultExport({ papers = 6, perPaper = 40, now = Date.now(), seed = 42 } = {}) {
  const rand = rng(seed);
  const pairs = Object.entries(SUBJECTS).flatMap(([s, n]) => TAXONOMY_SEED[s].slice(0, n).map((t) => [s, t]));
  pairs.push(["History", "Other"]);
  const out = { syllabuses: [{ id: "default", name: "Degree Mains", marking: { positive: 1, negNum: 1, negDen: 3 } }], papers: [], attempts: [], banks: [],
    paperTemplates: [], studyProgress: {}, dailyActivity: {}, topicLists: [], topicLabels: {}, listingNotes: {} };

  for (let p = 0; p < papers; p++) {
    const year = 2019 + p;
    // One very long post name: the one-line label on test cards must cut it short, not widen the page.
    const post = p === 1 ? "Made-up Assistant Engineer (Civil) in the Made-up Public Works Department, Second Grade, Part II (By Transfer)" : "Made-up Post";
    const paper = { id: `fx-${p + 1}`, name: `${101 + p}/${year}`, post_name: post, syllabus_id: "default", questions: [] };
    for (let i = 0; i < perPaper; i++) {
      const [subject, topic] = pairs[(i + p) % pairs.length];
      const ml = subject === "Malayalam";
      const n = p * perPaper + i + 1;
      const q = {
        id: `q${i + 1}`,
        question_text: ml ? `സാങ്കൽപ്പിക ചോദ്യം ${n}: ശരിയായ ഉത്തരം ഏത്?` : `Made-up question ${n} on ${topic}: which option is right?`,
        options: ml ? ["ഒന്ന്", "രണ്ട്", "മൂന്ന്", "നാല്"].map((o) => `${o} ${n}`) : ["A", "B", "C", "D"].map((o) => `Option ${o}${n}`),
        correct_answer_index: n % 4, subject, topic
      };
      if (i % 5 === 0) q.explanation = `Made-up explanation for question ${n}.`;
      paper.questions.push(q);
    }
    out.papers.push(paper);
  }
  // Asked again in a later paper (for 🔁), and a question whose answer changes over time (for ⏳).
  for (let i = 0; i < 5; i++) out.papers[3].questions[i] = { ...out.papers[0].questions[i], id: `q${i + 1}` };
  out.papers[1].questions[2] = { id: "q3", question_text: "Who is the present Governor of the made-up state?", options: ["Person A", "Person B", "Person C", "Person D"], correct_answer_index: 1, subject: "Current Affairs", topic: TAXONOMY_SEED["Current Affairs"][0] };

  // Tests taken over the last two weeks: about 6 in 10 right, 1 in 4 wrong, the rest blank.
  for (let a = 0; a < papers; a++) {
    const paper = out.papers[a];
    const at = now - (14 - a * 2) * DAY;
    const answers = paper.questions.map((q) => {
      const r = rand();
      const selected = r < 0.6 ? q.correct_answer_index : r < 0.85 ? (q.correct_answer_index + 1) % 4 : null;
      return { paperId: paper.id, qid: q.id, subject: q.subject, topic: q.topic, selectedIndex: selected, correctIndex: q.correct_answer_index,
        isCorrect: selected === q.correct_answer_index, isGraded: true, timeMs: Math.round(15000 + rand() * 45000), guessed: selected !== null && rand() < 0.15 };
    });
    const right = answers.filter((x) => x.isCorrect).length; const blank = answers.filter((x) => x.selectedIndex === null).length;
    const wrong = answers.length - right - blank;
    out.attempts.push({ id: `fx-att-${a + 1}`, type: "paper", scopeKey: paper.id, scopeLabel: paper.name, timestamp: iso(at), answers,
      correctCount: right, wrongCount: wrong, unansweredCount: blank, totalCount: answers.length, syllabus_id: "default",
      netScore: Math.round((right - wrong / 3) * 100) / 100, marking: { positive: 1, negNum: 1, negDen: 3 }, timerMinutes: 40 });
    out.dailyActivity[dayKey(at)] = answers.length;
  }
  // Studied topics, two of them due for revision now.
  pairs.slice(0, 4).forEach(([s, t], i) => {
    out.studyProgress[`default::${s}|||${t}`] = { count: 1 + i, lastStudiedAt: now - (10 + i) * DAY, nextReviewAt: i < 2 ? now - DAY : now + 5 * DAY };
  });
  out.banks.push({ id: "fx-bank", name: "Made-up bank", questionRefs: out.papers[0].questions.slice(0, 6).map((q) => ({ paperId: "fx-1", qid: q.id })) });
  out.listingNotes[`topic:${pairs[0][0]}|||${pairs[0][1]}`] = { text: "A made-up note: remember the three made-up facts.", label: `Topic: ${pairs[0][1]}` };
  return out;
}
