# BaSaya: how every part works, start to finish

This is the whole of BaSaya in one place: the websites, the Android app, the back end, and how data moves between them.

It covers who does what, where each click goes, which service answers, and why it was built that way. It includes:

- notifications, text to speech and speech checking
- the dictionary and its syllables
- sign-in tokens and passwords
- scores and reports

The two projects:

| Project | Folder |
|---|---|
| Websites (admin, teacher, student) + notify-api | `C:\xampp\htdocs\BaSaya-web` |
| Android app + basaya-stt Worker | `C:\Projects\BaSaya` |

Other docs go deeper on one topic: `flow.md` (older lesson cycle), `messaging.md` (chat), `basaya-tts-worker.md` (TTS Worker code), `notify-api/README.md` (API setup), `README.md` (student site + dictionary build).

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Why the website is static](#2-why-the-website-is-static)
3. [Every service and what it does](#3-every-service-and-what-it-does)
4. [Tokens, keys and secrets](#4-tokens-keys-and-secrets)
5. [Accounts, roles and logging in](#5-accounts-roles-and-logging-in)
6. [Passwords: forgot, reset, temporary, admin change](#6-passwords-forgot-reset-temporary-admin-change)
7. [Admin makes a lesson](#7-admin-makes-a-lesson)
8. [Text to speech (TTS): ElevenLabs → Cloudflare → R2 → student](#8-text-to-speech-tts)
9. [Teacher makes a class, student joins](#9-teacher-makes-a-class-student-joins)
10. [Teacher adds a lesson → notification → student](#10-teacher-adds-a-lesson--notification--student)
11. [Deadlines, reminders and the trusted clock](#11-deadlines-reminders-and-the-trusted-clock)
12. [Class chat](#12-class-chat)
13. [Student studies a lesson](#13-student-studies-a-lesson)
14. [Bigkas: how the student's voice is checked (STT)](#14-bigkas-how-the-students-voice-is-checked-stt)
15. [Saving progress, scores and teacher reports](#15-saving-progress-scores-and-teacher-reports)
16. [Diksiyonaryo: where the words come from](#16-diksiyonaryo-where-the-words-come-from)
17. [Pantig (syllables) and the Bigkas ⓘ button](#17-pantig-syllables-and-the-bigkas--button)
18. [Leaving, removing, deleting](#18-leaving-removing-deleting)
19. [Contact form and emails](#19-contact-form-and-emails)
20. [How everything is protected](#20-how-everything-is-protected)
21. [Where everything is saved](#21-where-everything-is-saved)
22. [What it costs (free limits)](#22-what-it-costs-free-limits)
23. [When something breaks](#23-when-something-breaks)
24. [File map](#24-file-map)

---

## 1. The big picture

```
                      ┌──────────────────────────── USERS ────────────────────────────┐
                      │                                                               │
        ADMIN website            TEACHER website          STUDENT website          STUDENT app
        /admin/                  /teacher/                /student/                Android (Kotlin)
        lessons, teachers,       classes, schedule,       same lessons as the      download, offline,
        students, classes,       reports, chat,           app, online only         push notifications
        dictionary               dictionary               (iPhone, laptop)
             │                        │                        │                        │
             └───────────── static files on Render (basaya.onrender.com) ───┘           │
                                      │                                                  │
             ┌────────────────────────┼──────────────────────────────────────────────────┤
             ▼                        ▼                                                  ▼
 ┌──────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────────────────┐
 │ FIREBASE (Google)    │  │ notify-api (Vercel)      │  │ CLOUDFLARE                           │
 │ • Auth: logins,      │  │ • push notifications     │  │ • basaya-tts Worker ─▶ ElevenLabs    │
 │   ID tokens          │  │ • remove / delete jobs   │  │      makes lesson audio, saves to R2 │
 │ • Firestore: the     │  │ • password emails        │  │ • R2 bucket: the lesson MP3s         │
 │   database + rules   │  │ • contact form email     │  │ • basaya-stt Worker ─▶ Workers AI    │
 │ • Cloud Messaging    │  │   (Gmail SMTP)           │  │      Whisper hears the student       │
 │   (FCM): push        │  │ uses Firebase Admin SDK  │  │                                      │
 └──────────────────────┘  └──────────────────────────┘  └──────────────────────────────────────┘

 Static data shipped with the site/app: data/dictionary/tl-seed.json (from Tagalog Wiktionary)
```

**In one sentence:** the websites and the app talk **directly** to Firebase for almost everything. The Firestore rules decide what each user may read or write. The three small servers (Vercel and two Cloudflare Workers) exist only for jobs that need a **secret** or **admin power**.

---

## 2. Why the website is static

The website is plain HTML, CSS and JavaScript modules: no React, no build step, no server code of its own. Render just serves the files.

| Reason | What it means for BaSaya |
|---|---|
| **Free and simple hosting** | Any static host works (Render, Firebase Hosting, Netlify, XAMPP on localhost). No server to keep running, patch or pay for. |
| **No build step** | Edit a `.js` file, refresh, done. Modules load straight in the browser (`import … from "./helpers.js"`), and the Firebase SDK loads from Google's CDN (`gstatic.com/firebasejs/10.12.2`). |
| **Security doesn't need a server** | The browser talks to Firestore with the user's sign-in token, and the **Firestore rules** (`firestore.rules`) check every read and write on Google's side. A student who opens the browser console still can't change a role or another student's score. |
| **Secrets never reach the browser** | Anything secret runs in a server instead: the ElevenLabs key (basaya-tts), the Firebase service account (notify-api), and the Gmail App Password (notify-api). The website only holds the **public** Firebase config. |
| **Cheap reads** | Big data that never changes per user is a static file, not database rows. The ~1,600-word dictionary is `tl-seed.json`: browsers cache it, and it costs **zero Firestore reads**. |
| **Same data as the app** | The app and the site read the same Firestore documents, so a student can switch between them and the teacher's reports don't change. |

The same idea applies to "static" dictionary words. They come from a file built **once** from Wiktionary, not from a live API. Wiktionary content doesn't change daily, a file is free to serve, and the app bundles the same file so it works offline.

---

## 3. Every service and what it does

| Service | Runs on | Called by | Does | Secret it keeps |
|---|---|---|---|---|
| **Websites** | Render (static) | browsers | Admin, teacher and student pages | none (public config only) |
| **Android app** | student's phone | students | Lessons offline, push, mic, Room database | `stt.appKey` (in the build) |
| **Firebase Auth** | Google | site + app | Email/password login, issues **ID tokens** | — |
| **Firestore** | Google | site, app, Workers, notify-api | The database, guarded by `firestore.rules` | — |
| **Firebase Cloud Messaging (FCM)** | Google | notify-api sends, app receives | Push to topic `class_<classId>` | — |
| **notify-api** | Vercel (Node 22, serverless) | teacher/admin site, login page | Push notifications, delete/remove jobs, password emails, contact email | Firebase **service account**, Gmail **App Password**, `PASSWORD_CHANGE_SECRET` |
| **basaya-tts** | Cloudflare Worker | admin site (Generate audio), app + site (play audio) | Text → MP3 via ElevenLabs, stores MP3 in **R2**, serves `/audio/…` | **ElevenLabs API key** |
| **R2 bucket** | Cloudflare | basaya-tts only | Stores lesson MP3s (`lessons/{id}/…`) | — |
| **ElevenLabs** | elevenlabs.io | basaya-tts only | The voice (model `eleven_v4_turbo`) | — |
| **basaya-stt** | Cloudflare Worker + Workers AI | app + student site | Student's voice → text (Whisper large-v3-turbo, Tagalog) | `APP_KEY` (for the app) |
| **Gmail SMTP** | Google | notify-api (nodemailer) | Sends reset, approval and contact emails | (App Password lives in Vercel) |
| **Tagalog Wiktionary** | dumps.wikimedia.org | `tools/build-dictionary.mjs`, run by hand | Source of the dictionary words | — |

---

## 4. Tokens, keys and secrets

| Name | What it is | Where it lives | Who sees it | Used for |
|---|---|---|---|---|
| **Firebase web config** (`apiKey`, `projectId`…) | Identifies the Firebase project. **Not a secret.** | `firebase-config.js`, the app's `google-services.json` | everyone | Lets the site/app find the project. The rules protect the data, not this key. |
| **Firebase ID token** | A signed JWT saying "this is user `uid`". Lasts **1 hour**, and the SDK refreshes it automatically. | in the browser/app memory | only that user | Sent as `Authorization: Bearer <token>` to Firestore, notify-api, basaya-tts and basaya-stt |
| **Firebase service account** | Admin key for the whole project; it **skips the rules**. | Vercel env var `FIREBASE_SERVICE_ACCOUNT` | notify-api only | Sending FCM, deleting other users' progress, password resets |
| **FCM topic** `class_<classId>` | A named channel. Phones subscribe, notify-api sends to it. | Google | — | No per-device tokens are stored. The app keeps itself subscribed to its class's topic only (`ClassNotifications.syncTopic`). |
| **FCM device token** | Google's address for one phone | the phone | — | Only used under the hood for the topic subscription (`onNewToken` resubscribes) |
| **ElevenLabs API key** (`xi-api-key`) | Pays for voice generation | Cloudflare **secret** `ELEVENLABS_API_KEY` | basaya-tts only | `/generate` |
| **`APP_KEY`** | Shared key the Android app sends as `X-App-Key` | Cloudflare secret + the app's `local.properties` (`stt.appKey`) | basaya-stt + app | Lets the app use Whisper without signing in each request |
| **Gmail App Password** | 16-letter password just for sending mail | Vercel `GMAIL_APP_PASSWORD` | notify-api | All BaSaya emails |
| **`PASSWORD_CHANGE_SECRET`** | Encrypts an admin's new password while it waits for email approval | Vercel env | notify-api | `adminPasswordChanges` |
| **`oobCode`** | Firebase's one-time reset code, valid **1 hour** | inside the reset email link | the email owner | `reset-password.html` |
| **Password-change link token** | One-time code in the admin's Approve/Cancel email, valid **30 minutes** | email link | the admin | `confirm-password-change.html` |

**How the Workers check a Firebase token without a service account:** basaya-tts and basaya-stt take the caller's ID token and use it to read `users/{uid}` from the Firestore REST API. If Firestore accepts it, the token is real and not expired. The Worker then reads `role` from that document: basaya-tts allows only teacher/admin, and basaya-stt accepts any existing user. That keeps strangers from spending ElevenLabs credits or the Whisper allowance.

---

## 5. Accounts, roles and logging in

Every user has `users/{uid}` with a `role`.

| Role | How the account is made | Signs in at |
|---|---|---|
| **admin** | by hand in Firebase | website → `admin/` |
| **teacher** | the admin creates it | website → `teacher/` |
| **student** | registers in the app (`RegisterActivity`) or on `register.html` | app, or website → `student/` |

```
Email + password ─▶ Firebase Auth ── wrong ──▶ "Wrong email or password"
                        │ right
                        ▼
                  ID token issued
                        │
                        ▼
              read users/{uid}.role
          ┌─────────────┼──────────────┐
        admin        teacher         student
     admin/index   teacher/index   student/index (website)
                                   or Home (app; the app refuses teacher/admin accounts)
```

- Registering makes the Auth account **and** `users/{uid}` with `role: "student"`. If the profile save fails, the new login is removed so the email can be tried again (`js/register.js`).
- The rules stop anyone from changing their own `role`.

---

## 6. Passwords: forgot, reset, temporary, admin change

### Forgot password (anyone, on the login page)

```
"Forgot password?" → email
      │
      ▼
notify-api POST /api/forgot-password      (public: CORS, honeypot field,
      │                                   5 per hour per IP in resetLimits/{hash})
      ├─ Firebase Admin makes a reset oobCode (1 hour)
      └─ Gmail sends a BaSaya-branded email ─▶ link to reset-password.html?oobCode=…
                                                 │
                                                 ▼
                                    page checks the code, user types new password,
                                    Firebase Auth saves it
```

- The answer is the same whether or not the email exists, so nobody can probe who is registered.
- If notify-api can't be reached, the page falls back to Firebase's plain reset email.

### Admin resets someone else

| Action | Endpoint | What happens |
|---|---|---|
| Email a reset link | `/api/send-password-reset` (admin) | Same branded email as above |
| Temporary password | `/api/set-temporary-password` (admin) | For a student with a fake or mistyped email: sets the password and signs them out of other devices |

### Admin changes their **own** password (needs email approval)

```
Admin → Account settings → new password (must have signed in within 5 minutes)
   │
   ▼
/api/request-admin-password-change
   • encrypts the new password with PASSWORD_CHANGE_SECRET
   • saves it in adminPasswordChanges (expires in 30 min)
   • emails Approve / Cancel links
   │
   ▼
Admin clicks Approve → confirm-password-change.html → button press
   → /api/confirm-admin-password-change { approve }
   → password set, admin signed out everywhere; each link works once
```

Nothing changes until a button on the page is pressed, so an email scanner opening the link does nothing.

---

## 7. Admin makes a lesson

**Admin → Lessons → + Add lesson** (the Lesson Studio, `admin/views/lessons.js`):

| Step | Admin fills in | Saved to |
|---|---|---|
| 1. Basics | title, difficulty, order, description | `lessons/{id}` |
| 2. Gawain (activity) | sentences + the correct words to tap, or **Skip Gawain** | `lessons/{id}/activity/content` (or `activity/status = skipped`) |
| 3. Lektura (lecture) | pages of sentences + **Generate audio** per sentence | `lessons/{id}/lectures/content` |
| 4. Bigkas (pronunciation) | words + **Generate audio** per word. A line under each word shows "Students see: ar·ki·pe·la·go" | `lessons/{id}/pronunciation/content` |
| 5. Pagsusulit + Laro | quiz questions; crossword levels from a key word, or **Skip game** | `lessons/{id}/quiz/content`, `lessons/{id}/game/*` |

**Publish lesson:**

1. Checks the quiz (every question has an answer) and the game levels (words only use the key word's letters).
2. Saves `lessons/{id}`.
3. Uploads every new audio preview to basaya-tts (section 8).
4. Saves each part with its audio links, then replaces the game levels.

A skipped Gawain or game is hidden from students and counts as done (`js/skippedParts.js`; in the app, `GameStatus.kt` / `ActivityStatus.kt`).

---

## 8. Text to speech (TTS)

Audio is made **once by the admin**, stored, and then just played. Students never call ElevenLabs, so credits are only spent when a lesson is written.

### A. Preview: **Generate audio**

```
ADMIN SITE (js/tts.js)          basaya-tts (Cloudflare)                  ElevenLabs
──────────────────────          ───────────────────────                  ──────────
click "Generate audio"
get ID token from Firebase
POST /generate  ───────────────▶ 1. Origin in ALLOWED_ORIGIN?   no → 403
{ text } + Bearer token          2. read users/{uid} WITH the token
                                    role teacher/admin?          no → 403
                                 3. text not empty, ≤ 1,500 chars
                                 4. POST text-to-speech/{voiceId} ───────▶ voice
                                    xi-api-key = secret                    eleven_v4_turbo
                                    ◀──────────────────────────────────── MP3 (44.1 kHz, 128 kbps)
play preview in the browser ◀── 5. stream MP3 back (not stored yet)
```

You can regenerate up to 5 times per sentence. Nothing is stored until **Publish**.

### B. Save: on **Publish lesson**

```
for each NEW preview:
POST /save-audio (FormData: MP3, lessonId, section, page, sentence) ─▶ basaya-tts
   same checks, file < 15 MB, ids validated
   R2.put("lessons/{id}/{lectures|pronunciation}/page-N/sentence-N-<uuid>.mp3",
          cache: 1 year, immutable)
   ◀── { audioUrl: "https://basaya-tts…workers.dev/audio/lessons/…mp3", storageKey }
website writes into Firestore:  cloudAudio[i] = { audioUrl, storageKey, text, wordStarts? }
```

`wordStarts` = when each word starts, in seconds (words = text split on spaces). `/generate` with `timings: true` calls ElevenLabs `/with-timestamps` and returns `{ audioBase64, alignment }`; js/tts.js turns the per-letter times into word starts. The Lecture (student/readAlong.js, app ReadAlongTextView) moves a bubble from word to word with them, or estimates them from word lengths for older audio. `text` remembers what the audio says. If the sentence is edited later, the old audio no longer matches and is dropped.

### C. Playback: the student hears it

`GET /audio/<key>` on basaya-tts reads R2 and returns the MP3 (public, cached a year). The order each platform tries:

| Where | 1st | 2nd | 3rd | Last resort |
|---|---|---|---|---|
| **App, Lektura** | downloaded file (`filesDir/lecture_audio/…`) | cached copy (`LectureAudioCache`) | stream `audioUrl` | audio packed in the app (older lessons) |
| **App, Bigkas** | downloaded file (`filesDir/pronunciation_audio/…`) | stream `audioUrl` (online) | raw resource in the app | **Android TextToSpeech** (phone's own voice) |
| **Website, Lektura** | downloaded/cached copy if any | stream `audioUrl` | — | silent (text still shows) |
| **Website, Bigkas** | stream `audioUrl` | — | — | **browser `speechSynthesis`** (`fil-PH` voice) |

**Why this design:** each ElevenLabs credit is spent once per sentence, not once per student. R2 serves files cheaply, and the app keeps copies for offline use.

*Not built yet (postponed): ElevenLabs audio for dictionary words, generated on first tap.*

---

## 9. Teacher makes a class, student joins

```
TEACHER                                          STUDENT (app or website)
+ New class → grade + section                    Sumali sa Klase → types the code
classes/{classId} = {                            find class by classCode ── none → "Walang klaseng…"
  className, classCode "AB12CD",                       │ found
  teacherId, gradeLevel }                              ▼
                                                 ONE batch (both or nothing):
                                                  • classes/{classId}/students/{uid} = { fullName, joinedAt }
                                                  • users/{uid} += { classId, className }
                                                       │
                                                       ▼
                                                 App: subscribes to FCM topic class_{classId}
```

A student is in **one class at a time**. The rules only allow `classId` to change when joining with a real roster entry, or when the teacher approves leaving.

---

## 10. Teacher adds a lesson → notification → student

This is the full path of one "new lesson" notification.

```
① TEACHER SITE (teacher/views/addLesson.js)
   Class page → + Add lesson → picks lessons, mode (Assessment / Practice),
   optional Open date + Deadline
        │  writes directly to Firestore (rules: teachesClass)
        ▼
   classes/{classId}/classLessons/{linkId} = { order, mode, openAt?, dueAt?, notifyPending: true }
        │
② js/schedule.js → js/api.js
   POST {notifyApiUrl}/api/notify-lesson
   Authorization: Bearer <teacher's ID token>
   { classId, lessonIds: [...] }
        │
        ▼
③ notify-api (Vercel)  api/notify-lesson.js
   a. verify the ID token (Admin SDK)                         → 401 if bad
   b. classes/{classId}.teacherId == caller?                  → 403 if not
   c. every link exists in classLessons                       → 404 if not
   d. read lesson titles; build message:
        1 lesson:  "📘 Bagong aralin: <title>"   body "Deadline: Okt 20, 5:00 PM" / "Walang deadline"
        many:      "📘 3 bagong aralin"          body "<titles>\nDeadline: …"
   e. visibleAt = max(now, openAt)       ← students see it when the lesson OPENS
   f. FCM send → topic "class_<classId>", DATA message (high priority):
        { type: "new_lesson", notificationId, classId, lessonIds, title, body, visibleAt }
   g. batch: save classes/{classId}/notifications/{id}  (the bell list)
             classLessons/* .notifyPending = false, notifiedAt = now
        │
        ├──────────────────────────────────────────┬────────────────────────────────────────┐
        ▼                                          ▼                                        ▼
④ ANDROID APP (push)                       ⑤ STUDENT WEBSITE (no push)              If ②/③ failed
LessonMessagingService.onMessageReceived    student/views/notifications.js          (teacher offline,
 • ignore if not this phone's class          On open / refresh, reads               API down):
 • sync the new lesson + real time first     classes/{classId}/notifications         notifyPending stays
 • save to Room (ClassNotificationEntity)    and shows items whose visibleAt         true, and the class
 • NotificationScheduler.run():              has passed in the 🔔 list +             page shows a
     visibleAt passed → show now             red badge                               "Notify students"
     still future → AlarmManager alarm       (Mga Abiso, #/notifications)            button to retry
       at visibleAt (trusted clock)
 • tap → Home, lesson highlighted
 • bell list + red badge
```

**Read / unread:** each student has one "read up to" time. It's stored on the device and in `users/{uid}.notifReadAt`, so marking items read on the website also clears them in the app (`NotificationReadState.kt`, `student/views/notifications.js`). Anything newer than that time is unread.

**Why a data message instead of a ready-made notification:** a ready-made one would show immediately. A data message lets the app **hold it until the lesson opens** (`visibleAt`), skip it if the phone left that class, and use the app's own channel, icon and tap action.

**Other pushes on the same topic:**

| Type | Sent by | When |
|---|---|---|
| `new_lesson` | `/api/notify-lesson` | teacher adds lessons |
| `deadline_extended` | `/api/notify-deadline` | teacher extends a deadline (also saved to the bell list) |
| `chat_message` | `/api/notify-chat` | teacher posts in the class chat (section 12) |

---

## 11. Deadlines, reminders and the trusted clock

| Situation | Student sees |
|---|---|
| before `openAt` | **Bubukas** + date; can't open it |
| open, no `dueAt` | **Walang deadline** |
| open, with `dueAt` | due date + reminders |
| after `dueAt` | locked. The parts done so far count, and the rest count as wrong (0) |

**Reminders are made on the phone/site, not pushed.** Each lesson's `dueAt` produces three: 1 day before, 1 hour before, and at closing (`LessonInbox.kt`, `student/views/notifications.js`). Practice lessons get none.

**Trusted clock (cheating the date doesn't work):**

```
online:  ask Firestore for server time, remember it with
         SystemClock.elapsedRealtime() (app) / performance.now() (web)
offline: now = last server time + time since then          ← changing the date has no effect
restart: no trusted time until next sync; "new lesson" items wait for it
```

`TrustedClock.kt` and `student/data.js`. The Firestore rules check the lesson window with `request.time` (Google's clock) too, so saving progress outside open → deadline is refused anyway.

---

## 12. Class chat

One group chat per class (full details in `messaging.md`).

```
Teacher (website, Messages)      Students (app Chat tab / website #/chat)
          └──── read/write ─▶ Firestore ◀─ read/write ────┘
               classes/{classId}/messages      (latest 30 live, older on demand)
               classes/{classId}/chat/state    (lastAt → unread dots, 1 cheap read)
               classes/{classId}/chatSenders   (5-second send limit per person)
          │ teacher messages only
          ▼
notify-api /api/notify-chat → checks: teacher of the class, own message, < 2 min old,
                              not already pushed → FCM { type: "chat_message" } → sets pushedAt
          ▼
App: shows it unless the chat is open; one notification per class (newest replaces older)
```

Student messages don't push, so phones aren't flooded and the free tier is enough.

---

## 13. Student studies a lesson

### App vs website

| | Android app | Student website |
|---|---|---|
| Lessons | **Download** for offline (Room + MP3 files) | online only |
| Push notifications | yes (FCM) | no (bell updates when the site is open) |
| Bigkas fallback | Android speech recognizer | browser speech recognition (if any) |
| Data | same Firestore fields | same Firestore fields |

### Download (app)

`Download` copies the lecture, activity, pronunciation, quiz and game into **Room**, and the MP3s into `filesDir`. Everything then works offline except Whisper checking. Offline progress writes wait in Firestore's offline queue and upload when back online.

### The lesson path and skills

| Part (Filipino name) | What the student does | Skill scored |
|---|---|---|
| Lektura | reads pages, hears each sentence | Pag-unawa (completion) |
| Laro | crossword: swipe letters on the wheel | Talasalitaan |
| Gawain | tap the correct words in a sentence | Pagkilala |
| Bigkas | say each word into the mic (3 lives per word) | Pagbigkas |
| Pagsusulit | quiz (one or many answers) | Pagsusulit |

- **Resume:** closing the Lektura, Gawain or Bigkas saves the place (`assignedLessons/{id}.resume.{part}`), so the student continues there on the app **or** the website (`LessonResume.kt`, `student/data.js`). The quiz starts over.
- **Practice lessons:** a teacher can add a lesson as **Practice** (`mode: "practice"`, link id `{lessonId}__practice`). It can be repeated freely, saves nothing, and is left out of reports. The rules reject its writes too.
- **Skipped parts:** a game or Gawain the admin skipped is hidden and counts as done.
- **Finished lesson:** every part done (`LessonCompletion.kt`). Only lessons in the student's current class count.

---

## 14. Bigkas: how the student's voice is checked (STT)

```
Student taps 🎤 and says "mataba"
      │
      ▼
Record 16 kHz mono WAV, stop after 0.8 s of quiet
(VoiceRecorder.kt / student/speech.js record())
      │
      ▼
POST https://basaya-stt…workers.dev/transcribe   (audio/wav)
   app:     header X-App-Key: <APP_KEY>
   website: Authorization: Bearer <student's ID token>, from an ALLOWED_ORIGIN site
      │                     (Worker checks the token by reading users/{uid} with it)
      ▼
Workers AI  @cf/openai/whisper-large-v3-turbo, language "tl"
      │
      ▼  { text: "mataba" }
Score (PronunciationScorer.kt / speech.js score()):
   • o/u and e/i count as the same sound (puno ≈ punu)
   • short words must match; words over 7 letters may have one slip
   → "great" / "okay" (correct)   or   "try again" (lose a life; 3 per word)
```

| If… | Then |
|---|---|
| no internet | "Kailangan ng internet" message (app) |
| Worker busy or free daily limit used up | **app:** Android SpeechRecognizer · **website:** browser speech recognition |
| nothing heard | no life lost |

Saved: first-try correct words, attempts, and the words that needed help (`hardWords`) for the teacher's item analysis.

---

## 15. Saving progress, scores and teacher reports

```
part finished ─▶ users/{uid}/assignedLessons/{lessonId}   (correct/attempts per part, finished flags,
                 │                                         hardWords, resume; rules: own doc only,
                 │                                         lesson must be in my class and open)
                 └─▶ users/{uid}.skillSummary              (5 skill scores, recalculated)
```

**Score rules** (same code in `js/scoring.js` and `SkillScoring.kt`; change both together):

1. Per lesson: first-try correct ÷ attempts × 100.
2. Combine lessons with recency weight: items × 0.85^(how many lessons ago).
3. Label: 85+ Very good · 70–84 Good · 50–69 Fair · < 50 Poor ("Not enough data" until 2 lessons or 10 items).
4. Trend arrow after 3 lessons (±10). "Needs help" when the last 2 lessons are both below 60.
5. A part unfinished at the deadline: progress so far counts, and the rest counts as wrong, weighted by its item count (`js/lessonItems.js`, `LessonItems.kt`).

**What the teacher sees:**

| Page | Shows |
|---|---|
| Students | roster, gender/birthdate, leave requests, View progress, Remove |
| Student progress | 5 skill rings, trends, sparklines, lesson table, remarks |
| Class Report | class averages, who needs help, **"What to re-teach"** (quiz questions and Bigkas words most missed) |
| Export | Print / Save as PDF (`css/layout/print.css`) and Excel (ExcelJS, loaded on first export, `teacher/views/reportExport.js`) |

Teacher pages are in English. Student pages are in Filipino. The skill keys in the data never change ("Lecture" is shown as "Lektura" everywhere).

---

## 16. Diksiyonaryo: where the words come from

A Tagalog dictionary that explains words **in Filipino**. Students open it from the 📖 button in the top bar (website `#/diksiyonaryo`, app `DictionaryActivity`).

### Two sources

| Source | Lives in | Changed by | Cost to read |
|---|---|---|---|
| **Wiktionary words** (~1,600) | `data/dictionary/tl-seed.json` (static file), and a copy in the app's `assets/dictionary/` | rebuilding with `tools/build-dictionary.mjs` | free (static file / bundled) |
| **Teacher words** | Firestore `dictionary/{key}` | teachers and admins on the **Dictionary** page | Firestore reads |

`key` is the word in lowercase without accent marks (`Báhay` → `bahay`, from `normalizeWord()` / `DictionaryWords.normalize`). A teacher doc with the same key **replaces** the Wiktionary word, and `hidden: true` **hides** it.

### How the static file is built (once, by hand)

```
dumps.wikimedia.org/tlwiktionary/latest/tlwiktionary-latest-pages-articles.xml.bz2
   (~10 MB zipped, 66 MB XML, ~31,000 pages)
        │  node tools/build-dictionary.mjs <dump.xml>
        │   1. keep real word pages (no redirects/talk/help)
        │   2. keep only the ==Tagalog== section
        │   3. read part of speech, # definitions, #: examples, synonyms, accent
        │   4. strip wiki markup  ([[kubo]] → kubo)
        │   5. drop empty/junk, merge duplicates
        ▼
data/dictionary/tl-seed.json  (~280 KB, short field names w/k/a/s/syn to stay small)
        │  copy to C:\Projects\BaSaya\app\src\main\assets\dictionary\tl-seed.json
        ▼
served with the website · bundled in the app
```

Wiktionary is CC BY-SA 4.0, so the credit line stays visible on every dictionary page (`data/dictionary/LICENSE.md`).

### Looking up a word (student)

```
types "kumakain"
   │
   ▼
searchWords(prefix):  tl-seed.json (cached in memory)  +  Firestore dictionary where key starts with prefix
   │                  teacher words replace/hide seed words
   ├── found  → list → tap → meanings, examples, synonyms, syllables
   └── none   → suggestRoots(): strip affixes/infixes/repeated syllable
                  kumakain → kakain → kain   ("Baka ang salitang-ugat ang hinahanap mo: kain")
                  (one Firestore query at most)
```

### Teachers and admins edit words

Teacher `#/dictionary` and admin `#/dictionary` show the same page (`teacher/views/dictionary.js`):

- Every word **A to Z** (seed + teacher words + hidden), 50 at a time, with letter buttons, search, and a filter (All / Changed by teachers / Hidden).
- Opening a word shows its meanings, examples and synonyms, like the student page.
- **Add / Edit:** word, accented spelling, **syllables**, meaning groups (part of speech, meanings, examples), synonyms. Editing a Wiktionary word saves a teacher copy that replaces it.
- **Hide:** hides a Wiktionary word from students.
- **Delete / Restore original:** whoever added the word, or any admin.

Rules: everyone signed in reads. Teachers and admins add and edit, and the rules check each field's size, including `syllables` ≤ 120 characters.

---

## 17. Pantig (syllables) and the Bigkas ⓘ button

### Automatic syllables

`js/syllables.js` (web) and `Syllables.kt` (app) split words using the KWF rules. They must give the same output, and `SyllablesTest.kt` checks the shared examples:

| Between vowels | Rule | Example |
|---|---|---|
| none | split the vowels | ka·in |
| 1 consonant | it starts the next syllable | ba·hay |
| 2 consonants | one each side | ak·lat, bun·dok |
| 3 consonants | 2 stay, 1 moves, unless the last 2 are a cluster (tr, pl, kw, ts…) | sen·tro, es·kwe·la |
| 4+ | 2 and 2 | eks·tra |

"ng" counts as one letter (a·ngaw), consonants at the start stay together (tra·ba·ho), and hyphens and spaces always split (pag-i·big).

**Teacher fix:** if the automatic split is wrong, a teacher or admin types it in the word's **Syllables** box (`trak.tor` or `trak·tor`). It's saved as `syllables` on `dictionary/{key}` and wins everywhere.

**Where syllables show:** under the word in the Diksiyonaryo, under the word in Bigkas (display only, since scoring uses the plain word), and in the admin lesson editor ("Students see: …").

### The ⓘ button in Bigkas

```
Bigkas shows word i
   │
   ▼
lookupWord(word)  (seed file + one Firestore get, once per word)
   ├── found  → green ⓘ appears left of the word (wiggles once)
   │            syllables = teacher fix, else automatic
   │            tap → pop-up (web) / bottom sheet (app):
   │                  word · syllables · part of speech · FIRST meaning group · examples · Isara
   └── not found → no ⓘ   (e.g. "mataba": only the root "taba" is in the dictionary)
```

Opening the ⓘ doesn't use a life, change the score, or save anything.

---

## 18. Leaving, removing, deleting

| Action | Who | How | What's removed |
|---|---|---|---|
| **Leave a class** | student asks → teacher approves | `students/{uid}.leaveRequest` → teacher Approve calls `/api/remove-student` (Decline saves a note) | roster entry, progress for that class's lessons, `classId/className/skillSummary` |
| **Remove a student** | teacher | `/api/remove-student` | same as above. The account stays and can rejoin with a code. |
| **Remove a lesson from a class** | teacher | `/api/remove-class-lesson` | the Assessment link(s) + every student's `assignedLessons/{lessonId}`, so re-adding starts fresh. The library lesson stays. |
| **Delete a class** | teacher **requests**, admin approves (types `delete`) | `classes/{id}.deletionRequest` → `/api/delete-class` (admin only) | the class, roster, lesson links, notifications, chat, students' progress and class links. Accounts and the lesson library stay. |
| **Delete a lesson** (library) | admin | Lessons page, with usage check | the lesson and its parts |

These go through notify-api because they touch **other users'** documents, which the rules (rightly) don't allow from a browser. The Admin SDK can.

---

## 19. Contact form and emails

| Email | Trigger | Sent by |
|---|---|---|
| Contact message (+ optional photo, shrunk in the browser to fit the 3 MB limit) | site footer → Contact | `/api/contact` → team Gmail (5/hour/IP, honeypot) |
| Password reset | Forgot password / admin | `/api/forgot-password`, `/api/send-password-reset` |
| Admin password approval | admin Account settings | `/api/request-admin-password-change` |

Templates are in `notify-api/lib/emails.js`. Sending uses Gmail SMTP with an App Password (`lib/mailer.js`), about 500 emails a day free.

---

## 20. How everything is protected

| Layer | Stops |
|---|---|
| **Firebase Auth** | anyone without a correct email + password |
| **Firestore rules** | students changing roles, reading other students, editing lessons, leaving a class without approval, saving progress outside the lesson dates or for Practice, chat spam (5-second limit), bad dictionary data. Classes can't be deleted directly. |
| **notify-api** | every call needs a valid ID token; ids must match a strict pattern; must teach the class (or be admin); public endpoints are rate-limited per IP |
| **basaya-tts** | only `ALLOWED_ORIGIN` sites and only teacher/admin can generate; the ElevenLabs key stays a Cloudflare secret; upload size and ids are checked |
| **basaya-stt** | app key, or a valid student token from an allowed site |
| **Website escaping** | everything typed is shown as text (`escapeHtml`), so no XSS. There's no SQL, so no SQL injection. |
| **Secrets** | service account, Gmail App Password and `PASSWORD_CHANGE_SECRET` in Vercel; ElevenLabs key and `APP_KEY` in Cloudflare. **Never in GitHub.** |

---

## 21. Where everything is saved

```
Firestore
├── users/{uid}                        role, names, gender, birthdate, classId, className,
│   │                                  skillSummary, notifReadAt
│   └── assignedLessons/{lessonId}     one student's results + resume for one lesson
├── lessons/{lessonId}                 title, difficulty, order, description
│   ├── activity/content | status      Gawain (or skipped)
│   ├── lectures/content               pages, sentences, cloudAudio
│   ├── pronunciation/content          words, cloudAudio
│   ├── quiz/content                   questions, choices, answers
│   └── game/{levelId} | status        crossword levels (or skipped)
├── classes/{classId}                  className, classCode, teacherId, gradeLevel, deletionRequest?
│   ├── students/{uid}                 fullName, joinedAt, leaveRequest?, leaveDeclined?
│   ├── classLessons/{linkId}          order, mode, openAt?, dueAt?, notifyPending, notifiedAt
│   ├── notifications/{id}             new_lesson / deadline_extended items (visibleAt)
│   ├── messages/{id}, chat/state, chatSenders/{uid}     class chat
├── dictionary/{key}                   teacher words: word, accent, syllables, senses, synonyms, hidden
├── contactLimits/, resetLimits/       rate-limit counters (hashed IP, expiresAt)
└── adminPasswordChanges/              encrypted pending admin passwords (notify-api only)

Cloudflare R2  (via basaya-tts)
└── lessons/{lessonId}/{lectures|pronunciation}/page-N/sentence-N-<uuid>.mp3

Static files
└── data/dictionary/tl-seed.json       Wiktionary words (site + app assets)

Student's phone (app)
├── Room database                      downloaded lessons, notifications, crossword progress
├── filesDir/lecture_audio/…           downloaded lecture MP3s
├── filesDir/pronunciation_audio/…     downloaded Bigkas MP3s
└── SharedPreferences                  subscribed topic, notification read time, chat read time

Student's browser (website)
└── localStorage                       chat read time, small UI preferences
```

---

## 22. What it costs (free limits)

| Service | Free allowance | BaSaya's use |
|---|---|---|
| Render (static site) | free static hosting | the websites |
| Firebase Auth + Firestore (Spark) | 50k reads / 20k writes a day | everything; kept low by static dictionary, 30-message chat window, `chat/state` badges |
| FCM | free | topic pushes |
| Vercel Hobby | free serverless | notify-api |
| Cloudflare Workers | 100k requests/day | basaya-tts, basaya-stt |
| Cloudflare R2 | 10 GB storage, free egress | lesson MP3s |
| Workers AI | 10,000 Neurons/day (~200 audio minutes) | Whisper. Past it, it falls back to the device recognizer. |
| ElevenLabs | paid credits (per character) | only when the admin generates audio |
| Gmail | ~500 emails/day | resets, approvals, contact |

---

## 23. When something breaks

| You see | Likely cause | Fix |
|---|---|---|
| Generate audio → "Failed to fetch" | site not in basaya-tts `ALLOWED_ORIGIN`, or the Worker isn't deployed | add the site, redeploy (`basaya-tts-worker.md`) |
| "ElevenLabs could not generate the audio." | bad key or no credits | check ElevenLabs + the Cloudflare secret |
| "Missing or insufficient permissions" | live rules older than `firestore.rules` | `firebase deploy --only firestore:rules` |
| No "new lesson" push | notify-api env vars, phone never opened Home after joining, lesson not open yet (`visibleAt`) | check Vercel env; open the app; wait for the open date |
| "Notify students" button on a lesson | the push call failed | click it to retry |
| Bigkas always uses the phone/browser recognizer | Whisper daily limit used up, or the site isn't in basaya-stt `ALLOWED_ORIGIN` | wait for reset / add the site and `wrangler deploy` |
| Syllable fix won't save | dictionary rules without `syllables` not deployed | deploy the rules |
| A word has no ⓘ in Bigkas | the word isn't in the dictionary | add it on the Dictionary page |
| Reset email never arrives | Gmail App Password missing | set `GMAIL_APP_PASSWORD`. The site falls back to Firebase's email. |

---

## 24. File map

**Website (`BaSaya-web`)**

| Area | Files |
|---|---|
| Login, register, reset | `index.html`, `js/login.js`, `register.html`, `js/register.js`, `js/forgot-password.js`, `reset-password.html`, `confirm-password-change.html` |
| Shared | `firebase-config.js`, `js/firebase.js`, `js/helpers.js`, `js/state.js`, `js/api.js` (notify-api), `js/tts.js` (basaya-tts) |
| Admin | `admin/views/lessons.js` (Lesson Studio), `gameLevels.js`, `teachers.js`, `students.js`, `classes.js`, `classDeletion.js`, `account.js` |
| Teacher | `teacher/views/classPage.js`, `addLesson.js`, `studentProgress.js`, `classReport.js`, `reportExport.js`, `messages.js`, `dictionary.js` |
| Student | `student/data.js`, `speech.js`, `views/home.js`, `lessonPath.js`, `lecture.js`, `game.js`, `quiz.js`, `pronunciation.js`, `notifications.js`, `dictionary.js` |
| Logic shared with the app | `js/scoring.js`, `js/lessonItems.js`, `js/schedule.js`, `js/skippedParts.js`, `js/dictionaryWords.js`, `js/syllables.js`, `js/dictionary.js` |
| Back end | `notify-api/api/*.js`, `notify-api/lib/*.js`, `firestore.rules` |
| Dictionary data | `data/dictionary/tl-seed.json`, `tools/build-dictionary.mjs` |

**App (`C:\Projects\BaSaya`)**

| Area | Files |
|---|---|
| Notifications | `data/notifications/LessonMessagingService.kt`, `ClassNotifications.kt`, `NotificationScheduler.kt`, `NotificationAlarmReceiver.kt`, `LessonInbox.kt`, `NotificationReadState.kt` |
| Time | `data/schedule/TrustedClock.kt`, `LessonSchedule.kt` |
| Lessons + offline | `data/repository/*Repository.kt`, `data/database/AppDatabase.kt`, `data/audio/*AudioStore.kt` |
| Progress | `data/progress/SkillScoring.kt`, `LessonItems.kt`, `LessonResume.kt`, `PracticeLessons.kt`, `LessonCompletion.kt` |
| Speech | `speech/VoiceRecorder.kt`, `WhisperSttClient.kt`, `PronunciationScorer.kt`, `ui/pronunciation/PronunciationActivity.kt` |
| Dictionary | `data/dictionary/Dictionary.kt`, `DictionaryWords.kt`, `Syllables.kt`, `ui/dictionary/DictionaryActivity.kt`, `assets/dictionary/tl-seed.json` |
| Chat | `data/chat/ClassChat.kt`, `ui/fragment/ChatFragment.kt` |
| STT Worker | `cloudflare/basaya-stt/src/index.js`, `wrangler.jsonc` |

**Keep in sync between web and app:** scoring, lesson item counts, schedule rules, skipped parts, resume shape, practice mode, dictionary keys (`normalizeWord`), syllable rules, and the dictionary seed file.
