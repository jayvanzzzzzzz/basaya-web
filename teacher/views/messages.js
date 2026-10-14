import { $, displayName, escapeHtml, initials, navigate, page, toast } from "../../js/helpers.js";
import { state, getTeacherClasses } from "../../js/state.js";
import {
  STUDENT_MAX,
  TEACHER_MAX,
  isUnread,
  loadOlder,
  markRead,
  removeMessage,
  sendTeacherMessage,
  setChatOpen,
  watchRecent,
  watchState,
} from "../../js/chat.js";
import { LABELS, membersButton, openClassMembers } from "../../js/classMembers.js";

// Messages: one group chat per class with its students (#/messages/<classId>).
// The class list shows each chat's last message and an unread dot; the sidebar shows how
// many classes have unread messages. Data: js/chat.js. Styles: css/pages/messages.css.

// ───────────── Live class summaries (sidebar badge, class list, class cards) ─────────────

const summaries = new Map(); // classId → chat/state
const summaryWatchers = new Map(); // classId → unsubscribe
const summaryListeners = new Set();

const myName = () => displayName("Teacher");

function emitSummaries() {
  updateNavBadge();
  summaryListeners.forEach((listener) => listener());
}

/** Keeps a live chat/state for every class this teacher has. Safe to call again. */
export async function watchChatSummaries() {
  if (!state.classes.length) await getTeacherClasses();
  const ids = new Set(state.classes.map((classroom) => classroom.id));
  summaryWatchers.forEach((stop, id) => {
    if (!ids.has(id)) {
      stop();
      summaryWatchers.delete(id);
      summaries.delete(id);
    }
  });
  ids.forEach((id) => {
    if (summaryWatchers.has(id)) return;
    summaryWatchers.set(
      id,
      watchState(id, (summary) => {
        summaries.set(id, summary);
        emitSummaries();
      }),
    );
  });
}

const unreadIn = (classId) => {
  const summary = summaries.get(classId);
  return Boolean(summary && isUnread(state.user.uid, classId, summary, myName()));
};

function updateNavBadge() {
  const link = document.querySelector('[data-nav="messages"]');
  if (!link) return;
  const count = state.classes.filter((classroom) => unreadIn(classroom.id) && classroom.id !== openClassId).length;
  let badge = link.querySelector(".nav-badge");
  if (!count) return badge?.remove();
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "nav-badge nav-badge--chat";
    link.append(badge);
  }
  badge.textContent = String(count);
  badge.setAttribute("aria-label", `${count} ${count === 1 ? "class has" : "classes have"} new messages`);
}

/** Re-run `listener` whenever a class chat summary changes (cleared on route change). */
export const onChatSummaries = (listener) => summaryListeners.add(listener);

/** Whether this class's chat has messages the teacher hasn't read. */
export const hasUnreadChat = (classId) => unreadIn(classId);

/** "New messages" dot for a class card on the dashboard ("" when there's nothing new). */
export const chatDot = (classId) =>
  unreadIn(classId)
    ? `<span class="chat-dot" title="New messages in the class chat"><span aria-hidden="true"></span>New messages</span>`
    : "";

// ───────────── Formatting ─────────────

