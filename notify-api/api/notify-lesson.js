import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, db, messaging } from "../lib/firebase.js";

// POST /api/notify-lesson
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, lessonIds: [...] }
//
// Checks that the caller teaches the class, then sends one push to the FCM
// topic "class_<classId>", which every student's Android app subscribes to.

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
function scheduleLine(link) {
  const parts = [];
  if (link.openAt && link.openAt.toMillis() > Date.now())
    parts.push(`Bubukas: ${when(link.openAt)}`);
  if (link.dueAt) parts.push(`Deadline: ${when(link.dueAt)}`);
  return parts.join(" · ");
}

function buildMessage(lessons, link) {
  const schedule = scheduleLine(link);
  if (lessons.length === 1) {
    return {
      title: `📘 Bagong aralin: ${lessons[0].title}`,
      body: schedule || "Buksan ang BaSaya para magsimula!",
    };
  }
  const titles = lessons.map((lesson) => lesson.title).join(", ");
  return {
    title: `📘 ${lessons.length} bagong aralin`,
    body: [titles, schedule].filter(Boolean).join("\n"),
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

    // 4. Send, then clear the "not notified yet" flag.
    const { title, body } = buildMessage(lessons, linkSnaps[0].data());
    await messaging().send({
      topic: `class_${classId}`,
      notification: { title, body },
      data: { type: "new_lesson", classId, lessonIds: ids.join(",") },
      android: {
        priority: "high",
        notification: { channelId: "new_lessons" },
      },
    });

    const batch = firestore.batch();
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
