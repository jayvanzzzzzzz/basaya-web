import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";

// POST /api/remove-student
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, studentId }
//
// Removes a student from a class the caller teaches:
//   - classes/{classId}/students/{studentId}         (the roster entry)
//   - users/{studentId}/assignedLessons/{lessonId}    (progress, for this class's lessons only)
//   - users/{studentId}.classId / className / skillSummary (if still pointing at this class)
// The account itself stays, so the student can join again with the class code.
// Done with the Admin SDK because Firestore rules only let students write their own data.

const BATCH_LIMIT = 450;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid) return;

    const { classId, studentId } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(studentId || "")) {
      return res.status(400).json({ error: "Invalid classId or studentId" });
    }

    // Only the class's own teacher may remove its students.
    const firestore = db();
    const classSnap = await firestore.doc(`classes/${classId}`).get();
    if (!classSnap.exists || classSnap.get("teacherId") !== uid) {
      return res.status(403).json({ error: "You don't teach this class" });
    }

    const rosterRef = firestore.doc(`classes/${classId}/students/${studentId}`);
    const userRef = firestore.doc(`users/${studentId}`);
    const [rosterSnap, userSnap, linksSnap] = await Promise.all([
      rosterRef.get(),
      userRef.get(),
      firestore.collection(`classes/${classId}/classLessons`).get(),
    ]);
    if (!rosterSnap.exists) {
      return res.status(404).json({ error: "This student is not in the class" });
    }

    // Links are keyed by lesson id, or carry it in "lessonId" (older links).
    const lessonIds = [
      ...new Set(linksSnap.docs.map((link) => link.get("lessonId") || link.id)),
    ];

    const writes = [
      (batch) => batch.delete(rosterRef),
      ...lessonIds.map((lessonId) => (batch) =>
        batch.delete(userRef.collection("assignedLessons").doc(lessonId)),
      ),
    ];
    // Don't touch a student who has already moved to another class.
    if (userSnap.exists && userSnap.get("classId") === classId) {
      writes.push((batch) =>
        batch.update(userRef, {
          classId: FieldValue.delete(),
          className: FieldValue.delete(),
          skillSummary: FieldValue.delete(),
        }),
      );
    }

    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
      const batch = firestore.batch();
      writes.slice(start, start + BATCH_LIMIT).forEach((write) => write(batch));
      await batch.commit();
    }

    return res.status(200).json({ removed: true, lessonsCleared: lessonIds.length });
  } catch (err) {
    console.error("remove-student failed", err);
    return res.status(500).json({ error: "Could not remove the student" });
  }
}
