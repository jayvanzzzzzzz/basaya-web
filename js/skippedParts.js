import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

// Parts of a lesson that aren't part of it (admin/views/lessons.js "Skip …"):
// - the game: lessons/{id}/game/status = { completion: "skipped" }, or no game levels at all
// - the Gawain: lessons/{id}/activity/status = { completion: "skipped" }
// - quiz and pronunciation use the same status document in their own subcollections
// A skipped part is hidden from students and counts as done. Same rule as the app's
// GameStatus.kt and ActivityStatus.kt.

const markedSkipped = (snap) =>
  snap.docs.find((item) => item.id === "status")?.get("completion") === "skipped";

/** { game, activity, quiz, pronunciation }: true for explicitly skipped parts. */
export async function skippedParts(lessonId) {
  const read = (part) => getDocs(collection(db, "lessons", lessonId, part)).catch(() => null);
  const [game, activity, quiz, pronunciation] = await Promise.all([read("game"), read("activity"), read("quiz"), read("pronunciation")]);
  return {
    game: game ? markedSkipped(game) || !game.docs.some((item) => item.id !== "status") : false,
    quiz: quiz ? markedSkipped(quiz) : false,
    pronunciation: pronunciation ? markedSkipped(pronunciation) : false,
    activity: activity ? markedSkipped(activity) : false,
  };
}
