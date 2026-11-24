# BaSaya notify-api

Admin teacher access actions are `deactivate` and `reactivate`. Deactivation disables sign-in, revokes sessions, and atomically clears `teacherId` on every assigned class alongside the disabled profile flag. Classes, rosters, lessons and progress remain intact. Reactivation restores access without restoring prior class assignments. Class assignment menus omit deactivated teachers, and Firestore rules reject assigning them through stale clients. Deploy the API, rules and web changes together. The deactivation transaction supports up to 499 classes; above that it fails without changing Auth or class ownership and asks the admin to reassign some classes first.

All classes repairs older assignments using admin-only `cleanup-classes` with `userId`. The server transaction rechecks that the profile is still a deactivated teacher before clearing class ownership. Reactivated teachers are skipped. The page refetches classes after cleanup; errors remain visible and can be retried by reloading. This repair does not change sign-in status, rosters or learning records.

Teacher onboarding uses `POST /api/teacher-onboarding`, routed through the existing class-membership function. Admin actions: `create`, `statuses` (up to 100 user IDs), `resend`, and `correct-email`. Creation requires `firstName` and `lastName`; `middleName` is optional. Each name part allows up to 80 characters. The API trims and saves the parts and derives `displayName` in first-middle-last order. Pending teachers can `resend` for themselves and `complete` after email verification, recent sign-in, and choosing a strong password different from the temporary one. Verification messages use the existing `GMAIL_USER` / `GMAIL_APP_PASSWORD` mail transport. Set `SITE_URL` to the web deployment root that serves `verify-teacher.html` (including a subdirectory if used).

Deploy the API, website, and `firestore.rules` together before creating teachers with the new form. The API owns `emailVerificationRequired`, `mustChangePassword`, and `verificationSentAt`; private `teacherInvitations` documents hold salted temporary-password hashes until setup completes and have no client access. New teachers are blocked from teacher API/rules access until setup completes. Existing profiles without `emailVerificationRequired: true` retain access. A successful create response includes `emailSent: false` when sending fails; retry sending for that account instead of recreating it. Resends have a one-minute cooldown. “Sent” indicates acceptance by the email service, not delivery to the inbox.

Local QA (no production writes): `node --experimental-vm-modules tools/teacher-onboarding-tests.mjs <java> <firestore-emulator.jar>` and `node tools/teacher-onboarding-browser.cjs` from the web root. The API suite can run without emulator arguments for the backend checks only.

Verification links are inspected with `checkActionCode` on page load and redeemed with `applyActionCode` only after the teacher selects **Verify my email**. Refreshes and email scanners must not redeem codes. Transient service/network errors retain the code for retry and must not be reported as expiry. A signed-in teacher whose email is already verified can continue password setup even when reopening a used link. Local Auth integration check: `npx firebase-tools emulators:exec --only auth --project demo-basaya-verification --config build/teacher-link-auth/firebase.json "node tools/teacher-verification-auth-emulator.mjs"` (synthetic accounts only).

The BaSaya website's small server. Runs free on Vercel (Hobby plan, no card).

| Endpoint | Who can call it | What it does |
|---|---|---|
| `POST /api/assistant` | student, teacher, admin | Role-specific app-help AI with server-side quotas and Groq. Students: 5 questions/day; teachers/admins: 10 questions/day per account, including cached repeats. All roles: 10-second cooldown and one pending request per account. Allowances reset at midnight UTC; shared provider/app budgets still apply. Staff replies match the question language. Edit `js/handbookHelp.js` and run `node tools/build-assistant-help.mjs` from the web root to update staff references. See [web assistant setup and verification](../audit/ASSISTANT-WEB.md). |
| `POST /api/assessment` | approved student | Serves content without answer keys; accepts answers/audio and derives scores, completion and skill summaries on the server. See [assessment validation and rollout](../audit/ASSESSMENT-VALIDATION.md). |
| `POST /api/join-class` | student | Validates `{ code }`, rate-limits guesses, and creates a pending request. Does not enroll the student. |
| `POST /api/review-join-requests` | the class's teacher | Reviews `{ classId, requests: [{ studentId, requestId, progressMode? }], action: "approve" or "decline" }`. For returning students, `progressMode` is `"restore"` (default) or `"fresh"`. Up to 50 decisions per call, each in its own transaction. |
| `POST /api/notify-lesson` | the class's teacher | Sends the "new lesson" push notification to the FCM topic `class_<classId>`. The Android app subscribes to that topic when the student opens the Home screen. |
| `POST /api/notify-deadline` | the class's teacher | Tells the class a lesson's deadline was extended: saves it to the notification list and sends a `deadline_extended` push to `class_<classId>`. |
| `POST /api/remove-student` | the class's teacher | Archives accepted progress and removes active membership atomically. Rejoining the same class can restore it. |
| `POST /api/remove-class-lesson` | the class's teacher | Takes a lesson out of a class and deletes every student's progress on it, so adding it back starts fresh. |
| `POST /api/delete-class` | admin | Retired (410). Use class-lifecycle archive/restore; no records are removed. |
| `POST /api/send-password-reset` | admin | Emails a teacher or student a BaSaya-branded password reset link. The link opens `reset-password.html` on the website. |
| `POST /api/set-temporary-password` | admin | Sets a temporary password for a student who can't get the reset email (fake or mistyped address), and signs them out of other devices. |
| `POST /api/forgot-password` | anyone (login page "Forgot password?", admin Account settings) | Emails the BaSaya-branded reset link to whoever owns that email. Same answer whether or not the account exists. Limited to 5 per hour per IP (`resetLimits`). If it fails, the site falls back to Firebase's plain reset email. |
| `POST /api/request-admin-password-change` | admin (signed in again in the last 5 minutes) | Keeps the admin's new password waiting (encrypted, 30 minutes) and emails them **Approve** / **Cancel** links to `confirm-password-change.html`. The password doesn't change until they approve. |
| `POST /api/confirm-admin-password-change` | anyone with the one-time link | Called by `confirm-password-change.html`: `check`, `approve` (sets the password and signs the admin out everywhere) or `cancel`. Each link works once. |
| `POST /api/contact` | signed-in student, teacher or admin | One contact message per account per rolling hour, across devices and reply addresses. `{action: "status"}` returns `retryAt` without consuming a slot. Failed delivery releases its reservation. Contact is unavailable on the login page. |

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

