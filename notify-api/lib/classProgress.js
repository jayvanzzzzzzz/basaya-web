import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

export class ProgressError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const historyRef = (firestore, uid, classId) => firestore.doc(`users/${uid}/classProgress/${classId}`);
// progressCount counts saved lesson documents, including a single unfinished
// lecture or 3/5 pronunciation words. No completed part/lesson is required.
export const canRestore = (history) => Boolean(history?.get("latestArchiveId") && history.get("progressCount") > 0);

/** A single transaction copies the accepted snapshot before detaching membership.
 * Failure leaves both the roster and all active progress intact. Each leave creates
 * an immutable snapshot; starting fresh never overwrites previous results.
 */
export async function archiveClassMember(firestore, teacherId, classId, studentId) {
  const archiveId = randomUUID();
  const legacySession = randomUUID();
  return firestore.runTransaction(async (tx) => {
    const userRef = firestore.doc(`users/${studentId}`);
    const rosterRef = firestore.doc(`classes/${classId}/students/${studentId}`);
    const history = historyRef(firestore, studentId, classId);
    const [teacher, classroom, user, roster] = await tx.getAll(
      firestore.doc(`users/${teacherId}`), firestore.doc(`classes/${classId}`), userRef, rosterRef,
    );
    if (teacher.get("role") !== "teacher" || !classroom.exists || classroom.get("teacherId") !== teacherId || classroom.get("membershipClosed") === true) {
      throw new ProgressError(403, "You don't teach this active class.");
    }
    if (!roster.exists) throw new ProgressError(404, "This student is not in the class.");
    if (!user.exists || user.get("classId") !== classId) throw new ProgressError(409, "The student's class changed. Refresh before removing them.");
    const progress = await tx.get(userRef.collection("assignedLessons"));
    const archive = history.collection("archives").doc(archiveId);
    const progressSession = user.get("progressSession") || legacySession;
    const joinedAt = roster.get("joinedAt") || null;
    tx.create(archive, {
      classId, className: classroom.get("className") || "", studentId,
      progressSession, joinedAt, progressCount: progress.size,
      skillSummary: user.get("skillSummary") || null,
      archivedAt: FieldValue.serverTimestamp(), archivedBy: teacherId,
    });
    for (const lesson of progress.docs) {
      tx.create(archive.collection("lessons").doc(lesson.id), lesson.data());
      tx.delete(lesson.ref);
    }
    tx.set(history, {
      latestArchiveId: archiveId, progressCount: progress.size,
      className: classroom.get("className") || "", archivedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(rosterRef);
    tx.update(userRef, {
      classId: FieldValue.delete(), className: FieldValue.delete(),
      progressSession: FieldValue.delete(), skillSummary: FieldValue.delete(),
    });
    return { removed: true, lessonsArchived: progress.size };
  });
}

/** Reads only; call before the enrollment transaction starts making writes. */
export async function readEnrollmentProgress(tx, firestore, userRef, classId, mode) {
  const history = await tx.get(historyRef(firestore, userRef.id, classId));
  const available = canRestore(history);
  if (mode === "restore" && !available) throw new ProgressError(409, "There is no saved progress to restore for this class. Refresh the requests.");
  const restore = available && mode !== "fresh";
  const archive = restore ? await tx.get(history.ref.collection("archives").doc(history.get("latestArchiveId"))) : null;
  if (restore && !archive.exists) throw new ProgressError(409, "Saved progress is unavailable. No membership was changed.");
  const saved = restore ? await tx.get(archive.ref.collection("lessons")) : null;
  if (restore && (saved.size !== archive.get("progressCount") || !archive.get("progressSession"))) {
    throw new ProgressError(409, "The saved progress record is incomplete. No membership was changed.");
  }
  const active = await tx.get(userRef.collection("assignedLessons"));
  return { restore, archive, saved, active, progressSession: restore ? archive.get("progressSession") : randomUUID() };
}

export function applyEnrollmentProgress(tx, userRef, classId, progress) {
  // Active progress is a compatibility projection for both existing clients.
  // Clear it even on a first join: stale legacy documents must not cross classes.
  const restored = new Set(progress.saved?.docs.map((doc) => doc.id) || []);
  for (const lesson of progress.active.docs) if (!restored.has(lesson.id)) tx.delete(lesson.ref);
  for (const lesson of progress.saved?.docs || []) tx.set(userRef.collection("assignedLessons").doc(lesson.id), {
    ...lesson.data(), classId, progressSession: progress.progressSession,
  });
}
