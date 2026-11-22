# Lesson modules

Both staff portals use `js/lessonWorkspace.js` at `#/lessons`. The existing lesson studio mounts inside the workspace; its content sections and validation remain shared with the admin library.

## Stored structure

`modules/{id}` contains `title`, `description`, `ownerId`, `visibility`, `lessonIds`, `revision`, `createdAt`, `updatedAt`, `progression`, and `lockingEnabled`. The position of each ID in `lessonIds` is its authoritative learning order. Modules accept 1–100 unique lessons. Revision checks prevent overwriting another session's changes.

Admin modules are shared and available for teacher class assignment. Teacher modules are private to their author and admins. A teacher using a shared module in the builder creates their own module. Only its owner or an admin can update a saved module.

Selecting a premade lesson reuses its ID. Editing it within a module creates a separate lesson, tracks `sourceLessonId` (original) and `copiedFromLessonId` (selected version), and assigns names such as `Pandiwa 1.1`, `Pandiwa 1.2`. A transaction on `lessonCopyCounters/{originalId}` allocates the next number. Editing a copy again in the same unsaved module session updates that copy. Reopening a saved module treats its lessons as reusable premade content again.

New lessons and copies are first reserved with `publicationState: draft`. A single batch publishes their activity sections and marks the root `published`. The staff libraries omit unfinished drafts. A retry reuses the reserved lesson ID and number. Existing lesson IDs, class assignments and student progress are preserved.

Class assignment can add a module's lessons using the existing assessment/practice and schedule controls. New links retain `moduleId`, `moduleTitle`, `moduleOrder`, and `moduleRevision`, along with the existing class order. Already assigned lessons are skipped according to the selected mode. Assignments are snapshots; editing a module does not silently replace an existing class's assignments.

## Future sequential access

Modules store `progression: sequential` and `lockingEnabled: false`. Student web and Android locking is intentionally inactive. Future work must define completion, pin the assigned sequence, and enforce access on the backend as well as both clients. Students currently use the existing lesson access rules.

## Validation and release

Run `node tools/module-lessons-browser.cjs` for the local browser suite. It uses local adapters and never writes production data. It covers both staff roles, responsive light/dark layouts, original preservation, copy naming, new lesson publication, ordered class assignment, failed saves, and unsaved navigation.

Run `node tools/module-lessons-tests.mjs <java.exe> <firestore-emulator.jar>` for actual Firestore rules, ownership, concurrent numbering and stale module revisions. Java 11 or newer is required.

Deploy the updated `firestore.rules` together with the web changes before exposing the workspace in production. No production data migration is required. Student locking requires a separate future release.