## Teacher and admin username sign-in

Admin Account Settings updates passwords directly through Firebase after current-password verification. It no longer calls the legacy approval-email endpoints or shows a password-reset email card.

Teachers and admins can add/change a unique, lowercase username in Account settings using their current Firebase password. Email sign-in and recovery remain available. `/api/username-save` and `/api/username-login` share `api/class-membership.js` through Vercel rewrites; no extra serverless function is added.

Deploy the updated `firestore.rules` first (aliases are private and client profile username writes are denied), then deploy `notify-api`, then the web files and regenerated `offline-shell.js`. The existing `FIREBASE_SERVICE_ACCOUNT` and `ALLOWED_ORIGINS` settings are reused. `FIREBASE_WEB_API_KEY` can override the public BaSaya web key when using another Firebase deployment. No paid Firebase Functions or Identity Platform upgrade is needed.

Passwords are verified with Firebase's password endpoint before reserving an alias or issuing a custom sign-in token for the same UID. Passwords and returned Firebase credentials must never be logged or stored. MFA challenges fail closed. Google-only accounts must first establish a password using the existing recovery flow. Failed login responses do not disclose email addresses. Username changes atomically reserve the new alias and release the old one. Limits are 20 save attempts and 100 username login attempts per IP per hour, shared by users behind that IP; email login remains separate.

Checks: `node --experimental-vm-modules tools/username-auth-tests.mjs`, `node tools/username-browser-qa.cjs`, and `node tools/username-rules-tests.mjs <java-path> <firestore-emulator-jar>` from the repository root. The browser checks use local authentication fixtures; they do not sign in to production.

## Admin-created student accounts

### Monitoring exemptions and individual deadlines

Student access changes now record server-owned `inactivePeriods` (`start`/`end` in epoch milliseconds) and the current `deactivatedAt`. Deactivated students remain enrolled and their actual results stay available as history, but class averages, completion totals and current alerts exclude them. Unfinished deadlines falling within an inactive interval are exempt; reactivation does not turn them into zeros. Completed results remain valid. For older disabled accounts without a reliable start date, the unknown interval is treated conservatively as exempt instead of inventing missed-work penalties.

Teachers use `POST /api/lesson-deadlines`: `schedule` updates the class schedule; `extend-students` accepts `{ classId, entryId, studentIds, dueAt }` for 1–200 unique active enrolled students. One new epoch-ms deadline must exceed each selected student's effective deadline. Ownership, membership and active status are rechecked transactionally; invalid selections cause no partial changes. Personal extensions are server-owned `deadlineOverrides` on roster records, leaving the class schedule and other students unchanged. Actual elapsed deadlines are retained in history so later extensions do not erase an exemption. A timely extension supersedes the earlier class deadline. A later class deadline takes precedence over a shorter personal extension.

The web student lesson list and server submission/reading checks use the same effective deadline. The shared policy source is `js/deadline-policy.js`; regenerate its backend copy with `node tools/build-deadline-policy.mjs`. Web/server scoring skips automatic missing-work penalties on exempt lessons. Exempt unfinished lessons are excluded from completion denominators. Teacher report exports mark deactivated students as excluded while their individual history remains accessible. The extension dialog supports Entire class or Selected students, name/LRN/username search, checkboxes, Select all shown, a selected count and an audience-specific confirmation. Deactivated students cannot receive individual extensions. Class-wide notifications remain available only for the entire-class option; personal extensions do not broadcast to unselected classmates.