const timeOf = (millis) => new Date(millis).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function dayLabel(millis) {
  const day = new Date(millis);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "Today";
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return day.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function shortTime(millis) {
  if (!millis) return "";
  const label = dayLabel(millis);
  return label === "Today" ? timeOf(millis) : label;
}

/** A stable hue per name, so each student keeps their avatar color. */
const hueOf = (text) => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

const ICONS = {
  send: '<path d="M4.5 12 20 4.5 13.5 20l-2.2-6.3L4.5 12Z" /><path d="m11.3 13.7 4-4" />',
  back: '<path d="m15 18-6-6 6-6" />',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />',
  up: '<path d="m6 15 6-6 6 6" />',
  down: '<path d="m6 9 6 6 6-6" />',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ───────────── The page ─────────────

let openClassId = null;
let stopChat = () => {};

/** Called by the router before any page renders: closes live listeners of the open chat. */
export function leaveMessages() {
  stopChat();
  stopChat = () => {};
  openClassId = null;
  summaryListeners.clear();
  updateNavBadge();
}

function classListHtml(activeId) {
  if (!state.classes.length) {
    return `<div class="inbox-empty-list">${icon("chat")}<p>Create a class to start a class chat.</p></div>`;
  }
  return state.classes
    .map((classroom) => {
      const summary = summaries.get(classroom.id);
      const unread = unreadIn(classroom.id) && classroom.id !== activeId;
      const preview = summary?.lastAt
        ? `${summary.lastRole === "teacher" && summary.lastSenderName === myName() ? "You" : summary.lastSenderName}: ${summary.lastText}`
        : "No messages yet";
      const name = classroom.className || "Untitled class";
      return `<a class="inbox-class${classroom.id === activeId ? " is-active" : ""}${unread ? " is-unread" : ""}"
          href="#/messages/${encodeURIComponent(classroom.id)}" ${classroom.id === activeId ? 'aria-current="page"' : ""}>
        <span class="inbox-class__avatar" style="--h:${hueOf(name)}">${escapeHtml(initials(name))}</span>
        <span class="inbox-class__text">
          <span class="inbox-class__top">
            <strong>${escapeHtml(name)}</strong>
            <time>${escapeHtml(shortTime(summary?.lastAt))}</time>
          </span>
          <span class="inbox-class__preview">
            ${summary && !summary.open ? `<span class="inbox-class__closed">${icon("lock")}Closed</span>` : ""}
            <span>${escapeHtml(preview)}</span>
          </span>
        </span>
        ${unread ? '<span class="inbox-class__dot" aria-label="New messages"></span>' : ""}
      </a>`;
    })
    .join("");
}

export async function renderMessages(classId) {
  await getTeacherClasses();
  await watchChatSummaries();

  const classroom = classId ? state.classes.find((item) => item.id === classId) : null;
  if (classId && !classroom) return navigate("/messages");
  // On wide screens, open the first class right away.
  if (!classId && state.classes.length && window.matchMedia("(min-width: 861px)").matches) {
    return navigate(`/messages/${encodeURIComponent(state.classes[0].id)}`);
  }

  page("Messages", "One group chat for each class: you and your students.");
  $("#page-content").innerHTML = `
    <div class="inbox${classroom ? " has-chat" : ""}">
      <aside class="inbox-list" aria-label="Class chats">
        <div class="inbox-list__head"><span>Class chats</span><b>${state.classes.length}</b></div>
        <nav class="inbox-list__items" data-class-list>${classListHtml(classId)}</nav>
      </aside>
      <section class="chat" data-chat aria-label="Class chat">
        ${classroom ? chatShellHtml(classroom) : `<div class="chat-placeholder">${icon("chat")}<h2>Pick a class</h2><p>Choose a class to read and send messages.</p></div>`}
      </section>
    </div>`;

  summaryListeners.add(() => {
    const list = $("[data-class-list]");
    if (list) list.innerHTML = classListHtml(classId);
  });
  if (classroom) openChat(classroom);
}

function chatShellHtml(classroom) {
  const name = classroom.className || "Untitled class";
  return `
    <header class="chat-head">
      <a class="chat-head__back" href="#/messages" aria-label="All class chats">${icon("back")}</a>
      <span class="inbox-class__avatar" style="--h:${hueOf(name)}">${escapeHtml(initials(name))}</span>
      <div class="chat-head__text">
        <h2>${escapeHtml(name)}</h2>
        <span data-chat-status>Class group chat</span>
      </div>
      ${membersButton(LABELS.en)}
      <label class="chat-switch" title="When closed, students can read but not send">
        <input type="checkbox" data-chat-open checked />
        <span class="chat-switch__track" aria-hidden="true"><span></span></span>
        <span class="chat-switch__label" data-chat-open-label>Open</span>
      </label>
    </header>
    <div class="chat-closed" data-chat-closed hidden>
      ${icon("lock")}
      <span><strong>Chat is closed.</strong> Students can read messages but can't send.</span>
      <button type="button" class="button secondary small" data-reopen>Reopen</button>
    </div>
    <div class="chat-scroll" data-chat-scroll>
      <div class="chat-older" data-older hidden>
        <button type="button" class="chat-older__button" data-load-older>${icon("up")}Load older messages</button>
      </div>
      <ol class="chat-messages" data-messages aria-live="polite">
        <li class="chat-loading" aria-label="Loading messages"><span></span><span></span><span></span></li>
      </ol>
      <div class="chat-jump" data-jump hidden>
        <button type="button" class="chat-jump__button" data-jump-button aria-label="Go to newest message" title="Go to newest message">
          ${icon("down")}<span class="chat-jump__count" data-jump-count hidden></span>
        </button>
      </div>
    </div>
    <form class="chat-composer" data-composer>
      <textarea rows="1" maxlength="${TEACHER_MAX}" placeholder="Message ${escapeHtml(name)}…" aria-label="Message" data-input></textarea>
      <span class="chat-composer__count" data-count hidden></span>
      <button type="submit" class="chat-composer__send" aria-label="Send" data-send disabled>${icon("send")}</button>
    </form>
    <p class="chat-hint">Enter to send · Shift + Enter for a new line · Students can send up to ${STUDENT_MAX} characters, one message every 5 seconds.</p>`;
}

function messageHtml(message, previous) {
  const mine = message.senderId === state.user.uid;
  const newDay = !previous || dayLabel(previous.sentAt) !== dayLabel(message.sentAt);
  // Messages from the same person within 5 minutes stack under one name.
  const grouped =
    !newDay && previous && previous.senderId === message.senderId && message.sentAt - previous.sentAt < 5 * 60 * 1000;
  const name = message.senderName || (message.role === "teacher" ? "Teacher" : "Student");
  const day = newDay ? `<li class="chat-day"><span>${escapeHtml(dayLabel(message.sentAt))}</span></li>` : "";

  if (message.deleted) {
    return `${day}<li class="chat-msg is-removed${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}">
      <p class="chat-msg__removed">${icon("trash")}${message.deletedBy === "teacher" ? "Message removed by teacher" : `${escapeHtml(name)} deleted a message`}</p>
    </li>`;
  }
  return `${day}<li class="chat-msg${mine ? " is-mine" : ""}${message.role === "teacher" ? " is-teacher" : ""}${grouped ? " is-grouped" : ""}${message.pending ? " is-pending" : ""}" data-id="${escapeHtml(message.id)}">
    ${mine ? "" : `<span class="chat-msg__avatar" style="--h:${hueOf(name)}" aria-hidden="true">${grouped ? "" : escapeHtml(initials(name))}</span>`}
    <div class="chat-msg__body">
      ${grouped || mine ? "" : `<span class="chat-msg__name">${escapeHtml(name)}${message.role === "teacher" ? '<b class="chat-msg__role">Teacher</b>' : ""}</span>`}
      <div class="chat-msg__bubble">
        <p>${escapeHtml(message.text)}</p>
        <time datetime="${new Date(message.sentAt).toISOString()}">${message.pending ? "Sending…" : timeOf(message.sentAt)}</time>
      </div>
    </div>
    <button type="button" class="chat-msg__remove" data-remove="${escapeHtml(message.id)}" aria-label="Remove this message" title="Remove for everyone">${icon("trash")}</button>
  </li>`;
}

function openChat(classroom) {
  const classId = classroom.id;
  openClassId = classId;
  const root = $("[data-chat]");
  const scroller = $("[data-chat-scroll]", root);
  const list = $("[data-messages]", root);
  const input = $("[data-input]", root);
  const send = $("[data-send]", root);
  const count = $("[data-count]", root);
  const openToggle = $("[data-chat-open]", root);

  let recent = [];
  let older = [];
  let moreOlder = false;
  let recentFull = false;
  let firstLoad = true;

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;

  const render = ({ keepOffset = false } = {}) => {
    const stick = firstLoad || nearBottom();
    const fromBottom = scroller.scrollHeight - scroller.scrollTop;
    const messages = [...older, ...recent.filter((message) => !older.some((item) => item.id === message.id))];
    list.innerHTML = messages.length
      ? messages.map((message, index) => messageHtml(message, messages[index - 1])).join("")
      : `<li class="chat-empty">${icon("chat")}<strong>No messages yet</strong><span>Say hello to ${escapeHtml(classroom.className || "your class")}. Students see it in the BaSaya app.</span></li>`;
    $("[data-older]", root).hidden = !(older.length ? moreOlder : recentFull);
    if (keepOffset) scroller.scrollTop = scroller.scrollHeight - fromBottom;
    else if (stick) scroller.scrollTop = scroller.scrollHeight;
    firstLoad = false;
    updateJump();
  };

  // "Go to newest" button: shown once scrolled up, with a count of messages that came in meanwhile.
  const jump = $("[data-jump]", root);
  const jumpCount = $("[data-jump-count]", root);
  let unseen = 0;
  const updateJump = () => {
    const away = !nearBottom();
    if (!away) unseen = 0;
    jump.hidden = !away;
    jumpCount.hidden = !unseen;
    jumpCount.textContent = unseen > 99 ? "99+" : String(unseen);
    $("[data-jump-button]", root).setAttribute(
      "aria-label",
      unseen ? `Go to newest message (${unseen} new)` : "Go to newest message",
    );
  };
  scroller.addEventListener("scroll", updateJump, { passive: true });
  $("[data-jump-button]", root).addEventListener("click", () =>
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }),
  );

  const stopRecent = watchRecent(
    classId,
    (messages, full) => {
      const lastSeenAt = recent.at(-1)?.sentAt ?? Infinity;
      if (!firstLoad && !nearBottom()) {
        unseen += messages.filter((m) => m.sentAt > lastSeenAt && m.senderId !== state.user.uid).length;
      }
      recent = messages;
      recentFull = full;
      render();
      const newest = messages.at(-1);
      if (newest && document.visibilityState === "visible") markRead(state.user.uid, classId, newest.sentAt);
      emitSummaries();
    },
    (error) => {
      console.error(error);
      list.innerHTML = `<li class="chat-empty">${icon("chat")}<strong>Couldn't load the chat</strong><span>Check your connection and reload the page.</span></li>`;
    },
  );

  const stopState = watchState(classId, (summary) => {
    openToggle.checked = summary.open;
    $("[data-chat-open-label]", root).textContent = summary.open ? "Open" : "Closed";
    $("[data-chat-closed]", root).hidden = summary.open;
    $("[data-chat-status]", root).textContent = summary.open
      ? "Class group chat · students can send"
      : "Closed · students can only read";
    if (summary.lastAt) markRead(state.user.uid, classId, summary.lastAt);
  });

  const onVisible = () => {
    if (document.visibilityState === "visible" && recent.length) {
      markRead(state.user.uid, classId, recent.at(-1).sentAt);
      emitSummaries();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  stopChat = () => {
    stopRecent();
    stopState();
    document.removeEventListener("visibilitychange", onVisible);
  };

  // Older messages, on request
  $("[data-load-older]", root).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const oldest = older[0] || recent[0];
    if (!oldest) return;
    button.disabled = true;
    button.lastChild.textContent = "Loading…";
    try {
      const page = await loadOlder(classId, oldest);
      older = [...page.messages, ...older];
      moreOlder = page.more;
      render({ keepOffset: true });
    } catch (error) {
      console.error(error);
      toast("Couldn't load older messages.");
    } finally {
      button.disabled = false;
      button.lastChild.textContent = "Load older messages";
    }
  });

  // Remove a message (for everyone)
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const row = button.closest(".chat-msg");
    if (!row.classList.contains("is-confirming")) {
      list.querySelectorAll(".is-confirming").forEach((item) => item.classList.remove("is-confirming"));
      row.classList.add("is-confirming");
      button.setAttribute("aria-label", "Click again to remove");
      button.title = "Click again to remove";
      return;
    }
    button.disabled = true;
    try {
      await removeMessage(classId, button.dataset.remove);
      older = older.map((item) =>
        item.id === button.dataset.remove ? { ...item, text: "", deleted: true, deletedBy: "teacher" } : item,
      );
      render();
    } catch (error) {
      console.error(error);
      toast("Couldn't remove the message.");
      button.disabled = false;
    }
  });
  list.addEventListener("mouseleave", () =>
    list.querySelectorAll(".is-confirming").forEach((item) => item.classList.remove("is-confirming")),
  );

  $("[data-members]", root).addEventListener("click", () =>
    openClassMembers({
      classId,
      className: classroom.className || "Untitled class",
      meId: state.user.uid,
      labels: LABELS.en,
    }),
  );

  // Open / close
  const toggleOpen = async (open) => {
    try {
      await setChatOpen(classId, open);
      toast(open ? "Chat reopened. Students can send again." : "Chat closed. Students can only read.");
    } catch (error) {
      console.error(error);
      openToggle.checked = !open;
      toast("Couldn't change the chat.");
    }
  };
  openToggle.addEventListener("change", () => toggleOpen(openToggle.checked));
  $("[data-reopen]", root).addEventListener("click", () => toggleOpen(true));

  // Composer
  const resize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  };
  const update = () => {
    resize();
    const length = input.value.trim().length;
    send.disabled = !length;
    count.hidden = input.value.length < TEACHER_MAX - 200;
    count.textContent = `${input.value.length}/${TEACHER_MAX}`;
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("[data-composer]", root).requestSubmit();
    }
  });
  $("[data-composer]", root).addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    update();
    scroller.scrollTop = scroller.scrollHeight;
    updateJump();
    try {
      await sendTeacherMessage(classId, text, state.user.uid, myName());
    } catch (error) {
      console.error(error);
      input.value = text;
      update();
      toast("Couldn't send. Check your connection and try again.");
    }
  });
  if (window.matchMedia("(min-width: 861px)").matches) input.focus();
}
