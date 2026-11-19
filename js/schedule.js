import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { postToApi } from "./api.js";

// ----- Class lesson links (classes/{classId}/classLessons/{linkId}) -----
// A library lesson can be in a class twice: as an Assessment (link id = lesson id, which the
// Firestore rules and the students' progress docs rely on) and as Practice
// (link id = "{lessonId}__practice"). Older links have auto ids and keep the lesson id in a field.

export const linkLessonId = (link) => link.lessonId || link.id;
export const linkMode = (link) => (link.mode === "practice" ? "practice" : "assessment");
export const practiceLinkId = (lessonId) => `${lessonId}__practice`;

// Lesson schedule (classes/{classId}/classLessons/{linkId}.openAt / .dueAt)

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

const localDay = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Calendar limits for choosing lesson dates, using the teacher's local date. */
export function wireLessonSchedule(form, { existingSchedule = null } = {}) {
  const { openAt, dueAt } = form.elements;
  const unchanged = () => existingSchedule &&
    openAt.value === toInputValue(existingSchedule.openAt) &&
    dueAt.value === toInputValue(existingSchedule.dueAt);
  // Existing historical dates may stay unchanged. Validate edits in readSchedule,
  // while keeping today's calendar minimum even when an old date is displayed.
  if (existingSchedule) form.noValidate = true;
  const sync = () => {
    const today = localDay(new Date());
    const openingDay = openAt.value.slice(0, 10) || today;
    const firstDueDay = openingDay > today ? openingDay : today;
    openAt.min = `${today}T00:00`;
    dueAt.min = `${firstDueDay}T00:00`;
    if (!unchanged() && dueAt.value && dueAt.value.slice(0, 10) === openingDay) {
      dueAt.value = `${openingDay}T23:59`;
      dueAt.min = `${firstDueDay}T23:59`;
    }
  };
  // Refresh on focus as well, in case the dialog stays open across midnight.
  for (const input of [openAt, dueAt]) {
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    input.addEventListener("focus", sync);
  }
  sync();
}

/**
 * Reads the schedule inputs of a form. Returns { openAt, dueAt } as Timestamps (or null),
 * or { error } when the dates don't make sense.
 */
export function readSchedule(form, { allowPastDeadline = false, newLesson = false, existingSchedule = null } = {}) {
  const open = fromInputValue(form.elements.openAt?.value);
  const due = fromInputValue(form.elements.dueAt?.value);
  const now = new Date();
  if (form.elements.openAt?.validity?.badInput || (form.elements.openAt?.value && !open))
    return { error: "Pick a valid opening date and time." };
  if (form.elements.dueAt?.validity?.badInput || (form.elements.dueAt?.value && !due))
    return { error: "Pick a valid deadline date and time." };
  const unchangedOpen = existingSchedule && form.elements.openAt?.value === toInputValue(existingSchedule.openAt);
  const unchangedDue = existingSchedule && form.elements.dueAt?.value === toInputValue(existingSchedule.dueAt);
  if (newLesson || existingSchedule) {
    const today = localDay(now);
    if (open && !unchangedOpen && localDay(open) < today)
      return { error: "The opening date cannot be in the past. Pick today or a later date." };
    if (due && !unchangedDue && localDay(due) < today)
      return { error: "The deadline cannot be in the past. Pick today or a later date." };
    if (!(unchangedOpen && unchangedDue) && due && localDay(due) === localDay(open || now)) {
      due.setHours(23, 59, 0, 0);
      form.elements.dueAt.value = `${localDay(due)}T23:59`;
    }
  }
  if (open && due && due <= open)
    return { error: "The deadline must be after the open date." };
  if (due && !unchangedDue && !allowPastDeadline && due <= now)
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

// Push notifications (notify-api on Vercel)

/** Sends the "new lesson" push to every student in the class. Throws on failure. */
export const notifyStudents = (classId, lessonIds) =>
  postToApi("notify-lesson", { classId, lessonIds });

/** Tells the class a lesson's deadline was extended (push + notification list). Throws on failure. */
export const notifyDeadline = (classId, lessonId) =>
  postToApi("notify-deadline", { classId, lessonId });
