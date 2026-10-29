import {
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { $ } from "./helpers.js";
import { fieldError, focusFirstError } from "./field-errors.js";
import { passwordProblem, passwordRulesMarkup, watchPasswordRules } from "./password-rules.js";

// Student sign-up (register.html), the same as the Android app's RegisterActivity:
// a Firebase Auth account plus users/{uid} with role "student". Lessons come later from
// the class the student joins. If saving the profile fails, the new login is removed so the
// same email can be tried again.

const form = $("#register-form");
const submit = $("#register-submit");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const setError = (field, message = "") => fieldError(form.elements[field], message);

// Checklist under the password that ticks each rule as it's met.
form.querySelector("[data-password-rules]").outerHTML = passwordRulesMarkup("fil");
watchPasswordRules(form.elements.password, form.querySelector(".password-rules"));

form.querySelectorAll("[data-reveal]").forEach((button) =>
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.reveal);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.classList.toggle("is-revealed", show);
    button.setAttribute("aria-label", show ? "Itago ang password" : "Ipakita ang password");
  }),
);

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? "Ginagawa ang account…" : "Gumawa ng account ngayon";
}

const authMessage = (code) =>
  ({
    "auth/email-already-in-use": "May account na ang email na ito. Mag-login na lang.",
    "auth/invalid-email": "Mukhang mali ang email.",
    "auth/weak-password": "Masyadong mahina ang password.",
    "auth/network-request-failed": "May problema sa koneksyon. Subukan muli.",
    "auth/too-many-requests": "Masyadong maraming subok. Maghintay muna bago umulit.",
  })[code] || "Hindi nagawa ang account. Subukan muli.";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#register-error").textContent = "";
  const data = Object.fromEntries(new FormData(form));
  const firstName = data.firstName.trim();
  const middleName = data.middleName.trim();
  const lastName = data.lastName.trim();
  const email = data.email.trim();
  const password = data.password;

  // Show every problem at once, focus the first one.
  const errors = {
    firstName: firstName ? "" : "Ilagay ang iyong first name.",
    lastName: lastName ? "" : "Ilagay ang iyong last name.",
    email: !email
      ? "Ilagay ang email na gagamitin mo sa pag-login."
      : EMAIL_PATTERN.test(email)
        ? ""
        : "Mukhang mali ang email. Tingnan kung may @ at domain, hal. pangalan@gmail.com.",
    password: !password ? "Gumawa ng password para sa iyong account." : passwordProblem(password, "fil"),
  };
  Object.entries(errors).forEach(([field, message]) => setError(field, message));
  if (focusFirstError(form)) return;

  setBusy(true);
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Registration failed", error);
    setBusy(false);
    // Problems with what they typed go under that field.
    const field = { "auth/email-already-in-use": "email", "auth/invalid-email": "email", "auth/weak-password": "password" }[
      error.code
    ];
    if (field) {
      setError(field, authMessage(error.code));
      form.elements[field].focus();
    } else {
      $("#register-error").textContent = authMessage(error.code);
    }
    return;
  }

  const uid = credential.user.uid;
  try {
    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      role: "student",
      firstName,
      middleName,
      lastName,
      dob: "",
      gender: "",
      username: "",
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("Failed to save user document", error);
    // Roll back the half-created login so the same email can be retried.
    await credential.user.delete().catch((err) => console.error("Could not roll back auth user", err));
    $("#register-error").textContent = "Hindi na-save ang iyong impormasyon. Subukan muli.";
    setBusy(false);
    return;
  }

  // Signed in already: straight to the student side.
  window.location.replace("student/index.html");
});
