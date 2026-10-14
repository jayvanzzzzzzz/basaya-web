import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, messaging } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";

// POST /api/notify-deadline
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, lessonId }
//
// Sent after the teacher extends a lesson's deadline (classLessons/{lessonId}.dueAt is
// already saved). Like notify-lesson: checks that the caller teaches the class, saves the
// item to classes/{classId}/notifications and sends a "deadline_extended" data message to
// the FCM topic "class_<classId>".

const TIME_ZONE = process.env.NOTIFY_TIME_ZONE || "Asia/Manila";
const formatter = new Intl.DateTimeFormat("fil-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // 1. Who is calling?
    const uid = await requireUser(req, res);
    if (!uid) return;

    // 2. Which lesson?
    const { classId, lessonId } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(lessonId || "")) {
      return res.status(400).json({ error: "Invalid classId or lessonId" });
    }

    // 3. Only the class's own teacher may notify its students.
    const firestore = db();
    const classSnap = await firestore.doc(`classes/${classId}`).get();
    if (!classSnap.exists || classSnap.get("teacherId") !== uid) {
      return res.status(403).json({ error: "You don't teach this class" });
    }

    const [linkSnap, lessonSnap] = await Promise.all([
      firestore.doc(`classes/${classId}/classLessons/${lessonId}`).get(),
      firestore.doc(`lessons/${lessonId}`).get(),
    ]);
    if (!linkSnap.exists) return res.status(404).json({ error: "Lesson is not in this class" });
    const dueAt = linkSnap.get("dueAt");
    if (!dueAt) return res.status(400).json({ error: "This lesson has no deadline" });

    const lessonTitle = (lessonSnap.exists && lessonSnap.get("title")) || "Aralin";
    const title = `⏰ Pinalawig ang deadline: ${lessonTitle}`;
    const body = `Bagong deadline: ${formatter.format(dueAt.toDate())}`;

    // 4. Students see it once the lesson opens (or right away when it already has).
    const openAt = linkSnap.get("openAt");
    const visibleAt = Timestamp.fromMillis(Math.max(Date.now(), openAt ? openAt.toMillis() : 0));
    const feedRef = firestore.collection(`classes/${classId}/notifications`).doc();

    // 5. Send, then save it to the class's notification list.
    await messaging().send({
      topic: `class_${classId}`,
      data: {
        type: "deadline_extended",
        notificationId: feedRef.id,
        classId,
        lessonIds: lessonId,
        title,
        body,
        visibleAt: String(visibleAt.toMillis()),
      },
      android: { priority: "high" },
    });

    await feedRef.set({
      type: "deadline_extended",
      lessonIds: [lessonId],
      title,
      body,
      visibleAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("notify-deadline failed", err);
    return res.status(500).json({ error: "Could not send the notification" });
  }
}
