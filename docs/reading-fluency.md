# Page-based Bigkas

Lessons with `pronunciation/content.pages` use the new reading flow. Word-only lessons keep their original activity.

Each reading page stores `sentence`, `cloudAudio`, and a page-specific `readyWords` list. Older page lessons infer their words from the document-level selections. The editor's green word buttons now select words for that individual page; the shared word audio list remains compatible with older clients.

## Student flow

Get Ready (hold microphone for each word) → sentence/model audio → hold microphone to record → preview → retake or next page → submit on the last page. Get Ready is ungraded and has no lives. Completed words, the page, and the stage are saved immediately. Sentence recordings are mono 16 kHz WAV, up to 45 seconds.

The web/PWA stores drafts and original queued audio in IndexedDB. Android uses account/class/session-scoped app files and an atomic JSON outbox. Draft recordings survive closing the app. Interrupted in-progress recordings are discarded; an earlier kept take remains available. Pending uploads replay in order, with revision checks and idempotent event IDs. A conflicting draft can be backed up locally before loading the server's latest progress.

The first visit requires connectivity to establish an assigned reading snapshot. Later device drafts work offline; model audio is available offline when the lesson was downloaded. Final submission requires a confirmed upload of every page.

## Teacher review

Class → **Review readings**. The teacher can play individual recordings or all recordings, score accuracy/smoothness/expression from 1–4 each, leave feedback, and save the grade before moving to the next student. Final submission completes the pronunciation step so students can continue while awaiting review. Pending submissions have no numerical score. A teacher grade writes the Pagbigkas rubric result and becomes visible when the student reopens the activity.

## Storage and deployment

`/api/assessment` handles `fluency-*` operations. It validates current class membership, assignment and progress session, controls stage transitions, and preserves the assigned text. Recording access and grading require the owner or the assigned class teacher.

The `basaya-readings` Worker uses the private `basaya-student-readings` R2 bucket, separate from public model audio. API-only uploads require `READINGS_STORAGE_SECRET`; playback links expire after ten minutes. The API environment contains `READINGS_WORKER_URL` and the same secret. `tools/deploy-reading-storage.cjs` deploys and configures the service through stdin without printing or saving the secret. Running it rotates the shared credential and redeploys the API.

## Android

Source project: `C:\Projects\BaSaya`. `tools/android-fluency/apply.cjs` copies the two native reading classes and applies the repository/model, entry-point, dashboard, and hold-recorder integration. It checks that every destination remains inside that Android project.

## Checks

- `node tools/pronunciation-editor-tests.mjs`
- `node --experimental-vm-modules tools/fluency-ui-tests.mjs`
- `node --experimental-vm-modules tools/fluency-draft-tests.mjs`
- `node --experimental-vm-modules tools/pronunciation-ui-tests.mjs`
- `node tools/microphone-ready-tests.mjs`
- `node tools/fluency-tests.mjs <java.exe> <firestore-emulator.jar>`
- `node tools/reading-deployment-check.mjs`
- Android: `gradlew.bat --offline :app:assembleDebug`

The local-only synthetic visual fixture is `node tools/serve-fluency-preview.mjs` at `http://127.0.0.1:8794`; use `?stage=preview` for the recording preview state. It never accesses real accounts or recordings.
