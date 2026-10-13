import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireAdmin, requireUser } from "../lib/http.js";

// POST /api/delete-class
// Headers: Authorization: Bearer <admin's Firebase ID token>
// Body:    { classId }
//
// Admin only (approving a teacher's deletion request, or deleting directly). Removes:
//   - classes/{classId} and its students, classLessons, notifications and class chat
//     (messages, chat state, chatSenders)
//   - every student's progress for this class's lessons (users/{uid}/assignedLessons/{lessonId})
//   - their class link and skill summary (users/{uid}.classId / className / skillSummary),
//     so the app shows "Join a class"
// Student accounts and the lessons themselves (lessons/{id}) stay.

const BATCH_LIMIT = 450;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    if (!(await requireAdmin(uid, res))) return;

    const { classId } = req.body || {};
    if (!ID_PATTERN.test(classId || "")) {
      return res.status(400).json({ error: "Invalid classId" });
    }

    const firestore = db();
    const classRef = firestore.doc(`classes/${classId}`);
    const [classSnap, rosterSnap, linksSnap, feedSnap, membersSnap, ...chatSnaps] = await Promise.all([
      classRef.get(),
      classRef.collection("students").get(),
      classRef.collection("classLessons").get(),
      classRef.collection("notifications").get(),
      // Students whose account still points at this class, even if missing from the roster.
      firestore.collection("users").where("classId", "==", classId).get(),
      classRef.collection("messages").get(),
      classRef.collection("chat").get(),
      classRef.collection("chatSenders").get(),
    ]);
    if (!classSnap.exists) {
      return res.status(404).json({ error: "This class no longer exists" });
    }

    const lessonIds = [
      ...new Set(linksSnap.docs.map((link) => link.get("lessonId") || link.id)),
    ];
    const studentIds = [
      ...new Set([...rosterSnap.docs.map((d) => d.id), ...membersSnap.docs.map((d) => d.id)]),
    ];
    const pointsHere = new Set(membersSnap.docs.map((d) => d.id));

    const writes = [];
    studentIds.forEach((studentId) => {
      const userRef = firestore.doc(`users/${studentId}`);
      lessonIds.forEach((lessonId) =>
        writes.push((batch) => batch.delete(userRef.collection("assignedLessons").doc(lessonId))),
      );
      if (pointsHere.has(studentId)) {
        writes.push((batch) =>
          batch.update(userRef, {
            classId: FieldValue.delete(),
            className: FieldValue.delete(),
            skillSummary: FieldValue.delete(),
          }),
        );
      }
    });
    [rosterSnap, linksSnap, feedSnap, ...chatSnaps].forEach((snap) =>
      snap.docs.forEach((item) => writes.push((batch) => batch.delete(item.ref))),
    );
    // The class itself goes last, so a failure part-way leaves it visible to retry.
    writes.push((batch) => batch.delete(classRef));

    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
      const batch = firestore.batch();
      writes.slice(start, start + BATCH_LIMIT).forEach((write) => write(batch));
      await batch.commit();
    }

    return res.status(200).json({
      deleted: true,
      students: studentIds.length,
      lessons: lessonIds.length,
    });
  } catch (err) {
    console.error("delete-class failed", err);
    return res.status(500).json({ error: "Could not delete the class" });
  }
}
