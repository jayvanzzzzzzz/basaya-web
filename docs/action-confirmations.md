# Action confirmation coverage

The website uses `js/action-confirmation.js` and `css/components/action-confirmation.css` for accessible themed confirmation dialogs. Native Android actions reuse `StudioDialogBuilder` through `ActionConfirmation.kt`.

## Website

- Explicit form policies cover teacher creation/editing, temporary passwords, class creation/editing/assignment, schedules/deadlines, teacher/student profile and password saves, admin password approval requests, reading grades, registration, profile completion, password reset and class join requests.
- The full lesson editor validates its content before asking to publish/save. The legacy lesson form uses the shared form policy.
- Dictionary saves and spelling changes ask after dictionary validation. Existing dictionary deletion, restoration and discard dialogs are retained.
- Join-request approvals/declines (including bulk review), lesson notifications, password-reset emails, teacher message deletion, saved-account removal, offline-download removal and final reading submission have explicit confirmations.
- Existing class/lesson/account deletion, student removal, leave requests, student message deletion, lesson unlinking and logout confirmations remain in place without an extra prompt.
- Leaving a dirty reading rubric uses the themed dialog. Closing the browser retains the browser-required native unsaved-work prompt.

Form submission is replayed with `requestSubmit` only after approval; the real handler receives its original submitter. Cancel, Escape, detached forms and changed form data cannot authorize a write. Dialog text is inserted as text, never HTML. Login, search, navigation and automatic learning-progress synchronization remain direct.

## Android

Added confirmations for profile/password saves, registration/profile completion, join requests, offline-download removal, saved-account removal and final reading submission. Existing native logout, leave-class and message-deletion dialogs are retained. Draft/progress autosaves remain automatic.

## Verification

`node --experimental-vm-modules tools/action-confirmation-tests.cjs` checks all 19 form policies, cancellation, validation, exactly-once replay, changed-value protection, existing-dialog exemption, syntax and responsive light/dark dialogs. Screenshots are in `audit/action-confirmations/`.

Android verification: `:app:compileDebugKotlin` and `:app:assembleDebug` with the bundled Android Studio JDK. The APK is built locally; these changes do not publish the website or install the APK on a device.
