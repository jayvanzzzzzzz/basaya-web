# BaSaya teacher portal

A no-build teacher web app using Firebase Authentication and Cloud Firestore. It deliberately excludes teacher-account management; create those accounts in your future main-admin app, then give each user document `role: "teacher"`.

## Setup

1. In Firebase Authentication, enable **Email/Password** and create the teacher user.
2. Create `users/{uid}` with at least `{ displayName: "…", role: "teacher" }`.
3. Paste your Firebase Web App config into `firebase-config.js`.
4. Deploy `firestore.rules` using the Firebase console or `firebase deploy --only firestore:rules`.
5. Host these static files (Firebase Hosting, Netlify, GitHub Pages, or any web server). Do not open `index.html` directly from disk because browser modules/Firebase authentication need an HTTP(S) origin.

## Data written by this portal

| Collection | Key fields |
|---|---|
| `classes` | `name`, `subject`, `grade`, `joinCode`, `teacherId`, `createdAt` |
| `classes/{classId}/students` | student snapshot written by your student enrollment flow; read-only here |
| `lessons` | `title`, `description`, `difficulty`, `activityType`, `content`, `teacherId`, `createdAt`, `updatedAt` |
| `classLessons` | `classId`, `lessonId`, `teacherId`, `order`, `createdAt` |
| `progress` | student-side completion documents with `classId`, `studentId`, `teacherId`, `percent`, `updatedAt` |

The teacher portal treats student enrollment and progress writes as student-app/server responsibilities. Its security rules allow teachers to read only data associated with their own classes.
