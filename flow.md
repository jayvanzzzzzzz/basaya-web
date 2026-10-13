# How BaSaya works — the whole cycle

A plain-language map of every part of BaSaya and how data moves between them.
Read it top to bottom: it follows a lesson from the moment the admin types it to the moment a teacher reads the student's score.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Who can do what](#2-who-can-do-what)
3. [Logging in](#3-logging-in)
4. [Admin creates a lesson](#4-admin-creates-a-lesson)
5. [Generating audio (step by step)](#5-generating-audio-step-by-step)
6. [Teacher creates a class](#6-teacher-creates-a-class)
7. [Student joins the class](#7-student-joins-the-class)
8. [Teacher adds lessons + notifications](#8-teacher-adds-lessons--notifications)
9. [Student downloads and studies a lesson](#9-student-downloads-and-studies-a-lesson)
10. [Scores and the teacher's reports](#10-scores-and-the-teachers-reports)
11. [Leaving a class](#11-leaving-a-class)
12. [Removing a student / deleting a class](#12-removing-a-student--deleting-a-class)
13. [How everything is protected](#13-how-everything-is-protected)
14. [Where everything is saved](#14-where-everything-is-saved)
15. [When something breaks](#15-when-something-breaks)

---

## 1. The big picture

BaSaya has **3 apps** and **4 helper services**.

```
   ┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
   │  ADMIN website       │      │  TEACHER website     │      │  STUDENT app         │
   │  basaya.onrender.com │      │  basaya.onrender.com │      │  Android (Kotlin)    │
   │  makes lessons       │      │  runs classes        │      │  learns, plays       │
   └──────────┬───────────┘      └──────────┬───────────┘      └──────────┬───────────┘
              │                             │                             │
              └──────────────┬──────────────┴──────────────┬──────────────┘
                             ▼                             ▼
                ┌─────────────────────────┐   ┌──────────────────────────────┐
                │  FIREBASE               │   │  HELPER SERVICES             │
                │  • Auth (logins)        │   │  • basaya-tts  (Cloudflare)  │
                │  • Firestore (database) │   │      makes lesson audio      │
                │  • Cloud Messaging      │   │  • basaya-stt  (Cloudflare)  │
                │      (push notifications│   │      hears the student speak │
                └─────────────────────────┘   │  • notify-api  (Vercel)      │
                                              │      push, remove, delete    │
                                              │  • ElevenLabs                │
                                              │      the voice behind TTS    │
                                              └──────────────────────────────┘
```

| Part | Where it runs | Its job |
|---|---|---|
| Admin website | Render (`/admin/`) | Create and edit lessons, manage teachers and all classes, approve class deletions |
| Teacher website | Render (`/teacher/`) | Create classes, add lessons with dates, see progress and reports, handle leave requests |
| Student app | Android phone | Join a class, download lessons, study, play, take quizzes |
| Firebase Auth | Google | Checks email + password and gives each user a sign-in token |
| Firestore | Google | The database: lessons, classes, students, scores |
| Cloud Messaging (FCM) | Google | Sends the "new lesson" push to phones |
| basaya-tts | Cloudflare Worker | Turns lesson text into an MP3 (using ElevenLabs) and stores it in R2 |
| basaya-stt | Cloudflare Worker | Turns the student's recorded voice into text (Whisper AI) |
| notify-api | Vercel | Jobs the website can't do safely by itself: push notifications, removing a student, deleting a class |

---

## 2. Who can do what

Every user has a `role` saved in `users/{uid}`.

| Role | How the account is made | Can do |
|---|---|---|
| **Admin** | Set up by hand | Everything below, plus lessons, teachers, all classes, delete classes |
| **Teacher** | Created by the admin | Own classes only: lessons, dates, students, reports |
| **Student** | Registers in the app (always `student`) | Join one class, study, ask to leave |

A student can never change their own role. The database rules stop it (section 13).

---

## 3. Logging in

```
User types email + password
        │
        ▼
Firebase Auth checks them ──── wrong ───▶ "Wrong email or password"
        │ correct
        ▼
App gets a sign-in TOKEN (a signed pass that proves who you are)
        │
        ▼
App reads users/{uid}.role
        ├── admin   → admin website
        ├── teacher → teacher website
        └── student → student app home
```

The token is sent along with every later request (to the database, to basaya-tts, to notify-api), so each one knows who is asking.

---

## 4. Admin creates a lesson

**Admin → Lessons → + Add lesson** opens the Lesson Studio with 5 steps:

| Step | What the admin fills in | Saved as |
|---|---|---|
| 1. Basics | Title, difficulty, order, description | `lessons/{id}` |
| 2. Activity | Sentences; taps the correct words (tap-the-word) | `lessons/{id}/activity/content` |
| 3. Lectures | Pages of sentences + **Generate audio** for each | `lessons/{id}/lectures/content` |
| 4. Pronunciation | Words to say + **Generate audio** for each | `lessons/{id}/pronunciation/content` |
| 5. Quiz & game | Questions (3 choices) and game levels, or **Skip game** | `lessons/{id}/quiz/content`, `lessons/{id}/game/*` |

### The game level builder (step 5)

```
Key word:   L A M E S A        ← 3 to 7 letters = the student's letter wheel
Words:      MESA ✓  MALAS ✓  SALA ✓  LASA ✓     ← 1 to 4 words
Preview:    the crossword exactly as the app will draw it
```

- A word is only accepted if it uses the key word's letters, and no letter more times than the key word has it.
  `MILA` → ✗ "LAMESA has no I". `SAMAA` → ✗ "uses A 3 times, LAMESA has it only twice".
- **Publish** is blocked until every level is valid. A tip offers **Skip game** if words are hard to find.
- Saved order: key word first, then longest to shortest.

### What happens when the admin clicks **Publish lesson**

```
1. Check the quiz (every question has a correct answer)
2. Check the game levels (rules above)
3. Save lessons/{id}  (title, difficulty, order, description)
4. Upload every NEW audio preview to basaya-tts  → get back a link   (section 5, part B)
5. Save activity, lectures (+ audio links), pronunciation (+ audio links), quiz
6. Replace the game levels (or save game/status = "skipped")
7. "Lesson published."
```

---

## 5. Generating audio (step by step)

Audio is made in **two parts**: first a **preview** you can listen to, then the **upload** when you publish.
Nothing is stored until you publish, so trying several versions is free of clutter.

### Part A: Preview (when you click **Generate audio**)

```
 ADMIN WEBSITE                    basaya-tts (Cloudflare)              ELEVENLABS
 ─────────────                    ───────────────────────              ──────────
 1. You click "Generate audio"
    on a sentence or word
          │
 2. Website gets your sign-in
    token from Firebase
          │
 3. POST /generate ──────────────▶ 4. Is the website allowed?
    { text: "Ang aso ay           (ALLOWED_ORIGIN list:
      tumatakbo." }                 localhost, basaya.onrender.com)
    + token                          no → 403 "Origin not allowed"
                                          (browser shows "Failed to fetch")
                                     │ yes
                                  5. Who is asking?
                                     reads users/{uid} from Firestore
                                     WITH your token
                                     not teacher/admin → 403
                                     │ ok
                                  6. Text checks:
                                     empty → 400
                                     over 1500 chars → 400
                                     │ ok
                                  7. Ask ElevenLabs ────────────────▶ 8. Makes the voice
                                     (secret API key,                    (multilingual v2)
                                      never shown to you)
                                     ◀───────────────────────────────── MP3 audio
                                     │
 10. Website plays the MP3 ◀───── 9. Sends the MP3 back
     preview so you can listen
     (kept in the browser only)
```

- You can regenerate a sentence up to **5 times** before publishing.
- If you change the sentence text after generating, the old audio no longer matches, so generate again.

### Part B: Upload (when you click **Publish lesson**)

```
 ADMIN WEBSITE                    basaya-tts (Cloudflare)              R2 STORAGE
 ─────────────                    ───────────────────────              ──────────
 1. For each NEW preview:
    POST /save-audio ────────────▶ 2. Same checks (website allowed,
    MP3 + lessonId +                  teacher/admin, file under 15 MB,
    section + page + sentence         valid ids)
                                     │
                                  3. Saves the file ────────────────▶ lessons/{id}/lectures/
                                                                       page-1/sentence-2-xxxx.mp3
                                     │
 5. Writes the link into  ◀────── 4. Returns { audioUrl, storageKey }
    the lesson's cloudAudio
    in Firestore
```

Each saved sentence looks like this in the database:

```json
{ "audioUrl": "https://basaya-tts…workers.dev/audio/lessons/…/sentence-2-….mp3",
  "storageKey": "lessons/…/sentence-2-….mp3",
  "text": "Ang aso ay tumatakbo." }
```

`text` remembers what the audio says. If you later edit the sentence, the old audio is dropped.

### Part C: The student hears it

```
Student opens a lecture page
        │
        ▼
Is the MP3 downloaded on the phone? ── yes ─▶ play the phone's copy (works offline)
        │ no
        ▼
Is there an audioUrl? ── yes ─▶ stream it from basaya-tts GET /audio/… (needs internet)
        │ no
        ▼
Older lessons: play the audio packed inside the app
```

---

## 6. Teacher creates a class

```
Teacher → + New class → grade + section
        │
        ▼
classes/{classId} = { className: "Grade 8 - Aguinaldo", classCode: "AB12CD",
                      teacherId, gradeLevel, … }
```

The **class code** is what students type to join.

---

## 7. Student joins the class

```
Student app → Join Class (+) → types the class code
        │
        ▼
Find the class with that code ── none ─▶ "Walang klaseng natagpuan sa code na ito"
        │ found
        ▼
In ONE step (both or nothing):
  • classes/{classId}/students/{uid} = { fullName, joinedAt }    ← the class roster
  • users/{uid} += { classId, className }                        ← the student's link
        │
        ▼
Home shows the class name; the Join Class button disappears
The phone subscribes to the push topic  class_{classId}
```

A student is in **one class at a time**.

---

## 8. Teacher adds lessons + notifications

```
Teacher → class page → + Add lesson → picks lessons
          optional: Open date  and  Deadline
        │
        ▼
classes/{classId}/classLessons/{lessonId} = { order, openAt?, dueAt?, notifyPending: true }
        │
        ▼
Website calls notify-api  POST /notify-lesson  (with the teacher's token)
        │
        ▼
notify-api (Vercel):
  1. Checks the token and that this teacher owns the class
  2. Saves classes/{classId}/notifications/{id}
        (visibleAt = now, or the open date if later)
  3. Sends a push to topic class_{classId} through Firebase Cloud Messaging
  4. Marks the lesson notifyPending = false
        │
        ▼
Student's phone:
  • Shows "📘 Bagong aralin: <title>" + the deadline (only once the lesson is open)
  • Adds it to the bell 🔔 list with a red badge
  • Tapping it opens Home and highlights the lesson
```

### Open dates and deadlines

| Situation | What the student sees |
|---|---|
| Before the open date | Card says **Bubukas** + date; it can't be opened |
| Open, no deadline | **Walang Deadline** |
| Open, with deadline | The due date; a reminder notification before it ends |
| After the deadline | Locked; unfinished parts are scored **0** |

**Changing the phone's clock doesn't work.** The app keeps a "trusted clock" from the server time, and the database itself rejects saving progress outside the open → deadline window (it uses the server's time, not the phone's).

---

## 9. Student downloads and studies a lesson

### Download (for offline use)

```
Lesson card → Download
        │
        ▼
Copies to the phone (Room database + files):
  lecture text + lecture MP3s, activity, pronunciation + MP3s, quiz, game levels
        │
        ▼
The lesson now works without internet (except speech checking, below)
```

### The parts of a lesson

| Part | What the student does | Skill it scores |
|---|---|---|
| Lecture | Reads pages, listens to each sentence | Pag-unawa (completion only) |
| Activity | Taps the correct words in a sentence | Pagkilala |
| Pronunciation | Says each word into the microphone | Pagbigkas |
| Quiz | Answers questions (one or many answers) | Pagsusulit |
| Game | Swipes letters on the wheel to fill the crossword | Talasalitaan |

### How pronunciation is checked

```
Student taps the mic and says "Arkipelago"
        │
        ▼
Recording sent to basaya-stt (Cloudflare, Whisper AI, Tagalog)
        ├── got text   → compared with the word → correct / try again
        ├── no internet → "needs internet" message
        └── service busy or free limit reached → falls back to Android's
                                                 built-in speech recognizer
```

### Saving progress

```
Each part finished
        │
        ▼
users/{uid}/assignedLessons/{lessonId}  ← per-lesson results (correct / attempts per part)
users/{uid}.skillSummary                ← the 5 skill scores, recalculated
```

If the phone is offline, Firestore keeps the change on the phone and sends it when the internet is back.

---

## 10. Scores and the teacher's reports

### How a skill score is calculated (same rules in the app and the website)

```
1. Per lesson:   score = correct on the first try ÷ attempts × 100
2. Combine:      newer lessons count more   (weight = items × 0.85 ^ how many lessons ago)
3. Label:        85–100 Very good · 70–84 Good · 50–69 Fair · below 50 Poor
                 "Not enough data" until 2 lessons or 10 items
4. Flags:        Trend ↑ or ↓  needs 3 lessons (±10 points)
                 "Needs help" when the last 2 lessons are both below 60
```

The website's copy is `js/scoring.js`. The app's is `SkillScoring.kt`. Change both together.

### What the teacher sees

| Page | Shows |
|---|---|
| **Students** | The roster, leave requests, **View progress**, **Remove** |
| **View progress** (one student) | 5 skill cards with rings, trends, sparklines, lesson-by-lesson table, written remarks |
| **Class Report** | Each skill's class average, the overall class score, who needs help, every student's row |

---

## 11. Leaving a class

A student **can't just leave**: the teacher must approve.

```
STUDENT APP (Account → Aking Klase)            TEACHER WEBSITE (Students page)
──────────────────────────────────            ───────────────────────────────
1. Taps "Umalis sa klase"
2. Confirms, adds an optional reason
3. roster entry gets leaveRequest
   → shows "Hinihintay ang iyong guro"
   (can cancel while waiting)
                                         ───▶ 4. "Leave requests" panel + count badge
                                                  on "View students"
                                              5a. APPROVE → notify-api /remove-student
                                                  (deletes their progress for this class,
                                                   removes them, clears their class link)
                                              5b. DECLINE → optional note saved in
                                                  leaveDeclined
6. Next time the app opens:          ◀───
   approved → "Wala ka pang klase",
              Join Class button is back
   declined → "Hindi pumayag ang iyong guro"
              + the teacher's note → "Sige"
```

---

## 12. Removing a student / deleting a class

### Teacher removes a student

```
Students page → × → confirm
        │
        ▼
notify-api POST /remove-student  (checks: you teach this class, the student is in it)
        ├── deletes classes/{classId}/students/{uid}
        ├── deletes their assignedLessons for this class's lessons
        └── clears their classId / className / skillSummary
The student's account stays; they can join again with a code.
```

### Deleting a class needs the admin

```
TEACHER                                   ADMIN
───────                                   ─────
Class menu → Request deletion
(reason required)
classes/{id}.deletionRequest      ───▶   All classes → "Deletion requests" (count badge)
Class keeps working;                      ├── Decline (+ optional note) → teacher sees the note
teacher can cancel the request            └── Approve & delete → must type  delete
                                               │
                                               ▼
                                          notify-api POST /delete-class (admins only)
                                          removes: the class, roster, lesson links,
                                          notifications, every student's progress for
                                          its lessons, and the students' class links
```

Student accounts and the lesson library are never deleted by this.

---

## 13. How everything is protected

| Layer | What it stops |
|---|---|
| **Firebase Auth** | Nobody gets in without a correct email + password |
| **Firestore rules** (`firestore.rules`) | The database itself refuses forbidden actions, even from someone skipping the app: students can't change their role, edit lessons, read other students, leave a class without approval, or save progress outside the lesson dates; classes can't be deleted directly |
| **notify-api checks** | Every request needs a valid token; ids must match a strict pattern; you must own the class (or be admin for deleting) |
| **basaya-tts checks** | Only listed websites (`ALLOWED_ORIGIN`) and only teachers/admins can generate audio; the ElevenLabs key stays a Cloudflare secret |
| **Website escaping** | Anything typed (names, reasons, lesson text) is shown as plain text, so code can't be injected (no XSS). There is no SQL database, so no SQL injection |
| **Secrets** | Service-account key → Vercel env var. ElevenLabs key → Cloudflare secret. Never in GitHub |

The Firebase config in `firebase-config.js` is **meant to be public**: the rules above are what protect the data.

---

## 14. Where everything is saved

```
Firestore
├── users/{uid}                         role, names, classId, className, skillSummary
│   └── assignedLessons/{lessonId}      one student's results for one lesson
├── lessons/{lessonId}                  title, difficulty, order, description
│   ├── activity/content                tap-the-word pages
│   ├── lectures/content                pages, sentences, cloudAudio links
│   ├── pronunciation/content           words, cloudAudio links
│   ├── quiz/content                    questions, choices, answers
│   └── game/{levelId}                  level, words  (or game/status = skipped)
└── classes/{classId}                   className, classCode, teacherId, gradeLevel,
    │                                   deletionRequest?, deletionDeclined?
    ├── students/{uid}                  fullName, joinedAt, leaveRequest?, leaveDeclined?
    ├── classLessons/{lessonId}         order, openAt?, dueAt?, notify status
    └── notifications/{id}              "new lesson" items for the bell list

Cloudflare R2 (via basaya-tts)
└── lessons/{lessonId}/{lectures|pronunciation}/page-N/sentence-N-….mp3

Student's phone
├── Room database                       downloaded lessons, offline progress, notifications
└── files/lecture_audio/{lessonId}/     downloaded MP3s
```

---

## 15. When something breaks

| You see | Most likely cause | Fix |
|---|---|---|
| **Generate audio → "Failed to fetch"** | The website isn't in basaya-tts `ALLOWED_ORIGIN`, or the Worker's new code isn't deployed | Add the site to `ALLOWED_ORIGIN` (comma-separated), redeploy the Worker (`basaya-tts-worker.md`) |
| "ElevenLabs could not generate the audio." | ElevenLabs key wrong or credits used up | Check the ElevenLabs account and the Cloudflare secret |
| "Only teachers and admins can generate audio." | Signed in as a student, or role missing | Check `users/{uid}.role` |
| **Login → ERR_NAME_NOT_RESOLVED** | Internet / DNS dropped | Reload; clear the browser DNS cache; `ipconfig /flushdns` |
| **"Missing or insufficient permissions"** | The live rules are older than `firestore.rules`, or the action really isn't allowed | Publish `firestore.rules` in the Firebase Console |
| No "new lesson" push | notify-api env vars missing, or the phone never opened Home after joining | Check Vercel env vars; open the app once |
| Leave / delete requests do nothing | New rules not published | Publish `firestore.rules` |
| Pronunciation always uses the phone's recognizer | basaya-stt free limit reached or not set up | Check the Worker; it resets daily |

---

*Files to look at:* `admin/views/lessons.js` (Lesson Studio) · `admin/views/gameLevels.js` (game builder) · `js/tts.js` (calls basaya-tts) · `basaya-tts-worker.md` (the Worker) · `notify-api/` (Vercel) · `firestore.rules` · `js/scoring.js`.
