import { $, displayName, escapeHtml, initials, navigate, page, toast } from "../../js/helpers.js";
import { state, getTeacherClasses } from "../../js/state.js";
import {
  STUDENT_MAX,
  TEACHER_COOLDOWN_MS,
  TEACHER_MAX,
  chatDelivery,
  isUnread,
  joinText,
  loadOlder,
  markRead,
  removeMessage,
  sendTeacherMessage,
  setChatOpen,
  watchRecent,
  watchState,
} from "../../js/chat.js?v=removed-preview";
import { LABELS, openClassMembers } from "../../js/classMembers.js";
import { attachFloatingTooltips } from "../../js/floatingTooltip.js";
import { messageActions, wireMessageActions } from "../../js/messageActions.js";

// Messages: one group chat per class with its students (#/messages/<classId>).
// The class list shows each chat's last message and an unread dot; the sidebar shows how
// many classes have unread messages. Data: js/chat.js. Styles: css/pages/messages.css.

// Live class summaries (sidebar badge, class list, class cards)

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

// Formatting

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
const classInitials = (name) => initials(name.replace(/\s+[—–-]\s+/g, " "));

// Inline Lucide icons, using the portal's existing SVG delivery convention.
const ICONS = {
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  back: '<path d="m12 19-7-7 7-7M5 12h14"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  join: '<path d="M15 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="8.5" cy="8" r="3.5" /><path d="M19 8v6m3-3h-6" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />',
  up: '<path d="m6 15 6-6 6 6" />',
  down: '<path d="m6 9 6 6 6-6" />',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// The page

let openClassId = null;
let stopChat = () => {};
let stopTooltips = () => {};
let stopMembersDialog = () => {};

/** Called by the router before any page renders: closes live listeners of the open chat. */
export function leaveMessages() {
  stopTooltips();
  stopTooltips = () => {};
  stopMembersDialog();
  stopMembersDialog = () => {};
  // Keep the visible page styled while the next route loads. page() clears
  // these presentation classes synchronously when its replacement is ready.
  stopChat();
  stopChat = () => {};
  openClassId = null;
  summaryListeners.clear();
  updateNavBadge();
}

function classListHtml(activeId) {
  if (!state.classes.length) {
    return `<div class="inbox-empty-list">${icon("chat")}<p>Create a class to start a class chat.</p><a class="button primary" href="#/dashboard">Go to classes</a></div>`;
  }
  return state.classes
    .map((classroom) => {
      const summary = summaries.get(classroom.id);
      const unread = unreadIn(classroom.id) && classroom.id !== activeId;
      const preview = !summary?.lastAt
        ? "No messages yet"
        : summary.lastRole === "join"
          ? joinText(summary.lastSenderName, false)
          : // Empty text: the newest message was removed (a real message always has text).
            `${summary.lastRole === "teacher" && summary.lastSenderName === myName() ? "You" : summary.lastSenderName}: ${summary.lastText || "Message removed"}`;
      const name = classroom.className || "Untitled class";
      return `<a class="inbox-class${classroom.id === activeId ? " is-active" : ""}${unread ? " is-unread" : ""}"
          href="#/messages/${encodeURIComponent(classroom.id)}" aria-label="${escapeHtml(name)}${summary && !summary.open ? ', closed' : ''}${unread ? ', new messages' : ''}. ${escapeHtml(preview)}" title="${escapeHtml(name)}" ${classroom.id === activeId ? 'aria-current="page"' : ""}>
        <span class="inbox-class__avatar" style="--h:${hueOf(name)}" aria-hidden="true">${escapeHtml(classInitials(name))}</span>
        <span class="inbox-class__text">
          <span class="inbox-class__top">
            <strong>${escapeHtml(name)}</strong>
            <time${summary?.lastAt ? ` datetime="${new Date(summary.lastAt).toISOString()}"` : ""}>${escapeHtml(shortTime(summary?.lastAt))}</time>
          </span>
          <span class="inbox-class__preview">
            ${summary && !summary.open ? `<span class="inbox-class__closed">${icon("lock")}Closed</span>` : ""}
            <span title="${escapeHtml(preview)}">${escapeHtml(preview)}</span>
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

  page("Messages", "A shared space for every class conversation.");
  $("#page-header .page-header__icon")?.remove();
  $("#page-header").classList.add("teacher-messages-header");
  $("#page-content").classList.add("teacher-messages");
  $("#page-content").innerHTML = `
    <div class="inbox${classroom ? " has-chat" : ""}">
      <aside class="inbox-list" aria-label="Class chats">
        <div class="inbox-list__head"><div><span class="inbox-eyebrow">Your teaching space</span><h2>Class conversations <b aria-label="${state.classes.length} classes">${state.classes.length}</b></h2></div></div>
        <nav class="inbox-list__items" data-class-list aria-label="Class conversations">${classListHtml(classId)}</nav>
        <p class="inbox-list__note">${icon("chat")}A space to learn, ask, and connect.</p>
      </aside>
      <section class="chat" data-chat aria-label="Class chat">
        ${classroom ? chatShellHtml(classroom) : `<div class="chat-placeholder">${icon("chat")}<span class="inbox-eyebrow">Class conversations</span><h2>${state.classes.length ? "Start with a class" : "Your conversations start here"}</h2><p>${state.classes.length ? "Choose a class to read and send messages." : "Create a class to connect with your students."}</p>${!state.classes.length ? '<a class="button primary" href="#/dashboard">Go to classes</a>' : ''}</div>`}
      </section>
    </div>`;

  summaryListeners.add(() => {
    const list = $("[data-class-list]");
    if (list) list.innerHTML = classListHtml(classId);
  });
  // Mobile navigation hides its text visually; give those links explicit names.
  const navLabels = [...document.querySelectorAll('.main-nav [data-nav]')].map(link => {
    const previous = link.getAttribute('aria-label');
    link.setAttribute('aria-label', link.querySelector('strong')?.textContent || link.textContent.trim());
    return { link, previous };
  });
  const disposeTooltips = attachFloatingTooltips(document.body, '.teacher-messages [data-floating-tooltip], .messages-members-dialog [data-floating-tooltip], body:has(.teacher-messages) :is([data-theme-toggle], #account-menu-toggle, .main-nav [data-nav])');
  stopTooltips = () => {
    disposeTooltips();
    navLabels.forEach(({ link, previous }) => {
      if (previous === null) link.removeAttribute('aria-label');
      else link.setAttribute('aria-label', previous);
    });
  };
  if (classroom) openChat(classroom);
}

function chatShellHtml(classroom) {
  const name = classroom.className || "Untitled class";
  return `
    <header class="chat-head">
      <a class="chat-head__back chat-icon" href="#/messages" aria-label="All class chats" data-floating-tooltip>${icon("back")}</a>
      <span class="inbox-class__avatar" style="--h:${hueOf(name)}" aria-hidden="true">${escapeHtml(classInitials(name))}</span>
      <div class="chat-head__text">
        <h2>${escapeHtml(name)}</h2>
        <span data-chat-status>Class group chat</span>
      </div>
      <button type="button" class="chat-info chat-icon" data-members aria-haspopup="dialog" aria-label="Class members" data-floating-tooltip>${icon("info")}</button>
      <label class="chat-switch" title="When closed, students can read but not send">
        <input type="checkbox" data-chat-open checked aria-label="Allow students to send messages" aria-describedby="chat-permissions" />
        <span class="chat-switch__track" aria-hidden="true"><span></span></span>
        <span class="chat-switch__text"><span class="chat-switch__caption">Student chat</span><span class="chat-switch__label" data-chat-open-label>Open</span></span>
      </label>
      <span id="chat-permissions" class="sr-only">When closed, students can read but cannot send. Teachers can still send messages.</span>
    </header>
    <div class="chat-closed" data-chat-closed hidden>
      ${icon("lock")}
      <span><strong>Chat is closed.</strong> Students can read messages but can't send.</span>
      <button type="button" class="button secondary small" data-reopen>Reopen</button>
    </div>
    <div class="chat-scroll" data-chat-scroll>
      <div class="chat-older" data-older hidden>
        <button type="button" class="chat-older__button chat-icon" data-load-older aria-label="Load older messages" data-floating-tooltip>${icon("up")}</button>
      </div>
      <ol class="chat-messages" data-messages aria-live="polite">
        <li class="chat-loading" aria-label="Loading messages"><span></span><span></span><span></span></li>
      </ol>
      <div class="chat-jump" data-jump hidden>
        <button type="button" class="chat-jump__button chat-icon" data-jump-button aria-label="Go to newest message" data-floating-tooltip>
          ${icon("down")}<span class="chat-jump__count" data-jump-count hidden></span>
        </button>
      </div>
    </div>
    <div class="chat-compose-area">
      <form class="chat-composer" data-composer>
        <textarea rows="1" maxlength="${TEACHER_MAX}" placeholder="Message your class…" aria-label="Message ${escapeHtml(name)}" aria-describedby="chat-compose-help chat-send-error" data-input></textarea>
        <button type="submit" class="chat-composer__send chat-icon" aria-label="Send message" data-floating-tooltip data-send disabled>${icon("send")}</button>
      </form>
      <div class="chat-compose-meta"><p class="chat-hint" id="chat-compose-help"><span class="chat-hint__keyboard">Enter to send <span aria-hidden="true">·</span> Shift + Enter for a new line</span><span class="chat-hint__mobile">Messages are shared with your class.</span><span class="sr-only"> Students can send up to ${STUDENT_MAX} characters, one message every 5 seconds.</span></p><span class="chat-composer__count" data-count hidden></span></div>
      <p class="chat-send-error" id="chat-send-error" role="status" aria-live="polite" data-send-error></p>
    </div>`;
}

function messageHtml(message, previous, delivery) {
  const mine = message.senderId === state.user.uid;
  const newDay = !previous || dayLabel(previous.sentAt) !== dayLabel(message.sentAt);
  // Messages from the same person within 5 minutes stack under one name.
  const grouped =
    !newDay && previous && !previous.join && previous.senderId === message.senderId && message.sentAt - previous.sentAt < 5 * 60 * 1000;
  const name = message.senderName || (message.role === "teacher" ? "Teacher" : "Student");
  const day = newDay ? `<li class="chat-day"><span>${escapeHtml(dayLabel(message.sentAt))}</span></li>` : "";

  if (message.join) {
    return `${day}<li class="chat-notice">${icon("join")}<span>${escapeHtml(joinText(name, false))}</span>
      <time datetime="${new Date(message.sentAt).toISOString()}">${timeOf(message.sentAt)}</time></li>`;
  }

  const isNew = delivery.isNew(message.id) ? " is-new" : "";
  if (message.deleted) {
    return `${day}<li class="chat-msg is-removed${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}${isNew}">
      <p class="chat-msg__removed">${icon("trash")}${message.deletedBy === "teacher" ? "Message removed by teacher" : `${escapeHtml(name)} deleted a message`}</p>
    </li>`;
  }
  const status = mine ? delivery.status(message) : "";
  return `${day}<li class="chat-msg${mine ? " is-mine" : ""}${message.role === "teacher" ? " is-teacher" : ""}${grouped ? " is-grouped" : ""}${isNew}" data-id="${escapeHtml(message.id)}">
    ${mine ? "" : `<span class="chat-msg__avatar" style="--h:${hueOf(name)}" aria-hidden="true">${grouped ? "" : escapeHtml(initials(name))}</span>`}
    <div class="chat-msg__body">
      ${grouped || mine ? "" : `<span class="chat-msg__name">${escapeHtml(name)}${message.role === "teacher" ? '<b class="chat-msg__role">Teacher</b>' : ""}</span>`}
      <div class="chat-msg__bubble">
        <p>${escapeHtml(message.text)}</p>
      </div>
      <div class="chat-msg__meta">${message.pending ? "" : `<time datetime="${new Date(message.sentAt).toISOString()}">${timeOf(message.sentAt)}</time>`}${status ? `<span class="chat-msg__status">${status === "sending" ? "Sending…" : "Sent"}</span>` : ""}</div>
    </div>
    ${message.pending ? "" : messageActions(message.id)}
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
  let cooldownUntil = 0;
  let cooldownTimer = null;
  let summary = null; // chat/state, to tell if a removed message is the newest
  const delivery = chatDelivery((id) => list.querySelector(`[data-id="${CSS.escape(id)}"] .chat-msg__status`)?.remove());

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;

  const render = ({ keepOffset = false } = {}) => {
    const stick = firstLoad || nearBottom();
    const fromBottom = scroller.scrollHeight - scroller.scrollTop;
    const messages = [...older, ...recent.filter((message) => !older.some((item) => item.id === message.id))];
    delivery.note(messages);
    list.innerHTML = messages.length
      ? messages.map((message, index) => messageHtml(message, messages[index - 1], delivery)).join("")
      : `<li class="chat-empty">${icon("chat")}<strong>No messages yet</strong><span>Say hello to ${escapeHtml(classroom.className || "your class")}. Students see it in the BaSaya app.</span></li>`;
    delivery.drawn(messages);
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
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? "auto" : "smooth" }),
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

  const stopState = watchState(classId, (latest) => {
    summary = latest;
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
    clearInterval(cooldownTimer);
    delivery.stop();
    document.removeEventListener("visibilitychange", onVisible);
    stopMessageActions();
  };

  // Older messages, on request
  $("[data-load-older]", root).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const oldest = older[0] || recent[0];
    if (!oldest) return;
    button.disabled = true;
    button.setAttribute("aria-label", "Loading older messages");
    button.setAttribute("aria-busy", "true");
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
      button.setAttribute("aria-label", "Load older messages");
      button.removeAttribute("aria-busy");
    }
  });

  const stopMessageActions = wireMessageActions(list, { label: "Delete for everyone", confirmLabel: "Confirm delete for everyone", onDelete: async (messageId) => {
    try {
      const message = [...older, ...recent].find((item) => item.id === messageId);
      if (!message || message.deleted || message.pending) return;
      await removeMessage(classId, message, summary);
      older = older.map((item) =>
        item.id === messageId ? { ...item, text: "", deleted: true, deletedBy: "teacher" } : item,
      );
      render();
    } catch (error) {
      console.error(error);
      toast("Couldn't remove the message.");
    }
  } });

  $("[data-members]", root).addEventListener("click", () => {
    openClassMembers({
      classId,
      className: classroom.className || "Untitled class",
      meId: state.user.uid,
      labels: LABELS.en,
    });
    // Keep the shared members implementation; scope dialog polish and keyboard focus to this page.
    const backdrop = document.querySelector('.modal-backdrop:last-child');
    if (!backdrop) return;
    const modal = backdrop.querySelector('.modal');
    modal.classList.add('messages-members-dialog');
    const closeButton = modal.querySelector('.modal-close');
    closeButton.innerHTML = icon('close');
    closeButton.setAttribute('data-floating-tooltip', '');
    closeButton.setAttribute('aria-label', 'Close class members');
    const trap = event => {
      if (event.key !== 'Tab') return;
      const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    modal.addEventListener('keydown', trap);
    const observer = new MutationObserver(() => {
      if (!backdrop.isConnected) {
        observer.disconnect();
        if (root.isConnected) $('[data-members]', root).focus();
      }
    });
    observer.observe(document.body, { childList: true });
    stopMembersDialog = () => { observer.disconnect(); backdrop.remove(); };
  });

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
  // After each message the send button waits 3 seconds and shows the countdown; typing still works.
  const update = () => {
    resize();
    const length = input.value.trim().length;
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    send.disabled = !length || left > 0;
    // Redraw the button only when the number changes, so it doesn't flicker every tick.
    if (send.dataset.left !== String(Math.max(left, 0))) {
      send.dataset.left = String(Math.max(left, 0));
      send.innerHTML = left > 0 ? `<span class="chat-composer__wait">${left}</span>` : icon("send");
      send.setAttribute("aria-label", left > 0 ? `Send in ${left} seconds` : "Send message");
    }
    count.hidden = input.value.length < TEACHER_MAX - 200;
    count.textContent = `${input.value.length}/${TEACHER_MAX}`;
  };
  const startCooldown = () => {
    cooldownUntil = Date.now() + TEACHER_COOLDOWN_MS;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      update();
      if (Date.now() >= cooldownUntil) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 250);
    update();
  };
  const stopCooldown = () => {
    cooldownUntil = 0;
    clearInterval(cooldownTimer);
    cooldownTimer = null;
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
    if (!text || Date.now() < cooldownUntil) return;
    $("[data-send-error]", root).textContent = "";
    input.value = "";
    startCooldown();
    scroller.scrollTop = scroller.scrollHeight;
    updateJump();
    try {
      await sendTeacherMessage(classId, text, state.user.uid, myName());
    } catch (error) {
      console.error(error);
      // Not sent, so no wait before trying again.
      stopCooldown();
      input.value = text;
      update();
      $("[data-send-error]", root).textContent = "Couldn't send. Your message is restored. Check your connection and try again.";
      toast("Couldn't send. Check your connection and try again.");
    }
  });
  if (window.matchMedia("(min-width: 861px)").matches) input.focus();
}
