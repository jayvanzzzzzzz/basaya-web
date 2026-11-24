import { allowCors, requireUser, requireAdmin } from "../lib/http.js";

// Retired: classes now use the authenticated archive/restore lifecycle.
export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const uid = await requireUser(req, res);
  if (!uid || !await requireAdmin(uid, res)) return;
  return res.status(410).json({ error: "Class deletion is no longer available. Archive the class instead." });
}
