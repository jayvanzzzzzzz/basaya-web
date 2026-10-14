import { db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";

// POST /api/remove-class-lesson
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, lessonId }
//
// Takes a lesson out of a class the caller teaches, with the class's progress on it:
//   - classes/{classId}/classLessons/*                (every link to this lesson)
//   - users/{uid}/assignedLessons/{lessonId}          (for every student in the class)
// so adding the lesson back later starts everyone fresh. The lesson itself (lessons/{id})
// stays in the library. Done with the Admin SDK because Firestore rules only let
// students write their own progress.

const BATCH_LIMIT = 450;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid) return;

    const { classId, lessonId } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(lessonId || "")) {
      return res.status(400).json({ error: "Invalid classId or lessonId" });
    }

    // Only the class's own teacher may change its lessons.
    const firestore = db();
    const classRef = firestore.doc(`classes/${classId}`);
    const classSnap = await classRef.get();
    if (!classSnap.exists || classSnap.get("teacherId") !== uid) {
      return res.status(403).json({ error: "You don't teach this class" });
    }

    const [linksSnap, rosterSnap, membersSnap] = await Promise.all([
      classRef.collection("classLessons").get(),
      classRef.collection("students").get(),
      // Students whose account points at this class, even if missing from the roster.
      firestore.collection("users").where("classId", "==", classId).get(),
    ]);

    // Links are keyed by lesson id, or carry it in "lessonId" (older links).
    const links = linksSnap.docs.filter((link) => (link.get("lessonId") || link.id) === lessonId);
    if (!links.length) {
      return res.status(404).json({ error: "This lesson is not in the class" });
    }

    // A roster entry whose account has moved to another class keeps its progress:
    // that class may have the same lesson.
    const studentIds = new Set(membersSnap.docs.map((member) => member.id));
    const elsewhere = await Promise.all(
      rosterSnap.docs
        .filter((entry) => !studentIds.has(entry.id))
        .map((entry) => firestore.doc(`users/${entry.id}`).get()),
    );
    elsewhere
      .filter((user) => user.exists && !user.get("classId"))
      .forEach((user) => studentIds.add(user.id));

    const writes = [
      ...[...studentIds].map((studentId) => (batch) =>
        batch.delete(firestore.doc(`users/${studentId}/assignedLessons/${lessonId}`)),
      ),
      // The links go last, so a failure part-way leaves the lesson visible to retry.
      ...links.map((link) => (batch) => batch.delete(link.ref)),
    ];
    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
      const batch = firestore.batch();
      writes.slice(start, start + BATCH_LIMIT).forEach((write) => write(batch));
      await batch.commit();
    }

    return res.status(200).json({ removed: true, studentsCleared: studentIds.size });
  } catch (err) {
    console.error("remove-class-lesson failed", err);
    return res.status(500).json({ error: "Could not remove the lesson" });
  }
}