Deploy the API and matching web files with `firestore.rules`; direct client changes to schedule/history fields are restricted. Regenerate `offline-shell.js`. Validation: `tools/lesson-deadline-tests.mjs <java> <emulator-jar>` (with `--experimental-vm-modules`), `tools/monitoring-policy-tests.mjs` (same VM flag), `tools/assessment-tests.mjs <java> <emulator-jar>`, and `build/individual-deadline-qa.cjs`. All mutation tests use synthetic data in local emulators or browser fixtures.

Student accounts supports admin-only `action: "deactivate"` or `"reactivate"` with `studentIds` (1–50 unique IDs per request). Each result reports its own success or failure. Only student profiles can be changed. Deactivation disables Firebase Auth, sets the protected profile flag and revokes sessions; a failed profile write rolls Auth back. Class membership and all learning records remain intact. The directory supports individual actions, selection across pages, and All / Active / Deactivated status filters alongside the class filters and search. Select page affects only the current page; changing search or filters clears selection. Failed accounts remain selected for retry.

Deploy Firestore rules and this API before using the local admin controls. Deactivated students can read their own profile for live sign-out detection but cannot access learning content or update their profile. Staff retain reporting access. API guards reject disabled profiles as well as revoked Auth sessions. Reactivation restores access to the same account and saved progress.

`POST /api/student-accounts` requires an authenticated admin. It accepts `{ firstName, middleName?, lastName, lrn, password }`. LRN is a string of exactly 12 digits, preserving leading zeros. The server assigns a lowercase `lastname.firstname` username, removing spaces and punctuation and folding accents. Duplicate names receive a number starting at 2 (`cruz.juan2`). The returned username is the one to share with the student. Passwords use 8–128 characters, consistent with admin-issued temporary passwords.

Existing student usernames can be updated using `node tools/assign-student-usernames.mjs` with `FIREBASE_SERVICE_ACCOUNT` configured, or `--firebase-cli` for the existing project CLI login. The default run reports only; `--apply` updates student profiles and private username reservations, removes the old reservation only when owned by that student, and verifies the result. Missing first/last names stop the run before writes. Private backups and reports go under ignored `output/student-usernames/`. Repeat runs preserve assigned duplicate suffixes. Deploy the updated username-login handler before the migration so dotted usernames can sign in immediately. Staff usernames keep their existing format.

Firebase Auth retains password verification using an internal UUID address at `students.basaya.invalid`; students do not supply an email. The public profile stores an empty email. The API reserves the lowercase username, LRN and student profile atomically, rolling back the new Auth user if provisioning fails. Passwords are never stored in Firestore or returned by the API. The admin sees the password they entered once for private handoff. Student password changes continue to use Firebase reauthentication; forgotten passwords are reset by the admin.

For existing students without an LRN, admins can choose **Assign LRN** from the student's actions menu. `POST /api/student-accounts` with `{ action: "assign-lrn", studentId, lrn }` validates the 12-digit string and atomically reserves it in `learnerNumbers` with the profile update. It rejects LRNs held by another profile or identifier reservation and prevents replacing an assigned LRN. Existing usernames, passwords, membership, and learning records are preserved. The directory's **All**, **With LRN**, and **Without LRN** ribbons combine with class, account status, search, and pagination filters. Deploy the updated API before the admin view. Fixture browser check: `node build/student-lrn-qa.cjs`.

Deploy `firestore.rules`, then `notify-api` (including its Vercel rewrite), then the web files and regenerated `offline-shell.js`. The rules deny student self-registration, client LRN/username changes, and access to identifier reservations. `/api/username-login` accepts either student identifier, verifies the password through Firebase, and issues a custom token for the same UID. Existing accounts are preserved; native Android login changes are separate work.

Local checks: `node --experimental-vm-modules tools/student-accounts-tests.mjs`, `node --experimental-vm-modules tools/username-auth-tests.mjs`, `node tools/username-rules-tests.mjs <java-path> <firestore-emulator-jar>`, and `node build/student-accounts-qa.cjs`. Browser checks use fixtures and create no live accounts.

## Optional: clean up rate-limit records

`/api/contact` keeps one server-owned cooldown document per account UID in `contactAccountLimits`, with an `expiresAt` field. To have Firestore delete old ones automatically: Firebase Console → Firestore → **TTL policies** → add a policy on collection `contactAccountLimits`, field `expiresAt`. Do the same for `resetLimits` (used by `/api/forgot-password`).

Admin password changes waiting for approval live in `adminPasswordChanges`, also with an `expiresAt` field; add the same kind of policy there. (Expired ones are refused either way.)

Class archive and restore use `POST /api/class-lifecycle` for the assigned teacher or admin. Archived classes pause joining and participation. Student web and Android may still submit/cancel roster leave requests. The assigned active teacher may decline them or approve via `remove-student` with action `leave` and the current request key. Approval archives saved progress and ends membership without restoring the class.
