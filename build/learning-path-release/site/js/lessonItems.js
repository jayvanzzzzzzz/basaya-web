import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

// How many items each scored part of a lesson has, read from its content
// (lessons/{id}/game|activity|pronunciation|quiz). A part missed at the deadline counts as a
// 0 weighted by these (js/scoring.js withMissed). Same counts as the app's LessonItems.kt.
// Also returns the quiz questions and Bigkas words, for the Class Report's item analysis.

const cache = new Map();

const strings = (list) =>
  (Array.isArray(list) ? list : []).map((item) => String(item ?? "").trim()).filter(Boolean);

/** The part's content doc ("content" if there is one), never the skip "status" doc. */
function contentOf(snap) {
  const docs = snap ? snap.docs.filter((item) => item.id !== "status") : [];
  return docs.find((item) => item.id === "content") || docs[0] || null;
}

async function load(lessonId) {
  const read = (part) => getDocs(collection(db, "lessons", lessonId, part)).catch(() => null);
  const [game, activity, pronunciation, quiz] = await Promise.all([
    read("game"),
    read("activity"),
    read("pronunciation"),
    read("quiz"),
  ]);
  const gameWords = (game?.docs || [])
    .filter((item) => item.id !== "status")
    .reduce((sum, item) => sum + strings(item.get("words")).length, 0);
  const questions = (contentOf(quiz)?.get("questions") || []).map((item) => String(item?.question ?? "").trim());
  const words = strings(contentOf(pronunciation)?.get("words"));
  return {
    items: {
      talasalitaan: gameWords,
      pagkilala: (contentOf(activity)?.get("pages") || []).length,
      pagbigkas: words.length,
      pagsusulit: questions.length,
    },
    questions,
    words,
  };
}

/** { items: { skillKey: count }, questions: [text], words: [text] } for one lesson (cached). */
export function lessonItems(lessonId) {
  if (!cache.has(lessonId)) {
    const pending = load(lessonId).catch((error) => {
      cache.delete(lessonId);
      throw error;
    });
    cache.set(lessonId, pending);
  }
  return cache.get(lessonId);
}
