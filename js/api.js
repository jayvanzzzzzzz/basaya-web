import { auth } from "./firebase.js";
import { notifyApiUrl } from "../firebase-config.js";

// Calls the BaSaya API on Vercel (notify-api/), as the signed-in user when there is one.

/** POSTs `body` to `/api/<path>`. Throws with the server's message on failure. */
export async function postToApi(path, body) {
  if (!notifyApiUrl) throw new Error("the BaSaya API is not set up yet");
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`${notifyApiUrl.replace(/\/+$/, "")}/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `server error (${response.status})`);
  return result;
}

/** Admin only: deletes a class with its roster, lessons and every student's progress. */
export const deleteClass = (classId) => postToApi("delete-class", { classId });

/** Removes a student from the class, with their progress for its lessons. */
export const removeStudent = (classId, studentId) =>
  postToApi("remove-student", { classId, studentId });

/** Takes a lesson out of the class, with every student's progress on it. */
export const removeClassLesson = (classId, lessonId) =>
  postToApi("remove-class-lesson", { classId, lessonId });

/** Admin only: emails the teacher a BaSaya-branded password reset link. */
export const sendPasswordReset = (teacherId) =>
  postToApi("send-password-reset", { teacherId });

/** Contact form → the team's Gmail. Works signed in or out. */
export const sendContact = (message) => postToApi("contact", message);

/** Admin only: emails a student a BaSaya-branded password reset link. */
export const sendStudentPasswordReset = (studentId) =>
  postToApi("send-password-reset", { userId: studentId });

/** Admin only: sets a temporary password for a student who can't get the reset email. */
export const setTemporaryPassword = (studentId, password) =>
  postToApi("set-temporary-password", { studentId, password });
