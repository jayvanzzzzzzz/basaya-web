# BaSaya review — 1 November 2026

## Assessment

BaSaya has credible best-capstone potential: a Filipino classroom use case, Android and browser clients, offline learning, speech recognition, games, and teacher reporting. That is a substantial implementation. A prediction of winning would require the actual school rubric, competing projects, demonstration quality, and evidence from classroom use. Code size and feature count alone do not establish effectiveness or award readiness.

My assessment: a serious contender after the access-control and data-integrity issues below are addressed and the educational claims are supported by a pilot. The most useful addition is a teacher-approved remediation and reassessment workflow that builds on the existing weak-skill, hard-word, and missed-question reports.

## Scope and checks

- Reviewed the current working files in `C:/xampp/htdocs/BaSaya-web` and `C:/Projects/BaSaya`, including existing uncommitted work. No application source was changed by this review.
- Website regression suites: offline (17), recent accounts (44), session restoration (9), download queue (24), cancellation (7), refresh (18): all 119 reported checks/scenarios passed.
- Android: `gradlew.bat --offline :app:testDebugUnitTest` completed successfully; XML reports contain 40 tests, zero failures and zero errors. This also ran the required debug compilation tasks.
- Additional read-only reproductions: `node --experimental-vm-modules audit/verify-review.mjs`. Uses actual website functions and Worker code; AI is a local stub. No production requests or data writes.
- All 113 website JavaScript files checked by that script parsed successfully. Both targeted defect reproductions succeeded: incomplete Bigkas disagrees with shared completion scoring, and an unconfigured Worker key permits anonymous transcription.
- Local HTTP requests to `http://localhost/BaSaya-web/` could not connect. The browser tool reported no connected browsers. Authenticated UI, mobile layout, accessibility, real microphone behavior, notification delivery, release APK behavior, and live cross-device syncing were not verified.
- Firestore findings concern the rules in this repository. Their current deployment was not verified, and no Firebase emulator authorization tests were available/run. These findings are based on the explicit rule conditions, not an attempted production exploit.

## Findings, in priority order

### 1. High — Students can create classes despite the teacher-only workflow

Evidence: `firestore.rules:131-138`, `teachesClass` at lines 22-27, and class lesson writes at lines 330-332.

The class creation rule requires only a signed-in caller and `teacherId == request.auth.uid`; it never requires the teacher role. A student can create a class naming themselves as teacher. Downstream ownership checks then allow that student to manage the class, its lesson links, and its chat as the owner. This does not by itself grant the global admin role or access to every real class.

Fix: require an authorized teacher/admin role for creation, validate the document shape and ownership fields, and constrain changes to `teacherId` to authorized reassignment. Add emulator tests for student, teacher, and admin callers.

### 2. High — Class codes and one-class membership are enforced mainly in the client

Evidence: `firestore.rules:131`, `firestore.rules:152`, `firestore.rules:57-62`; intended join batch in `student/views/join.js:109-131`.

Any authenticated user can read every class document, including `classCode`. A user can also create their own roster entry in any class without proving knowledge of its code or atomically updating their profile. They can create entries in multiple rosters despite the UI's single-class restriction. Roster existence grants access to class chat and other students' roster names. Merely checking a code in the browser does not protect membership.

Fix: move joining to a trusted authenticated endpoint/transaction that validates the supplied code and existing membership. Restrict class metadata discovery, and enforce consistency between the profile and roster. Validate `joinedAt` as server time so users cannot change which overdue lessons count by editing their join date.

### 3. High — Assessment results and completion are trusted from the student client

Evidence: `firestore.rules:87-91`, `firestore.rules:108-109`, `firestore.rules:115-120`.

A student can write arbitrary fields to their own open lesson progress document, including `quizScore`, `quizFinished`, and skill results, without server validation. The rules do not prevent overwriting an already completed assessment while it remains open. Student profile updates also permit arbitrary fields other than a changed role/class constraint, including `skillSummary`. All signed-in users can read lesson content subcollections, which include quiz answer information.

Fix: distinguish informal practice from trusted assessment. For trusted results, submit answers/attempts to a backend, calculate results there, protect finalized attempts, and keep assessment answer keys outside student-readable documents. At minimum enforce types, bounds, allowed fields, membership, assigned lessons, and completion transitions. Client-side scoring alone cannot establish assessment integrity.

The schedule helper also returns true when neither the canonical assessment link nor practice link exists (`firestore.rules:41-53`), so an arbitrary unassigned lesson can receive progress. Replace the legacy permissive fallback with an explicit migration/assignment check.

### 4. High — Android crossword state can be reused across accounts and become stale across devices

Evidence: `app/src/main/java/ph/basaya/app/data/entity/CrosswordProgress.kt:6-12`; `data/dao/CrosswordProgressDao.kt:15`; `data/repository/CrosswordRepository.kt:138-139`; `ui/game/CrosswordActivity.kt:570-601`.

Room crossword progress is keyed only by `lessonId`, with no student ID. The repository immediately returns if any local record exists. Logout paths do not clear this table. A second student using the same phone and lesson can inherit the first student's found words, including partial progress at level one that `deleteAdvancedProgress` will not remove. Separately, an existing Android record is not refreshed when the same student advances that lesson on the website, so the phone can resume an older level.

Fix: use `(userId, lessonId)` as the progress key and thread the user ID through DAO/repository calls. Reconcile local progress with newer acknowledged remote progress while preserving genuinely pending local work. Verify with two students sharing a phone and with one student switching devices.

