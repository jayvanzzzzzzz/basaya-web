# BaSaya teacher portal

A no-build teacher web app using Firebase Authentication and Cloud Firestore. It deliberately excludes teacher-account management; create those accounts in your future main-admin app, then give each user document `role: "teacher"`.

## Setup

1. In Firebase Authentication, enable **Email/Password** and create the teacher user.
2. Create `users/{uid}` with at least `{ displayName: "…", role: "teacher" }`.
3. Paste your Firebase Web App config into `firebase-config.js`.
4. Deploy `firestore.rules` using the Firebase console or `firebase deploy --only firestore:rules`.
5. Host these static files (Firebase Hosting, Netlify, GitHub Pages, or any web server). Do not open `index.html` directly from disk because browser modules/Firebase authentication need an HTTP(S) origin.

## Student website (`student/`)

Students who can't install the Android app (e.g. on an iPhone) sign in on the same login page and land on `student/`. **Create a student account** on the login page opens `register.html`, which makes the same `users/{uid}` profile as the app (`role: "student"`).

Students can register with email/password or continue with Google from the login screen. Enable the **Google** provider in Firebase Authentication and add each hosted website's domain to its authorized domains. First-time Google sign-ins continue to `complete-profile.html` to collect the student's name before opening the student site.

It reads and writes the same Firestore fields as the app, so a student can switch between the two and the teacher's reports don't change:

| Screen | Same as the app's | Writes |
|---|---|---|
| Mga Aralin (`#/home`) | `HomeFragment` | — |
| Sumali sa Klase (`#/join`) | `JoinClassActivity` | roster entry + `users/{uid}.classId/className` in one batch |
| Lesson path (`#/lesson/{id}`) | `DashboardActivity` | — |
| Lektura | `LectureActivity` | `lectureFinished` |
| Laro (crossword) | `CrosswordActivity` | `game*` fields + `skills.talasalitaan` (added up per level) |
| Gawain | `PracticeActivity` | `activity*` fields + `skills.pagkilala` |
| Bigkas | `PronunciationActivity` | `pronunciation*` fields + `skills.pagbigkas` (with `hardWords`) |
| Comprehension (Pagsusulit) | `QuizActivity` | `quiz*` fields + `skills.pagsusulit` |
| Progreso (`#/progress`) | `ProgressFragment` | `users/{uid}.skillSummary` |
| Chat (`#/chat`) | `ChatFragment` | `messages`, `chatSenders`, `chat/state` (same rules as the app) |
| Mga Abiso (`#/notifications`) | `NotificationsActivity` | `users/{uid}.notifReadAt` |
| Account (`#/account`) | `ProfileFragment` | name, gender, birthday, leave request |

Lessons work online only (no download), and there are no push notifications: the 🔔 shows new lessons and deadline reminders when the site is open.

**Bigkas** records the student in the browser (16 kHz WAV, like the app) and sends it to the `basaya-stt` Worker with the student's Firebase sign-in token. The Worker accepts that only from the sites in its `ALLOWED_ORIGIN` (see `C:\Projects\BaSaya\cloudflare\basaya-stt\README.md`), so add every site this portal is hosted on there. If the Worker is busy or out of its free daily limit, the page falls back to the browser's own speech recognition when it has one.

## Diksiyonaryo (Tagalog dictionary)

A Tagalog dictionary that explains words **in Filipino**. Students open it from the book icon in the top bar (`#/diksiyonaryo`), left of the bell. It costs nothing to run.

### Where the words come from

| Source | Where it lives | Who changes it |
|---|---|---|
| **Wiktionary words** (about 1,600) | `data/dictionary/tl-seed.json`, a static file served with the site | Rebuilt with `tools/build-dictionary.mjs` (step 1) |
| **Teacher words** | Firestore `dictionary/{key}` | Teachers, on the teacher portal's **Dictionary** page (step 3) |

`key` is the word in lowercase without accent marks (`Báhay` → `bahay`, `normalizeWord()` in `js/dictionaryWords.js`). Both sources use it, so a teacher word with the same key **replaces** the Wiktionary word, and a teacher doc with `hidden: true` **hides** it.

### What is Wiktionary, and what is the "Wiktionary file"?

