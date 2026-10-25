# How the class chat works

Each class has **one group chat**. The teacher uses it on the website (**Messages** page), and the class's students use it in the Android app (**Chat** tab). Both apps read and write the same Firestore documents directly. The only server code is one Vercel endpoint, and it just sends push notifications.

```
 Teacher (website)                         Students (Android app)
 teacher/views/messages.js                 ui/fragment/ChatFragment.kt
          │                                          │
     js/chat.js                              data/chat/ClassChat.kt
          │   read / write (live listeners)          │
          └──────────────►  Firestore  ◄─────────────┘
                     classes/{classId}/messages
                     classes/{classId}/chat/state
                     classes/{classId}/chatSenders/{uid}
                     (firestore.rules → "Class chat")
          │
          │ teacher's message only
          ▼
 notify-api (Vercel)  POST /api/notify-chat
          │  FCM data message, topic "class_<classId>"
          ▼
 Android: LessonMessagingService → ClassNotifications.showChat → tap opens the Chat tab
```

---

## 1. Data in Firestore

All chat data lives under the class, so deleting a class also deletes its chat (`notify-api/api/delete-class.js`).

| Path | Fields | Purpose |
|---|---|---|
| `classes/{classId}/messages/{id}` | `text`, `senderId`, `senderName`, `role` (`"teacher"` / `"student"`), `sentAt` (server time) | One message |
| ↳ after removal | `text: ""`, `deleted: true`, `deletedBy` (`"teacher"` / `"sender"`) | A removed message keeps its place in the chat. If it was the newest (its `sentAt` equals `chat/state.lastAt`), the same batch sets `chat/state.lastText` to `""`, and the teacher's Class chats list shows "Name: Message removed" (a removed join notice also gets `lastRole: "student"`). The rules let a student blank it only when the summary is their own message from the last 5 minutes |
| ↳ after push | `pushedAt` | Set by notify-chat, so a message is pushed only once |
| ↳ join notice | `kind: "join"`, `text: ""`, `role: "student"` | "Juan Dela Cruz joined the class" (teacher) / "Si Juan Dela Cruz ay sumali sa klase" (students), a centered line |
| `classes/{classId}/chat/state` | `open` (missing = open), `lastAt`, `lastText`, `lastSenderName`, `lastRole` (`"join"` after a join notice) | Open/closed switch, plus a summary of the last message for unread dots and the class list |
| `classes/{classId}/chatSenders/{uid}` | `lastSentAt` | A student's last send time, for the 5-second limit |

Messages are never hard-deleted. The rules don't allow it. "Removing" a message empties its text and marks it deleted.

**Join notices.** When a student joins (`student/views/join.js`, `JoinClassActivity.kt`), the same batch that creates their roster entry also writes the notice and the summary (`addJoinNotice` in `js/chat.js` / `ClassChat.kt`). The rules accept it only when the roster entry is created in that same request with `joinedAt` = server time, so it can't be repeated and is allowed even while the chat is closed. It lights the unread dot and shows in the teacher's class list, but sends no push. The student can't delete it. Only joins after this feature shipped have a notice.

---

## 2. Who can do what (`firestore.rules` → "Class chat")

The rules enforce every limit on the server. The apps check the same limits only for a nicer experience.

| | Teacher of the class | Student in the class | Anyone else |
|---|---|---|---|
| Read messages and `chat/state` | ✅ | ✅ (even while closed) | ❌ |
| Send | ✅ up to **2,000** chars, no rate limit | ✅ up to **300** chars, **1 per 5 s**, only while **open** | ❌ |
| Remove a message | ✅ any (`deletedBy: "teacher"`) | ✅ **own** only, within **5 minutes** (`deletedBy: "sender"`) | ❌ |
| Edit a message's text | ❌ | ❌ | ❌ |
| Open / close the chat | ✅ | ❌ | ❌ |

Further checks on a message:

