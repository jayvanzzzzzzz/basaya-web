# Class Chat — Progress Notes

One group chat per class: the teacher (website) and the class's students (Android app).
Nothing below is committed or deployed yet.

**Status:** website and app are both built, the app compiles (`assembleDebug` OK), and the
rules pass 28/28 emulator tests. **Left: deploy (step 5) and a real-device test.**

---

## Decisions (agreed with the user)

| Topic | Decision |
|---|---|
| Who chats | Teacher + all students of one class (a student is in only 1 class) |
| App entry | New 4th bottom tab: Mga Aralin / Progreso / **Chat** / Account |
| Push notifications | **Teacher messages only**, through notify-api (free). Student messages show only an in-app unread dot. |
| Teacher controls | Delete any message ("Tinanggal ng guro…"), and turn the chat **open/closed** (closed = students can read, not send) |
| Students | Can delete **their own** message within **5 minutes** |
| Limits (students only) | **300 characters**, **1 message every 5 seconds**, checked by the Firestore rules, not just the app |
| Teachers | Up to 2,000 characters, no send limit |
| Read-saving | Only the latest **30** messages are live, older ones load on request ("Tingnan ang mas luma"), Firestore's offline cache on the phone, unread dots come from one small `chat/state` doc |

## Data shape (Firestore)

```
classes/{classId}/messages/{id}    text, senderId, senderName, role ("teacher"|"student"), sentAt
                                   removed: text "", deleted true, deletedBy ("teacher"|"sender")
                                   pushedAt (set by notify-chat, so a message pushes only once)
classes/{classId}/chat/state       open (missing = open), lastAt, lastText, lastSenderName, lastRole
classes/{classId}/chatSenders/{uid} lastSentAt (the student's last send, for the 5-second limit)
```

A student sends with **one batch**: the message, `chatSenders/{uid}` and `chat/state`.
The rules check that `chatSenders/{uid}.lastSentAt` is stamped in the same batch and is
at least 5 seconds after the previous one (server time). The student's `senderName` must
equal their `fullName` in `classes/{classId}/students/{uid}`.

Unread state ("last read at") is kept **on the device** (localStorage on the website,
SharedPreferences in the app), so it costs no reads.

---

## ✅ Finished

### Website — `C:\xampp\htdocs\BaSaya-web`

| File | What |
|---|---|
| `firestore.rules` | New "Class chat" section inside `match /classes/{classId}`: `messages`, `chat/state`, `chatSenders` (all limits above) |
| `js/chat.js` *(new)* | Data layer: `watchRecent` (latest 30, live), `loadOlder`, `watchState`, `sendTeacherMessage` (batch + calls `notify-chat`), `removeMessage`, `setChatOpen`, local read state (`lastRead`, `markRead`, `isUnread`) |
| `teacher/views/messages.js` *(new)* | **Messages** page `#/messages/<classId>`: class list with last message, time, "Closed" tag and unread dot; chat with day separators, grouped bubbles, "Load older messages", two-click Remove, open/closed switch + banner, composer (Enter sends, Shift+Enter new line). Also keeps a live summary per class for the badges (`watchChatSummaries`, `chatDot`, `onChatSummaries`, `leaveMessages`) |
| `css/pages/messages.css` *(new)* | Styles for the inbox + chat, light/dark, phone layout (list → chat with back button) |
| `teacher/router.js` | `/messages` route; `leaveMessages()` on every route change; `watchChatSummaries()` after the sidebar loads |
| `teacher/index.html` | "Messages" sidebar link (`data-nav="messages"`, badge with unread class count) + `messages.css` link |
| `teacher/views/dashboard.js` | "New messages" tag on each class card (live) |
| `teacher/views/classPage.js` | "Class chat" button in the class page header → `#/messages/<classId>` |
| `notify-api/api/notify-chat.js` *(new)* | `POST /api/notify-chat { classId, messageId }`: only the class's teacher, only their own message, only within 2 minutes, only once (`pushedAt`). Sends FCM data message `type: "chat_message"` to topic `class_<classId>` (title `💬 <class name>`, body `<name>: <text>`) |
| `notify-api/api/delete-class.js` | Deleting a class now also deletes `messages`, `chat`, `chatSenders` |

Previewed in headless Edge with a fake Firestore: inbox, sending (summary updates +
`notify-chat` called), closed state, remove, dark mode, phone width.
**Not yet tested against real Firebase or the rules emulator.**

### Android app — `C:\Projects\BaSaya`

