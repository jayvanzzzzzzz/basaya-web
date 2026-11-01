import { db } from "../lib/firebase.js";
import { allowCors, requireUser } from "../lib/http.js";
import { MembershipError, requestClassJoin } from "../lib/classMembership.js";

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    return res.status(200).json(await requestClassJoin(db(), uid, req.body?.code));
  } catch (error) {
    if (error instanceof MembershipError) return res.status(error.status).json({ error: error.message });
    console.error("join-class failed:", error);
    return res.status(500).json({ error: "Your request could not be sent. Please try again." });
  }
}
