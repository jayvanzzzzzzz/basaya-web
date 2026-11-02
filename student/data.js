import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  getDocFromCache,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, offlineReady } from "../js/firebase.js";
import { postToApi } from "../js/api.js";
import { getDownload, putDownload, listDownloads, removeDownload, snapshotOf } from "./offlineStore.js";
import { withDownloadAbort } from "./downloadCancellation.js";
import { summarize, resultsFrom, lessonParts, withMissed } from "../js/scoring.js";

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
const dataScope = () => JSON.stringify([student.uid, classId(), student.profile.progressSession || "", navigator.onLine]);
let classLoad = null;
let classLoaded = null;
let progressLoaded = null;
let dataRevision = 0;
const DATA_MAX_AGE = 30_000;
const fresh = (entry, scope) => entry?.scope === scope && Date.now() - entry.time < DATA_MAX_AGE;

export function invalidateStudentData() {
  dataRevision += 1;
  classLoaded = null;
  progressLoaded = null;
}

export const classId = () => student.profile.classId || "";
export const firstName = () => (student.profile.firstName || "").trim();
export const fullName = (profile = student.profile) =>
  [profile.firstName, profile.middleName, profile.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");

export async function loadProfile() {
  const uid = student.uid;
  const snap = await (navigator.onLine ? getDoc(userRef()) : getDocFromCache(userRef()));
  if (student.uid !== uid) return student.profile;
  student.profile = snap.exists() ? snap.data() : {};
  return student.profile;
}

// ---------- Trusted clock (the app's TrustedClock.kt) ----------
// Asks Firestore for the server time once, then counts forward with performance.now(),
// which changing the computer's date doesn't affect. The database rules check lesson dates
// with server time anyway; this only keeps what the student sees honest.

let clockAnchor = null; // { serverMs, perfMs }

export async function syncClock() {
  if (!navigator.onLine) return;
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
let metadataRetryAt = 0;
const metadataCache = new Map();
const metadataLoads = new Map();
const metadataKey = (body, version) => JSON.stringify([
  student.uid, body.classId, body.progressSession, body.lessonId, version,
]);
const cachedMetadata = (key) => {
  const entry = metadataCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.value;
  metadataCache.delete(key);
  return null;
};
const rememberMetadata = (key, value) => {
  metadataCache.set(key, { value, expires: Date.now() + 60_000 });
  return value;
};
async function readLessonMetadata(body, version) {
  const key = metadataKey(body, version);
  const cached = cachedMetadata(key);
  if (cached) return cached;
  if (metadataLoads.has(key)) return metadataLoads.get(key);
  const pending = postToApi("assessment", body)
    .then(value => rememberMetadata(key, value)).finally(() => metadataLoads.delete(key));
  metadataLoads.set(key, pending);
  return pending;
}
async function readClassMetadata(id, lessonDocs) {
  const body = { operation: "metadata-list", classId: id, progressSession: student.profile.progressSession || "" };
  const entries = [...lessonDocs].map(([lessonId, lesson]) => [lessonId, metadataKey({ ...body, lessonId }, toMillis(lesson.get("updatedAt")))]);
  const cached = entries.map(([lessonId, key]) => [lessonId, cachedMetadata(key)]);
  if (cached.every(([, value]) => value)) return new Map(cached);
  const key = JSON.stringify([student.uid, body, entries]);
  if (!metadataLoads.has(key)) {
    const pending = postToApi("assessment", body).then(result => {
      for (const [lessonId, entryKey] of entries) {
        if (result.lessons[lessonId]) rememberMetadata(entryKey, result.lessons[lessonId]);
      }
      return new Map(Object.entries(result.lessons));
    }).finally(() => metadataLoads.delete(key));
    metadataLoads.set(key, pending);
  }
  return metadataLoads.get(key);
}

export async function assessmentRequest(lessonId, operation, fields = {}) {
  if (!navigator.onLine) throw new Error("Kumonekta sa internet para maipasa at masuri ang sagot.");
  const lesson = student.lessons.find(item => item.id === lessonId);
  const body = {
    operation, classId: classId(), progressSession: student.profile.progressSession || "",
    ...(lessonId ? { lessonId: contentId(lessonId) } : {}),
    ...(lesson?.practice ? { practice: true, entryId: lesson.id } : {}), ...fields,
  };
  const result = await (operation === "metadata"
    ? readLessonMetadata(body, lesson?.contentVersion ?? null)
    : postToApi("assessment", body));
  if (!["metadata", "metadata-list", "content", "summary"].includes(operation)) invalidateStudentData();
  return result;
}

export const submitAnswer = (lessonId, part, fields) => assessmentRequest(lessonId, "answer", {
  part, eventId: crypto.randomUUID(), ...fields,
});

/** Lessons that count toward scores: every class lesson except Practice ones. */
export const scoredLessons = () => student.lessons.filter((lesson) => !lesson.practice);

/**
 * Clears crossword words found mid-level (views/game.js keeps them in localStorage) for
 * lessons with no saved progress, e.g. after the teacher removed the lesson and added it
 * back, so the game starts fresh too.
 */
function forgetFoundWords(lessonIds) {
  try {
    const prefixes = lessonIds.map((lessonId) => `basaya.crossword.${student.uid}.${student.profile.progressSession || "legacy"}.${lessonId}.`);
    Object.keys(localStorage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** Something was done even if no part is finished yet: a part left halfway (a saved place), a game level, or Bigkas (the app's LessonResume.started). */
const hasStarted = (data) =>
  Object.values(data.resume || {}).some((state) => Number(state?.done) > 0) ||
  Number(data.gameScore) > 0 ||
  data.pronunciationFinished === true;

/** Lessons of the class, in the teacher's order, with schedule and progress flags. */
export async function loadClassLessons({ force = false } = {}) {
  const scope = dataScope();
  if (classLoad?.scope === scope && classLoad.revision === dataRevision) return classLoad.promise;
  if (!force && fresh(classLoaded, scope)) return student.lessons;
  const entry = { scope, revision: dataRevision };
  entry.promise = fetchClassLessons(scope, entry.revision).then(lessons => {
    if (dataScope() === scope && entry.revision !== dataRevision) return loadClassLessons();
    if (dataScope() === scope) classLoaded = { scope, time: Date.now() };
    return lessons;
  }).finally(() => { if (classLoad === entry) classLoad = null; });
  classLoad = entry;
  return entry.promise;
}

async function fetchClassLessons(scope, revision) {
  const current = () => dataScope() === scope && revision === dataRevision;
  const id = classId();
  if (!id) {
    student.lessons = [];
    return [];
  }

  if (!navigator.onLine) {
    const downloads = await listDownloads(student.uid, id);
    const lessons = await Promise.all(downloads.map(async ({ meta }) => {
      const progress = await loadLessonProgress(meta.id);
      return { ...meta, ...Object.fromEntries(Object.entries(progress).filter(([, value]) => typeof value === "boolean")), started: hasStarted(progress) };
    }));
    if (current()) student.lessons = lessons;
    return student.lessons;
  }

  const [linksSnap, progressSnap, rosterSnap] = await Promise.all([
    getDocs(collection(db, "classes", id, "classLessons")),
    getDocs(collection(db, "users", student.uid, "assignedLessons")),
    getDoc(doc(db, "classes", id, "students", student.uid)).catch(() => null),
  ]);
  if (!current()) return student.lessons;
  progressLoaded = { scope, time: Date.now(), docs: progressSnap.docs.map(item => ({ id: item.id, ...item.data() })) };
  const joinedAt = toMillis(rosterSnap?.get?.("joinedAt"));
  const links = linksSnap.docs;
  const ids = [...new Set(links.map(linkLessonId))];
  if (!ids.length) {
    student.lessons = [];
    return [];
  }

  
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
  if (!current()) return student.lessons;

  const progress = new Map(progressSnap.docs.map((item) => [item.id, item.data()]));
  forgetFoundWords(links.map(entryId).filter((entry) => !progress.has(entry)));
  const skipped = new Map([...lessonDocs.keys()].map(lessonId => {
    const previous = student.lessons.find(item => item.lessonId === lessonId);
    return [lessonId, { game: previous?.gameSkipped === true, activity: previous?.activitySkipped === true }];
  }));
  // One authenticated request for all assigned metadata. The same short-lived
  // cache supplies lesson paths and progress pages without another round trip.
  if (Date.now() >= metadataRetryAt) {
    try {
      const metadata = await readClassMetadata(id, lessonDocs);
      for (const [lessonId, found] of metadata) skipped.set(lessonId, found.skipped);
    } catch (error) {
      console.warn("Lesson metadata unavailable; showing saved progress", error);
      if (!error.status || error.status === 404 || error.status >= 500) metadataRetryAt = Date.now() + 30_000;
    }
  }

  if (!current()) return student.lessons;
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
        // Its deadline passed before the student joined: they never could do it, so it isn't shown to them (teacher/views/progressData.js leaves it out of their totals).
        closedBeforeJoining: !finished && dueAt != null && joinedAt != null && dueAt < joinedAt,
        assignedAt: toMillis(link.get("createdAt")),
        contentVersion: toMillis(lesson.get("updatedAt")),
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

// Schedule (the app's LessonSchedule.kt)

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
  lesson.pronunciationFinished &&
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

// Lesson content

// Each loader takes the class entry id (an Assessment's is the lesson id, see contentId).

async function contentDoc(lessonId, part, preferred = "content") {
  const snap = await contentCollection(lessonId, part);
  if (snap.empty) return null;
  return snap.docs.find((item) => item.id === preferred) || snap.docs.find((item) => item.id !== "status") || null;
}

async function contentCollection(lessonId, part) {
  if (!navigator.onLine) {
    const saved = await getDownload(student.uid, classId(), lessonId);
    if (!saved) throw new Error("I-download muna ang aralin habang online.");
    return snapshotOf(saved.parts[part] || []);
  }
  if (["quiz", "activity"].includes(part)) {
    const found = await assessmentRequest(lessonId, "content");
    return snapshotOf([{ id: "content", data: found[part] }, ...(part === "activity" && found.skipped.activity ? [{ id: "status", data: { completion: "skipped" } }] : [])]);
  }
  return getDocs(collection(db, "lessons", contentId(lessonId), part));
}

export async function downloadLesson(lessonId, onProgress = () => {}, { signal } = {}) {
  signal?.throwIfAborted();
  if (!navigator.onLine || !(await withDownloadAbort(offlineReady, signal))) throw new Error("Kailangan ng internet at available na device storage.");
  if (!("serviceWorker" in navigator)) throw new Error("Hindi suportado ang offline na aralin sa browser na ito.");
  let readyTimeout;
  let registration;
  try {
    registration = await withDownloadAbort(Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => { readyTimeout = setTimeout(() => reject(new Error("Hindi pa handa ang offline na app. I-refresh habang online at subukan muli.")), 15000); }),
    ]), signal);
  } finally {
    clearTimeout(readyTimeout);
  }
  // Wait for this version's shell to finish installing before marking a lesson ready.
  if (!registration.active) throw new Error("Inihahanda pa ang app. Subukan muli.");
  const shellReady = await Promise.all((await caches.keys()).filter((name) => name.startsWith("basaya-offline-v2")).map(async (name) =>
    Boolean(await (await caches.open(name)).match(new URL("../.offline-ready", import.meta.url).href))));
  if (!shellReady.some(Boolean)) throw new Error("Inihahanda pa ang offline na app. Isara at buksan muli ang BaSaya habang online, saka subukan.");
  const uid = student.uid;
  const cid = classId();
  const lesson = await findLesson(lessonId);
  if (!lesson || !canOpen(lesson)) throw new Error("Hindi bukas ang aralin.");
  const parts = {};
  for (const part of ["lectures", "game", "activity", "pronunciation", "quiz"]) {
    signal?.throwIfAborted();
    const snap = await withDownloadAbort(["quiz", "activity"].includes(part) ? contentCollection(lessonId, part) : getDocsFromServer(collection(db, "lessons", contentId(lessonId), part)), signal);
    parts[part] = snap.docs.map((item) => ({ id: item.id, data: item.data() }));
  }
  await withDownloadAbort(loadLessonProgress(lessonId), signal);
  const urls = new Set();
  const collect = (value) => {
    if (typeof value === "string" && value.startsWith("https://")) urls.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
      if (["audioUrl", "audioRefs", "cloudAudio", "pages"].includes(key)) collect(item);
    });
  };
  Object.values(parts).flat().forEach(({ data }) => collect(data));
  const audioCache = `basaya-audio-${encodeURIComponent(uid)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const cache = await caches.open(audioCache);
    let done = 0;
    for (const url of urls) {
      signal?.throwIfAborted();
      const response = await fetch(url, { signal });
      if (!response.ok || response.type === "opaque") throw new Error("Hindi ma-download ang audio. Subukan muli.");
      await cache.put(url, response);
      signal?.throwIfAborted();
      onProgress(Math.round(++done / urls.size * 100));
    }
    if (student.uid !== uid || classId() !== cid) throw new Error("Nagbago ang account o klase. Subukan muli.");
    const previous = await getDownload(uid, cid, lessonId);
    signal?.throwIfAborted();
    await putDownload(uid, cid, { meta: { ...lesson }, parts, audioCache, downloadedAt: Date.now() });
    if (previous?.audioCache) await caches.delete(previous.audioCache);
    onProgress(100);
    navigator.storage?.persist?.().catch(() => {});
  } catch (error) {
    await caches.delete(audioCache);
    throw error;
  }
}

export const downloadedLessons = () => listDownloads(student.uid, classId());
export const removeLessonDownload = (id) => removeDownload(student.uid, classId(), id);

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
    return { words, correctIndices, pickCount: page.pickCount ?? correctIndices.length, explanation };
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
    return { question: item.question || "", choices, correct, multiple: item.multiple ?? correct.size > 1 };
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
  const snap = await contentCollection(lessonId, "game");
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
  if (navigator.onLine) return (await assessmentRequest(lessonId, "metadata")).counts;
  const count = async (part, field) => {
    try {
      const snap = await contentDoc(lessonId, part);
      return snap?.get(field)?.length || 0;
    } catch {
      return 0;
    }
  };
  const levels = contentCollection(lessonId, "game")
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

// Progress (users/{uid}/assignedLessons/{lessonId})

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
  let snap;
  try {
    snap = await (navigator.onLine ? getDoc(progressRef(lessonId)) : getDocFromCache(progressRef(lessonId)));
  } catch (error) {
    if (!navigator.onLine && error.code === "unavailable") return {};
    throw error;
  }
  const progress = snap.exists() ? snap.data() : {};
  // Old client-calculated resume scores are not valid server attempts.
  progress.resume = { ...progress.resume };
  for (const part of ["lecture", "quiz", "activity", "game", "pronunciation"]) {
    if (!progress.assessmentState?.[part]) delete progress.resume[part];
  }
  return progress;
}

/**
 * Finalizes the requested part through the API. Client score/skill fields are
 * display hints only; the API derives every stored result from accepted answers.
 */
export async function saveProgress(lessonId, fields, skill) {
  if (isPractice(lessonId)) return rememberPractice(lessonId, fields);
  const part = ["quiz", "activity", "pronunciation", "game", "lecture"].find(part => `${part}Finished` in fields);
  if (!part) throw new Error("Missing assessment part.");
  const result = await assessmentRequest(lessonId, "finish", { part,
    ...(part === "game" ? { level: fields.gameLevel ?? fields.gameScore } : {}),
    ...(part === "quiz" ? { attemptId: fields.attemptId } : {}),
  });

  const lesson = student.lessons.find((item) => item.id === lessonId);
  if (lesson) {
    Object.entries(fields).forEach(([key, value]) => {
      if (key === `${part}Finished`) lesson[key] = result.finished;
    });
  }
  return result;
}

// ---------- Resume (assignedLessons/{lessonId}.resume.{part}) ----------
// Where the student stopped in the lecture, Gawain or Bigkas, so closing the page or
// switching to the app continues from there. Same shape as the app's LessonResume.kt;
// Every scored state is produced by the API from accepted answers.

/** The saved place in one part, or null. A state for a different number of items is ignored. */
export function resumeOf(progress, part, total) {
  const state = progress?.resume?.[part];
  if (!state || typeof state !== "object") return null;
  const done = Number(state.done);
  if (!Number.isInteger(done) || done < 0 || Number(state.total) !== total) return null;
  return { ...state, done: Math.min(done, total) };
}

/** Advances lecture reading only. Scored parts save their place with each accepted answer. */
export async function saveResume(lessonId, part, state) {
  if (isPractice(lessonId)) return;
  // Scored resume state is derived from accepted answers by the backend.
  if (part !== "lecture") return;
  try {
    await assessmentRequest(lessonId, "resume", { part, done: state.done });
  } catch (error) {
    console.warn(`Could not save the ${part} place`, error);
    const { reportSyncFailure } = await import("./sync.js");
    reportSyncFailure(student.uid);
    throw error;
  }
}

/** Fields that drop the saved place, to merge into the write that finishes the part. */
export const clearResume = (part) => ({ resume: { [part]: deleteField() } });

/** Progress docs of the class's lessons only (the app's LessonCompletion.classDocs). */
export async function loadClassProgressDocs({ force = false } = {}) {
  const scope = dataScope();
  const revision = dataRevision;
  let docs = fresh(progressLoaded, scope) && !force ? progressLoaded.docs : null;
  if (!docs) {
    const snap = await getDocs(collection(db, "users", student.uid, "assignedLessons"));
    if (dataScope() !== scope) return [];
    if (revision !== dataRevision) return loadClassProgressDocs({ force });
    docs = snap.docs.map(item => ({ id: item.id, ...item.data() }));
    progressLoaded = { scope, time: Date.now(), docs };
  }
  const ids = new Set(scoredLessons().map((lesson) => lesson.id));
  return docs.filter(item => ids.has(item.id));
}

/** Requests a server calculation; the browser cannot supply summary values. */
export async function saveSummary() {
  if (!navigator.onLine) return;
  return (await assessmentRequest(null, "summary")).summary;
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
    closed.map((lesson) => assessmentRequest(lesson.id, "metadata").then((found) => found.items).catch(() => ({}))),
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
