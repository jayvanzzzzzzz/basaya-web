// Student progress scoring — a port of the Android app's SkillScoring.kt
// (C:\Projects\BaSaya, see its README "Paano kinukwenta ang progreso"), so teachers on
// the web and students in the app see the same numbers. Keep the two in sync.
//
// - One score per skill per lesson: first-try accuracy = correct ÷ attempts × 100.
// - Lessons combine in a recency-weighted average (weight = items × 0.85^age).
// - Skills are never mixed into one student grade.

export const SKILLS = [
  { key: "pagUnawa", name: "Pag-unawa", detail: "Reading comprehension · Lecture", color: "#4f7cec" },
  { key: "talasalitaan", name: "Talasalitaan", detail: "Vocabulary · Crossword game", color: "#24994a" },
  { key: "pagkilala", name: "Pagkilala", detail: "Word recognition · Gawain", color: "#d9780a" },
  { key: "pagbigkas", name: "Pagbigkas", detail: "Pronunciation", color: "#e5503e" },
  { key: "pagsusulit", name: "Pagsusulit", detail: "Quiz", color: "#7a55d8" },
];

export const RECENCY_DECAY = 0.85;
export const MIN_LESSONS = 2;
export const MIN_ITEMS = 10;
export const TREND_THRESHOLD = 10;
export const HELP_THRESHOLD = 60;

/** Remarks (web wording) for the app's levels; same score bands. */
export const LEVELS = {
  MAHUSAY: { key: "very-good", label: "Very good", app: "Mahusay" },
  UMUUNLAD: { key: "good", label: "Good", app: "Umuunlad" },
  NAGSISIMULA: { key: "fair", label: "Fair", app: "Nagsisimula" },
  KAILANGAN_NG_TULONG: { key: "poor", label: "Poor", app: "Kailangan ng tulong" },
  KULANG_ANG_DATOS: { key: "no-data", label: "Not enough data", app: "Kulang ang datos" },
};

export function levelFor(score) {
  if (score >= 85) return "MAHUSAY";
  if (score >= 70) return "UMUUNLAD";
  if (score >= 50) return "NAGSISIMULA";
  return "KAILANGAN_NG_TULONG";
}

/** Remark for any 0–100 score (e.g. class averages); null → "Not enough data". */
export const remarkFor = (score) => LEVELS[score == null ? "KULANG_ANG_DATOS" : levelFor(score)];

const lessonScore = (result) =>
  result.attempts > 0 ? (result.correct * 100) / result.attempts : 0;

/** Average of the last 2 lessons vs. the (up to) 2 before them; null under 3 lessons. */
export function trendOf(scores) {
  if (scores.length < 3) return null;
  const average = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const recent = average(scores.slice(-2));
  const before = average(scores.slice(0, -2).slice(-2));
  if (recent - before > TREND_THRESHOLD) return "UP";
  if (before - recent > TREND_THRESHOLD) return "DOWN";
  return "STEADY";
}

/**
 * One skill from its per-lesson results
 * ({ lessonId, correct, attempts, items, completedAtMillis }).
 */
export function summarizeSkill(skillKey, results = []) {
  // Lessons not attempted are "no data", never 0%.
  const done = results
    .filter((result) => result.attempts > 0)
    .sort((a, b) => a.completedAtMillis - b.completedAtMillis);
  if (!done.length) {
    return {
      skill: skillKey, score: null, level: "KULANG_ANG_DATOS", trend: null,
      lessons: 0, items: 0, needsHelp: false, lessonScores: [], lessonIds: [],
    };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  done.forEach((result, index) => {
    const age = done.length - 1 - index;
    const weight = Math.max(result.items, 1) * RECENCY_DECAY ** age;
    weightedSum += lessonScore(result) * weight;
    weightTotal += weight;
  });
  const score = Math.round(weightedSum / weightTotal);

  const items = done.reduce((sum, result) => sum + result.items, 0);
  const enoughEvidence = done.length >= MIN_LESSONS || items >= MIN_ITEMS;
  const scores = done.map(lessonScore);
  const lastTwo = scores.slice(-2);

  return {
    skill: skillKey,
    score,
    level: enoughEvidence ? levelFor(score) : "KULANG_ANG_DATOS",
    trend: trendOf(scores),
    lessons: done.length,
    items,
    needsHelp: lastTwo.length === 2 && lastTwo.every((value) => value < HELP_THRESHOLD),
    lessonScores: scores.map((value) => Math.round(value)),
    lessonIds: done.map((result) => result.lessonId),
  };
}

export function summarize(resultsBySkill) {
  const skills = Object.fromEntries(
    SKILLS.map(({ key }) => [key, summarizeSkill(key, resultsBySkill[key] || [])]),
  );
  return {
    skills,
    needsHelp: SKILLS.map(({ key }) => key).filter((key) => skills[key].needsHelp),
  };
}

// ---------- Reading Firestore (users/{uid}/assignedLessons/{lessonId}) ----------

const millis = (value) =>
  value?.toMillis ? value.toMillis() : typeof value === "number" ? value : Date.now();

function parseRecord(lessonId, record) {
  if (typeof record?.attempts !== "number") return null;
  return {
    lessonId,
    correct: Number(record.correct) || 0,
    attempts: record.attempts,
    items: typeof record.items === "number" ? record.items : record.attempts,
    completedAtMillis: millis(record.completedAt),
  };
}

/** Quizzes taken before skill tracking (quizScore/quizTotal) still count. */
function legacyQuiz(lessonId, data) {
  const score = data.quizScore;
  const total = data.quizTotal;
  if (typeof score !== "number" || typeof total !== "number" || total <= 0) return null;
  return {
    lessonId,
    correct: score,
    attempts: total,
    items: total,
    completedAtMillis: millis(data.quizCompletedAt),
  };
}

/** [{ id, ...data }] progress docs → { skillKey: [results] }. */
export function resultsFrom(progressDocs) {
  const results = Object.fromEntries(SKILLS.map(({ key }) => [key, []]));
  progressDocs.forEach((doc) => {
    SKILLS.forEach(({ key }) => {
      const parsed =
        parseRecord(doc.id, doc.skills?.[key]) ||
        (key === "pagsusulit" ? legacyQuiz(doc.id, doc) : null);
      if (parsed) results[key].push(parsed);
    });
  });
  return results;
}

/**
 * A lesson is finished only when every part is done: lecture, game and Gawain (or skipped
 * by the admin, see js/skippedParts.js), Bigkas and Pagsusulit — same as the app's
 * LessonCompletion. `skipped` is { game, activity }.
 */
export function lessonParts(doc = {}, skipped = {}) {
  const parts = {
    lecture: doc.lectureFinished === true,
    game: skipped.game === true || doc.gameFinished === true,
    activity: skipped.activity === true || doc.activityFinished === true,
    pronunciation: doc.pronunciationFinished === true,
    quiz: doc.quizFinished === true,
  };
  const done = Object.values(parts).filter(Boolean).length;
  // A skipped part counts as done, but doesn't make the lesson "started".
  const skippedCount = [skipped.game, skipped.activity].filter((value) => value === true).length;
  return { parts, done, total: 5, finished: done === 5, started: done > skippedCount };
}
