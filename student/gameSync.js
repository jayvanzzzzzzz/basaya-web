import { auth } from "../js/firebase.js";
import { postToApi } from "../js/api.js";
import { student, invalidateStudentData } from "./data.js";
import { createGameSaves } from "./gameSaves.js";

export const gameSaveScope = () => auth.currentUser?.uid === student.uid ? {
  uid: student.uid, classId: student.profile.classId || "", progressSession: student.profile.progressSession || "",
} : null;

export const gameSaves = createGameSaves({
  getScope: gameSaveScope,
  send: async job => {
    const scope = gameSaveScope();
    if (!scope || scope.uid !== job.uid || scope.classId !== job.classId || scope.progressSession !== job.progressSession)
      throw new Error("Nagbago ang account o klase.");
    const controller = new AbortController();
    let timeout;
    let result;
    try {
      const request = postToApi("assessment", {
        operation: job.kind, classId: job.classId, progressSession: job.progressSession,
        lessonId: job.lessonId, part: "game", level: job.level, attemptId: job.attemptId,
        ...(job.kind === "answer" ? { word: job.word, eventId: job.eventId } :
          Array.isArray(job.words) ? { words: job.words } : {}),
      }, { signal: controller.signal });
      result = await Promise.race([request, new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Mabagal ang koneksiyon. Awtomatikong susubukan muli."));
        }, 12_000);
      })]);
    } finally { clearTimeout(timeout); }
    invalidateStudentData();
    const current = gameSaveScope();
    if (job.kind === "finish" && current?.uid === job.uid && current.classId === job.classId && current.progressSession === job.progressSession) {
      const lesson = student.lessons.find(item => item.id === job.lessonId);
      if (lesson && result.finished) lesson.gameFinished = true;
    }
    return result;
  },
});

window.addEventListener("online", () => gameSaves.resume({ immediate: true }));
window.addEventListener("storage", () => gameSaves.resume());
