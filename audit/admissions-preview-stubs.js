// Fictional preview data only. This module never imports Firebase or contacts the API.
export const db = {};
export const state = { user: { uid: 'preview-teacher' } };
export const lastRead = () => 0;
export const Timestamp = { fromMillis: value => value };
export const postToApi = async () => ({ submissions: [] });
export const $ = (selector, root = document) => root.querySelector(selector);
export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const collection = (_, ...parts) => ({ path: parts.join("/") });
export const doc = collection;
export const query = (reference) => reference;
export const where = () => ({});
export const limit = () => ({});
export const deleteField = () => "__DELETE__";
export const serverTimestamp = () => new Date();
const listeners = new Map();
let students = [
  { studentId: "sample-ana", requestId: "sample-request-ana", fullName: "Dela Cruz, Ana", hasPreviousProgress: true, requestedAt: new Date(Date.now() - 3600000) },
  { studentId: "sample-miguel", requestId: "sample-request-miguel", fullName: "Reyes, Miguel", requestedAt: new Date(Date.now() - 2700000) },
  { studentId: "sample-sofia", requestId: "sample-request-sofia", fullName: "Santos, Sofia", hasPreviousProgress: true, requestedAt: new Date(Date.now() - 1800000) },
  { studentId: "sample-gabriel", requestId: "sample-request-gabriel", fullName: "Garcia, Gabriel", requestedAt: new Date(Date.now() - 900000) },
];
let roster = [
  { id: "sample-leave-isa", fullName: "Ramos, Isabella", leaveRequest: { reason: "I have transferred to another section.", requestedAt: new Date(Date.now() - 7200000) } },
  { id: "sample-leave-paolo", fullName: "Cruz, Paolo", leaveRequest: { reason: "Our teacher asked me to join the new class.", requestedAt: new Date(Date.now() - 5400000) } },
];
const snapshot = (item, id) => ({ id, exists: () => Boolean(item), data: () => item, get: (key) => item?.[key] });
function emit() { for (const [callback, reference] of listeners) { const docs = reference.path.endsWith("joinRequests") ? students.map((item) => snapshot(item, item.studentId)) : roster.map((item) => snapshot(item, item.id)); callback({ docs, empty: docs.length === 0 }); } }
export function onSnapshot(reference, callback) { listeners.set(callback, reference); emit(); return () => listeners.delete(callback); }
export async function getDoc(reference) { const item = roster.find((item) => item.id === reference.path.split("/").at(-1)); return snapshot(item, item?.id); }
export async function runTransaction(_, callback) { await callback({ get: getDoc, update: (reference, fields) => { const student = roster.find((item) => item.id === reference.path.split("/").at(-1)); for (const [key, value] of Object.entries(fields)) value === "__DELETE__" ? delete student[key] : student[key] = value; } }); emit(); }
export async function removeStudent(_, id) { await new Promise((resolve) => setTimeout(resolve, 400)); roster = roster.filter((item) => item.id !== id); emit(); }
export function openModal(html, mount, options = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "preview-modal";
  backdrop.innerHTML = `<div class="preview-modal__content" role="dialog" aria-modal="true"><button class="preview-modal__close" aria-label="Close">×</button>${html}</div>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".preview-modal__close").onclick = async () => { if (!options.beforeClose || await options.beforeClose()) close(); };
  mount(backdrop, close);
}
export function notify({ title, message }) {
  $("#preview-status").textContent = `${title}. ${message}`;
}
export async function reviewJoinRequests(classId, requests, action) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const ids = new Set(requests.map((item) => item.requestId));
  students = students.filter((item) => !ids.has(item.requestId));
  emit();
  return { results: requests.map((item) => ({ studentId: item.studentId, status: action === "approve" ? "approved" : "declined" })) };
}
