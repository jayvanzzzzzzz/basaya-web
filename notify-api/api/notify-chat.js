import { db, messaging } from "../lib/firebase.js";
import { ID_PATTERN, allowCors, requireUser } from "../lib/http.js";

// POST /api/notify-chat
// Headers: Authorization: Bearer <teacher's Firebase ID token>
// Body:    { classId, messageId }
//
// Pushes a teacher's class chat message to the class's phones (FCM topic "class_<classId>").
// Only the class's teacher, only their own fresh message: students' messages don't push,
// so phones aren't flooded. The Android app shows it unless the chat is already open.

const FRESH_MS = 2 * 60 * 1000;
const PREVIEW = 140;

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const uid = await requireUser(req, res);
    if (!uid) return;

    const { classId, messageId } = req.body || {};
    if (!ID_PATTERN.test(classId || "") || !ID_PATTERN.test(messageId || "")) {
      return res.status(400).json({ error: "Invalid classId or messageId" });
    }

    const firestore = db();
    const [classSnap, messageSnap] = await Promise.all([
      firestore.doc(`classes/${classId}`).get(),
      firestore.doc(`classes/${classId}/messages/${messageId}`).get(),
    ]);
    if (!classSnap.exists || classSnap.get("teacherId") !== uid) {
      return res.status(403).json({ error: "You don't teach this class" });
    }
    if (!messageSnap.exists) return res.status(404).json({ error: "Message not found" });

    const message = messageSnap.data();
    const sentAt = message.sentAt?.toMillis?.() || 0;
    if (message.senderId !== uid || message.role !== "teacher" || message.deleted) {
      return res.status(403).json({ error: "Only your own messages can be pushed" });
    }
    // One push per message, and only while it's new (no re-sending old ones).
    if (Date.now() - sentAt > FRESH_MS || message.pushedAt) {
      return res.status(409).json({ error: "Already sent or too old" });
    }

    const className = classSnap.get("className") || "Klase";
    const text = String(message.text || "");
    await messaging().send({
      topic: `class_${classId}`,
      data: {
        type: "chat_message",
        classId,
        messageId,
        title: `💬 ${className}`,
        body: `${message.senderName || "Guro"}: ${text.length > PREVIEW ? `${text.slice(0, PREVIEW - 1)}…` : text}`,
        sentAt: String(sentAt),
      },
      android: { priority: "high" },
    });
    await messageSnap.ref.update({ pushedAt: new Date() });

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("notify-chat failed", err);
    return res.status(500).json({ error: "Could not send the notification" });
  }
}