### 5. Medium — Website reports completion before Bigkas is finished

Evidence: `student/data.js:226-231`, contrasted with `js/scoring.js`'s `lessonParts` and Android `LessonCompletion.isFinished`.

The student `isComplete` helper checks lecture, game, activity and quiz, but omits `pronunciationFinished`. Home can say “Tapos na” and deadline notifications can be suppressed while teacher reports still show unfinished work. This is reachable because the quiz requires lecture completion but does not require Bigkas completion. The local audit script reproduces the disagreement using the actual functions.

Fix: use the shared completion calculation consistently. Verify with every part finished except Bigkas, including skipped game/activity combinations.

### 6. Medium — Android lesson syncing fails beyond 30 distinct lessons

Evidence: `app/src/main/java/ph/basaya/app/data/repository/LessonRepository.kt:136-142`.

Android passes the entire lesson ID list into one `whereIn` query. With 31 distinct lesson IDs this exceeds Firestore's documented limit. The website already chunks this query (`student/data.js:150-160`). Android may retain stale content or show a loading failure depending on the caller.

Fix: chunk Android lesson IDs into groups of at most 30 and merge the snapshots. Verify with 0, 1, 30, and 31 distinct content IDs, including practice copies.

Source: [Firebase query documentation](https://firebase.google.com/docs/firestore/query-data/queries).

### 7. Medium, deployment-dependent — Speech Worker fails open without APP_KEY

Evidence: `cloudflare/basaya-stt/src/index.js:32-50`; key embedded into Android at `app/build.gradle.kts:30` and sent by `speech/WhisperSttClient.kt:42`.

With no Bearer token, authentication is rejected only if `env.APP_KEY` is configured and does not match. If that secret is missing, an anonymous nonempty request reaches the AI binding. This was reproduced locally using the actual Worker and a fake AI implementation. Production secret configuration was not inspected. A configured shared key blocks this specific anonymous path, but an APK-embedded shared key is not a reliable long-term secret, and this Worker has no application-level per-user rate limit.

Fix: reject requests when no supported authentication succeeds. Prefer authenticated Android user requests too, with platform-appropriate abuse protection and per-user usage limits. Do not simply impose browser Origin requirements on Android requests.

### 8. Medium — Privacy text does not describe microphone processing and all stored data

Evidence: `js/site-info.js:43-74`; recording/transcription in `student/speech.js`; Worker AI call at `cloudflare/basaya-stt/src/index.js:50`; birthday/gender in `student/views/account.js:120-121`; class chat in `js/chat.js`.

The policy says information is not shared and describes Firebase storage, but speech audio is transmitted to the Cloudflare Worker/Workers AI. Its collection list omits class-chat content and the optional birthday/gender fields. This is a mismatch between the interface's disclosure and implementation, not a legal-compliance conclusion.

Fix: describe the actual providers, microphone processing, chat visibility, data fields, verified retention behavior, and correction/removal process in language appropriate for the intended learners. Verify provider retention before making promises about audio deletion.

## Educational assessment limitation

`PronunciationScorer.kt` and `student/speech.js` compare recognized text with the target, using spelling normalization and tolerance rules. This checks whether the recognizer heard the expected word; it does not directly measure phoneme production, stress, intonation, or a child's articulation quality. Recognition errors can become apparent learner errors.

Validate the feedback against a Filipino teacher's ratings on representative consenting learners, word lengths, accents, phones, and background noise. Report false acceptances and false rejections. When recognition is uncertain, allow “could not assess” and teacher review rather than automatically equating technical failure with inability. Describe this capability precisely during the defense.

## What to add for a stronger capstone

1. **Teacher-approved remediation and reassessment.** Extend the existing weak-skill, hard-word, and missed-question reports: suggest a small practice set, explain why, let the teacher assign/edit it, and show a separate reassessment result. Preserve the original assessment result and distinguish independent learning from improvement after practice.
2. **Baseline and follow-up evidence.** Map tasks to the intended grade/curriculum competencies. Run a documented classroom pilot with suitable permissions. Use comparable baseline and follow-up tasks; report learner count, completion, change in scores, teacher feedback, and study limitations. Without a suitable comparison design, describe observed improvement rather than claiming the app caused it.
3. **Visible sync state and recovery on Android.** The browser already has a pending-save banner and logout guard. Bring that visibility to Android: pending, acknowledged, rejected, and retry/recovery. Demonstrate offline work followed by successful reconnection; also test deadlines and account changes. Several Android result-write failures currently only go to logs.
4. **A polished, repeatable demonstration.** Use a prepared test class and an explicit sequence: assign a lesson, download it, disconnect, complete work, reconnect, inspect the teacher report, assign remediation, and show reassessment. Add accessibility improvements based on testing with actual users and devices.

These are proposals based on the code review. The educational priority is consistent with the EEF's guidance to use technology to improve teaching, practice, assessment, and feedback: [Using Digital Technology to Improve Learning](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/digital).

## Suggested order

First fix authorization, assessment trust, and account isolation. Then fix completion, query limits, and authentication fallback; verify offline syncing and privacy disclosures. Next add the remediation/reassessment workflow and collect pilot evidence. Finish with demonstration rehearsals and honest limitations. Additional chatbots, social feeds, and cosmetic rewards are lower priority given the scope already present.
