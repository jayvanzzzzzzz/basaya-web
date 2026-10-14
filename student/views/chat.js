import { $, escapeHtml, initials, toast } from "../../js/helpers.js";
import {
  STUDENT_MAX,
  canDeleteOwn,
  STUDENT_COOLDOWN_MS,
  deleteOwnMessage,
  lastFirst,
  lastRead,
  loadOlder,
  markRead,
  rosterName,
  sendStudentMessage,
  watchRecent,
  watchState,
} from "../../js/chat.js?v=student-chat-2"; // ?v: skip an older cached copy without the student functions
import { student, classId } from "../data.js";
import { onLeave } from "../router.js";
import { content, icon, showDialog } from "../ui.js";

// "Chat ng klase" (the app's ChatFragment): the class's one group chat with the teacher.
// Students send up to 300 characters, one message every 5 seconds, only while the teacher
// keeps the chat open, and can delete their own message within 5 minutes. The rules
// (firestore.rules, "Class chat") enforce all of it. Styles: css/pages/messages.css.

// ---------- Unread dot on the "Chat" tab ----------

let stopBadge = null;
let badgeClassId = null;
let myRosterName = "";

/** Something new from someone else since the student last looked (ClassChat.isUnread). */
const isUnread = (state) =>
  state.lastAt > lastRead(student.uid, classId()) && (state.lastRole === "teacher" || state.lastSenderName !== myRosterName);

/** Keeps the Chat tab's dot live. Call after the class may have changed. */
export async function watchChatBadge() {
  const id = classId();
  if (id === badgeClassId) return;
  stopBadge?.();
  stopBadge = null;
  badgeClassId = id;
  setBadge(false);
  if (!id) return;
  myRosterName = await rosterName(id, student.uid).catch(() => "");
  stopBadge = watchState(id, (state) => setBadge(isUnread(state) && !location.hash.startsWith("#/chat")));
}

function setBadge(on) {
  const link = document.querySelector('[data-nav="chat"]');
  if (!link) return;
  link.classList.toggle("has-dot", on);
  link.setAttribute("aria-label", on ? "Chat, may bagong mensahe" : "Chat");
}

// ---------- Formatting ----------

const timeOf = (millis) => new Date(millis).toLocaleTimeString("fil-PH", { hour: "numeric", minute: "2-digit" });

