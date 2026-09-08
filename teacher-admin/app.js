import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./js/firebase.js";
import { state } from "./js/state.js";
import { $, setLoading, toast } from "./js/helpers.js";
import { renderRoute } from "./js/router.js";

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#email").value.trim(),
    password = $("#password").value;
  $("#login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    $("#login-error").textContent =
      error.code === "auth/invalid-credential"
        ? "Incorrect email or password."
        : error.message;
  }
});

document.addEventListener("click", async (event) => {
  const stub = event.target.closest(".code-stub");
  if (!stub) return;
  event.preventDefault();
  event.stopPropagation();
  const codeEl = stub.querySelector("code");
  const hintEl = stub.querySelector(".code-stub__hint");
  const codeText = codeEl?.textContent.trim();
  if (!codeText) return;
  try {
    await navigator.clipboard.writeText(codeText);
    toast("Class code copied.");
    stub.classList.add("is-copied");
    if (hintEl) hintEl.textContent = "Copied!";
    setTimeout(() => {
      stub.classList.remove("is-copied");
      if (hintEl) hintEl.textContent = "Copy";
    }, 1400);
  } catch {
    toast(`Class code: ${codeText}`);
  }
});

$("#logout-button").addEventListener("click", () => signOut(auth));
window.addEventListener("hashchange", renderRoute);

onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  state.user = user;
  state.profile = null;
  if (!user) {
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
    setLoading(false);
    return;
  }
  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists() || profile.data().role !== "teacher") {
      await signOut(auth);
      $("#login-view").hidden = false;
      $("#login-error").textContent =
        "This account is not approved for teacher access.";
      return;
    }
    state.profile = profile.data();
    await renderRoute();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    $("#login-view").hidden = false;
    $("#login-error").textContent = "Could not verify your teacher access.";
  } finally {
    setLoading(false);
  }
});
