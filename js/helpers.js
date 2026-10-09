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
  $("#page-header").innerHTML =
    `<div><h1>${title}</h1><p>${subtitle}</p></div><div class="header-actions">${actions}</div>`;
}

export function empty(title, description, button, id) {
  return `<div class="card empty"><h3>${title}</h3><p>${description}</p><button class="button primary" id="${id}">${button}</button></div>`;
}

export function openModal(html, onMount) {
  const node = $("#modal-template").content.cloneNode(true);
  document.body.append(node);
  const backdrop = document.body.lastElementChild;
  backdrop.querySelector(".modal-content").innerHTML = html;
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  onMount?.(backdrop, close);
}