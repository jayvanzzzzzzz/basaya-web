# BaSaya notify-api

The BaSaya website's small server. Runs free on Vercel (Hobby plan, no card).

| Endpoint | Who can call it | What it does |
|---|---|---|
| `POST /api/notify-lesson` | the class's teacher | Sends the "new lesson" push notification to the FCM topic `class_<classId>`. The Android app subscribes to that topic when the student opens the Home screen. |
| `POST /api/notify-deadline` | the class's teacher | Tells the class a lesson's deadline was extended: saves it to the notification list and sends a `deadline_extended` push to `class_<classId>`. |
| `POST /api/remove-student` | the class's teacher | Removes a student from a class, with their progress for its lessons. |
| `POST /api/remove-class-lesson` | the class's teacher | Takes a lesson out of a class and deletes every student's progress on it, so adding it back starts fresh. |
| `POST /api/delete-class` | admin | Deletes a class with its roster, lessons and every student's progress. |
| `POST /api/send-password-reset` | admin | Emails a teacher or student a BaSaya-branded password reset link. The link opens `reset-password.html` on the website. |
| `POST /api/set-temporary-password` | admin | Sets a temporary password for a student who can't get the reset email (fake or mistyped address), and signs them out of other devices. |
| `POST /api/forgot-password` | anyone (login page "Forgot password?", admin Account settings) | Emails the BaSaya-branded reset link to whoever owns that email. Same answer whether or not the account exists. Limited to 5 per hour per IP (`resetLimits`). If it fails, the site falls back to Firebase's plain reset email. |
| `POST /api/request-admin-password-change` | admin (signed in again in the last 5 minutes) | Keeps the admin's new password waiting (encrypted, 30 minutes) and emails them **Approve** / **Cancel** links to `confirm-password-change.html`. The password doesn't change until they approve. |
| `POST /api/confirm-admin-password-change` | anyone with the one-time link | Called by `confirm-password-change.html`: `check`, `approve` (sets the password and signs the admin out everywhere) or `cancel`. Each link works once. |
| `POST /api/contact` | anyone (the site's Contact form) | Emails the message, with an optional photo, to the team's Gmail. Limited to 5 messages per hour per IP, with a honeypot field against bots. |

Signed-in calls send `Authorization: Bearer <Firebase ID token>`. Email templates are in `lib/emails.js`.

## Deploy (one time)

1. **Service account key:** Firebase Console → Project settings → Service accounts → *Generate new private key*. Keep the file private and never commit it.
2. **Vercel project:** on vercel.com, choose *Add New → Project* and import this repository. Set **Root Directory** to `notify-api`, then deploy.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables), then redeploy:
   | Name | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | the whole content of the JSON key file |
   | `ALLOWED_ORIGINS` | where the website runs, comma-separated, e.g. `http://localhost,https://basaya.onrender.com` |
   | `NOTIFY_TIME_ZONE` | optional, default `Asia/Manila` |
   | `GMAIL_USER` | the Gmail address that sends BaSaya's emails, e.g. `adminbasaya@gmail.com` |
   | `GMAIL_APP_PASSWORD` | that account's 16-letter App Password, without spaces (see below) |
   | `CONTACT_TO` | optional: where Contact form messages go (default: `GMAIL_USER`) |
   | `PASSWORD_CHANGE_SECRET` | a long random text (32+ characters) that encrypts admin passwords waiting for approval. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it cancels requests that are still waiting. |
   | `SITE_URL` | optional: the website's address for email links and the logo (default: `https://basaya.onrender.com`) |
4. Put the deployment URL in `../firebase-config.js` as `notifyApiUrl`, e.g. `"https://basaya-notify-api.vercel.app"`.

If the notification fails (for example because the teacher's internet dropped), the class page shows a **Notify students** button on that lesson.

## Gmail App Password (for the emails)

Gmail only lets apps send mail with an *App Password*, never your real password.

1. Sign in to the sending Gmail account and turn on **2-Step Verification** at [myaccount.google.com/security](https://myaccount.google.com/security).
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), name it `BaSaya`, and click **Create**.
3. Copy the 16 letters (Google shows them only once) into `GMAIL_APP_PASSWORD` in Vercel, then redeploy.

Never commit the App Password or paste it anywhere else. If it leaks, delete it on the same page and create a new one; your real Gmail password is not affected.

Free limits: a personal Gmail account can send about 500 emails a day, far more than BaSaya needs.

If the branded reset email can't be sent (for example the App Password isn't set yet), the admin site falls back to Firebase's standard reset email, so teachers can still reset their password.

## Optional: clean up rate-limit records

`/api/contact` keeps one small document per sender IP (hashed) in `contactLimits`, with an `expiresAt` field. To have Firestore delete old ones automatically: Firebase Console → Firestore → **TTL policies** → add a policy on collection `contactLimits`, field `expiresAt`. Do the same for `resetLimits` (used by `/api/forgot-password`).

Admin password changes waiting for approval live in `adminPasswordChanges`, also with an `expiresAt` field; add the same kind of policy there. (Expired ones are refused either way.)
