import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { $ } from "./helpers.js";

const loading = document.getElementById("loading-screen");
const loginView = document.getElementById("login-view");

const ROLE_DESTINATIONS = {
  teacher: "teacher/index.html",
  admin: "admin/index.html",
};

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let email = $("#email").value.trim();
  const password = $("#password").value;

  // If they typed a bare username (no @), treat it as an admin/staff shorthand
  if (!email.includes("@")) {
    email = `${email}@basaya.local`;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    $("#login-error").textContent =
      error.code === "auth/invalid-credential"
        ? "Incorrect email or password."
        : error.message;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loading.hidden = true;
    loginView.hidden = false;
    return;
  }
  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const role = profileSnap.data()?.role;
    const destination = ROLE_DESTINATIONS[role];

    if (!profileSnap.exists() || !destination) {
      await signOut(auth);
      loading.hidden = true;
      loginView.hidden = false;
      $("#login-error").textContent = "This account has no portal access.";
      return;
    }
    window.location.href = destination;
  } catch (error) {
    console.error(error);
    await signOut(auth);
    loading.hidden = true;
    loginView.hidden = false;
    $("#login-error").textContent = "Could not verify your account.";
  }
});