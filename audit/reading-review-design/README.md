# Review Readings redesign

The student directory, submitted-lesson list, and recording/grading workspace now share the Class Dashboard's cream/navy and dark lavender identity. The review queue uses actual newest-submission counts. A ruled register replaces repeated panels; recordings occupy the main column and the grading form uses a restrained translucent surface.

Back, play-all, save, retry, and suggested-feedback actions are icon-only with accessible names and animated hover/focus tooltips. Suggested sentences remain visible beside their add buttons. Native audio controls, form validation, dirty-state protection, API requests, and grade payloads remain in place. The existing theme toggle and persistence are reused.

Changes are scoped to `teacher/views/fluencyReview.js` and `css/pages/reading-review.css`. Existing in-progress work was preserved.

Verification:

- `node tools/reading-review-design-browser.cjs` passed: actual shell, styles, helpers, review renderer, theme, and tooltip implementation with local-only API/roster fixtures. All three screens checked at 1440, 900, 390, and 320px in both themes, including content overflow and accessible icon names.
- Browser interaction checks passed for tooltip hover/focus/Escape, tooltip disposal on navigation, local WAV playback, suggested feedback, save failure/retry, unsaved-change confirmation, correct grading payload and return navigation, reduced motion, and empty/error states.
- `node --experimental-vm-modules tools/teacher-reading-tests.mjs` passed, including newest submissions, stale/cross-student routes, playback retry, grade-save recovery and count updates.
- `node --experimental-vm-modules tools/floating-tooltip-tests.mjs` passed.
- JavaScript syntax and scoped `git diff --check` checks passed.
- Rendered desktop light/dark and narrow mobile layouts were visually reviewed. Screenshots are alongside this report.

Live authenticated Firebase operations, production recordings, and production grade writes were not exercised. Test data exists only in the local preview server. Targeted accessibility checks do not constitute a full WCAG audit.

## Text readability follow-up

- Raised metadata/status labels to at least 12px, supporting text to 14px, and form values to 16px, with comfortable line spacing and opaque placeholder colors.
- Long reader names, lesson text and feedback remain available through wrapping. No new truncation was introduced.
- Added `tools/text-readability-audit.cjs` to the browser checks. Visible main-content, header, footer, dialog and tooltip text is checked for minimum size, computed contrast (4.5:1 for ordinary text; 3:1 for large text), and hidden overflow. Background compositing is calculated from CSS ancestor colors; this is targeted verification rather than a complete accessibility audit.
- Passed both theme/viewport matrices again, plus long names, expanded feedback, increased WCAG text-spacing values, focused tooltips, saving/disabled controls, and failed-save messages. Reviewed the rendered narrow grading layout and desktop register after the typography changes.

The student directory now uses a semantic table with Student, Submitted, Review status and an icon-only Open action. Mobile rows stack labeled facts below the identity; names wrap fully. Student sorting, submission counts and routes remain unchanged. Both the Open link (keyboard Enter) and whole-row pointer navigation were verified, along with hover/focus tooltip text and both theme/viewport matrices.

Pagination now appears below the student register using the existing `js/pagination.js` component: 10 students by default, numbered pages, icon-only previous/next controls with tooltips, and 10/20/50 rows-per-page options. A 25-student local fixture verified page boundaries, first/last disabled states, keyboard activation, page-size changes, preserved ordering, and light/dark readability at desktop and mobile widths. Empty lists do not display pagination.

Latest queue behavior: only students with submitted readings awaiting review are listed, sorted A–Z. Lesson deadlines come from the class's existing Firestore `classLessons` documents. The earliest deadline among each student's pending assessment readings determines the animated name dot: orange for beyond 48 hours (or no deadline), red within 48 hours or overdue. Practice links and graded readings do not affect urgency. Urgent rows also show a readable deadline note; urgency is recomputed each minute without resetting pagination, and the interval is disposed on navigation. Pagination labels/buttons use 13px text and the rows selector uses 14px text, retaining 44px controls.

Passed updated browser matrices and pending-only 25-student pagination fixtures. Unit checks cover the exact 48-hour boundary, beyond 48 hours, aging into the window, overdue/unscheduled readings, mixed deadlines and exclusion of graded/practice deadlines. Production Firestore access remains unverified in an authenticated session.

Recording duration fix: audio now uses `preload="metadata"` so valid recordings expose their duration before Play. Each page also shows a loading/length message, using the server's stored clip duration while metadata loads when available. Media or playback failures expose an accessible error and icon retry, which requests a new authenticated playback URL without rebuilding the grading form. Play-all uses the same error handling. Tests verified two valid WAV clips have duration 1 second while still paused, recovery from a simulated expired-link HTTP 403 via a fresh API request, duration formatting, and unchanged grading/feedback behavior. Light/dark and narrow-layout checks pass. Actual private production recordings were not accessed.
