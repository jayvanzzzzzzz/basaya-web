# Page-based Bigkas

Lessons with `pronunciation/content.pages` use the new reading flow. Word-only lessons keep their original activity.

Each reading page stores `sentence`, `cloudAudio`, and a page-specific `readyWords` list. Pronunciation supports up to eight pages, shown one at a time with page ribbons in the lesson editor. Older page lessons infer their words from the document-level selections. The editor's green word buttons now select words for that individual page; the shared word audio list remains compatible with older clients.

## Student flow

Get Ready (hold microphone for each word) → sentence/model audio → hold microphone to record → preview → retake or next page → submit on the last page. Get Ready is ungraded and has no lives. It advances only after the server recognizes and accepts the current word; a fuzzy near-match, silence, or speech-service failure keeps the student on that word. Word checking requires connectivity and uses clips up to seven seconds. Completed words, the page, and the stage are saved immediately. Sentence recordings are mono 16 kHz WAV, up to 45 seconds.

The web/PWA stores drafts and original queued audio in IndexedDB. Android uses account/class/session-scoped app files and an atomic JSON outbox. Draft recordings survive closing the app. Interrupted in-progress recordings are discarded; an earlier kept take remains available. Pending uploads replay in order, with revision checks and idempotent event IDs. A conflicting draft can be backed up locally before loading the server's latest progress.

The first visit requires connectivity to establish an assigned reading snapshot. Later device drafts work offline; model audio is available offline when the lesson was downloaded. Final submission requires a confirmed upload of every page.

Pronunciation example audio highlights the spoken word on web and Android. Saved word timings are used when available; older clips estimate timings from word length and duration. Highlights clear on stop, completion, recording, and leaving the screen. Student recording previews do not use highlighting.

Recording previews use custom play/pause, seeking, and time controls. Choosing **Bumasa muli** hides the preview and returns to the sentence and microphone. The old take remains saved until a valid new recording replaces it; silence and canceled attempts keep the old take. Students can return to the old preview without recording. The routine progress-saved footer is omitted.

Get Ready feedback uses a persistent, colored card with an icon above the microphone. Retry, silence, connection, and service messages remain until another recording starts. Correct feedback appears on the spoken word briefly before moving on. Both clients probe `fluency-begin` for `wordVerification: 1` before each word recording is sent. An older API is blocked before it can consume an unchecked attempt; missing or nonboolean acceptance is rejected. Deploy the web and strict API together before enabling this flow in production.

While a Get Ready recording is checked, web and Android show five gently moving amber sound bars beside **Sinusuri ang sagot…**, on a cream background. The current word stays visible and recording is disabled. The indicator stops before feedback or an error appears. Reduced-motion settings use static bars; Android also cancels the animator when the activity stops.

Get Ready matching treats spaces and hyphens equally and requires the full compound in order. It can find that complete phrase among extra recognized words. One extra repeated consonant is allowed across the matched phrase (for example, `maitim ang buddhi` for `maitim-ang-budhi`); missing letters or compound parts, repeated vowels, other consonant substitutions, and multiple duplicate errors are rejected. Existing Tagalog e/i and o/u normalization remains. This is shared by student web and Android; legacy graded-word scoring is unchanged.

Temporary localhost diagnosis is enabled again to investigate a remaining failed attempt. The failed response can include **Inaasahan** (the frozen server target) and **Narinig** (the same transcript actually compared). It requires authentication, an explicit debug request, and a localhost/127.0.0.1 Origin; the hosted student site hides it. The values are escaped, transient and never saved. Remove this opt-in and display after the mismatch is resolved; it does not change acceptance.

## Teacher review

Recordings submitted before the lesson deadline remain complete while awaiting grading, including after the lesson closes. Only the lesson pronunciation card shows **Awaiting teacher review**. Pending pronunciation results are excluded from skill averages, including stale word-based results; unsubmitted work retains the existing missed-deadline policy. Teacher grading remains available after closing and replaces the pending score with the rubric result. The lecture remains the quiz prerequisite. No teacher-requested retake or retry deadline is added.

Class → **Review readings**. The teacher can play individual recordings or all recordings, score accuracy/smoothness/expression from 1–4 each, leave feedback, and save the grade before moving to the next student. Final submission completes the pronunciation step so students can continue while awaiting review. Pending submissions have no numerical score. A teacher grade writes the Pagbigkas rubric result and becomes visible when the student reopens the activity.

The class review and Add lesson controls are icon-only with blue hover feedback and floating hover/focus labels. Opening review replaces the class screen. Student rows and the class Students button show pending notification dots; row tooltips distinguish unread class messages, recordings awaiting grading, and leave requests. The student menu can open that student's recordings directly. Message and membership updates are live; the protected reading queue refreshes on entry, focus, and every minute while the page is visible. Reading dots remain until graded, independently of message read state. Route changes dispose listeners, polling, and tooltips.

## Storage and deployment

When an admin saves Add/Edit Lesson, each saved Get Ready MP3 is also registered as that dictionary word's current audio. The dictionary reuses the existing R2 lesson file; it does not synthesize another recording. Existing dictionary meanings are required and are preserved. Missing/hidden words keep the editor warning and are reported after save, so the admin can add the entry and save again. Sentence audio is excluded.

The API validates the saved lesson references and writes audio pointers to the server-only `dictionaryAudio` collection. Web and Android playback resolve the latest pointer before the original first-tap generation fallback. Replacement URLs use separate browser/device cache entries. A spelling-accent change invalidates an outdated pointer. Future R2 cleanup must retain lesson files that are referenced by these dictionary pointers.

`/api/assessment` handles `fluency-*` operations. It validates current class membership, assignment and progress session, controls stage transitions, and preserves the assigned text. Recording access and grading require the owner or the assigned class teacher.

The `basaya-readings` Worker uses the private `basaya-student-readings` R2 bucket, separate from public model audio. API-only uploads require `READINGS_STORAGE_SECRET`; playback links expire after ten minutes. The API environment contains `READINGS_WORKER_URL` and the same secret. `tools/deploy-reading-storage.cjs` deploys and configures the service through stdin without printing or saving the secret. Running it rotates the shared credential and redeploys the API.

## Android

Source project: `C:\Projects\BaSaya`. `tools/android-fluency/apply.cjs` copies the two native reading classes and applies the repository/model, entry-point, dashboard, and hold-recorder integration. It checks that every destination remains inside that Android project.

## Checks

- `node tools/pronunciation-editor-tests.mjs`
- `node --experimental-vm-modules tools/fluency-ui-tests.mjs`
- `node tools/reading-highlight-tests.mjs`
- `node tools/reading-recording-browser.cjs` (synthetic phone layout and light/dark screenshots)
- `node --experimental-vm-modules tools/teacher-reading-tests.mjs`
- `node tools/get-ready-word-tests.mjs`
- `node --experimental-vm-modules tools/speech-diagnostic-tests.mjs`
- `node tools/teacher-review-browser.cjs` (synthetic teacher navigation, icon hover, and grading)
- `node --experimental-vm-modules tools/fluency-draft-tests.mjs`
- `node --experimental-vm-modules tools/pronunciation-ui-tests.mjs`
- `node tools/microphone-ready-tests.mjs`
- `node tools/fluency-tests.mjs <java.exe> <firestore-emulator.jar>`
- `node tools/reading-deployment-check.mjs`
- Android: `gradlew.bat --offline :app:assembleDebug`

The local-only synthetic visual fixture is `node tools/serve-fluency-preview.mjs` at `http://127.0.0.1:8794`; use `?stage=preview` for the recording preview state. It never accesses real accounts or recordings.
