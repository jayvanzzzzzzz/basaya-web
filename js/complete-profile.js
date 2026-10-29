import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { $ } from "./helpers.js";
import { fieldError, focusFirstError } from "./field-errors.js";

const form = $("#profile-form");
const submit = $("#profile-submit");
const status = $("#profile-status");
const retry = $("#profile-retry");
const setError = (field, message = "") => fieldError(form.elements[field], message);
let activeUser = null;

async function prepareProfile(user) {
  activeUser = user;
  status.hidden = false;
  retry.hidden = true;
  status.textContent = "Sinusuri ang iyong Google account…";
  $("#profile-error").textContent = "";
  form.hidden = true;

  if (!user) {
    window.location.replace("register.html");
    return;
  }

  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists()) {
      if (profile.data().role === "student") {
        window.location.replace("student/index.html");
        return;
      }
      await signOut(auth);
      window.location.replace("register.html");
      return;
    }

    const nameParts = (user.displayName || "").trim().split(/\s+/).filter(Boolean);
    $("#first-name").value = nameParts.shift() || "";
    $("#last-name").value = nameParts.join(" ");
    $("#profile-email").value = user.email || "";
    status.hidden = true;
    form.hidden = false;
  } catch (error) {
    console.error("Could not verify Google profile", error);
    status.textContent = "Hindi ma-verify ang iyong account. Suriin ang koneksyon at subukan muli.";
    retry.hidden = false;
  }
}

onAuthStateChanged(auth, prepareProfile);
retry.addEventListener("click", () => prepareProfile(auth.currentUser));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#profile-error").textContent = "";
  const firstName = form.elements.firstName.value.trim();
  const middleName = form.elements.middleName.value.trim();
  const lastName = form.elements.lastName.value.trim();

  setError("firstName", firstName ? "" : "Ilagay ang iyong first name.");
  setError("lastName", lastName ? "" : "Ilagay ang iyong last name.");
  if (focusFirstError(form)) return;
  if (!activeUser) {
    $("#profile-error").textContent = "Nag-expire ang iyong Google session. Magpatuloy muli gamit ang Gmail.";
    return;
  }

  submit.disabled = true;
  submit.textContent = "Sine-save ang iyong impormasyon…";
  try {
    await setDoc(doc(db, "users", activeUser.uid), {
      uid: activeUser.uid,
      email: activeUser.email || "",
      role: "student",
      firstName,
      middleName,
      lastName,
      dob: "",
      gender: "",
      username: "",
      createdAt: Date.now(),
    });
    window.location.replace("student/index.html");
  } catch (error) {
    console.error("Failed to save Google student profile", error);
    $("#profile-error").textContent = "Hindi na-save ang iyong impormasyon. Suriin ang koneksyon at subukan muli.";
    submit.disabled = false;
    submit.textContent = "Tapusin ang account setup";
  }
});

$("#profile-back").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("register.html");
  } catch (error) {
    console.error("Could not sign out of incomplete Google registration", error);
    $("#profile-error").textContent = "Hindi ka na-sign out. Subukan muli.";
  }
});