| File | What |
|---|---|
| `app/src/main/java/com/example/basaya/data/chat/ClassChat.kt` *(new)* | Data layer: `watchRecent`, `loadOlder`, `watchState`, `rosterName`, `send` (the 3-write batch the rules expect), `canDelete`, `deleteOwn`, read state (`lastRead`, `markRead`, `isUnread`), `visibleClassId` (to skip pushes while the chat is on screen). Constants: `PAGE=30`, `MAX_LENGTH=300`, `COOLDOWN_MS=5000`, `DELETE_WINDOW_MS=5 min` |
| `res/values/colors_chat.xml` *(new)* | `ch_*` colors |
| `res/values/colors_nav.xml` | Added `nav_tab_chat` (#F2784B, orange) |
| `res/values/strings_chat.xml` *(new)* | All chat text in Filipino (`nav_chat`, `ch_*`, notification channel name) |
| `res/drawable/` *(new)* | `ic_chat`, `ic_send`, `ch_bubble_in`, `ch_bubble_teacher`, `ch_bubble_mine`, `ch_pill`, `ch_removed`, `ch_avatar`, `ch_header`, `ch_class_tile`, `ch_composer`, `ch_send`, `ch_closed_banner`, `ch_nav_dot` |

---

### Android app: screen + wiring (done in the second session)

| File | What |
|---|---|
| `res/layout/fragment_chat.xml` *(new)* | Header card, RecyclerView (stack from end), empty / no-class state, closed banner, composer (counter from 240 chars, send button with 5-second countdown) |
| `res/layout/item_chat_{in,mine,removed,day,older}.xml` *(new)* | Message rows |
| `adapter/ChatAdapter.kt` *(new)* | `ListAdapter` + DiffUtil; groups by sender within 5 min (name on first, avatar + time on last) |
| `ui/fragment/ChatFragment.kt` *(new)* | Listeners only while visible; keeps every message seen so "load older" has no gaps; `markRead`; long-press delete; cooldown starts once the server accepted the send; lifts the composer above the keyboard on Android 11+ (edge-to-edge) |
| `controller/BottomNavController.kt` | 4 tab colors; bubble position now walks up to the shared parent (Chat's icon sits in a wrapper with the dot) |
| `res/layout/activity_main.xml` | `navChat` tab with `chatUnreadDot`, `weightSum="4"` |
| `ui/MainActivity.kt` | `chatFragment`, 4th tab, unread dot (listens to `users/{uid}` → `chat/state` while started), `chatIntent()` opens the Chat tab |
| `data/notifications/ClassNotifications.kt` | `class_chat` channel, `showChat(...)` (one notification per class, replaced by newer) |
| `data/notifications/LessonMessagingService.kt` | `chat_message` → `showChat` unless the chat is on screen or it's not the subscribed class |

Rules tested with the Firestore emulator (jar run directly with Android Studio's JBR,
`@firebase/rules-unit-testing`): all cases below pass, plus whitespace-only, fake teacher
role, other teacher removing, editing text, hard delete, reading others' `chatSenders`.

---

## Archive — the plan as it was when paused (steps 1–4 now done)

### 1. App: chat screen
- `res/layout/fragment_chat.xml`: header card (class initials tile, "Chat ng klase", class
  name, open/closed subtitle), RecyclerView (stack from end), empty state, "no class" state,
  closed banner, composer (EditText `maxLength=300`, counter after ~240 characters, send
  button with a 5-second countdown).
- Item layouts: incoming (avatar + name + bubble, teacher gets a violet bubble + "Guro" tag),
  mine (gradient bubble), day separator ("Ngayon" / "Kahapon" / date), removed message,
  "Tingnan ang mas luma" row.
- `adapter/ChatAdapter.kt`: view types for the above, grouping by sender within 5 minutes.
- `ui/fragment/ChatFragment.kt`:
  - read `users/{uid}.classId` / `className`, and `rosterName` for the sender name
  - live listeners only while the tab is visible (`onHiddenChanged`), set
    `ClassChat.visibleClassId`, `markRead` on new messages
  - long-press own message (within 5 min) → "Burahin ang mensahe?" dialog
  - on a rules rejection when sending → `ch_too_fast` / `ch_send_failed` toast

### 2. App: wiring
- `res/layout/activity_main.xml`: 4th nav item (`navChat`, `iconChat`, `labelChat`, plus an
  unread dot view using `ch_nav_dot`), `weightSum="4"`, between Progreso and Account.
- `ui/MainActivity.kt`: add `chatFragment`, the 4th `NavItem`, `tabColors` = home,
  progress, **chat**, profile; listen to `chat/state` for the student's class →
  show/hide the dot (`ClassChat.isUnread`); open the Chat tab from a chat notification
  (intent extra).
- `data/notifications/ClassNotifications.kt`: new channel `class_chat` (`ch_channel_name`)
  and a `showChat(...)` that opens MainActivity on the Chat tab.
- `data/notifications/LessonMessagingService.kt`: handle `type == "chat_message"` → show it
  unless `ClassChat.visibleClassId == classId` or the class isn't the subscribed one.

### 3. Build the app
```
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
```
(run in `C:\Projects\BaSaya`; Android SDK is at
`C:\Users\Scean Andrei\AppData\Local\Android\Sdk`)

### 4. Test the rules
Use the Firestore emulator (needs Java 11+, so use Android Studio's JBR above). Cases to cover:
- student in the class can send ≤300 chars; 301 is rejected
- a second send within 5 seconds is rejected; after 5 seconds it works
- wrong `senderName` (not the roster `fullName`) is rejected
- student can't send while `chat/state.open == false`
- non-member / other class's teacher can't read or send
- teacher can remove any message; student can delete own only within 5 minutes
- student can't change `open`

### 5. Deploy
- Publish `firestore.rules` (Firebase console or `firebase deploy --only firestore:rules`).
  **The website chat won't work against the real database until this is done.**
- Redeploy `notify-api` to Vercel (adds `/api/notify-chat`). Vercel Hobby allows 12
  functions; this makes 6.

### Also pending from earlier (not chat)
- `__preview/viewer.html` is a leftover preview file; delete before committing.
- Uncommitted website work from this session: View lesson viewer, delete-lesson dialog,
  7-letter game words + suggestions, A–Z lesson list, duplicate-title check.
