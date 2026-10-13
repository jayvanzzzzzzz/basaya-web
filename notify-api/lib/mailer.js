import nodemailer from "nodemailer";

// Sends email through Gmail with an App Password (Google Account → Security →
// App passwords; needs 2-Step Verification). Vercel environment variables:
//   GMAIL_USER          the Gmail address that sends, e.g. adminbasaya@gmail.com
//   GMAIL_APP_PASSWORD  the 16-letter app password, without spaces
//   CONTACT_TO          optional: where contact messages go (default: GMAIL_USER)

let transport = null;

function gmail() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set");
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return { transport, user };
}

export const contactInbox = () => process.env.CONTACT_TO || process.env.GMAIL_USER;

/** Sends one email as "BaSaya <GMAIL_USER>". */
export async function sendMail({ to, subject, html, text, replyTo, attachments }) {
  const { transport, user } = gmail();
  return transport.sendMail({
    from: { name: "BaSaya", address: user },
    to,
    subject,
    html,
    text,
    replyTo,
    attachments,
  });
}
