import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, navigate } from "../../js/helpers.js";
import { student, classId, formatWhen, isComplete, loadClassLessons, now } from "../data.js";
import { buddy, content, icon } from "../ui.js";

// "Mga Abiso" (the app's NotificationsActivity + LessonInbox): "new lesson" and "deadline
// extended" items from classes/{classId}/notifications (written by notify-api), shown once
// the lesson opens, and
// deadline reminders made here from each lesson's dueAt (1 day before, 1 hour before, and
// when it closes). Everything after the "read up to" time is unread; that time is kept in
// this browser and in users/{uid}.notifReadAt, so it follows the account to the app too.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let feed = []; // last loaded classes/{classId}/notifications
let feedClassId = null;

const readKey = () => `basaya.notifReadAt.${student.uid}`;

/** The "read up to" time: the newer of this browser's and the account's. */
function readAt() {
  let local = 0;
  try {
    local = Number(localStorage.getItem(readKey())) || 0;
  } catch {
    // Private mode: the account's value still works.
  }
  return Math.max(local, student.profile.notifReadAt?.toMillis?.() || 0);
}

function markAllRead() {
  // Trusted time, not the device's, so a changed date can't hide future notifications.
  const time = Math.max(now(), readAt());
  try {
    localStorage.setItem(readKey(), String(time));
  } catch {
    // ignore
  }
  const stamp = Timestamp.fromMillis(time);
  student.profile.notifReadAt = stamp;
  updateDoc(doc(db, "users", student.uid), { notifReadAt: stamp }).catch((error) =>
    console.warn("Could not save notifReadAt", error),
  );
}

async function loadFeed() {
  const id = classId();
  feedClassId = id;
  if (!id) {
    feed = [];
    return;
  }
  try {
    const snap = await getDocs(
      query(collection(db, "classes", id, "notifications"), orderBy("visibleAt", "desc"), limit(50)),
    );
    feed = snap.docs
      .map((item) => ({
        id: item.id,
        type: item.get("type"),
        title: item.get("title"),
        body: item.get("body") || "",
        lessonIds: (item.get("lessonIds") || []).filter((value) => typeof value === "string"),
        visibleAt: item.get("visibleAt")?.toMillis?.() ?? null,
      }))
      .filter((item) => item.title && item.visibleAt != null);
  } catch (error) {
    console.warn("Notification sync failed", error);
  }
}

/** Every item that has appeared by now, newest first (LessonInbox.visible). */
function visibleItems() {
  const ids = new Set(student.lessons.map((lesson) => lesson.id));
  const newLessons = feed
    .map((item) => ({ ...item, lessonIds: item.lessonIds.filter((id) => ids.has(id)) }))
    .filter((item) => item.lessonIds.length)
    .map((item) => ({ key: `feed:${item.id}`, kind: item.type === "deadline_extended" ? "extended" : "new", title: item.title, body: item.body, time: item.visibleAt, lessonIds: item.lessonIds }));

  const deadlines = student.lessons.flatMap((lesson) => {
    // A Practice lesson has nothing to finish, so no "due soon" reminders.
    if (lesson.dueAt == null || lesson.practice || isComplete(lesson)) return [];
    const deadline = formatWhen(lesson.dueAt);
    const body = `Tapusin ang “${lesson.title}” bago mag-${deadline}.`;
    const lessonIds = [lesson.id];
    // No reminders from before the lesson was added or opened.
    const earliest = Math.max(lesson.assignedAt || 0, lesson.openAt || 0);
    return [
      { key: `due-day:${lesson.id}`, kind: "day", title: "⏰ Bukas na ang deadline!", body, time: lesson.dueAt - DAY, lessonIds },
      { key: `due-hour:${lesson.id}`, kind: "hour", title: "⏳ 1 oras na lang!", body, time: lesson.dueAt - HOUR, lessonIds },
      {
        key: `closed:${lesson.id}`,
        kind: "closed",
        title: "🔒 Sarado na ang aralin",
        body: `Lumipas na ang deadline ng “${lesson.title}” (${deadline}).`,
        time: lesson.dueAt,
        lessonIds,
      },
    ].filter((item) => item.time >= earliest);
  });

  const time = now();
  return [...newLessons, ...deadlines].filter((item) => item.time <= time).sort((a, b) => b.time - a.time);
}

