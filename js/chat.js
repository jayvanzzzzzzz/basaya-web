import {
  collection,
  doc,
  getDoc,
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
// teacher (teacher/) and the class's students (student/ and the Android app). Rules: firestore.rules
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

// ---------- Students (student/ on this site, ClassChat.kt in the app) ----------

export const STUDENT_COOLDOWN_MS = 5_000;
export const DELETE_WINDOW_MS = 5 * 60_000;

/** The student's name as the class roster has it (the rules check messages against it). */
export async function rosterName(classId, uid) {
  const snap = await getDoc(doc(db, "classes", classId, "students", uid));
  return snap.get("fullName") || "";
}

/**
 * A student sends with one batch: the message, their last-send time (for the 5-second
 * limit) and the class's summary. Throws if the rules refuse it (too fast, chat closed).
 */
export async function sendStudentMessage(classId, uid, name, text) {
  const body = text.trim();
  if (!body || body.length > STUDENT_MAX) return;
  const batch = writeBatch(db);
  batch.set(doc(messagesOf(classId)), {
    text: body,
    senderId: uid,
    senderName: name,
    role: "student",
    sentAt: serverTimestamp(),
  });
  batch.set(doc(db, "classes", classId, "chatSenders", uid), { lastSentAt: serverTimestamp() });
  batch.set(
    stateOf(classId),
    { lastAt: serverTimestamp(), lastText: body.slice(0, 120), lastSenderName: name, lastRole: "student" },
    { merge: true },
  );
  await batch.commit();
}

// Filipino surname prefixes that belong to the surname: "Juan Dela Cruz" → "Dela Cruz, Juan".
const SURNAME_PARTICLES = new Set(["de", "del", "dela", "delos", "la", "las", "los", "san", "santa", "sta", "sto", "santo", "di", "da", "dos", "van", "von"]);
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
// "Gng. Santos" reads wrong reordered, so names that start with a title stay as written.
const NAME_TITLES = new Set(["gng", "g", "bb", "mr", "mrs", "ms", "dr", "sir", "maam", "ma'am", "teacher"]);

/**
 * A teacher's name as "Last, First" (students are already saved that way). Teachers only
 * have one display name ("Juan Dela Cruz"), so it is reordered when shown; names that
 * already have a comma, or are one word, stay as they are. Same as ClassChat.kt in the app.
 */
export function lastFirst(name = "") {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.includes(",")) return clean;
  const words = clean.split(" ");
  const key = (word) => word.toLowerCase().replace(/\./g, "");
  if (NAME_TITLES.has(key(words[0]))) return clean;
  const suffix = words.length > 2 && NAME_SUFFIXES.has(key(words.at(-1))) ? words.pop() : "";
  if (words.length < 2) return clean;
  let start = words.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(key(words[start - 1]))) start -= 1;
  const first = [...words.slice(0, start), suffix].filter(Boolean).join(" ");
  return `${words.slice(start).join(" ")}, ${first}`;
}

// How a teacher wants students to address them (users/{uid}.title); "" = name only.
export const TEACHER_TITLES = { maam: "Ma'am", sir: "Sir" };
const titleOf = (title) => TEACHER_TITLES[title] || "";
const startsWithTitle = (name) => NAME_TITLES.has(name.split(" ")[0].toLowerCase().replace(/\./g, ""));

/**
 * The teacher as students see them: "Ma'am Reyes" / "Sir Dela Cruz" when a title is picked,
 * else "Reyes, Ana" (lastFirst). A name that already starts with a title stays as written.
 * Same as ClassChat.teacherName() in the app.
 */
export function teacherName(name = "", title = "") {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!titleOf(title) || !clean || startsWithTitle(clean)) return lastFirst(clean);
  const surname = lastFirst(clean).split(",")[0].trim();
  return `${titleOf(title)} ${surname}`;
}

/** The full name with the title in front, for reports: "Ma'am Ana Reyes". */
export function titledFullName(name = "", title = "") {
  const clean = name.trim().replace(/\s+/g, " ");
  return titleOf(title) && clean && !startsWithTitle(clean) ? `${titleOf(title)} ${clean}` : clean;
}

/** The class's teacher (id and title), so their chat messages can show "Ma'am Reyes". */
export async function loadClassTeacher(classId) {
  try {
    const teacherId = (await getDoc(doc(db, "classes", classId))).get("teacherId");
    if (!teacherId) return null;
    const snap = await getDoc(doc(db, "users", teacherId));
    return snap.exists() ? { id: teacherId, title: snap.get("title") || "" } : null;
  } catch (error) {
    console.warn("Couldn't read the class's teacher", error);
    return null;
  }
}

/** A student can delete their own message within 5 minutes; it stays in place as "deleted". */
export const canDeleteOwn = (message, uid, now = Date.now()) =>
  !message.deleted && !message.pending && message.senderId === uid && now - message.sentAt < DELETE_WINDOW_MS;

export const deleteOwnMessage = (classId, messageId) =>
  updateDoc(doc(messagesOf(classId), messageId), { text: "", deleted: true, deletedBy: "sender" });

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