**Wiktionary** is a free online dictionary written by volunteers, like Wikipedia but for words. It has a Tagalog edition, [tl.wiktionary.org](https://tl.wiktionary.org/) (Wiksiyonaryo), where words are explained **in Tagalog**. For example, the page for *bahay* says: "kubo, dampa, gusali, o kauri nito na sadyang niyari upang maging tirahan ng tao." Anyone may reuse it under the CC BY-SA 4.0 license, as long as they credit Wiktionary.

Wikimedia publishes a **dump** of the whole site: one big download with every page in it. That's the **Wiktionary dump file**:

- Download link: `https://dumps.wikimedia.org/tlwiktionary/latest/tlwiktionary-latest-pages-articles.xml.bz2`
- About 10 MB compressed and 66 MB extracted, holding about 31,000 pages.
- It's one XML file. Each page looks like this, with its text in *wikitext*, the markup Wikipedia uses:

```xml
<page>
  <title>bahay</title>
  <ns>0</ns>
  <text>==Tagalog==
===Pagbigkas===
* bá·hay

====Pangngalan====
# [[kubo]], [[dampa]], [[gusali]], o kauri nito na sadyang niyari upang maging tirahan ng [[tao]].
#: ''Nakauwi na ang mga tao sa kanilang mga '''bahay'''.''

====Magkasingkahulugan====
* [[tahanan]]
* [[tirahan]]

====Mga salin====
*[[Ingles]]: [[house]]
  </text>
</page>
```

The dump can't be used as is. It's too big, it's full of markup, and most pages aren't Tagalog words: the site also explains Norwegian, Finnish, English and other words in Tagalog. So we **build** a small, clean file from it once: `data/dictionary/tl-seed.json`. Only that small file goes in the project and is loaded by students. The dump stays outside the project and is only needed when rebuilding.

### How the dictionary file is built

`tools/build-dictionary.mjs` turns the 66 MB dump into the 279 KB `tl-seed.json`:

```
tlwiktionary-...xml (66 MB, ~31,000 pages)
   │  1. keep real word pages (no redirects, talk or help pages)
   │  2. keep only the Tagalog part of each page
   │  3. read the part of speech, definitions, examples, synonyms
   │  4. strip wiki markup to plain text
   │  5. drop empty or junk entries, merge duplicates
   ▼
data/dictionary/tl-seed.json (~279 KB, ~1,600 words)
```

1. **Keep real word pages.** Only main pages (`<ns>0</ns>`) that aren't redirects. Talk, user and help pages are skipped.
2. **Keep only the Tagalog part.** Each page is split into language sections by its headings. The part under `==Tagalog==` is kept (also `===Tagalog===`, `=={{=tl=}}==`, or a page with no language heading that is in a Tagalog category). Sections like `==Ingles==` and `==Noruwego==` are skipped.
3. **Read the useful lines.** Inside the Tagalog part:
   - a part-of-speech heading starts a new meaning group: `Pangngalan` → `pangngalan`, `Berbo` → `pandiwa`, `Pang-uri` → `pang-uri`, and so on;
   - `# …` lines are **definitions**;
   - `#: …` lines are **examples**;
   - links under `Magkasingkahulugan` / `Singkahulugan` are **synonyms**;
   - `{{tl-pr|aklát}}` gives the **accented spelling**.

   Everything else (Etimolohiya, Mga salin, references, free text) is ignored.
4. **Strip the markup.** `[[kubo]]` → `kubo`, `'''bahay'''` → `bahay`, `{{lb|tl|obsolete}}` → `(obsolete)`, and `<ref>` notes and comments are removed.
5. **Clean up.** Words with no definition left are dropped (e.g. *mahal*, whose page has none), and so are definitions that only repeat the word (*kapiraso*: "kapiraso"). Pages with the same key (`baybay` and `Baybay`) are merged into one word.

The *bahay* page above becomes this entry in `tl-seed.json`:

```json
{
  "w": "bahay",
  "k": "bahay",
  "s": [
    {
      "p": "pangngalan",
      "d": ["kubo, dampa, gusali, o kauri nito na sadyang niyari upang maging tirahan ng tao."],
      "e": ["Nakauwi na ang mga tao sa kanilang mga bahay."]
    }
  ],
  "syn": ["residensiya", "tahanan", "tirahan"]
}
```

| Field | Meaning |
|---|---|
| `w` | the word as written |
| `k` | search key: lowercase, no accent marks |
| `a` | accented spelling, if Wiktionary has one (`aklát`) |
| `s` | meaning groups, one per part of speech |
| `s[].p` | part of speech |
| `s[].d` | definitions |
| `s[].e` | examples (optional) |
| `syn` | synonyms (optional) |

The short names keep the file small, since every student downloads it.

**Why some words are missing:** Tagalog Wiktionary is small, and many pages are empty or only give translations. That's why teachers can add words (step 3 below). Wiktionary grows over time, so rebuilding later may add more words.

### How it works, start to finish

**1. Building the word list (one time, or to refresh it)**

1. Download `tlwiktionary-latest-pages-articles.xml.bz2` from `https://dumps.wikimedia.org/tlwiktionary/latest/` and extract it (7-Zip, or `bzip2 -dk` in Git Bash).
2. Run `node tools/build-dictionary.mjs path/to/tlwiktionary-latest-pages-articles.xml`.
3. The script reads every page and keeps only the Tagalog part. Most pages have a `==Tagalog==` heading, some use `===Tagalog===`, and a few only have a Tagalog category. Words in other languages (Ingles, Espanyol, …) are skipped.
4. From the Tagalog part it keeps the part of speech (Pangngalan → `pangngalan`, Berbo → `pandiwa`, …), the numbered definitions (`# …`), examples (`#: …`), synonyms and the accented spelling (`aklát`). Wiki markup is stripped to plain text. Words with no real definition, or defined as themselves, are dropped, and pages with the same key (`baybay` / `Baybay`) are merged.
5. It writes `data/dictionary/tl-seed.json` as `[{ w, k, a?, s: [{ p, d: [..], e?: [..] }], syn? }]` (word, key, accented spelling, senses with part of speech, definitions, examples). Commit the new file and deploy the site.

**2. A student searches**

1. The book icon goes to `#/diksiyonaryo`, and `student/router.js` draws `student/views/dictionary.js`.
2. The page shows a few random words to try, and A–Y letter buttons in Abakada order.
3. As the student types (after a 250 ms pause), `searchWords()` in `js/dictionary.js` runs:
   - `loadSeed()` downloads `tl-seed.json` once and keeps it in memory for the visit.
   - It takes the Wiktionary words whose key starts with what was typed. This costs no Firestore reads.
   - It reads teacher words in the same key range from Firestore (`where key >= q and key <= q + ""`, at most 30 docs).
   - Teacher words replace Wiktionary words with the same key, and hidden words are removed. The exact match is listed first.
4. The student taps a word to see its card: the accented spelling, each part of speech with numbered meanings and examples, a "Dinagdag ng guro" tag if a teacher wrote it, and synonyms. Tapping a synonym opens that word (`lookupWord()`).
5. **Not found?** `suggestRoots()` strips Tagalog affixes with `guessRoots()` in `js/dictionaryWords.js` (prefixes like mag-/nag-/ma-, infixes -um-/-in-, suffixes -an/-in, a repeated first syllable): kumakain → kakain → kain. Guesses the dictionary has are shown as "Baka ang salitang-ugat ang hinahanap mo". If none match, the page asks the student to tell their teacher about the word.
6. If Firestore can't be reached (offline, or the rules aren't deployed), the Wiktionary words still work and the teacher words are skipped.

