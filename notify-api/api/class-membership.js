import teacherOnboarding from "../handlers/teacher-onboarding.js";
import joinClass from "../handlers/join-class.js";
import reviewRequests from "../handlers/review-join-requests.js";
import removeStudent from "../handlers/remove-student.js";
import assessment from "../handlers/assessment.js";
import assistant from "../handlers/assistant.js";
import username from "../handlers/username.js";
import { allowCors } from "../lib/http.js";

// Share one function so the new workflow stays within the existing hosting plan.
// vercel.json retains each public URL, including the existing remove-student route.
const handlers = { "username-save": username, "username-login": username, "teacher-onboarding": teacherOnboarding, request: joinClass, review: reviewRequests, remove: removeStudent, assessment, assistant };
export default function handler(req, res) {
  const operation = req.query?.operation;
  if (typeof operation === "string" && Object.hasOwn(handlers, operation)) return handlers[operation](req, res);
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  return res.status(404).json({ error: "Unknown membership operation" });
}