function dayLabel(millis) {
  const day = new Date(millis);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "Ngayon";
  if (day.toDateString() === yesterday.toDateString()) return "Kahapon";
  return day.toLocaleDateString("fil-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** A stable hue per name, so each person keeps their avatar color (same as the teacher side). */
const hueOf = (text) => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

const ICONS = {
  send: '<path d="M4.5 12 20 4.5 13.5 20l-2.2-6.3L4.5 12Z" /><path d="m11.3 13.7 4-4" />',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />',
  up: '<path d="m6 15 6-6 6 6" />',
};
const chatIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function messageHtml(message, previous) {
  const mine = message.senderId === student.uid;
  const newDay = !previous || dayLabel(previous.sentAt) !== dayLabel(message.sentAt);
  // Messages from the same person within 5 minutes stack under one name.
  const grouped =
    !newDay && previous && previous.senderId === message.senderId && message.sentAt - previous.sentAt < 5 * 60 * 1000;
  const teacher = message.role === "teacher";
  const name = (teacher ? lastFirst(message.senderName) : message.senderName) || (teacher ? "Guro" : "Kaklase");
  const day = newDay ? `<li class="chat-day"><span>${escapeHtml(dayLabel(message.sentAt))}</span></li>` : "";

  if (message.deleted) {
    return `${day}<li class="chat-msg is-removed${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}">
      <p class="chat-msg__removed">${chatIcon("trash")}${message.deletedBy === "teacher" ? "Tinanggal ng guro ang mensaheng ito" : "Binura ang mensaheng ito"}</p>
    </li>`;
  }
  const deletable = canDeleteOwn(message, student.uid);
  return `${day}<li class="chat-msg${mine ? " is-mine" : ""}${message.role === "teacher" ? " is-teacher" : ""}${grouped ? " is-grouped" : ""}${message.pending ? " is-pending" : ""}">
    ${mine ? "" : `<span class="chat-msg__avatar" style="--h:${hueOf(name)}" aria-hidden="true">${grouped ? "" : escapeHtml(initials(name))}</span>`}
    <div class="chat-msg__body">
      ${grouped || mine ? "" : `<span class="chat-msg__name">${escapeHtml(name)}${teacher ? '<span class="st-chat__role">· GURO</span>' : ""}</span>`}
      <div class="chat-msg__bubble">
        <p>${escapeHtml(message.text)}</p>
        <time datetime="${new Date(message.sentAt).toISOString()}">${message.pending ? "Ipinapadala…" : timeOf(message.sentAt)}</time>
      </div>
    </div>
    ${deletable ? `<button type="button" class="chat-msg__remove" data-delete="${escapeHtml(message.id)}" aria-label="Burahin ang mensahe">${chatIcon("trash")}</button>` : ""}
  </li>`;
}

// ---------- The page ----------

export async function renderChat() {
  const id = classId();
  if (!id) {
    content().innerHTML = `
      <div class="st-empty">
        <img class="st-empty__art" src="../img/logo.png" alt="" />
        <h2>Wala ka pang klase</h2>
        <p>Sumali muna sa isang klase sa Mga Aralin para makita ang chat.</p>
        <a class="button primary" href="#/join">${icon("plus")}Sumali sa klase</a>
      </div>`;
    return;
  }

  setBadge(false);
  const name = await rosterName(id, student.uid);
  myRosterName = name;
  const className = student.profile.className || "Klase";

  content().innerHTML = `
    <section class="st-chat">
      <div class="chat">
        <header class="chat-head">
          <span class="inbox-class__avatar" style="--h:${hueOf(className)}">${escapeHtml(initials(className))}</span>
          <div class="chat-head__text">
            <h2>${escapeHtml(className)}</h2>
            <span data-chat-status>Ikaw, ang guro, at ang mga kaklase mo</span>
          </div>
        </header>
        <div class="chat-closed" data-chat-closed hidden>
          ${chatIcon("lock")}
          <span>Isinara ng guro ang chat. Puwede ka pang magbasa, pero hindi muna magpadala.</span>
        </div>
        <div class="chat-scroll" data-chat-scroll>
          <div class="chat-older" data-older hidden>
            <button type="button" class="chat-older__button" data-load-older>${chatIcon("up")}<span>Tingnan ang mas luma</span></button>
          </div>
          <ol class="chat-messages" data-messages aria-live="polite">
            <li class="chat-loading" aria-label="Naglo-load"><span></span><span></span><span></span></li>
          </ol>
        </div>
        <form class="chat-composer" data-composer>
          <textarea rows="1" maxlength="${STUDENT_MAX}" placeholder="Sumulat ng mensahe…" aria-label="Mensahe" data-input></textarea>
          <span class="chat-composer__count" data-count hidden></span>
          <button type="submit" class="chat-composer__send" aria-label="Ipadala" data-send disabled>${chatIcon("send")}</button>
        </form>
      </div>
    </section>`;

  const root = $(".st-chat");
  const scroller = $("[data-chat-scroll]", root);
  const list = $("[data-messages]", root);
  const input = $("[data-input]", root);
  const send = $("[data-send]", root);
  const count = $("[data-count]", root);
  const composer = $("[data-composer]", root);

  let recent = [];
  let older = [];
  let moreOlder = false;
  let recentFull = false;
  let firstLoad = true;
  let open = true;
  let sending = false;

  const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;

  const render = ({ keepOffset = false } = {}) => {
    const stick = firstLoad || nearBottom();
    const fromBottom = scroller.scrollHeight - scroller.scrollTop;
    const messages = [...older, ...recent.filter((message) => !older.some((item) => item.id === message.id))];
    list.innerHTML = messages.length
      ? messages.map((message, index) => messageHtml(message, messages[index - 1])).join("")
      : `<li class="chat-empty">${chatIcon("chat")}<strong>Wala pang mensahe</strong><span>Bumati sa iyong guro at mga kaklase! 👋</span></li>`;
    $("[data-older]", root).hidden = !(older.length ? moreOlder : recentFull);
    if (keepOffset) scroller.scrollTop = scroller.scrollHeight - fromBottom;
    else if (stick) scroller.scrollTop = scroller.scrollHeight;
    firstLoad = false;
  };

  const stopRecent = watchRecent(
    id,
    (messages, full) => {
      recent = messages;
      recentFull = full;
      render();
      const newest = messages.at(-1);
      if (newest && document.visibilityState === "visible") markRead(student.uid, id, newest.sentAt);
    },
    (error) => {
      console.error(error);
      list.innerHTML = `<li class="chat-empty">${chatIcon("chat")}<strong>Hindi ma-load ang chat.</strong><span>Tingnan ang internet.</span></li>`;
    },
  );

  // After each message the box is locked for 5 seconds (the rules' limit) and counts down.
  let cooldownUntil = 0;
  let cooldownTimer = null;
  const HINT = "Sumulat ng mensahe…";

  const updateComposer = () => {
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    const cooling = left > 0;
    const locked = !open || sending || cooling;
    input.disabled = locked;
    input.placeholder = sending
      ? "Ipinapadala…"
      : cooling
        ? `Maghintay lamang ng ${left} segundo…`
        : open
          ? HINT
          : "Sarado ang chat";
    composer.classList.toggle("is-cooling", sending || cooling);
    composer.classList.toggle("is-closed", !open);
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    send.disabled = locked || !input.value.trim();
    count.hidden = input.value.length < STUDENT_MAX - 60;
    count.textContent = `${input.value.length}/${STUDENT_MAX}`;
  };

  const startCooldown = () => {
    cooldownUntil = Date.now() + STUDENT_COOLDOWN_MS;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      updateComposer();
      if (Date.now() >= cooldownUntil) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        if (open) input.focus({ preventScroll: true });
      }
    }, 250);
    updateComposer();
  };

  const stopState = watchState(id, (state) => {
    open = state.open;
    $("[data-chat-closed]", root).hidden = open;
    $("[data-chat-status]", root).textContent = open
      ? "Ikaw, ang guro, at ang mga kaklase mo"
      : "Sarado muna ang chat · puwede ka pang magbasa";
    updateComposer();
    if (state.lastAt) markRead(student.uid, id, state.lastAt);
  });

  const onVisible = () => {
    if (document.visibilityState === "visible" && recent.length) markRead(student.uid, id, recent.at(-1).sentAt);
  };
  document.addEventListener("visibilitychange", onVisible);
  // Delete buttons disappear once 5 minutes have passed.
  const refresh = setInterval(() => render(), 30_000);

  onLeave(() => {
    stopRecent();
    stopState();
    clearInterval(refresh);
    clearInterval(cooldownTimer);
    document.removeEventListener("visibilitychange", onVisible);
  });

  $("[data-load-older]", root).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const oldest = older[0] || recent[0];
    if (!oldest) return;
    button.disabled = true;
    button.lastChild.textContent = "Naglo-load…";
    try {
      const page = await loadOlder(id, oldest);
      older = [...page.messages, ...older];
      moreOlder = page.more;
      render({ keepOffset: true });
    } catch (error) {
      console.error(error);
      toast("Hindi ma-load ang chat. Tingnan ang internet.");
    } finally {
      button.disabled = false;
      button.lastChild.textContent = "Tingnan ang mas luma";
    }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    const answer = await showDialog({
      iconName: "close",
      tone: "locked",
      title: "Burahin ang mensahe?",
      message: "Mawawala ito para sa lahat. Puwede lang burahin sa loob ng 5 minuto.",
      primary: "Burahin",
      secondary: "Huwag",
    });
    if (answer !== "primary") return;
    try {
      await deleteOwnMessage(id, button.dataset.delete);
      older = older.map((item) =>
        item.id === button.dataset.delete ? { ...item, text: "", deleted: true, deletedBy: "sender" } : item,
      );
      render();
    } catch (error) {
      console.error(error);
      toast("Hindi nabura. Baka lampas na sa 5 minuto.");
    }
  });

  input.addEventListener("input", updateComposer);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !open || sending || Date.now() < cooldownUntil) return;
    sending = true;
    input.value = "";
    input.blur(); // the box is locked until the countdown ends
    updateComposer();
    scroller.scrollTop = scroller.scrollHeight;
    try {
      await sendStudentMessage(id, student.uid, name, text);
      // The rules count the 5 seconds from when the server got it.
      sending = false;
      startCooldown();
    } catch (error) {
      console.error(error);
      input.value = text;
      // The rules refuse a second message within 5 seconds.
      toast(
        error?.code === "permission-denied"
          ? open
            ? "Sandali lang! Puwede ulit magpadala sa loob ng ilang segundo."
            : "Isinara ng guro ang chat."
          : "Hindi naipadala. Tingnan ang internet at subukan ulit.",
      );
    } finally {
      sending = false;
      updateComposer();
    }
  });
}