**3. A teacher adds, fixes or hides words**

1. On the teacher portal, **Dictionary** in the sidebar (`#/dictionary`) opens `teacher/views/dictionary.js`.
2. With the search box empty, it lists the words teachers added or changed most recently (`recentTeacherWords()`). Typing searches both sources, hidden words included.
3. **+ Add word**: enter the word, an optional accented spelling, one or more meaning groups (part of speech, meanings one per line, optional examples) and optional synonyms. If the word already exists, the form opens it for editing instead. `saveWord()` writes `dictionary/{key}`.
4. **Edit** on a Wiktionary word saves the teacher's corrected copy as `dictionary/{key}`, and students see that copy from then on. The spelling can't change while editing, because it's the doc id.
5. **Hide** on a Wiktionary word writes `dictionary/{key}` with `hidden: true`, so students stop seeing it. **Show again** deletes that marker.
6. **Delete** (a teacher's own word) or **Restore original** (their edit of a Wiktionary word) deletes the doc, and the Wiktionary version, if there is one, comes back.
7. Students see each change on their next search. No refresh or deploy is needed.

**4. What the Firestore rules allow** (`match /dictionary/{key}` in `firestore.rules`)

- **Read:** anyone signed in.
- **Add / edit:** teachers and admins only. The doc id must equal `key`, the word is at most 60 characters, there are at most 5 meaning groups and 10 synonyms, and the creator and created time can't change. `updatedBy` must be the signed-in user, and the times must be server times.
- **Delete:** the teacher who added the word, an admin, or any teacher for a `hidden` marker.
- Deploy them with `firebase deploy --only firestore:rules`.

### Files

| File | What it does |
|---|---|
| `tools/build-dictionary.mjs` | Builds `tl-seed.json` from the Wiktionary dump |
| `data/dictionary/tl-seed.json`, `LICENSE.md` | The Wiktionary words and their CC BY-SA 4.0 license |
| `js/dictionaryWords.js` | `normalizeWord()` and `guessRoots()` (no Firebase, so the build script uses them too) |
| `js/dictionary.js` | Loads and merges both sources: `searchWords`, `lookupWord`, `suggestRoots`, `saveWord`, `hideWord`, `deleteWord` |
| `student/views/dictionary.js`, `css/pages/student-dictionary.css` | Student page (Filipino) |
| `teacher/views/dictionary.js`, `css/pages/teacher-dictionary.css` | Teacher page (English) |

**License:** the Wiktionary words are CC BY-SA 4.0, so keep the credit line at the bottom of both pages. If you share `tl-seed.json` or a changed copy, share it under the same license.

**Android app** (`C:\Projects\BaSaya`): has the same Diksiyonaryo (book button in the top bar). It bundles a copy of `tl-seed.json` in `app/src/main/assets/dictionary/` and reads the same `dictionary` collection. **When you rebuild `tl-seed.json`, copy it to the app too.** Its `DictionaryWords.kt` must match `js/dictionaryWords.js`.

## Lesson schedule and notifications

When adding lessons to a class, a teacher can set an optional **open date** and **deadline**. Students can't open a lesson before it opens, and an unfinished lesson locks after its deadline. The Firestore rules enforce both with server time, so changing the phone's clock doesn't help. Adding a lesson sends a push notification to the class through `notify-api/`, which runs on Vercel (see `notify-api/README.md`).

## Student progress and Class Report

Teachers can open **View progress** for any student, and a **Class Report** for the whole class (button on the class page). Scores use the same rules as the Android app (`js/scoring.js` is a port of the app's `SkillScoring.kt`, and passes the same unit tests). Change both together.

- **Per student:** five skills, scored separately with no combined grade. Each lesson's score is first-try accuracy, lessons are combined with a recency-weighted average, and a skill is flagged "needs help" when its last 2 lessons were both below 60%.
- **Remarks:** Very good (85–100%), Good (70–84%), Fair (50–69%), Poor (below 50%). "Not enough data" appears until a skill has 2 lessons or 10 items.
- **Unfinished at the deadline = the rest is wrong:** when a lesson's deadline passes, every scored part the student left unfinished (game, Gawain, Bigkas, quiz) is scored over **all** its items. What they got right so far counts, and every item they didn't reach counts as wrong. For example, 3 of 5 quiz questions answered with 2 right gives 2/5, and an untouched part gives 0%. "So far" comes from the saved place (`resume.activity.score`, `resume.pronunciation.firstTryCorrect`, `resume.quiz.score`) and, for the crossword, from the levels played. Item counts come from `js/lessonItems.js`. The result is dated at the deadline. Skipped parts, lessons with no deadline, and lessons that closed before the student joined don't count. The quiz now saves each answer when **Susunod** is pressed (`resume.quiz`) and continues from there when reopened, like the Gawain and Bigkas. This is `withMissed` in `js/scoring.js` and `SkillScoring.withMissed` in the app, used by the teacher pages, the student's Progreso and the saved `skillSummary`.
- **Class Report:** each skill's class average is the mean of the students' skill scores, counting only students with results. The **overall class score** is the mean of those skill averages.
- **What to re-teach (item analysis):** a Class Report section, filterable by lesson, that ranks the quiz questions and Bigkas words by the share of students who missed them. Anything missed by 50% or more is flagged **Re-teach**, and it is included in Print/PDF and in the Excel export's "Item analysis" sheet. Quizzes now save `skills.pagsusulit.missedQuestions` (question text, since questions are shuffled) on both the web and the app. Quizzes taken before that change aren't counted, and the report says how many. Words come from `skills.pagbigkas.hardWords`. A student who didn't finish by the deadline counts with the answers they gave, plus every question or word they didn't reach as missed.
- **Removing a student** (Students page) calls `notify-api/api/remove-student`. It deletes the roster entry and their progress for this class's lessons, and clears their class link. The account stays.

## Students leaving a class

Students can't leave a class on their own. In the app's account screen, **Umalis sa klase** sends a request (optional reason) that sets `leaveRequest` on their roster entry. The class page's **View students** button shows a count, and the Students page lists the requests at the top:
- **Approve** removes the student the same way as **Remove** (progress for this class is deleted).
- **Decline** clears the request and stores an optional note in `leaveDeclined`. The student sees it in the app.

Firestore rules stop a student from changing or clearing their `classId` while still on the class roster, so this flow can't be skipped.

## Deleting a class

Teachers can't delete a class themselves. **Request deletion** (class card menu) asks for a reason and marks the class `deletionRequest`. The class keeps working, and the teacher can cancel the request.

An admin reviews requests at the top of **All classes** (the menu item shows a count):
- **Decline** clears the request and stores an optional note in `deletionDeclined`. The teacher sees the note until they dismiss it.
- **Approve & delete**, like the admin's own **Delete class**, requires typing `delete`. It then calls `notify-api/api/delete-class` (admins only), which removes the class, its roster, lesson links and notifications, plus every student's progress for its lessons, and clears their class link. Student accounts and the lesson library stay.

Firestore rules block deleting a class directly, so this flow can't be skipped.

## Styles

All styles live in `css/`, split by job. Each HTML page links only the files it needs.

| Folder | What's inside |
|---|---|
| `css/base/` | `tokens.css` (colors, fonts, radii, shadows, motion; light + dark theme), `reset.css`, `typography.css`, `animations.css` |
| `css/layout/` | `shell.css` (sidebar, nav, account menu, content area), `page-header.css` (gradient hero headers) |
| `css/components/` | Buttons, forms, cards, directory panels, tables, menus, modal, toast, class-code stub, pagination, loading screens |
| `css/pages/` | One file per screen: login, teacher dashboard, class page, add lesson, account settings, admin lessons, lesson studio |

Change a color or font once in `css/base/tokens.css` and it applies everywhere, in both themes. Dark mode follows the computer's setting. Long lists are paginated by `js/pagination.js`.

## Teacher account settings

The teacher portal's Account settings page lets teachers update their display name, choose how students address them (Ma'am / Sir / Name only, saved as `title` and shown as "Ma'am Reyes" in the class chat, class members, dashboard greeting and reports), and change their password. Teachers sign in with their email address. Deploy the Firestore rules after setup so a teacher can update only their own display name; password changes are handled by Firebase Authentication.

## Data written by this portal

| Collection | Key fields |
|---|---|
| `classes` | `name`, `subject`, `grade`, `joinCode`, `teacherId`, `createdAt` |
| `classes/{classId}/students` | student snapshot written by your student enrollment flow; read-only here |
| `lessons` | `title`, `description`, `difficulty`, `activityType`, `content`, `teacherId`, `createdAt`, `updatedAt` |
| `classes/{classId}/classLessons/{linkId}` (Assessment: `linkId` = lesson id; Practice: `{lessonId}__practice`, so a lesson can be in a class as both) | `lessonId`, `teacherId`, `order`, `createdAt`, `openAt`, `dueAt` (optional schedule), `mode` (`"assessment"` or `"practice"`; missing = assessment. Practice saves no progress, the rules reject it, and reports leave it out), `notifyPending`, `notifiedAt` |
| `progress` | student-side completion documents with `classId`, `studentId`, `teacherId`, `percent`, `updatedAt` |
| `dictionary/{key}` (`key` = word without accents, lowercase) | `word`, `key`, `accent`, `senses` (`[{ pos, definitions, examples }]`), `synonyms`, `hidden` (hides a Wiktionary word), `createdBy`, `createdByName`, `createdAt`, `updatedBy`, `updatedByName`, `updatedAt` |

The teacher portal treats student enrollment and progress writes as student-app/server responsibilities. Its security rules allow teachers to read only data associated with their own classes.

STT used - Whisper