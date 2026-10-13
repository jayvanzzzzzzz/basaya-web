# BaSaya teacher portal

A no-build teacher web app using Firebase Authentication and Cloud Firestore. It deliberately excludes teacher-account management; create those accounts in your future main-admin app, then give each user document `role: "teacher"`.

## Setup

1. In Firebase Authentication, enable **Email/Password** and create the teacher user.
2. Create `users/{uid}` with at least `{ displayName: "…", role: "teacher" }`.
3. Paste your Firebase Web App config into `firebase-config.js`.
4. Deploy `firestore.rules` using the Firebase console or `firebase deploy --only firestore:rules`.
5. Host these static files (Firebase Hosting, Netlify, GitHub Pages, or any web server). Do not open `index.html` directly from disk because browser modules/Firebase authentication need an HTTP(S) origin.

## Lesson schedule and notifications

When adding lessons to a class, a teacher can set an optional **open date** and **deadline**. Students can't open a lesson before it opens, and an unfinished lesson locks after its deadline. The Firestore rules enforce both with server time, so changing the phone's clock doesn't help. Adding a lesson sends a push notification to the class through `notify-api/`, which runs on Vercel (see `notify-api/README.md`).

## Student progress and Class Report

Teachers can open **View progress** for any student, and a **Class Report** for the whole class (button on the class page). Scores use the same rules as the Android app (`js/scoring.js` is a port of the app's `SkillScoring.kt`, and passes the same unit tests). Change both together.

- **Per student:** five skills, scored separately with no combined grade. Each lesson's score is first-try accuracy, lessons are combined with a recency-weighted average, and a skill is flagged "needs help" when its last 2 lessons were both below 60%.
- **Remarks:** Very good (85–100%), Good (70–84%), Fair (50–69%), Poor (below 50%). "Not enough data" appears until a skill has 2 lessons or 10 items.
- **Class Report:** each skill's class average is the mean of the students' skill scores, counting only students with results. The **overall class score** is the mean of those skill averages.
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

The teacher portal's Account settings page lets teachers update their display name and change their password. Teachers sign in with their email address. Deploy the Firestore rules after setup so a teacher can update only their own display name; password changes are handled by Firebase Authentication.

## Data written by this portal

| Collection | Key fields |
|---|---|
| `classes` | `name`, `subject`, `grade`, `joinCode`, `teacherId`, `createdAt` |
| `classes/{classId}/students` | student snapshot written by your student enrollment flow; read-only here |
| `lessons` | `title`, `description`, `difficulty`, `activityType`, `content`, `teacherId`, `createdAt`, `updatedAt` |
| `classes/{classId}/classLessons/{lessonId}` | `lessonId`, `teacherId`, `order`, `createdAt`, `openAt`, `dueAt` (optional schedule), `notifyPending`, `notifiedAt` |
| `progress` | student-side completion documents with `classId`, `studentId`, `teacherId`, `percent`, `updatedAt` |

The teacher portal treats student enrollment and progress writes as student-app/server responsibilities. Its security rules allow teachers to read only data associated with their own classes.