- `senderId` must be the signed-in user, and `sentAt` must equal the server's `request.time`, so nobody can fake who sent a message or when.
- A student's `senderName` must equal their `fullName` in `classes/{classId}/students/{uid}`, so students can't post under another name.
- Only the five message fields are allowed when creating a message. `role: "teacher"` is accepted only from the class's teacher.

### How the 5-second limit works

A student sends **one batch** with three writes:

1. the new message
2. `chatSenders/{uid}` with `lastSentAt: serverTimestamp()`
3. `chat/state` (the last-message summary, merged)

The rules use `getAfter()` to check that `chatSenders/{uid}.lastSentAt` is stamped with this same request's time. The `chatSenders` rule requires that time to be at least 5 seconds after the previous `lastSentAt`. If any check fails, the whole batch is rejected. Because the times come from the server, changing the phone's clock doesn't help.

---

## 3. Website (teacher)

| File | Role |
|---|---|
| `js/chat.js` | Data layer: `watchRecent`, `loadOlder`, `watchState`, `sendTeacherMessage`, `removeMessage`, `setChatOpen`, and the local read state (`lastRead`, `markRead`, `isUnread`) |
| `teacher/views/messages.js` | The **Messages** page (`#/messages/<classId>`): class list on the left, chat on the right. Also keeps one live `chat/state` listener per class for the badges (`watchChatSummaries`, `chatDot`, `onChatSummaries`) |
| `css/pages/messages.css` | Styles, light/dark, phone layout (list → chat with a back button) |
| `teacher/router.js` | `/messages` route. Calls `watchChatSummaries()` once the sidebar loads, and `leaveMessages()` on every route change (stops the open chat's listeners) |
| `teacher/index.html` | "Messages" sidebar link with a badge counting classes that have unread messages |
| `teacher/views/dashboard.js` | "New messages" tag on each class card (live) |
| `teacher/views/classPage.js` | "Class chat" button in the class header |

**Sending (teacher):**

1. `sendTeacherMessage()` writes the message and `chat/state` in one batch.
2. After the batch commits, it calls `POST /api/notify-chat { classId, messageId }` via `postToApi` (with the teacher's Firebase ID token).
3. If the push fails, the message is still saved. The failure is only logged.

**Composer:** Enter sends and Shift+Enter adds a new line. After each message the send button waits **3 seconds** (`TEACHER_COOLDOWN_MS`) and shows the countdown in place of the icon. The teacher can keep typing during the wait, and a failed send clears it. This limit is only in the composer: the rules don't check teacher sends (students still have the 5-second limit, which the rules do check).

**Message list (teacher and student web):** the list is redrawn on every snapshot, and `chatDelivery()` in `js/chat.js` keeps that steady. Only messages that weren't on screen before fade in (`.is-new`). Under your own message, a small "Sending…" / "Ipinapadala…" shows until the server has it, then "Sent" / "Naipadala" for 2 seconds, then it goes away. The time inside the bubble shows only once the message is saved.

**Teacher controls:**
- Removing a message takes two clicks: Remove, then confirm.
- The open/closed switch writes `chat/state.open`. While the chat is closed, students see a banner and the app hides the composer.

---

## 4. Android app (student) — `C:\Projects\BaSaya`

| File | Role |
|---|---|
| `data/chat/ClassChat.kt` | Data layer (mirrors `js/chat.js`): `watchRecent`, `loadOlder`, `watchState`, `rosterName`, `send` (the 3-write batch), `canDelete`, `deleteOwn`, read state, and `visibleClassId` |
| `ui/fragment/ChatFragment.kt` | The Chat tab |
| `adapter/ChatAdapter.kt` | Message rows: "load older", day separators ("Ngayon", "Kahapon", date), incoming, mine, removed. Groups messages from the same person within 5 minutes |
| `res/layout/fragment_chat.xml`, `item_chat_*.xml` | Layouts |
| `res/values/strings_chat.xml`, `colors_chat.xml`, `drawable/ch_*` | Text (Filipino), colors, shapes |
| `ui/MainActivity.kt` | 4th bottom tab (Mga Aralin / Progreso / **Chat** / Account), the unread dot, and `chatIntent()` for opening the tab from a notification |
| `controller/BottomNavController.kt` | Tab bubble and colors (Chat is orange) |
| `data/notifications/ClassNotifications.kt` | `class_chat` notification channel and `showChat()` |
| `data/notifications/LessonMessagingService.kt` | Receives FCM messages and handles `type == "chat_message"` |

**Chat tab behaviour:**

- **When it listens:** Firestore listeners run only while the tab is on screen (`onResume`/`onHiddenChanged`). Leaving the tab stops them.
- **Class and sender name:** on opening, the tab reads `users/{uid}.classId` / `className`. The sender name comes from the roster (`rosterName`), which is what the rules compare against.
- **Message list:** the fragment keeps every message it has seen for the class. As new messages arrive, old ones slide out of the live window of 30, but they stay on screen, and "load older" continues from the oldest one.
- **Sending:**
  1. The input clears immediately and the message appears as "Ipinapadala…" until the server confirms it.
  2. The 5-second countdown starts **after** the server accepts the message, so a slow connection can't cause a too-early second send.
  3. If the rules reject the send, the text goes back into the input and a toast shows `ch_too_fast` or `ch_send_failed`.
- **Deleting:** long-pressing your own message (within 5 minutes) opens the "Burahin ang mensahe?" dialog.
- **Closed chat:** shows a banner and hides the composer. Students can still read.
- **Keyboard:** the app draws edge-to-edge, so on Android 11+ the window doesn't shrink for the keyboard. The fragment pads itself by the part of the keyboard that covers it.
- **No class yet:** shows "Wala ka pang klase".

**Unread dot on the Chat tab:** while the app is open, `MainActivity` listens to `users/{uid}` (in case the class changes) and to that class's `chat/state`. The dot shows when `ClassChat.isUnread(...)` is true and the Chat tab isn't the active one.

---

## 5. Push notifications (`notify-api/api/notify-chat.js`)

**Only teacher messages are pushed.** Students' messages only light the in-app dot, so phones aren't flooded and the free tier is enough.

`POST /api/notify-chat`, with header `Authorization: Bearer <teacher's ID token>` and body `{ classId, messageId }`.

The endpoint checks, in order:

1. The caller is signed in, and both IDs are valid.
2. The caller is the class's teacher (`classes/{classId}.teacherId`) → otherwise **403**.
3. The message exists → otherwise **404**.
4. The message is the caller's own, has `role: "teacher"`, and isn't removed → otherwise **403**.
5. The message is less than **2 minutes** old and has no `pushedAt` → otherwise **409**. This stops re-sending old messages and duplicate pushes.

If all checks pass, it sends an FCM **data** message to topic `class_<classId>`:

```json
{
  "type": "chat_message",
  "classId": "...",
  "messageId": "...",
  "title": "💬 <class name>",
  "body": "<teacher name>: <first 140 chars>",
  "sentAt": "<millis>"
}
```

Then it sets `pushedAt` on the message (with the Admin SDK, which isn't bound by the rules).

**On the phone:**

1. The phone is subscribed to `class_<classId>`. `HomeFragment` calls `ClassNotifications.syncTopic()`; this is the same topic as the "new lesson" pushes.
2. `LessonMessagingService.onMessageReceived` sees `type == "chat_message"`.
3. It ignores the message if:
   - the class isn't the one this phone is subscribed to, or
   - `ClassChat.visibleClassId == classId` (the chat is already on screen).
4. Otherwise `ClassNotifications.showChat()` posts the notification on the `class_chat` channel. Each class has one notification ID, so a newer message replaces the older notification. Tapping it opens `MainActivity` on the Chat tab.

---

## 6. Keeping reads (and cost) low

- **Live window:** only the latest **30** messages are live (`orderBy("sentAt", "desc").limit(30)`). Older pages of 30 load only when "Tingnan ang mas luma" / "Load older messages" is tapped (`startAfter` the oldest message).
- **Badges:** unread badges and dots come from the small `chat/state` doc (one read per change), not from the message list.
- **"Last read" time:** stored **on the device**, so it costs no Firestore reads or writes.
  - Website: `localStorage` key `basaya.chatRead.<uid>.<classId>`
  - App: SharedPreferences `class_chat`, key `read_<classId>`
- **Unread means** `chat/state.lastAt` is newer than the last read time and the last message wasn't your own.
- **Offline cache:** the phone uses Firestore's offline cache, so reopening the chat shows cached messages straight away.
- **Pending times:** while a server timestamp is still pending, both apps estimate it (`serverTimestamps: "estimate"` / `ServerTimestampBehavior.ESTIMATE`), so a new message sorts correctly before the server confirms it.

---

## 7. End-to-end examples

**A teacher posts "Magandang umaga!"**

1. The website batch writes `messages/{id}` and `chat/state`.
2. The rules check that the caller teaches the class, the text is ≤ 2000 chars, and `sentAt == request.time`.
3. Every open chat (web and app) gets the new message through its live listener. Unread dots update through `chat/state`.
4. The website calls `/api/notify-chat`. FCM sends to `class_<classId>`, and phones without the chat open show "💬 Grade 4 – Sampaguita: Gng. Santos: Magandang umaga!".

**A student replies "Magandang umaga po!"**

1. The app batch writes the message, `chatSenders/{uid}`, and `chat/state`.
2. The rules check membership, that the chat is open, ≤ 300 chars, that the name matches the roster, and that it's ≥ 5 s since the last send.
3. The teacher's Messages page and the classmates' Chat tabs update live. The teacher's sidebar badge and class card show "New messages".
4. No push is sent.

**The teacher closes the chat**

1. `chat/state.open = false`.
2. Students' Chat tabs switch to the closed banner and hide the composer.
3. Any send attempt is rejected by the rules (`chatOpen()`).

---

## 8. Deploying changes

| Changed | Deploy |
|---|---|
| `firestore.rules` | Firebase Console → Firestore → Rules → paste → Publish, or `npx firebase-tools deploy --only firestore:rules` |
| `notify-api/` | From `notify-api/`: `npx vercel --prod` (the folder is linked to the `basaya-notify-api` project), or push to GitHub if Vercel is connected to the repo |
| Website files | However the site is normally hosted (the files are static) |
| Android app | `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug` in `C:\Projects\BaSaya` |

## 9. Testing the rules

The Firestore emulator jar is cached in `~/.cache/firebase/emulators/`. Run it with Android Studio's Java (it needs Java 11+):

```
"C:/Program Files/Android/Android Studio/jbr/bin/java" -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.19.8.jar --host 127.0.0.1 --port 8080
```

Then run a `@firebase/rules-unit-testing` script against `firestore.rules`.

The checked cases (all passing):
- student sends 300 chars; 301 is rejected
- a second send within 5 s is rejected; after 5 s it works
- a wrong `senderName` is rejected
- a student can't send while the chat is closed
- a non-member or another class's teacher can't read or send
- the teacher can remove any message; a student can remove their own within 5 minutes only
- a student can't change `open`
- nobody can hard-delete a message

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Chat says it can't load / "Missing or insufficient permissions" | The new `firestore.rules` aren't published yet |
| Student's send always fails | Their `fullName` in `classes/{classId}/students/{uid}` doesn't match what the app sends, or the chat is closed |
| "Sandali lang!" toast | Sent again within 5 seconds (server time) |
| No push for teacher messages | `notify-api` not redeployed (no `/api/notify-chat`), env vars missing, or the phone never opened Mga Aralin after joining (not subscribed to the topic) |
| Push arrives while the chat is open | It shouldn't: the app skips it when `ClassChat.visibleClassId` matches. Check that the tab really is in front |
| Teacher sees an unread badge for their own message | Their display name changed between sending and reading (unread compares `lastSenderName`) |
