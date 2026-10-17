import { adminAuth, db } from "../lib/firebase.js";
import { allowCors } from "../lib/http.js";
import { withinRateLimit } from "../lib/rateLimit.js";
import { contactEmail } from "../lib/emails.js";
import { contactInbox, sendMail } from "../lib/mailer.js";

// POST /api/contact
// Body: { name, email, topic, message, page?, website?, photo?: { name, type, data } }
//   photo.data is base64 (the site shrinks photos before sending).
// Optional header: Authorization: Bearer <ID token>, to label the sender's role.
//
// Public (the login page uses it too), so it guards itself:
//   - only ALLOWED_ORIGINS may call it from a browser (CORS)
//   - "website" is a honeypot: hidden from people, filled in by bots
//   - at most RATE_LIMIT messages per hour per IP (contactLimits/{hash of IP})
// Then it emails the message (with the photo attached) to CONTACT_TO / GMAIL_USER.

export const TOPICS = ["Question", "Report a problem", "Feedback", "Account help"];
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const RATE_LIMIT = 5;
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

/** "Teacher" / "Admin" when a valid sign-in token comes along; otherwise null. */
async function senderRole(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { uid } = await adminAuth().verifyIdToken(token);
    const role = (await db().doc(`users/${uid}`).get()).get("role");
    return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)} (signed in)` : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = req.body || {};
    // Bots fill every field. Pretend it worked so they don't adapt.
    if (body.website) return res.status(200).json({ ok: true });

    const { value, error } = validate(body);
    if (error) return res.status(400).json({ error });

    if (!(await withinRateLimit(req, "contactLimits", RATE_LIMIT))) {
      return res
        .status(429)
        .json({ error: "You've sent several messages already. Please try again in an hour." });
    }

    const email = contactEmail({
      ...value,
      role: await senderRole(req),
      sentAt: new Date(),
      attachment: value.photo && { filename: value.photo.filename, size: value.photo.content.length },
    });
    await sendMail({
      to: contactInbox(),
      replyTo: { name: value.name, address: value.email },
      ...email,
      attachments: value.photo ? [value.photo] : [],
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("contact failed:", error);
    return res.status(500).json({ error: "We couldn't send your message right now. Please try again later." });
  }
}