/** The bell's red badge in the top bar. Reloads the feed when asked (or the class changed). */
export async function refreshBell({ reload = false } = {}) {
  if (reload || feedClassId !== classId()) {
    if (classId() && !student.lessons.length) await loadClassLessons();
    await loadFeed();
  }
  const bell = $("#st-bell");
  if (!bell) return;
  const unread = visibleItems().filter((item) => item.time > readAt()).length;
  const badge = $("#st-bell-badge");
  badge.hidden = !unread;
  badge.textContent = unread > 9 ? "9+" : String(unread);
  bell.setAttribute("aria-label", unread ? `Mga abiso, ${unread} bago` : "Mga abiso, walang bago");
}

/** "5 min", "Ngayong araw", "Kahapon" or "Okt 12", plus the clock (NotificationAdapter.whenLabel). */
function whenLabel(time) {
  const current = now();
  const clock = new Date(time).toLocaleTimeString("fil-PH", { hour: "numeric", minute: "2-digit" });
  const minutes = Math.floor((current - time) / 60_000);
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const day =
    minutes < 1
      ? "Ngayon lang"
      : minutes < 60
        ? `${minutes} min`
        : sameDay(time, current)
          ? "Ngayong araw"
          : sameDay(time, current - DAY)
            ? "Kahapon"
            : new Date(time).toLocaleDateString("fil-PH", {
                month: "short",
                day: "numeric",
                ...(new Date(time).getFullYear() !== new Date(current).getFullYear() ? { year: "numeric" } : {}),
              });
  return { day, clock };
}

const KIND_ICON = { new: "book", extended: "clock", day: "clock", hour: "clock", closed: "lock" };

function itemHtml(item, unread, index) {
  const { day, clock } = whenLabel(item.time);
  return `
    <li style="--i:${index}">
      <button class="st-notif st-notif--${item.kind}${unread ? " is-unread" : ""}" type="button" data-lessons="${escapeHtml(item.lessonIds.join(","))}">
        <span class="st-notif__icon">${icon(KIND_ICON[item.kind])}</span>
        <span class="st-notif__text">
          <strong>${escapeHtml(item.title)}</strong>
          ${item.body ? `<span>${escapeHtml(item.body)}</span>` : ""}
        </span>
        <span class="st-notif__when"><b>${escapeHtml(day)}</b><small>${escapeHtml(clock)}</small></span>
        ${unread ? '<span class="st-notif__dot" aria-label="Bago"></span>' : ""}
      </button>
    </li>`;
}

export async function renderNotifications() {
  content().innerHTML = `
    <section class="st-notifs">
      <header class="st-hero st-hero--notifs">
        <a class="st-icon-button st-icon-button--light" href="#/home" aria-label="Bumalik">${icon("back")}</a>
        <div class="st-hero__text">
          <span class="st-hero__eyebrow">Mga Abiso</span>
          <h1 id="notif-bubble">…</h1>
        </div>
        ${buddy("happy", "st-notifs__buddy")}
      </header>
      <div id="notif-list"><div class="st-loading"><span></span><span></span><span></span></div></div>
    </section>`;

  await loadClassLessons();
  await loadFeed();
  // What was unread when the page opened stays marked "BAGO" while it's open.
  const readBefore = readAt();
  const items = visibleItems();
  markAllRead();
  refreshBell();

  const unread = items.filter((item) => item.time > readBefore);
  const earlier = items.filter((item) => item.time <= readBefore);
  $("#notif-bubble").textContent = unread.length
    ? `May ${unread.length} bagong abiso para sa’yo!`
    : items.length
      ? "Nabasa mo na lahat. Ang galing mo!"
      : "Wala ka pang abiso. Babalitaan kita!";

  $("#notif-list").innerHTML = items.length
    ? `${unread.length ? `<h2 class="st-notifs__section">BAGO</h2><ul class="st-notifs__list">${unread.map((item, i) => itemHtml(item, true, i)).join("")}</ul>` : ""}
       ${earlier.length ? `<h2 class="st-notifs__section">NAKARAAN</h2><ul class="st-notifs__list">${earlier.map((item, i) => itemHtml(item, false, i + unread.length)).join("")}</ul>` : ""}`
    : `<div class="st-empty">
        <img class="st-empty__art" src="../img/logo.png" alt="" />
        <h2>Tahimik pa dito</h2>
        <p>Dito lalabas ang mga bagong aralin at paalala sa deadline.</p>
      </div>`;

  // Tapping one goes to the lesson list and makes its lesson glow.
  $("#notif-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-lessons]");
    if (!button) return;
    sessionStorage.setItem("basaya.highlight", button.dataset.lessons);
    navigate("/home");
  });
}
