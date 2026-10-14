import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../js/firebase.js";
import { $, toast } from "../js/helpers.js";
import { student, fullName } from "./data.js";
import { showDialog } from "./ui.js";

/** Name and initial in the top bar and its account menu. */
export function refreshTopbar() {
  const first = (student.profile.firstName || "").trim();
  const initial = first.charAt(0).toUpperCase() || "B";
  $("#st-first-name").textContent = first;
  $("#st-avatar").textContent = initial;
  $("#st-menu-avatar").textContent = initial;
  $("#st-menu-name").textContent = fullName() || "Mag-aaral";
  $("#st-menu-email").textContent = student.email;
}

export async function logout() {
  sessionStorage.setItem("basayaSignedOut", "true");
  try {
    await signOut(auth);
    window.location.replace("../index.html");
  } catch (error) {
    sessionStorage.removeItem("basayaSignedOut");
    console.error("Student sign-out failed:", error);
    toast("Hindi maka-logout. Subukan muli.");
  }
}

/** Asks first, then signs out (the top bar menu and the Account page). */
export async function confirmLogout() {
  const answer = await showDialog({
    iconName: "door",
    title: "Mag-sign out?",
    message: "Kailangan mong mag-log in muli para makabalik sa iyong mga aralin.",
    primary: "Mag-sign out",
    secondary: "Huwag muna",
  });
  if (answer === "primary") logout();
}

// ---------- Account menu (the name in the top bar) ----------

const toggle = $("#st-menu-toggle");
const popup = $("#st-menu");
const items = () => [...popup.querySelectorAll('[role="menuitem"]')];

function setMenu(open, { focus = false } = {}) {
  popup.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  if (open && focus) items()[0]?.focus();
}

toggle.addEventListener("click", () => setMenu(popup.hidden));
toggle.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setMenu(true, { focus: true });
  }
});
popup.addEventListener("keydown", (event) => {
  const list = items();
  const index = list.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    list[(index + step + list.length) % list.length].focus();
  } else if (event.key === "Tab") {
    setMenu(false);
  }
});
popup.addEventListener("click", (event) => {
  if (event.target.closest('[role="menuitem"]')) setMenu(false);
});
document.addEventListener("click", (event) => {
  if (!popup.hidden && !event.target.closest(".st-menu")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !popup.hidden) {
    setMenu(false);
    toggle.focus();
  }
});
window.addEventListener("hashchange", () => setMenu(false));
$("#st-menu-logout").addEventListener("click", confirmLogout);
