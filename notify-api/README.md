# BaSaya notify-api

The BaSaya website's small server. Runs free on Vercel (Hobby plan, no card).

| Endpoint | Who can call it | What it does |
|---|---|---|
| `POST /api/assessment` | approved student | Serves content without answer keys; accepts answers/audio and derives scores, completion and skill summaries on the server. See [assessment validation and rollout](../audit/ASSESSMENT-VALIDATION.md). |
| `POST /api/join-class` | student | Validates `{ code }`, rate-limits guesses, and creates a pending request. Does not enroll the student. |
| `POST /api/review-join-requests` | the class's teacher | Reviews `{ classId, requests: [{ studentId, requestId, progressMode? }], action: "approve" or "decline" }`. For returning students, `progressMode` is `"restore"` (default) or `"fresh"`. Up to 50 decisions per call, each in its own transaction. |
| `POST /api/notify-lesson` | the class's teacher | Sends the "new lesson" push notification to the FCM topic `class_<classId>`. The Android app subscribes to that topic when the student opens the Home screen. |
| `POST /api/notify-deadline` | the class's teacher | Tells the class a lesson's deadline was extended: saves it to the notification list and sends a `deadline_extended` push to `class_<classId>`. |
| `POST /api/remove-student` | the class's teacher | Archives accepted progress and removes active membership atomically. Rejoining the same class can restore it. |
| `POST /api/remove-class-lesson` | the class's teacher | Takes a lesson out of a class and deletes every student's progress on it, so adding it back starts fresh. |
| `POST /api/delete-class` | admin | Deletes a class with its roster, lessons and every student's progress. |
| `POST /api/send-password-reset` | admin | Emails a teacher or student a BaSaya-branded password reset link. The link opens `reset-password.html` on the website. |
| `POST /api/set-temporary-password` | admin | Sets a temporary password for a student who can't get the reset email (fake or mistyped address), and signs them out of other devices. |
| `POST /api/forgot-password` | anyone (login page "Forgot password?", admin Account settings) | Emails the BaSaya-branded reset link to whoever owns that email. Same answer whether or not the account exists. Limited to 5 per hour per IP (`resetLimits`). If it fails, the site falls back to Firebase's plain reset email. |
| `POST /api/request-admin-password-change` | admin (signed in again in the last 5 minutes) | Keeps the admin's new password waiting (encrypted, 30 minutes) and emails them **Approve** / **Cancel** links to `confirm-password-change.html`. The password doesn't change until they approve. |
| `POST /api/confirm-admin-password-change` | anyone with the one-time link | Called by `confirm-password-change.html`: `check`, `approve` (sets the password and signs the admin out everywhere) or `cancel`. Each link works once. |
| `POST /api/contact` | anyone (the site's Contact form) | Emails the message, with an optional photo, to the team's Gmail. Limited to 5 messages per hour per IP, with a honeypot field against bots. |

Signed-in calls send `Authorization: Bearer <Firebase ID token>`. Email templates are in `lib/emails.js`.

Membership URLs are routed by `vercel.json` to `api/class-membership.js`. The previous
`/api/remove-student` URL is preserved; its implementation is now in `handlers/remove-student.js`.
Join requests, reviews, and removal share one function, keeping the API at 12 functions.
The grouped function has a 60-second maximum duration for bulk decisions. Routing follows
[Vercel rewrites](https://vercel.com/docs/routing/rewrites), within the documented
[plain-function hosting limit](https://vercel.com/docs/functions/runtimes).

Requests live in `classes/{classId}/joinRequests/{studentId}` and a protected
`users/{uid}.joinRequest` pointer. A pending request grants no roster, lesson or chat access.
Only approval creates the roster and profile link, with one join notice. Fresh records use
server-time `joinedAt`; restored records retain their original join date.
The current request's `requestId` is required to prevent decisions from stale browser tabs.
The server sets `hasPreviousProgress` only when this class has an archived record with saved work.
The teacher sees restoration choices only for those requests. A restore retains completion,
scores, resume positions and the progress-session token. An explicit fresh start uses a new
token, leaving previous snapshots intact. Another class always uses its own record.
Immutable snapshots live at `users/{uid}/classProgress/{classId}/archives/{archiveId}` with
lesson documents in `lessons/{lessonId}`. `assignedLessons` remains the active projection
for existing reports. History is readable by the student, the owning class teacher and admins;
only the API can write it. No school-year field is used. Already-deleted results cannot be recovered.
Existing approved members (profile link plus roster entry) retain access. Deleting a class
closes enrollment before loading its roster and clears its pending requests.

Code guesses are limited to 20 per student per hour. Optionally add a Firestore TTL policy
on `joinRequestLimits.expiresAt` to remove expired counters. Client access to these counters
is denied by the rules. Chat topic pushes contain a generic notice; private chat text stays
behind Firestore membership checks.

Rollout and local validation are documented in `../audit/PHASE-2-APPROVALS.md`.

## Deploy (one time)

1. **Service account key:** Firebase Console → Project settings → Service accounts → *Generate new private key*. Keep the file private and never commit it.
2. **Vercel project:** on vercel.com, choose *Add New → Project* and import this repository. Set **Root Directory** to `notify-api`, then deploy.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables), then redeploy:
   | Name | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | the whole content of the JSON key file |
   | `ALLOWED_ORIGINS` | deployed website origins, comma-separated, e.g. `https://basaya.onrender.com`. `http://localhost` and `http://127.0.0.1` are always included; add local origins with other ports explicitly. |
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
