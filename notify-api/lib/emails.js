// Branded HTML emails sent from notify-api (contact form, password reset).
// Email clients ignore <style> and modern CSS, so everything is tables with
// inline styles, a 600px column, and system fonts. Each template also has a
// plain-text version for clients that don't show HTML.

const SITE_URL = (process.env.SITE_URL || "https://basaya.onrender.com").replace(/\/$/, "");
const LOGO_URL = `${SITE_URL}/img/logo.png`;
const SCHOOL = "Eastwoods Professional College of Science and Technology";

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const C = {
  page: "#f2f3f9",
  card: "#ffffff",
  ink: "#1f2547",
  ink2: "#4a5275",
  ink3: "#7a82a3",
  border: "#e4e7f3",
  soft: "#f6f7fc",
  primary: "#5b4cf4",
  primarySoft: "#eeebff",
};

export const escape = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char],
  );

/** Message text → HTML, keeping the sender's line breaks. */
const paragraphs = (text) => escape(text).replace(/\r?\n/g, "<br />");

function button(href, label) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
      <tr>
        <td bgcolor="${C.primary}" style="border-radius:12px;background:${C.primary};background-image:linear-gradient(135deg,#4f8bff,#8a6cf0);">
          <a href="${escape(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escape(label)}</a>
        </td>
      </tr>
    </table>`;
}

/** The shared frame: header band with the logo, white card, footer. */
function layout({ preheader, eyebrow, body, footerNote }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>BaSaya</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td bgcolor="${C.primary}" style="border-radius:20px 20px 0 0;background:${C.primary};background-image:linear-gradient(125deg,#4f8bff 0%,#6d74f6 52%,#8a6cf0 100%);padding:26px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${LOGO_URL}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;" />
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">BaSaya</span>
                  </td>
                  <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#e6e4ff;">${escape(eyebrow)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="${C.card}" style="background:${C.card};border-radius:0 0 20px 20px;padding:36px 32px 32px;font-family:${FONT};color:${C.ink};border:1px solid ${C.border};border-top:0;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 24px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.ink3};">
              ${footerNote ? `<p style="margin:0 0 10px;">${footerNote}</p>` : ""}
              <p style="margin:0;"><strong style="color:${C.ink2};">BaSaya</strong> &middot; A Capstone Project, BS Information Technology</p>
              <p style="margin:0;">${SCHOOL}</p>
              <p style="margin:10px 0 0;"><a href="${SITE_URL}" style="color:${C.primary};text-decoration:none;font-weight:600;">${SITE_URL.replace(/^https?:\/\//, "")}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** A label / value row inside the details card. */
const detailRow = (label, value, last = false) => `
  <tr>
    <td style="padding:10px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-size:13px;color:${C.ink3};width:110px;vertical-align:top;">${escape(label)}</td>
    <td style="padding:10px 0;${last ? "" : `border-bottom:1px solid ${C.border};`}font-size:14px;color:${C.ink};font-weight:600;vertical-align:top;">${value}</td>
  </tr>`;

/**
 * Contact form message, sent to the BaSaya team.
 * @param {{ name: string, email: string, topic: string, message: string,
 *           role?: string, page?: string, sentAt: Date,
 *           attachment?: { filename: string, size: number } }} input
 */
export function contactEmail({ name, email, topic, message, role, page, sentAt, attachment }) {
  const when = sentAt.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const kb = attachment ? Math.max(1, Math.round(attachment.size / 1024)) : 0;
  const replyHref = `mailto:${email}?subject=${encodeURIComponent(`Re: ${topic} - BaSaya`)}`;

  const body = `
    <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${C.primarySoft};color:${C.primary};font-size:12px;font-weight:700;">${escape(topic)}</span>
    <h1 style="margin:16px 0 6px;font-size:24px;line-height:1.3;color:${C.ink};font-weight:800;letter-spacing:-0.3px;">New message from ${escape(name)}</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${C.ink2};">Sent through the contact form on the BaSaya website.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td style="border-left:4px solid ${C.primary};background:${C.soft};border-radius:0 12px 12px 0;padding:18px 20px;font-size:15px;line-height:1.7;color:${C.ink};">
          ${paragraphs(message)}
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:14px;">
      <tr><td style="padding:6px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${detailRow("From", escape(name))}
          ${detailRow("Email", `<a href="mailto:${escape(email)}" style="color:${C.primary};text-decoration:none;">${escape(email)}</a>`)}
          ${detailRow("Account", escape(role || "Visitor (not signed in)"))}
          ${page ? detailRow("Sent from", escape(page)) : ""}
          ${detailRow("Attachment", attachment ? `&#128206; ${escape(attachment.filename)} <span style="color:${C.ink3};font-weight:400;">(${kb} KB)</span>` : `<span style="color:${C.ink3};font-weight:400;">None</span>`)}
          ${detailRow("Received", escape(when), true)}
        </table>
      </td></tr>
    </table>

    ${button(replyHref, `Reply to ${name.split(" ")[0]}`)}
    <p style="margin:0;font-size:13px;color:${C.ink3};">Or just press <strong>Reply</strong> in Gmail. It goes straight to ${escape(email)}.</p>`;

  return {
    subject: `[BaSaya · ${topic}] ${name}`,
    html: layout({
      preheader: `${topic} from ${name}: ${message.slice(0, 90)}`,
      eyebrow: "Contact form",
      body,
      footerNote: "You received this because someone used the contact form on the BaSaya website.",
    }),
    text: [
      `New message from ${name} (${topic})`,
      "",
      message,
      "",
      `From: ${name} <${email}>`,
      `Account: ${role || "Visitor (not signed in)"}`,
      page ? `Sent from: ${page}` : null,
      `Attachment: ${attachment ? `${attachment.filename} (${kb} KB)` : "None"}`,
      `Received: ${when}`,
      "",
      "Reply to this email to answer them directly.",
    ]
      .filter((line) => line !== null)
      .join("\n"),
  };
}

/**
 * Password reset for a teacher, requested by an admin.
 * @param {{ name: string, email: string, link: string }} input
 */
export function passwordResetEmail({ name, email, link }) {
  const first = (name || "there").split(" ")[0];
  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="56" height="56" align="center" bgcolor="${C.primarySoft}" style="width:56px;height:56px;border-radius:16px;background:${C.primarySoft};font-size:26px;line-height:56px;">&#128273;</td>
      </tr>
    </table>
    <h1 style="margin:22px 0 8px;font-size:26px;line-height:1.3;color:${C.ink};font-weight:800;letter-spacing:-0.4px;">Reset your password</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${C.ink2};">Hi ${escape(first)},</p>
    <p style="margin:0;font-size:15px;line-height:1.7;color:${C.ink2};">
      Your school admin asked BaSaya to send you a password reset link for your teacher account
      <strong style="color:${C.ink};">${escape(email)}</strong>. Click the button below to choose a new password.
    </p>

    ${button(link, "Set a new password")}

    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${C.ink3};">
      &#9201; This link expires in <strong style="color:${C.ink2};">1 hour</strong> and can be used only once.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:${C.soft};border:1px solid ${C.border};border-radius:14px;padding:16px 18px;font-size:13px;line-height:1.6;color:${C.ink2};">
          <strong style="color:${C.ink};">Didn't expect this?</strong><br />
          You can safely ignore this email. Your current password keeps working until you set a new one.
          If you think someone else requested it, let your school admin know.
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 6px;font-size:12px;color:${C.ink3};">Button not working? Copy this link into your browser:</p>
    <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escape(link)}" style="color:${C.primary};text-decoration:none;">${escape(link)}</a></p>`;

  return {
    subject: "Reset your BaSaya password",
    html: layout({
      preheader: "Use this link within 1 hour to choose a new password for your teacher account.",
      eyebrow: "Account security",
      body,
      footerNote: `This email was sent to ${escape(email)} because a password reset was requested for your BaSaya teacher account.`,
    }),
    text: [
      `Hi ${first},`,
      "",
      `Your school admin asked BaSaya to send you a password reset link for your teacher account (${email}).`,
      "",
      `Set a new password: ${link}`,
      "",
      "This link expires in 1 hour and can be used only once.",
      "Didn't expect this? You can ignore this email. Your current password keeps working.",
      "",
      `BaSaya · A Capstone Project, BS Information Technology · ${SCHOOL}`,
    ].join("\n"),
  };
}
