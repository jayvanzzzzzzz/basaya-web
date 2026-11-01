import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { historyRef, canRestore, readEnrollmentProgress, applyEnrollmentProgress } from "./classProgress.js";

export class MembershipError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new MembershipError(status, message); };
const text = (value) => typeof value === "string" ? value.trim() : "";
const nameOf = (profile) => {
  const first = [text(profile.firstName), text(profile.middleName)].filter(Boolean).join(" ");
  return [text(profile.lastName), first].filter(Boolean).join(", ") || text(profile.displayName) || "Student";
};

/** Server-only code lookup; a profile transaction serializes requests from every device. */
export async function requestClassJoin(firestore, uid, rawCode) {
  const code = text(rawCode).toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) fail(400, "Check the class code supplied by your teacher.");
  const userRef = firestore.doc(`users/${uid}`);
  const limitRef = firestore.doc(`joinRequestLimits/${uid}`);
  // Rate limit valid and invalid code guesses before looking up any class.
  await firestore.runTransaction(async (tx) => {
    const [user, limit] = await tx.getAll(userRef, limitRef);
    if (user.get("role") !== "student") fail(403, "Only students can request to join a class.");
    if (text(user.get("classId"))) fail(409, "You already belong to a class. Ask your teacher before changing classes.");
    const now = Date.now();
    const recent = (limit.get("attempts") || []).filter((time) => time > now - 3600000);
    if (recent.length >= 20) fail(429, "Too many code attempts. Please try again in an hour.");
    tx.set(limitRef, { attempts: [...recent, now], expiresAt: Timestamp.fromMillis(now + 3600000) });
  });
  const matches = await firestore.collection("classes").where("classCode", "==", code).limit(2).get();
  if (matches.size !== 1) fail(404, "No class was found. Check the code with your teacher.");
  const classRef = matches.docs[0].ref;
  return firestore.runTransaction(async (tx) => {
    const [user, classroom] = await tx.getAll(userRef, classRef);
    if (user.get("role") !== "student") fail(403, "Only students can request to join a class.");
    if (text(user.get("classId"))) fail(409, "You already belong to a class.");
    if (!classroom.exists || classroom.get("classCode") !== code || classroom.get("membershipClosed") === true) fail(404, "This class code is no longer available.");
    const teacherId = text(classroom.get("teacherId"));
    if (!teacherId || (await tx.get(firestore.doc(`users/${teacherId}`))).get("role") !== "teacher") {
      fail(409, "This class is not accepting requests. Please contact your teacher.");
    }
    const previous = user.get("joinRequest");
    if (previous?.status === "pending") {
      if (previous.classId !== classRef.id) fail(409, "You already have a pending request. Wait for your teacher's decision.");
      return { status: "pending", classId: classRef.id, className: classroom.get("className") || "Your class" };
    }
    const requestRef = classRef.collection("joinRequests").doc(uid);
    const requestId = randomUUID();
    const className = classroom.get("className") || "Your class";
    const requestedAt = FieldValue.serverTimestamp();
    const previousProgress = await tx.get(historyRef(firestore, uid, classRef.id));
    tx.set(requestRef, { studentId: uid, requestId, status: "pending", fullName: nameOf(user.data()), requestedAt, hasPreviousProgress: canRestore(previousProgress) });
    tx.update(userRef, { joinRequest: { classId: classRef.id, className, requestId, status: "pending", requestedAt } });
    return { status: "pending", classId: classRef.id, className };
  });
}

/** Each decision is atomic and re-checks ownership. requestId prevents stale-screen approvals. */
export async function reviewClassJoins(firestore, teacherId, classId, requests, action) {
  const teacherRef = firestore.doc(`users/${teacherId}`);
  const classRef = firestore.doc(`classes/${classId}`);
  const [teacher, classroom] = await firestore.getAll(teacherRef, classRef);
  if (teacher.get("role") !== "teacher" || classroom.get("teacherId") !== teacherId || classroom.get("membershipClosed") === true) fail(403, "Only this class's teacher can review requests for an active class.");
  const results = [];
  // Sequential transactions avoid contention on chat/state during bulk approval.
  for (const { studentId, requestId, progressMode } of requests) {
    const result = await firestore.runTransaction(async (tx) => {
      const requestRef = classRef.collection("joinRequests").doc(studentId);
      const userRef = firestore.doc(`users/${studentId}`);
      const rosterRef = classRef.collection("students").doc(studentId);
      const [owner, currentClass, request, user, roster] = await tx.getAll(teacherRef, classRef, requestRef, userRef, rosterRef);
      if (owner.get("role") !== "teacher" || currentClass.get("teacherId") !== teacherId || currentClass.get("membershipClosed") === true) fail(403, "You can no longer review requests for this class.");
      if (!request.exists || request.get("requestId") !== requestId || request.get("status") !== "pending") {
        return { studentId, status: "already-reviewed" };
      }
      const pointer = user.get("joinRequest");
      if (user.get("role") !== "student" || pointer?.classId !== classId || pointer?.requestId !== requestId || pointer?.status !== "pending" || text(user.get("classId")) || roster.exists) {
        tx.update(requestRef, { status: "superseded", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: teacherId });
        return { studentId, status: "changed", message: "The student's membership changed. Refresh before reviewing." };
      }
      const progress = action === "approve" ? await readEnrollmentProgress(tx, firestore, userRef, classId, progressMode) : null;
      const status = action === "approve" ? "approved" : "declined";
      tx.update(requestRef, { status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: teacherId });
      if (action === "decline") {
        tx.update(userRef, { joinRequest: { ...pointer, status, reviewedAt: FieldValue.serverTimestamp() } });
      } else {
        const fullName = nameOf(user.data());
        applyEnrollmentProgress(tx, userRef, classId, progress);
        tx.create(rosterRef, {
          fullName, joinedAt: progress.restore && progress.archive.get("joinedAt") || FieldValue.serverTimestamp(),
          approvedAt: FieldValue.serverTimestamp(), progressMode: progress.restore ? "restore" : "fresh",
        });
        tx.update(userRef, {
          classId, className: currentClass.get("className") || "", joinRequest: FieldValue.delete(),
          progressSession: progress.progressSession,
          skillSummary: progress.restore && progress.archive.get("skillSummary") || FieldValue.delete(),
        });
        // A deterministic message id makes retries incapable of duplicating the join notice.
        tx.create(classRef.collection("messages").doc(`join-${requestId}`), {
          kind: "join", text: "", senderId: studentId, senderName: fullName, role: "student", sentAt: FieldValue.serverTimestamp(),
        });
        tx.set(classRef.collection("chat").doc("state"), {
          lastAt: FieldValue.serverTimestamp(), lastText: "", lastSenderName: fullName, lastRole: "join",
        }, { merge: true });
      }
      return { studentId, status };
    });
    results.push(result);
  }
  return { results };
}
