import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { postToApi } from "./api.js";

// Class chat: one group chat per class (classes/{classId}/messages), shared by the
// teacher (this site) and the class's students (the Android app). Rules: firestore.rules
// ("Class chat"). Reads are kept low: only the latest PAGE messages are live, older ones
// load on request, and unread badges come from chat/state (one small doc per class).

export const PAGE = 30;
export const TEACHER_MAX = 2000;
export const STUDENT_MAX = 300;

const messagesOf = (classId) => collection(db, "classes", classId, "messages");
const stateOf = (classId) => doc(db, "classes", classId, "chat", "state");

/** A message with its time as millis (pending server times are estimated). */
function toMessage(snap) {
  const data = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    text: data.text || "",
    senderId: data.senderId || "",
    senderName: data.senderName || "",
    role: data.role || "student",
    sentAt: data.sentAt?.toMillis?.() || Date.now(),
    deleted: data.deleted === true,
    deletedBy: data.deletedBy || "",
    pending: snap.metadata.hasPendingWrites,
    snap,
  };
}

/** Live latest PAGE messages, oldest first. Returns unsubscribe. */
export function watchRecent(classId, onChange, onError) {
  return onSnapshot(
    query(messagesOf(classId), orderBy("sentAt", "desc"), limit(PAGE)),
    { includeMetadataChanges: true },
    (snapshot) => onChange(snapshot.docs.map(toMessage).reverse(), snapshot.size === PAGE),
    onError,
  );
}

/** The PAGE messages before `oldest` (a message from watchRecent/loadOlder), oldest first. */
export async function loadOlder(classId, oldest) {
  const snapshot = await getDocs(
    query(messagesOf(classId), orderBy("sentAt", "desc"), startAfter(oldest.snap), limit(PAGE)),
  );
  return { messages: snapshot.docs.map(toMessage).reverse(), more: snapshot.size === PAGE };
}

/** Live chat/state: { open, lastAt (millis), lastText, lastSenderName, lastRole }. */
export function watchState(classId, onChange) {
  return onSnapshot(
    stateOf(classId),
    (snap) => {
      const data = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : {};
      onChange({
        open: data.open !== false,
        lastAt: data.lastAt?.toMillis?.() || 0,
        lastText: data.lastText || "",
        lastSenderName: data.lastSenderName || "",
        lastRole: data.lastRole || "",
      });
    },
    () => onChange({ open: true, lastAt: 0, lastText: "", lastSenderName: "", lastRole: "" }),
  );
}

/** Teacher posts: the message and the class's summary in one batch, then a push to the class. */
export async function sendTeacherMessage(classId, text, senderId, senderName) {
  const body = text.trim();
  if (!body) return;
  const messageRef = doc(messagesOf(classId));
  const batch = writeBatch(db);
  batch.set(messageRef, {
    text: body,
    senderId,
    senderName,
    role: "teacher",
    sentAt: serverTimestamp(),
  });
  batch.set(
    stateOf(classId),
    {
      lastAt: serverTimestamp(),
      lastText: body.slice(0, 120),
      lastSenderName: senderName,
      lastRole: "teacher",
    },
    { merge: true },
  );
  await batch.commit();
  // The push is a bonus: the message is already saved if this fails.
  postToApi("notify-chat", { classId, messageId: messageRef.id }).catch((error) =>
    console.warn("Chat push not sent", error),
  );
}

/** The teacher removes any message; it stays in place as "removed". */
export const removeMessage = (classId, messageId) =>
  updateDoc(doc(messagesOf(classId), messageId), { text: "", deleted: true, deletedBy: "teacher" });

/** Open or close the chat for students (they can still read). */
export const setChatOpen = (classId, open) => setDoc(stateOf(classId), { open }, { merge: true });

// ---------- Read state: kept on this device (free, no Firestore reads) ----------

const readKey = (uid, classId) => `basaya.chatRead.${uid}.${classId}`;

export function lastRead(uid, classId) {
  try {
    return Number(localStorage.getItem(readKey(uid, classId))) || 0;
  } catch {
    return 0;
  }
}

export function markRead(uid, classId, at) {
  try {
    if (at > lastRead(uid, classId)) localStorage.setItem(readKey(uid, classId), String(at));
  } catch {
    // Private mode: badges just won't remember.
  }
}

/** Unread when someone else posted after the teacher last looked. */
export const isUnread = (uid, classId, state, myName) =>
  state.lastAt > lastRead(uid, classId) && !(state.lastRole === "teacher" && state.lastSenderName === myName);
