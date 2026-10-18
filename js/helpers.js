import { state } from "./state.js";

export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

export const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

export function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

const NOTICE_ICONS = {
  success: '<path d="m5 12.5 4.5 4.5L19 7.5" />',
  danger: '<path d="M6 12h12" />',
  info: '<path d="M12 11v6M12 7.5v.01" />',
};

/** Two-letter initials for an avatar: "Juan Dela Cruz" → "JD". */
export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/**
 * A richer toast: avatar or icon, title, message, an optional action (like Undo),
 * and a countdown bar that pauses while hovered or focused.
 * Several can stack. Styles: css/components/notice.css.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.avatar]   Initials shown in the badge; otherwise the tone icon.
 * @param {"success"|"danger"|"info"} [options.tone]
 * @param {{ label: string, busyLabel?: string, run: () => Promise<void>|void }} [options.action]
 *        The notice stays open (button shows busyLabel) until run() settles.
 * @param {number} [options.duration] ms before it closes by itself.
 * @returns {{ dismiss: () => void }}
 */
export function notify({ title, message = "", avatar, tone = "success", action, duration = 6000 }) {
  let stack = $(".notice-stack");
  if (!stack) {
    stack = document.createElement("section");
    stack.className = "notice-stack";
    stack.setAttribute("aria-label", "Notifications");
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }

  const icon = `<svg viewBox="0 0 24 24" aria-hidden="true">${NOTICE_ICONS[tone] || NOTICE_ICONS.info}</svg>`;
  const notice = document.createElement("div");
  notice.className = `notice notice--${tone}`;
  notice.setAttribute("role", tone === "danger" ? "alert" : "status");
  notice.style.setProperty("--notice-duration", `${duration}ms`);
  notice.innerHTML = `
    <span class="notice__badge${avatar ? " notice__badge--avatar" : ""}" aria-hidden="true">
      ${avatar ? escapeHtml(avatar) : icon}
      ${avatar ? `<span class="notice__tone">${icon}</span>` : ""}
    </span>
    <div class="notice__text">
      <strong>${escapeHtml(title)}</strong>
      ${message ? `<span>${escapeHtml(message)}</span>` : ""}
    </div>
    ${action ? `<button type="button" class="notice__action">${escapeHtml(action.label)}</button>` : ""}
    <button type="button" class="notice__close" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
    <span class="notice__timer" aria-hidden="true"><i></i></span>`;
  stack.append(notice);

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    notice.classList.add("is-leaving");
    const remove = () => notice.remove();
    notice.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 400); // in case animations are off
  };

  // The bar's animation is the timer, so CSS pausing (hover/focus) pauses it too.
  notice.querySelector(".notice__timer i").addEventListener("animationend", dismiss);
  notice.querySelector(".notice__close").addEventListener("click", dismiss);

  const actionButton = notice.querySelector(".notice__action");
  actionButton?.addEventListener("click", async () => {
    actionButton.disabled = true;
    actionButton.textContent = action.busyLabel || action.label;
    notice.classList.add("is-busy");
    try {
      await action.run();
    } finally {
      dismiss();
    }
  });

  return { dismiss };
}

export function setLoading(loading) {
  $("#loading-screen").hidden = !loading;
}

export function navigate(path) {
  location.hash = path;
}

export function displayName(fallback = "Teacher") {
  return (
    state.profile?.displayName || state.user?.email?.split("@")[0] || fallback
  );
}

export function time(value) {
  return value?.toDate ? value.toDate().toLocaleDateString() : "Recently";
}

export function joinCode() {
  return Array.from(
    crypto
      .getRandomValues(new Uint32Array(1))[0]
      .toString(36)
      .toUpperCase()
      .padStart(6, "0"),
  )
    .slice(-6)
    .join("");
}

export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value, location.href);
    const isLocalHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || isLocalHttp ? url.href : "";
  } catch {
    return "";
  }
}

export function currentRoute() {
  return location.hash.slice(1) || "/dashboard";
}

function closeAccountMenu() {
  const toggle = $("#account-menu-toggle");
  const menu = $(".account-menu__popup");
  if (!toggle || !menu) return;
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
}

document.addEventListener("click", (event) => {
  const toggle = event.target.closest?.("#account-menu-toggle");
  if (toggle) {
    const menu = toggle.nextElementSibling;
    const willOpen = menu.hidden;
    closeAccountMenu();
    menu.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
    return;
  }

  if (!event.target.closest?.(".account-menu")) closeAccountMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAccountMenu();
});

export function shell(summaryId = "teacher-summary", fallbackName = "Teacher") {
  $("#app-view").hidden = false;
  const summary = $(`#${summaryId}`);
  summary.textContent = state.user?.email || displayName(fallbackName);
  summary.title = summary.textContent;
}

export function page(title, subtitle, actions = "") {
  $("#page-header").classList.remove(
    "teacher-dashboard-header",
    "teacher-class-header",
    "teacher-add-lesson-header",
  );
  $("#page-content").classList.remove(
    "teacher-dashboard",
    "teacher-class-page",
    "teacher-add-lesson-page",
  );
  $("#page-header").innerHTML =
    `<div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="header-actions">${actions}</div>`;
}

export function empty(title, description, button, id) {
  return `<div class="card empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><button class="button primary" id="${escapeHtml(id)}">${escapeHtml(button)}</button></div>`;
}

/**
 * closeOnBackdrop: false keeps the modal open when the backdrop is clicked.
 * beforeClose: asked when × is pressed; the modal closes only if it resolves true.
 */
export function openModal(html, onMount, { closeOnBackdrop = true, beforeClose } = {}) {
  const node = $("#modal-template").content.cloneNode(true);
  document.body.append(node);
  const backdrop = document.body.lastElementChild;
  backdrop.querySelector(".modal-content").innerHTML = html;
  const close = () => backdrop.remove();
  const dismiss = async () => {
    if (!beforeClose || (await beforeClose())) close();
  };
  backdrop.querySelector(".modal-close").addEventListener("click", dismiss);
  if (closeOnBackdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) dismiss();
    });
  }
  onMount?.(backdrop, close);
}