import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../js/firebase.js";
import { summarize, resultsFrom, lessonParts, withMissed } from "../js/scoring.js";
import { skippedParts } from "../js/skippedParts.js";
import { lessonItems } from "../js/lessonItems.js";

// Everything the student side reads and writes in Firestore. Field names and shapes match
// the Android app (C:\Projects\BaSaya) exactly, so a student can switch between the app and
// the website, and the teacher's reports read both the same way.

export const student = {
  uid: null,
  email: "",
  profile: {},
  /** The class's lessons, as loaded by loadClassLessons(). */
  lessons: [],
};

const userRef = (uid = student.uid) => doc(db, "users", uid);
const progressRef = (lessonId, uid = student.uid) =>
  doc(db, "users", uid, "assignedLessons", lessonId);
const toMillis = (value) => (value?.toMillis ? value.toMillis() : null);

export const classId = () => student.profile.classId || "";
export const firstName = () => (student.profile.firstName || "").trim();
export const fullName = (profile = student.profile) =>
  [profile.firstName, profile.middleName, profile.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");

export async function loadProfile() {
  const snap = await getDoc(userRef());
  student.profile = snap.exists() ? snap.data() : {};
  return student.profile;
}

// ---------- Trusted clock (the app's TrustedClock.kt) ----------
// Asks Firestore for the server time once, then counts forward with performance.now(),
// which changing the computer's date doesn't affect. The database rules check lesson dates
// with server time anyway; this only keeps what the student sees honest.

let clockAnchor = null; // { serverMs, perfMs }

export async function syncClock() {
  try {
    await updateDoc(userRef(), { clockCheckAt: serverTimestamp() });
    const perfMs = performance.now();
    const serverMs = toMillis((await getDocFromServer(userRef())).get("clockCheckAt"));
    if (serverMs) clockAnchor = { serverMs, perfMs };
  } catch (error) {
    console.warn("Could not read the server time", error);
  }
}

export const now = () =>
  clockAnchor ? Math.round(clockAnchor.serverMs + (performance.now() - clockAnchor.perfMs)) : Date.now();

// ---------- Lessons of the student's class (the app's LessonRepository.syncLessons) ----------
// A library lesson can be in the class twice: once as an Assessment (link id = lesson id) and
// once as Practice (link id = "{lessonId}__practice"). Each is its own entry in
// student.lessons: `id` is the entry (routes, progress, practice flag), `lessonId` the
// library lesson whose content it shows. For an Assessment both are the lesson id, so its
// progress stays at users/{uid}/assignedLessons/{lessonId}.

const linkLessonId = (link) => link.get("lessonId")?.trim() || link.id;

/** classLessons/{id}.mode: "practice" or "assessment" (older links have none: assessment). */
const isPracticeLink = (link) => link.get("mode") === "practice";

/** The entry's id: the link id for Practice, the lesson id for an Assessment (older links have auto ids). */
const entryId = (link) => (isPracticeLink(link) ? link.id : linkLessonId(link));

/** The library lesson behind a class entry (an Assessment's entry id is its lesson id). */
const contentId = (id) => student.lessons.find((lesson) => lesson.id === id)?.lessonId || id;

/** Lessons that count toward scores: every class lesson except Practice ones. */
export const scoredLessons = () => student.lessons.filter((lesson) => !lesson.practice);

/**
 * Clears crossword words found mid-level (views/game.js keeps them in localStorage) for
 * lessons with no saved progress, e.g. after the teacher removed the lesson and added it
 * back, so the game starts fresh too.
 */
function forgetFoundWords(lessonIds) {
  try {
    const prefixes = lessonIds.map((lessonId) => `basaya.crossword.${student.uid}.${lessonId}.`);
    Object.keys(localStorage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/**
 * Something was done even if no part is finished yet: a part left halfway (a saved place),
 * a game level, or Bigkas (the app's LessonResume.started).
 */
const hasStarted = (data) =>
  Object.values(data.resume || {}).some((state) => Number(state?.done) > 0) ||
  Number(data.gameScore) > 0 ||
  data.pronunciationFinished === true;

/** Lessons of the class, in the teacher's order, with schedule and progress flags. */
export async function loadClassLessons() {
  const id = classId();
  if (!id) {
    student.lessons = [];
    return [];
  }

  const [linksSnap, progressSnap, rosterSnap] = await Promise.all([
    getDocs(collection(db, "classes", id, "classLessons")),
    getDocs(collection(db, "users", student.uid, "assignedLessons")),
    getDoc(doc(db, "classes", id, "students", student.uid)).catch(() => null),
  ]);
  const joinedAt = toMillis(rosterSnap?.get?.("joinedAt"));
  const links = linksSnap.docs;
  const ids = [...new Set(links.map(linkLessonId))];
  if (!ids.length) {
    student.lessons = [];
    return [];
  }

  // "in" queries take at most 30 ids.
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const lessonDocs = new Map(
    (
      await Promise.all(
        chunks.map((chunk) => getDocs(query(collection(db, "lessons"), where(documentId(), "in", chunk)))),
      )
    )
      .flatMap((snap) => snap.docs)
      .map((lesson) => [lesson.id, lesson]),
  );

  const progress = new Map(progressSnap.docs.map((item) => [item.id, item.data()]));
  forgetFoundWords(links.map(entryId).filter((entry) => !progress.has(entry)));
  const skipped = new Map(
    await Promise.all([...lessonDocs.keys()].map(async (lessonId) => [lessonId, await skippedParts(lessonId)])),
  );

  student.lessons = links
    .filter((link) => lessonDocs.has(linkLessonId(link)))
    .map((link) => {
      const lessonId = linkLessonId(link);
      const lesson = lessonDocs.get(lessonId);
      const id = entryId(link);
      const data = progress.get(id) || {};
      const dueAt = toMillis(link.get("dueAt"));
      const finished = lessonParts(data, skipped.get(lessonId)).finished;
      return {
        id,
        lessonId,
        title: lesson.get("title") || "",
        description: lesson.get("description") || "",
        difficulty: lesson.get("difficulty") || "",
        order: link.get("order") ?? lesson.get("order") ?? 0,
        openAt: toMillis(link.get("openAt")),
        dueAt,
        // Its deadline passed before the student joined: they never could do it, so it
        // isn't shown to them (teacher/views/progressData.js leaves it out of their totals).
        closedBeforeJoining: !finished && dueAt != null && joinedAt != null && dueAt < joinedAt,
        assignedAt: toMillis(link.get("createdAt")),
        // Pagsasanay: the teacher chose Practice, so nothing the student does is saved.
        practice: isPracticeLink(link),
        gameSkipped: skipped.get(lessonId).game,
        activitySkipped: skipped.get(lessonId).activity,
        lectureFinished: data.lectureFinished === true,
        gameFinished: data.gameFinished === true,
        activityFinished: data.activityFinished === true,
        pronunciationFinished: data.pronunciationFinished === true,
        quizFinished: data.quizFinished === true,
        started: hasStarted(data),
      };
    })
    .filter((lesson) => !lesson.closedBeforeJoining)
    .sort((a, b) => a.order - b.order);
  return student.lessons;
}

/** One class lesson by id, loading the list if needed. Null when it isn't in the class. */
export async function findLesson(lessonId) {
  if (!student.lessons.some((lesson) => lesson.id === lessonId)) await loadClassLessons();
  return student.lessons.find((lesson) => lesson.id === lessonId) || null;
}

// ---------- Schedule (the app's LessonSchedule.kt) ----------

/** "open", "not-yet-open" (before the open date) or "closed" (after the deadline). */
export function availability(lesson) {
  const time = now();
  if (lesson.openAt != null && time < lesson.openAt) return "not-yet-open";
  if (lesson.dueAt != null && time > lesson.dueAt) return "closed";
  return "open";
}

/** Every part is done (a game or Gawain the admin skipped doesn't count). */
export const isComplete = (lesson) =>
  lesson.lectureFinished &&
  (lesson.gameFinished || lesson.gameSkipped) &&
  (lesson.activityFinished || lesson.activitySkipped) &&
  lesson.quizFinished;

/** Open lessons, and closed ones the student finished (review only). */
export function canOpen(lesson) {
  const state = availability(lesson);
  return state === "open" || (state === "closed" && isComplete(lesson));
}

export function formatWhen(millis) {
  if (millis == null) return "";
  return new Date(millis).toLocaleString("fil-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------- Lesson content ----------

// Each loader takes the class entry id (an Assessment's is the lesson id, see contentId).

async function contentDoc(lessonId, part, preferred = "content") {
  const snap = await getDocs(collection(db, "lessons", contentId(lessonId), part));
  if (snap.empty) return null;
  return snap.docs.find((item) => item.id === preferred) || snap.docs[0];
}

const httpsOnly = (value) => (typeof value === "string" && value.startsWith("https://") ? value : "");

/** { title, pages: [{ pageNumber, sentences, audioUrls, wordStarts }] } or null. */
export async function loadLecture(lessonId) {
  const snap = await contentDoc(lessonId, "lectures");
  if (!snap) return null;
  const pages = (snap.get("pages") || []).map((page) => ({
    pageNumber: Number(page.pageNumber) || 0,
    sentences: (page.sentences || []).filter((sentence) => typeof sentence === "string"),
    audioUrls: (page.cloudAudio || []).map((entry) => httpsOnly(entry?.audioUrl)),
    // When each word is spoken (seconds), saved with audio generated since read-along; else null.
    wordStarts: (page.cloudAudio || []).map((entry) =>
      Array.isArray(entry?.wordStarts) && entry.wordStarts.every(Number.isFinite) ? entry.wordStarts : null,
    ),
  }));
  return { title: snap.get("title") || "", pages: pages.filter((page) => page.sentences.length) };
}

/** { title, instruction, explanation, pages: [{ words, correctIndices, explanation }] } or null. */
export async function loadActivity(lessonId) {
  const snap = await contentDoc(lessonId, "activity");
  if (!snap) return null;
  const pages = (snap.get("pages") || []).map((page) => {
    const words = (page.words || []).filter((word) => typeof word === "string");
    const correctIndices = [
      ...new Set(
        (page.correctIndices || [])
          .map(Number)
          .filter((index) => Number.isInteger(index) && index >= 0 && index < words.length),
      ),
    ];
    const explanation = typeof page.explanation === "string" && page.explanation.trim() ? page.explanation : null;
    return { words, correctIndices, explanation };
  });
  return {
    title: snap.get("title") || "",
    instruction: snap.get("instruction") || "",
    explanation: snap.get("explanation") || "",
    pages,
  };
}

/** { title, questions: [{ question, choices, correct: Set, multiple }] } or null. */
export async function loadQuiz(lessonId) {
  const snap = await contentDoc(lessonId, "quiz");
  if (!snap) return null;
  const questions = (snap.get("questions") || []).map((item) => {
    const choices = (item.choices || []).filter((choice) => typeof choice === "string");
    const answers = [
      ...new Set(
        (item.answers || [])
          .map(Number)
          .filter((index) => Number.isInteger(index) && index >= 0 && index < choices.length),
      ),
    ];
    // Older lessons keep a single `answer`.
    const correct = new Set(answers.length ? answers : [Number(item.answer) || 0]);
    return { question: item.question || "", choices, correct, multiple: correct.size > 1 };
  });
  return { title: snap.get("title") || "", questions };
}

/**
 * { title, instruction, words: [{ word, audioUrl }] } or null. basaya-web saves each word's
 * audio as cloudAudio, on the document or per page; matched by text first, then position
 * (the app's PronunciationRepository.cloudUrlFor).
 */
export async function loadPronunciation(lessonId) {
  const snap = await contentDoc(lessonId, "pronunciation");
  if (!snap) return null;
  const words = (snap.get("words") || []).filter((word) => typeof word === "string" && word.trim());
  const cloud = Array.isArray(snap.get("cloudAudio"))
    ? snap.get("cloudAudio")
    : (snap.get("pages") || []).flatMap((page) => page?.cloudAudio || []);
  const legacy = snap.get("audioRefs") || [];
  return {
    title: snap.get("title") || "",
    instruction: snap.get("instruction") || "",
    words: words.map((word, index) => {
      const byText = cloud.find((entry) => entry?.text?.trim().toLowerCase() === word.trim().toLowerCase());
      const entry = byText || cloud[index];
      return { word, audioUrl: httpsOnly(entry?.audioUrl) || httpsOnly(legacy[index]) };
    }),
  };
}

/** The crossword levels in order: [{ level, words }] (words as saved: key word first). */
export async function loadGameLevels(lessonId) {
  const snap = await getDocs(collection(db, "lessons", contentId(lessonId), "game"));
  return snap.docs
    .filter((item) => item.id !== "status")
    .map((item) => ({
      level: Number(item.get("level")) || 0,
      words: (item.get("words") || []).map((word) => String(word).trim()).filter(Boolean),
    }))
    .filter((level) => level.words.length)
    .sort((a, b) => a.level - b.level);
}

/** How many pages/levels/questions/words each part has, for the lesson path. */
export async function loadContentCounts(lessonId) {
  const count = async (part, field) => {
    try {
      const snap = await contentDoc(lessonId, part);
      return snap?.get(field)?.length || 0;
    } catch {
      return 0;
    }
  };
  const levels = getDocs(collection(db, "lessons", contentId(lessonId), "game"))
    .then((snap) => snap.docs.filter((item) => item.id !== "status").length)
    .catch(() => 0);
  const [lecture, activity, quiz, pronunciation, game] = await Promise.all([
    count("lectures", "pages"),
    count("activity", "pages"),
    count("quiz", "questions"),
    count("pronunciation", "words"),
    levels,
  ]);
  return { lecture, activity, quiz, pronunciation, game };
}

// ---------- Progress (users/{uid}/assignedLessons/{lessonId}) ----------

// ---------- Practice lessons ----------
// A Practice lesson saves nothing to Firestore (the rules reject it too) and can be done
// again and again. Only the game level reached is kept in memory for this visit, so
// "Susunod na antas" still moves on; it starts over at level 1 after the last level.

const practiceProgress = new Map();
const isPractice = (lessonId) => student.lessons.some((lesson) => lesson.id === lessonId && lesson.practice);

function rememberPractice(lessonId, fields) {
  const kept = practiceProgress.get(lessonId) || {};
  if (typeof fields.gameScore === "number") {
    if (fields.gameFinished) delete kept.gameScore;
    else kept.gameScore = fields.gameScore;
  }
  practiceProgress.set(lessonId, kept);
}

export async function loadLessonProgress(lessonId) {
  if (isPractice(lessonId)) return { ...(practiceProgress.get(lessonId) || {}) };
  const snap = await getDoc(progressRef(lessonId));
  return snap.exists() ? snap.data() : {};
}

/**
 * Merges fields into the lesson's progress, and optionally one skill record
 * (skills.{key} = { correct, attempts, items, completedAt, ...extras }, as in
 * SkillProgressRepository.recordResult). The rules reject it outside the lesson's dates.
 */
export async function saveProgress(lessonId, fields, skill) {
  if (isPractice(lessonId)) return rememberPractice(lessonId, fields);
  const data = { ...fields };
  if (skill) {
    data.skills = {
      [skill.key]: {
        correct: skill.correct,
        attempts: skill.attempts,
        items: skill.items,
        completedAt: serverTimestamp(),
        ...(skill.extras || {}),
      },
    };
  }
  await setDoc(progressRef(lessonId), data, { merge: true });

  const lesson = student.lessons.find((item) => item.id === lessonId);
  if (lesson) {
    Object.entries(fields).forEach(([key, value]) => {
      if (typeof value === "boolean") lesson[key] = value;
    });
  }
}

// ---------- Resume (assignedLessons/{lessonId}.resume.{part}) ----------
// Where the student stopped in the lecture, Gawain or Bigkas, so closing the page or
// switching to the app continues from there. Same shape as the app's LessonResume.kt;
// the quiz never resumes. Every state has `done` and `total` for the lesson path counts.

/** The saved place in one part, or null. A state for a different number of items is ignored. */
export function resumeOf(progress, part, total) {
  const state = progress?.resume?.[part];
  if (!state || typeof state !== "object") return null;
  const done = Number(state.done);
  if (!Number.isInteger(done) || done < 0 || Number(state.total) !== total) return null;
  return { ...state, done: Math.min(done, total) };
}

/** Saves the place in a part. Never throws: losing one save only costs a few steps. */
export async function saveResume(lessonId, part, state) {
  if (isPractice(lessonId)) return;
  try {
    await setDoc(
      progressRef(lessonId),
      { resume: { [part]: { ...state, updatedAt: serverTimestamp() } } },
      { merge: true },
    );
  } catch (error) {
    console.warn(`Could not save the ${part} place`, error);
  }
}

/** Fields that drop the saved place, to merge into the write that finishes the part. */
export const clearResume = (part) => ({ resume: { [part]: deleteField() } });

/** Progress docs of the class's lessons only (the app's LessonCompletion.classDocs). */
export async function loadClassProgressDocs() {
  const snap = await getDocs(collection(db, "users", student.uid, "assignedLessons"));
  const ids = new Set(scoredLessons().map((lesson) => lesson.id));
  return snap.docs.filter((item) => ids.has(item.id)).map((item) => ({ id: item.id, ...item.data() }));
}

/** Saves users/{uid}.skillSummary the way SkillProgressRepository.saveSummary does. */
export async function saveSummary(summary) {
  const skills = Object.fromEntries(
    Object.values(summary.skills).map((skill) => [
      skill.skill,
      {
        score: skill.score,
        level: skill.level,
        trend: skill.trend,
        lessons: skill.lessons,
        items: skill.items,
        needsHelp: skill.needsHelp,
        lessonScores: skill.lessonScores,
      },
    ]),
  );
  await setDoc(
    userRef(),
    {
      skillSummary: {
        needsHelp: summary.needsHelp,
        lessonsAssigned: scoredLessons().length,
        skills,
        updatedAt: serverTimestamp(),
      },
    },
    { mergeFields: ["skillSummary"] },
  );
}

/** Recomputes the skill summary after a part is finished. Never throws. */
/**
 * Skill results of the class's lessons, with a 0 for every part left unfinished when its
 * lesson closed (js/scoring.js withMissed). Practice lessons never count; student.lessons
 * already leaves out lessons that closed before the student joined.
 */
export async function scoredResults(docs) {
  const now = Date.now();
  const closed = scoredLessons().filter((lesson) => lesson.dueAt != null && lesson.dueAt < now);
  const items = await Promise.all(
    closed.map((lesson) => lessonItems(lesson.lessonId).then((found) => found.items).catch(() => ({}))),
  );
  const lessons = closed.map((lesson, index) => ({ ...lesson, items: items[index] }));
  return withMissed(resultsFrom(docs), docs, lessons, now);
}

export async function refreshSummary() {
  try {
    if (!student.lessons.length) await loadClassLessons();
    const summary = summarize(await scoredResults(await loadClassProgressDocs()));
    await saveSummary(summary);
    return summary;
  } catch (error) {
    console.warn("Could not refresh the skill summary", error);
    return null;
  }
}
