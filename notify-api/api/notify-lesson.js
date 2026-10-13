import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, db, messaging } from "../lib/firebase.js";

// POST /api/notify-lesson
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, lessonIds: [...] }
//
// Checks that the caller teaches the class, saves the notification to
// classes/{classId}/notifications (the students' notification list) and sends a
// data message to the FCM topic "class_<classId>". The Android app builds the
// notification itself and holds it until visibleAt (the lesson's open date).

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TIME_ZONE = process.env.NOTIFY_TIME_ZONE || "Asia/Manila";
const formatter = new Intl.DateTimeFormat("fil-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function allowCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

const when = (timestamp) => formatter.format(timestamp.toDate());

/** All lessons added together share one schedule, so the first link speaks for all. */
function buildMessage(lessons, link) {
  const deadline = link.dueAt ? `Deadline: ${when(link.dueAt)}` : "Walang deadline";
  if (lessons.length === 1) {
    return {
      title: `📘 Bagong aralin: ${lessons[0].title}`,
      body: deadline,
    };
  }
  const titles = lessons.map((lesson) => lesson.title).join(", ");
  return {
    title: `📘 ${lessons.length} bagong aralin`,
    body: `${titles}\n${deadline}`,
  };
}

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // 1. Who is calling?
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Not signed in" });
    let uid;
    try {
      ({ uid } = await adminAuth().verifyIdToken(token));
    } catch {
      return res.status(401).json({ error: "Sign-in expired. Reload the page." });
    }

    // 2. What to send?
    const { classId, lessonIds } = req.body || {};
    const ids = Array.isArray(lessonIds) ? [...new Set(lessonIds)] : [];
    if (
      !ID_PATTERN.test(classId || "") ||
      !ids.length ||
      ids.length > 30 ||
      !ids.every((id) => ID_PATTERN.test(String(id)))
    ) {
      return res.status(400).json({ error: "Invalid classId or lessonIds" });
    }

    // 3. Only the class's own teacher may notify its students.
    const firestore = db();
    const classSnap = await firestore.doc(`classes/${classId}`).get();
    if (!classSnap.exists || classSnap.get("teacherId") !== uid) {
      return res.status(403).json({ error: "You don't teach this class" });
    }

    const linkRefs = ids.map((id) => firestore.doc(`classes/${classId}/classLessons/${id}`));
    const lessonRefs = ids.map((id) => firestore.doc(`lessons/${id}`));
    const [linkSnaps, lessonSnaps] = await Promise.all([
      firestore.getAll(...linkRefs),
      firestore.getAll(...lessonRefs),
    ]);
    if (linkSnaps.some((snap) => !snap.exists)) {
      return res.status(404).json({ error: "Lesson is not in this class" });
    }
    const lessons = lessonSnaps.map((snap) => ({
      title: (snap.exists && snap.get("title")) || "Aralin",
    }));

    // 4. Students see it once the lesson opens (or right away when it has no open date).
    const link = linkSnaps[0].data();
    const { title, body } = buildMessage(lessons, link);
    const visibleAt = Timestamp.fromMillis(
      Math.max(Date.now(), link.openAt ? link.openAt.toMillis() : 0),
    );
    const feedRef = firestore.collection(`classes/${classId}/notifications`).doc();

    // 5. Send, then save it to the class's notification list and clear the "not notified yet" flag.
    await messaging().send({
      topic: `class_${classId}`,
      data: {
        type: "new_lesson",
        notificationId: feedRef.id,
        classId,
        lessonIds: ids.join(","),
        title,
        body,
        visibleAt: String(visibleAt.toMillis()),
      },
      android: { priority: "high" },
    });

    const batch = firestore.batch();
    batch.set(feedRef, {
      type: "new_lesson",
      lessonIds: ids,
      title,
      body,
      visibleAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    linkRefs.forEach((ref) =>
      batch.update(ref, { notifyPending: false, notifiedAt: FieldValue.serverTimestamp() }),
    );
    await batch.commit();

    return res.status(200).json({ sent: true, lessons: ids.length });
  } catch (err) {
    console.error("notify-lesson failed", err);
    return res.status(500).json({ error: "Could not send the notification" });
  }
}
