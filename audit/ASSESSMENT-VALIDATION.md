# Assessment result validation

Implemented locally, 2026-11-01. This file describes the new web/API contract and rollout;
it does not mean that the production rules or API have been deployed.

## Server boundary

Student clients cannot write `users/{uid}/assignedLessons/{lessonId}` or create/update
`users/{uid}.skillSummary`. This includes nested resume scores, counters, skill records,
completion flags, timestamps and arbitrary extra fields. Profile registration cannot
seed a skill summary either. Existing staff reads and profile/name changes remain supported.

`POST /api/assessment` is routed into the existing grouped function without adding a
hosting function. It verifies the Firebase ID token using the existing API middleware.
The UID comes from that token, never from the request body.

Every request supplies `classId` and `progressSession`. Lesson operations also supply
`lessonId` (the library lesson ID). The server checks current student role, the profile
class link, roster membership, class availability, explicit lesson assignment and session.
Canonical and legacy auto-ID class links are supported; an absent assignment is denied.
Server time checks the assignment's opening and deadline for mutations. Client-provided
scores, totals, timestamps, summaries and skill maps are rejected.

Operations:

- `metadata`: counts, item counts and skip flags. Available before opening; no questions or keys.
- `content`: quiz questions/choices/multiple-selection hints, and activity words/pick counts.
  Answer keys and explanations are omitted. Content is unavailable before opening.
- `answer`: `part`, `eventId`, plus `index`/`selected` for quiz/activity, or `level`/`word`
  for crossword. Choice indices refer to the original stored order, before display shuffling.
- `begin`: `part: "game"` reads the current validated crossword level ID, completed-level
  count and accepted words. It establishes a private attempt ID when needed while retaining
  existing scores and skills. Pending browser saves include that ID, so a reset rejects
  old queued words. The client uses
  this level ID rather than deriving a level from an old public score. Level IDs may have gaps.
- `begin`: `part: "quiz"`. Creates or recovers an unfinished quiz and returns its server
  `attemptId` and resume data. Quiz `answer` and `finish` requests must include this ID.
- `abandon`: `part: "quiz"` and the current `attemptId`. After the student's explicit exit
  confirmation, clears only that unfinished quiz's answers/resume and starts a new attempt
  generation. Old submissions cannot repopulate the cleared attempt. Repeated abandonment
  is idempotent. Completed quizzes are never changed, and deadline-frozen partial results
  are retained. Other lesson parts are untouched.
- `resume`: lecture only, with `done`. Page progress advances one page at a time.
- `speech`: `part: "pronunciation"`, `index`, `eventId`, and `audio` (base64 WAV, <=400,000
  characters). The backend calls the existing speech worker with the user's token and
  applies the pronunciation comparison itself. Client transcripts, verdicts and browser
  speech recognition cannot become official assessment results. The service is limited
  to 300 recordings per user/hour. Service failure records no scored attempt.
- `finish`: `part`, plus `level` for crossword. All required answers/pages/words must already
  be accepted. Final score, total, skill record, completion time and summary come from the server.
  Crossword finalization may include `words`: the server validates each word against the
  current level, merges it with accepted words, then requires the complete word set before
  committing the level. This lets the last word bypass separate pending word requests in one
  atomic transaction. Invalid or incomplete batches write nothing; repeated finalization is
  idempotent. Browser word records are removed only after the batch is confirmed. A lost
  response retries the batch, with no fallback to obsolete individual submissions.
- `summary`: recalculates the caller's summary from protected progress, assignments,
  item counts, original enrollment date and server deadlines. No summary values are accepted.

Quiz answers are final within their active attempt. A confirmed exit can discard an
unfinished quiz while it is open; reopening then starts from question one. Submitting the
completed quiz permanently locks its result. Activities and pronunciation have three attempts per
item and advance in order. Crossword levels also advance in order; completed levels cannot
be counted twice. Transactions serialize concurrent submissions and finalization. Content
fingerprints prevent an administrator's lesson edit from silently changing an active attempt.
An edited active attempt requires a deliberate reset by staff; no automatic result reset occurs.

Authoritative attempt state lives in private `users/{uid}/assessmentAttempts/{hash}` documents.
The server checks it against a generated attempt ID mirrored on the progress document;
invented state in formerly client-writable progress documents is never accepted as evidence.
Removing and reassigning a lesson creates a fresh attempt, while restoring an enrollment's
saved progress can continue its retained private attempt state.

