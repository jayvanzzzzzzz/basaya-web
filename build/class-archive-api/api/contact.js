import { db } from "../lib/firebase.js";
import { allowCors, requireUser } from "../lib/http.js";
import { contactRetryAt, reserveContact, releaseContact } from "../lib/contactCooldown.js";
import { contactEmail } from "../lib/emails.js";
import { contactInbox, sendMail } from "../lib/mailer.js";

// Signed-in accounts may send one contact message per rolling hour.
// POST {action:"status"} returns the server-owned cooldown without consuming it.

export const TOPICS = ["Question", "Report a problem", "Feedback", "Account help"];
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

const clean = (value, max) =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
/** For one-line fields: no line breaks (they'd end up in email headers). */
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, " ");

function validate(body) {
  const name = oneLine(body.name, 80);
  const email = oneLine(body.email, 254).toLowerCase();
  const topic = TOPICS.includes(body.topic) ? body.topic : "";
  const message = clean(body.message, 2000);
  const page = oneLine(body.page, 60);
  if (!name) return { error: "Please enter your name." };
  if (!EMAIL_PATTERN.test(email)) return { error: "Please enter a valid email address." };
  if (!topic) return { error: "Please choose a topic." };
  if (message.length < 10) return { error: "Please write a little more (at least 10 characters)." };

  let photo = null;
  if (body.photo) {
    const extension = PHOTO_TYPES[body.photo.type];
    const content = Buffer.from(String(body.photo.data || ""), "base64");
    if (!extension || !content.length) return { error: "The photo must be a JPG, PNG or WebP image." };
    if (content.length > MAX_PHOTO_BYTES) return { error: "The photo is too large (max 3 MB)." };
    const base = oneLine(body.photo.name, 60).replace(/\.[^.]*$/, "").replace(/[^\w.-]+/g, "-") || "photo";
    photo = { filename: `${base}.${extension}`, content, contentType: body.photo.type };
  }
  return { value: { name, email, topic, message, page, photo } };
}

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  res.setHeader("X-BASAya-Contact", "account-hour-v1");
  res.setHeader("Cache-Control", "no-store");
  let uid,claim,sent=false;
  try {
    uid=await requireUser(req,res);if(!uid)return;
    const profile=await db().doc(`users/${uid}`).get();
    if(!["student","teacher","admin"].includes(profile.get("role")))return res.status(403).json({error:"A student, teacher or admin account is required."});
    const body = req.body || {};
    if(body.action === "status")return res.status(200).json({retryAt:await contactRetryAt(db(),uid)});
    // Bots fill every field. Pretend it worked so they don't adapt.
    if (body.website) return res.status(200).json({ ok: true });

    const { value, error } = validate(body);
    if (error) return res.status(400).json({ error });

    claim=await reserveContact(db(),uid);
    if(!claim.allowed) {
      res.setHeader("Retry-After", String(Math.max(1,Math.ceil((claim.retryAt-Date.now())/1000))));
      return res.status(429).json({error:"You can send one message per hour. Please wait until your cooldown ends.",retryAt:claim.retryAt});
    }

    const email = contactEmail({
      ...value,
      role: `${profile.get("role")} (signed in)`,
      sentAt: new Date(),
      attachment: value.photo && { filename: value.photo.filename, size: value.photo.content.length },
    });
    await sendMail({
      to: contactInbox(),
      replyTo: { name: value.name, address: value.email },
      ...email,
      attachments: value.photo ? [value.photo] : [],
    });
    sent=true;
    return res.status(200).json({ ok: true, retryAt:claim.retryAt });
  } catch (error) {
    if(claim?.allowed && !sent)await releaseContact(db(),uid,claim.claimId).catch(releaseError=>console.error("contact cooldown release failed",releaseError));
    console.error("contact failed:", error);
    return res.status(500).json({ error: "We couldn't send your message right now. Please try again later." });
  }
}
