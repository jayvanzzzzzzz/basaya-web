# Phase 2 — Teacher approval for class membership

Implemented locally on 1 November 2026. The API and Firestore changes have **not** been
published to production by this implementation task.

## Student and teacher behavior

1. A student enters a class code on Android or the website.
2. The authenticated API validates the code and creates one pending request. Students
   cannot have two pending class requests or submit a new one while already enrolled.
3. The teacher's existing Students page shows requests above the roster, oldest first.
   It includes search, individual checkboxes, Select all shown, an indeterminate state,
   Approve selected with the exact count, and individual Approve/Decline actions.
4. Selection is cleared when changing the search. Hidden requests are never included.
   Large selections are sent in batches of at most 50; duplicate clicks are blocked.
5. Approval atomically creates the roster entry, links the student's profile, clears the
   pending pointer and writes one chat join notice. A closed chat stays closed.
6. Pending/declined status appears in the student's join, home and account screens.
   Membership changes are observed live. Declined students can submit a fresh code request.
   Only approval opens lesson content and class chat. Existing enrolled students stay enrolled.

The teacher view uses the existing Students route, including:
`http://localhost/BaSaya-web/teacher/index.html#/classes/NfPCDMUkyc67dcHQKI91/students`.

## Design preview

`http://127.0.0.1:8786/audit/admissions-preview.html` is a separate preview with fictional
students. It uses the real admission markup, controller and CSS with local fake data/API
adapters, and supports light/dark themes and selection/approval interactions. It does not
import the live Firebase application or modify real students. Its limited static server
exposes only preview resources, CSS and images; repository metadata and API code are blocked.

Start it from the website root with:

```powershell
node tools/serve-approval-preview.mjs
```

The same preview is also available under `/BaSaya-web/audit/admissions-preview.html` if
Apache is running. The browser/Computer Use helper was unavailable during this task, so
rendered layout, actual browser interaction and real-device UI were not visually verified.

## Verification

- 41 Firestore emulator integration/security scenarios passed, including actual server
  transactions, forged membership, pending access, code guessing, simultaneous two-device
  requests, stale request IDs, duplicate and bulk approval, existing member compatibility,
  teacher class-list queries, class-deletion cleanup and generic chat push content.
- 18 DOM/selection/routing checks passed, including search-scoped select-all, disabled
  controls, 101 requests split 50/50/1, duplicate clicks and interrupted review recovery.
- All six existing website regression suites passed: 119 reported checks/scenarios.
- Android: 40 unit tests passed; the final debug APK assembled successfully. Kotlin
  encountered a Windows incremental-cache file lock during assembly and recovered with
  its standard fallback compiler. The final unit-test run also completed successfully.
- Local preview resource checks passed, including blocked `.git` and API-source requests.

Run the new tests from the website root (Java/emulator paths may differ on another PC):

```powershell
node --experimental-vm-modules tools/class-membership-tests.mjs 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe' 'C:\Users\Scean Andrei\.cache\firebase\emulators\cloud-firestore-emulator-v1.19.8.jar'
node --experimental-vm-modules tools/join-requests-ui-tests.mjs
```

The tests use local demo projects and synthetic users, with no writes to production.
LinkeDOM is a development-only dependency in `notify-api/package.json` for DOM tests.

## Files and rollout

- `firestore.rules`: membership requires both the profile class link and roster entry.
  Direct roster enrollment, membership-field edits, request writes and code discovery
  are blocked. Only staff and approved members can read learning content.
- `notify-api/lib/classMembership.js`: transactional request/review logic.
- `notify-api/api/class-membership.js`, `handlers/` and `vercel.json`: authenticated routes
  with the original remove-student URL retained. API function count remains twelve.
- `teacher/views/joinRequests*.js`, `css/pages/class-admissions.css`: approval UI and design.
- Student web views and `student/app.js`: pending state and live membership changes.
- Six Android files were updated in `C:/Projects/BaSaya`, including the authenticated
  membership client and pending-state screens. The built debug APK is at
  `C:/Projects/BaSaya/app/build/outputs/apk/debug/app-debug.apk`.

To activate the feature, deploy the API **with its rewrites**, publish the Firestore rules,
then distribute the updated web client and Android APK. The local website files already
contain the new UI, but its API base URL still points to the existing Vercel deployment.
New join/review calls will not work on that deployment until the API is published.

The root `firebase.json` is prepared for rules-only deployment:

```powershell
firebase deploy --project basaya --only firestore:rules
```

Older Android versions that directly write enrollment will be refused after the rules
are published; students need the updated APK to request new membership. Existing approved
members retain their classes. Production end-to-end verification remains a deployment step:
request with a test student, confirm no early access, approve on the linked teacher page,
then verify access on web and Android. No real join requests were approved during development.
