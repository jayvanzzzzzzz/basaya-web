import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../js/firebase.js";
import { $, toast } from "../js/helpers.js";
import { student } from "./data.js";

/** Name and initial in the top bar. */
export function refreshTopbar() {
  const first = (student.profile.firstName || "").trim();
  $("#st-first-name").textContent = first;
  $("#st-avatar").textContent = first.charAt(0).toUpperCase() || "B";
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
