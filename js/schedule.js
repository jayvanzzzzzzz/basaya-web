import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth } from "./firebase.js";
import { notifyApiUrl } from "../firebase-config.js";

// ----- Lesson schedule (classes/{classId}/classLessons/{lessonId}.openAt / .dueAt) -----

const pad = (n) => String(n).padStart(2, "0");

/** Firestore Timestamp -> value for <input type="datetime-local"> (teacher's local time). */
export function toInputValue(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value -> Date, or null when empty. */
export function fromInputValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads the schedule inputs of a form. Returns { openAt, dueAt } as Timestamps (or null),
 * or { error } when the dates don't make sense.
 */
export function readSchedule(form, { allowPastDeadline = false } = {}) {
  const open = fromInputValue(form.elements.openAt?.value);
  const due = fromInputValue(form.elements.dueAt?.value);
  if (open && due && due <= open)
    return { error: "The deadline must be after the open date." };
  if (due && !allowPastDeadline && due <= new Date())
    return { error: "The deadline has already passed. Pick a later date." };
  return {
    openAt: open ? Timestamp.fromDate(open) : null,
    dueAt: due ? Timestamp.fromDate(due) : null,
  };
}

export function formatWhen(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "scheduled" (not open yet), "closed" (past deadline) or "open". */
export function scheduleStatus(link, now = new Date()) {
  const open = link.openAt?.toDate?.();
  const due = link.dueAt?.toDate?.();
  if (open && now < open) return "scheduled";
  if (due && now > due) return "closed";
  return "open";
}

// ----- Push notifications (notify-api on Vercel) -----

/** Sends the "new lesson" push to every student in the class. Throws on failure. */
export async function notifyStudents(classId, lessonIds) {
  if (!notifyApiUrl) throw new Error("notifications are not set up yet");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(
    `${notifyApiUrl.replace(/\/+$/, "")}/api/notify-lesson`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ classId, lessonIds }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `notification service error (${response.status})`);
  return body;
}