Each accepted answer has a private `users/{uid}/assessmentReceipts/{hash}` document. Its
hash includes the class/session, lesson, part, server attempt ID and submission ID. Retrying an identical
submission returns its original result, even after another submission; changing its payload
is denied. Clients cannot read/write receipts. Retain receipts for the lifetime of the
enrollment/restore session so late retries remain idempotent.

Skill scoring formulas are copied from `js/scoring.js` into `notify-api/lib/assessmentScoring.js`
so a Vercel deployment rooted at `notify-api` is self-contained. The regression suite checks
that the files match. Pronunciation comparison is similarly isolated from the browser's
microphone code in `notify-api/lib/pronunciationScoring.js`.

## Practice, offline use, and historical work

Practice requests use `practice: true` and `entryId` (the assigned practice link ID). The
server validates that link and evaluates quiz/activity answers without saving assessment
progress or updating a summary. Practice games and pronunciation keep their existing local
behavior. Quiz/activity practice now needs a connection for answer feedback.

Downloaded lectures remain readable offline. Official assessment answers and completion
must be accepted online before the deadline; they are not queued as client-generated scores.
Correct crossword words and a level-finalization request are persisted separately on the
device with stable submission IDs and the server's game attempt ID. A shared queue keeps
saving after Back and resumes on sign-in/reopen or reconnection. Transient failures retry
with backoff; rejected attempts pause until reconciliation with the current game. Words
appear immediately without saving text. Wrong guesses are feedback only. Pending words
remain visible on return, but completion waits for server acceptance of every required word.
Closing the browser stops execution; durable requests resume when the student opens it again.
Game requests time out after 12 seconds and retry with their original identities instead of
blocking the entire queue indefinitely. The completion screen opens immediately on server
confirmation without an extra animation timer.
The student banner explains the connection requirement. The regenerated offline shell
includes the updated student screens.

The quiz has an explicit Back button. Back-button and browser hash-history navigation
share a confirmation guard; cancelling leaves the same screen and selection mounted.
The confirmation is a keyboard-accessible alert dialog with continue as its default
action. It does not automatically disappear like a toast. Network failure during the
reset keeps the student in the quiz. This custom confirmation covers navigation within
the student website; closing a browser tab or terminating the browser is not an explicit
confirmed abandonment.

Old completed results are retained and locked. They cannot be retroactively certified from
scores alone. Old unfinished client-calculated resume scores are ignored by the updated web
client; the server starts those parts from its own accepted-answer state. Historical skill
records still appear in existing reports, so existing records are not automatically evidence
of server-verified submissions. New skill records carry `validation: "server-v1"`.

This establishes result integrity for submitted answers, not exam proctoring. Students may
already know previously downloaded answer keys, see another student's work, or learn answers
from practice on the same material. Use separate questions for practice and formal assessments
when answer secrecy matters. Audio can also be replayed; checking its source is a separate concern.

## Rollout

1. Deploy the updated API and web client together. The API uses the existing Firebase service
   account and `ALLOWED_ORIGINS`; no new secret is required. Confirm the existing speech worker
   accepts the forwarded Firebase bearer token from the API environment.
2. Update Android's assessment content loaders, answer submission, pronunciation audio submission,
   finalization and summary refresh to use the same API contract **before enforcing these rules
   for Android users**. The native app in `C:/Projects/BaSaya` is a separate repository and has
   not been modified by this web change. Existing native builds directly write progress and read
   keys; the new rules intentionally deny those actions rather than allowing a vulnerable fallback.
3. Deploy `firestore.rules` with the compatible clients. Security enforcement starts only when
   these rules are deployed. Do not deploy the stricter rules alone and expect old clients to save.
4. Refresh installed web apps and re-download lessons. Older cached answer keys cannot be revoked
   from devices; use fresh questions where assessment secrecy is required.
5. Review any suspicious historical results separately. Nothing here deletes or rewrites them.

No production deployment or production data modification was performed for this change.

## Validation

Run the following from the web repository (supply local Java and Firestore emulator jar paths):

```powershell
node tools/assessment-tests.mjs <java> <firestore-emulator.jar>
node --experimental-vm-modules tools/assessment-ui-tests.mjs
node --experimental-vm-modules tools/quiz-exit-tests.mjs
node tools/class-progress-tests.mjs <java> <firestore-emulator.jar>
node --experimental-vm-modules tools/class-membership-tests.mjs <java> <firestore-emulator.jar>
node tools/offline-tests.mjs
node tools/download-refresh-tests.mjs
```

These use local demo-emulator data, synthetic identities, DOM fixtures and a stubbed speech
recognizer. They do not submit recordings to the real speech service or contact production Firebase.
The older architecture audit reproduction script records the previous insecure behavior;
the assessment suite is the regression test for its remediation.
