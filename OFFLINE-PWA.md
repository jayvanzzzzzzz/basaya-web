# Student offline lessons

The student portal can download individual lessons and their lecture/Bigkas audio.
Download, update and remove controls appear only when opened as an installed PWA
(standalone display mode, including iOS Home Screen mode), not in a regular browser tab.
Download controls appear in the three-dot menu at the upper-right of each lesson card
on Mga Aralin.
The installed PWA has a separate "Na-download" Home tab with a count of local lesson
downloads. Completion remarks (such as Tapos na) remain unchanged; the green
downloaded icon stays beside each card's three-dot menu. Bulk controls scroll with
the page rather than staying pinned.
"I-download lahat" (with a download icon) processes currently open, undownloaded class lessons
sequentially, across all filters. Closed/future lessons and existing downloads are
skipped. Progress identifies the current lesson and percentage; failed items can
be retried without repeating completed downloads. Leaving Home or losing the
connection stops the remaining queue after the current attempt.
An icon-only × beside the bulk button cancels the active transfer and remaining
queue. Partial audio is discarded; completed lesson downloads stay available.

A successful download
requires a complete offline shell, durable Firestore storage, all five content
collections, and all referenced audio. Failed updates preserve the previous download.
Removing a download deletes its content bundle and audio cache, preserving progress.

Downloaded lessons are scoped by Firebase user, class and class-entry ID (including
Practice entries). Refreshing Home online updates downloaded schedules and removes
downloads for lessons no longer assigned. Content revisions show an update label.
Offline launch requires a previous successful student sign-in on the same browser.
Only explicit downloads appear in the offline lesson list. Bigkas checking still
requires internet; lecture playback, crossword, Gawain and quiz work offline.

Firestore's multi-tab IndexedDB persistence retains progress and sends pending writes
when reconnected. Screens resolve saves on the local snapshot so offline completion
does not wait for the network. Practice activities still skip progress writes.
The status banner reports offline operation, pending uploads and server rejection.
Pending save receipts survive reloads; server snapshots reconcile them, and a rejected
write produces a dismissible notice. The normal sign-out flow blocks pending saves.
After synchronization, the skill summary is recomputed.

Existing Firestore schedule rules are unchanged: uploads received after the deadline
can be rejected, including work completed offline before it. Students are reminded to
connect before the deadline. The server remains authoritative for accepted results.
Simultaneous edits of the same progress fields across devices follow Firestore's
existing last-write behavior. Offline work on multiple devices is not a conflict-free
merge of attempts.

## Build and verification

After changing student JS, shared JS, CSS, images, or the dictionary, run:

```powershell
node tools/build-offline-shell.mjs
node tools/offline-tests.mjs
node tools/download-queue-tests.mjs
node tools/download-cancellation-tests.mjs
```

Commit/deploy `offline-shell.js` along with the source. Its content hash versions the
shell cache. Service worker updates wait for existing tabs to close; close all BaSaya
tabs and reopen online after deployment. The installer recursively caches Firebase
ESM imports. It never caches authenticated Firebase API responses. Lesson audio is
kept in separate removable caches. Fonts can fall back to system fonts offline.

Offline storage needs HTTPS (or localhost), IndexedDB, Cache Storage and service workers.
The app requests persistent storage after downloading, but the browser can still clear
site data or evict storage. Private browsing or blocked storage may disable downloads.

The automated checks simulate service-worker and Firestore events; they are not a
replacement for the following signed-in browser/device checks:

1. Sign in as a student, download a lesson, close/reopen offline, and play lecture audio.
2. Answer some quiz questions, reload offline, and verify resume. Complete each scored
   part and verify the page advances without hanging. Practice must save no scores.
3. Reconnect before the deadline, verify pending status clears, and check Android and
   teacher reports. Reload while pending to test receipt reconciliation.
4. Repeat across a deadline and after class removal; verify a rejected-upload notice.
5. Update content and redownload, interrupt a download, remove a download, switch
   accounts/classes, and test two tabs. Verify downloads stay scoped and scores remain.
6. Test Android Chrome and an installed iPhone/Safari PWA, including denied storage and
   service-worker upgrades. Check microphone permission and the online-only Bigkas note.
