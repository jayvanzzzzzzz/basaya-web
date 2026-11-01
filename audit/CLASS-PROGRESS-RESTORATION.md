# Class progress archiving and restoration

Implemented without a school-year field. Class IDs separate records, even when two classes share a lesson or have the same display name.

## Behavior

- Approving a leave request or removing a student uses the same teacher-only endpoint. A transaction copies accepted progress into immutable history and then removes the active roster, profile class link, active progress and summary. A failed transaction leaves membership and accepted results intact.
- A request from a student new to that class has normal approval only. The UI does not render a restore dropdown.
- A returning student with saved work in that exact class sees **Returning student**, with **Restore previous progress (recommended)** selected. The teacher can explicitly select **Start fresh**. This choice works for individual and mixed bulk approvals and is disabled during processing.
- Saved work includes a single unfinished lesson, even when no lecture or assessment part has been completed. For example, 3 accepted pronunciation words out of 5 restore those three results and reopen word 4. The current word's remaining lives, mistakes and first-try counts also survive. The teacher's restore description explicitly mentions saved pages, answers and words in unfinished lessons.
- Restore copies completion flags, scores, skill results, resume positions and server assessment state. It retains the original join date, so leaving/rejoining does not change which overdue lessons count. A server-finalized assessment remains finalized; rejoining cannot create another attempt.
- Start fresh uses a new server-owned progress-session token and an empty active record. Earlier snapshots stay archived. New tokens also separate different classes and prevent old submissions from replacing the new record.
- A returning student with no saved work gets normal approval only. Nothing is restored before teacher approval.
- Previously deleted results cannot be recovered by this change. Pending answers never accepted by the server are not represented as accepted results in the archive.

## Storage and security

`users/{uid}/classProgress/{classId}` points to the latest leave snapshot. Each immutable snapshot is stored at `archives/{archiveId}`, with full lesson documents in `lessons/{lessonId}`. Summary and original join date live on the snapshot header. History is readable by that student, the owning class teacher and admins, and writable only by the API.

`users/{uid}/assignedLessons/{lessonId}` remains the active projection used by both clients and reports. Approval restores or clears it in the enrollment transaction; it never carries another class's active results forward. Missing or incomplete archives abort restore rather than silently discarding work.

The current concurrent assessment-security work owns authoritative answer handling. The archive copies its complete `assessmentState` and keeps the same `progressSession` on restore. Its API rejects an old token after an explicit fresh start. Direct client score writes remain denied by the current rules. The history rules and protected profile session field remain compatible with those stronger restrictions.

## Android

The native project in `C:/Projects/BaSaya` was updated to cache class/progress-session identity, scope crossword and completion caches to the signed-in student and progress record, reconcile newer remote crossword levels, retain remote found words, and explain archiving in the leave dialog. Newer restored levels replace older local levels; local words at the same level are merged with remote words. Cached downloads remain content; a fresh progress record does not reuse old completion caches.

The existing legacy `game_progress` table contained no user ID. Unscoped rows cannot safely be assigned to a student, so the new client does not reuse them. Accepted cloud progress remains available, and newly saved found words are included in resumable state.

The native sources compiled and the debug APK assembled successfully. The 40 JVM unit tests passed. A connected-device UI test was not performed. The pending assessment-security migration must also update native assessment calls before publishing its rules that deny all direct client result writes; the archive feature must not re-enable those writes to accommodate old APKs.

## Validation

- Follow-up partial-progress checks: `tools/partial-progress-restoration-tests.mjs` passed 7 real local-emulator scenarios covering an unfinished lecture, pronunciation 3/5 with no completed part, next-word continuation, retained lives/mistakes, activity 3/5, game words before level completion, and saved quiz answers. Speech recognition was stubbed locally; accepted results and continuation went through the actual server code.
- `tools/partial-progress-ui-tests.mjs` passed 4 checks against the actual pronunciation view and resume helper: word 4/5 at 60%, retained lives, completed-part protection, and finalization of all accepted words. Together with the 26 approval UI checks, the follow-up passed 37 targeted checks. Android already reads the same saved `done`, `correct`, `firstTryCorrect`, lives and mistakes in `PronunciationActivity`; no additional native source change was required for this clarification. This follow-up did not perform a device UI test or deploy services.
- `tools/class-progress-tests.mjs`: 22 local Firestore integration/security scenarios passed, including transfer isolation, legacy enrollment, immutable repeated snapshots, explicit fresh start, concurrent approval, failed archive rollback and missing/incomplete snapshots.
- `tools/restored-assessments-tests.mjs`: 3 integration scenarios passed against the new server assessment workflow: partial accepted attempts/words restore; finalized assessments reject another attempt; explicit fresh start permits a new attempt while preserving old results.
- `tools/class-membership-tests.mjs`: 41 scenarios passed with answer-key protection retained.
- `tools/join-requests-ui-tests.mjs`: 26 checks passed, including no restore option for newcomers, default restore, explicit fresh choice, mixed bulk choices, stale selection cleanup and disabled controls.
- `tools/leave-requests-ui-tests.mjs`: 22 checks passed with archival wording.
- Existing offline (17), session restoration (9), download refresh/storage (18), pending join UI (9), download queue (24), and cancellation (7) checks passed.
- Android `:app:testDebugUnitTest :app:assembleDebug`: successful after the final crossword reconciliation change; 40 tests, zero failures/errors.

The tests used local emulator demo projects and synthetic identities. No real requests were approved, no student was removed, and nothing was deployed. Browser inventory was empty, so UI verification used the DOM harness rather than an authenticated browser or visual screenshot. The local fictional admissions preview now contains both returning students and newcomers.

## Rollout

Publish the combined membership/assessment API (including its rewrites), Firestore rules, web client and compatible native assessment client together after the concurrent security work is ready. Rebuild `offline-shell.js` after the final combined web changes. Existing active members need no destructive data migration; the first subsequent leave creates their archive.

The debug APK produced by this work is `C:/Projects/BaSaya/app/build/outputs/apk/debug/app-debug.apk`. It is a development build, and the concurrent assessment work may replace it with a later combined build. Already-deployed clients/services have not been changed by this task.
