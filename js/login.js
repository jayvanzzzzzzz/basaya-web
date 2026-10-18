import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { $ } from "./helpers.js";
import { clearFieldErrors, fieldError } from "./field-errors.js";

const loading = document.getElementById("loading-screen");
const loginView = document.getElementById("login-view");
const loginForm = $("#login-form");
const loginButton = loginForm.querySelector('[type="submit"]');
const loginButtonLabel = loginButton.querySelector(".login-submit__label");
let signingIn = false;
// Showcase: real BaSaya screens in one window that morphs between them. Each
// tab's meter fills over --showcase-time; when it ends, the next screen shows.
const showcase = document.querySelector("[data-showcase]");
const showcaseWindow = showcase?.querySelector("[data-showcase-window]");
const showcaseCrumb = showcase?.querySelector("[data-showcase-crumb]");
const showcaseShots = [...(showcase?.querySelectorAll("[data-showcase-shot]") || [])];
const showcasePanels = [...(showcase?.querySelectorAll("[data-showcase-panel]") || [])];
const showcaseTabs = [...(showcase?.querySelectorAll("[data-showcase-tab]") || [])];
const showcasePause = showcase?.querySelector("[data-showcase-pause]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let showcaseIndex = 0;
let pausedByUser = false;
let pausedByFocus = false;

// Numbers on the screens count up when they appear.
function countUp(shot) {
  if (reducedMotion.matches) return;
  shot.querySelectorAll("[data-count]").forEach((number) => {
    const target = Number(number.dataset.count);
    const suffix = number.dataset.suffix || "";
    const start = performance.now() + 300;
    const tick = (now) => {
      const t = Math.min(Math.max((now - start) / 900, 0), 1);
      number.textContent = Math.round(target * (1 - (1 - t) ** 3)) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function showShowcase(index) {
  showcaseIndex = (index + showcaseShots.length) % showcaseShots.length;
  const shot = showcaseShots[showcaseIndex];
  showcaseShots.forEach((item) => item.classList.toggle("is-active", item === shot));
  showcaseWindow.classList.toggle("is-phone", shot.dataset.shape === "phone");
  if (shot.dataset.crumb) showcaseCrumb.textContent = shot.dataset.crumb;
  showcaseTabs.forEach((tab, tabIndex) => {
    const active = tabIndex === showcaseIndex;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  showcasePanels.forEach((panel, panelIndex) => {
    const active = panelIndex === showcaseIndex;
    panel.classList.toggle("is-active", active);
    panel.setAttribute("aria-hidden", String(!active));
    panel.inert = !active;
  });
  countUp(shot);
}

function updateShowcasePause() {
  showcase.classList.toggle(
    "is-paused",
    pausedByUser || pausedByFocus || document.hidden,
  );
}

if (showcase && showcaseShots.length) {
  // Wrap each headline word so the words can blur in one after another.
  showcasePanels.forEach((panel) => {
    const heading = panel.querySelector("h1");
    const words = heading.textContent.trim().split(/\s+/);
    heading.replaceChildren(
      ...words.flatMap((word, wordIndex) => {
        const span = document.createElement("span");
        span.className = "auth-showcase__word";
        span.style.setProperty("--i", wordIndex);
        span.textContent = word;
        return wordIndex ? [" ", span] : [span];
      }),
    );
  });

  showcase.addEventListener("animationend", (event) => {
    if (event.animationName !== "showcaseMeter" || reducedMotion.matches) return;
    showShowcase(showcaseIndex + 1);
  });

  showcaseTabs.forEach((tab, tabIndex) => {
    tab.addEventListener("click", () => {
      if (tabIndex !== showcaseIndex) showShowcase(tabIndex);
    });
  });

  // Arrow keys move between tabs (one tab stop for the whole list).
  showcase.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -showcaseIndex, End: showcaseTabs.length - 1 - showcaseIndex };
    if (!(event.key in moves)) return;
    event.preventDefault();
    showShowcase(showcaseIndex + moves[event.key]);
    showcaseTabs[showcaseIndex].focus();
  });

  showcasePause.addEventListener("click", () => {
    pausedByUser = !pausedByUser;
    showcasePause.setAttribute("aria-pressed", String(pausedByUser));
    updateShowcasePause();
  });

  // Hold still while someone is moving through the tabs with the keyboard.
  showcase.addEventListener("focusin", (event) => {
    // Only keyboard focus: a mouse click on a tab shouldn't stop it for good.
    if (!event.target.matches(":focus-visible")) return;
    pausedByFocus = true;
    updateShowcasePause();
  });
  showcase.addEventListener("focusout", (event) => {
    if (showcase.contains(event.relatedTarget)) return;
    pausedByFocus = false;
    updateShowcasePause();
  });
  document.addEventListener("visibilitychange", updateShowcasePause);
}

function revealLogin() {
  loading.hidden = true;
  loginView.hidden = false;
  clearSignedOutCredentials();
  setSigningIn(false);
  // Start from the first screen now that it's visible.
  if (showcase && showcaseShots.length) showShowcase(0);
}

// The eye button inside the password field shows or hides the password.
const passwordInput = $("#password");
const passwordToggle = $("#password-toggle");

function setPasswordVisible(visible) {
  passwordInput.type = visible ? "text" : "password";
  passwordToggle.setAttribute("aria-pressed", String(visible));
  passwordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
}

passwordToggle.addEventListener("click", () => {
  setPasswordVisible(passwordInput.type === "password");
  passwordInput.focus();
});

function clearSignedOutCredentials() {
  if (sessionStorage.getItem("basayaSignedOut") !== "true") return;
  $("#email").value = "";
  passwordInput.value = "";
  setPasswordVisible(false);
  $("#login-error").textContent = "";
  clearFieldErrors(loginForm);
}

window.addEventListener("pageshow", clearSignedOutCredentials);

function setSigningIn(active) {
  signingIn = active;
  loginButton.disabled = active;
  loginButton.setAttribute("aria-busy", String(active));
  loginForm.setAttribute("aria-busy", String(active));
  loginButtonLabel.textContent = active ? "Signing in…" : "Sign in to BaSaya";
}

const ROLE_DESTINATIONS = {
  teacher: "teacher/index.html",
  admin: "admin/index.html",
  student: "student/index.html",
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signingIn) return;
  const email = $("#email").value.trim();
  const password = passwordInput.value;
  // Hide it again so a browser's "save password" prompt never sees it as plain text.
  setPasswordVisible(false);
  const error = $("#login-error");
  error.textContent = "";
  setSigningIn(true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setSigningIn(false);
    if (error.code === "auth/invalid-email") {
      fieldError($("#email"), "That doesn't look like an email address. Check it has an @ and a domain.");
      $("#email").focus();
      return;
    }
    $("#login-error").textContent =
      error.code === "auth/invalid-credential"
      ? "Incorrect email or password."
      : error.message;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    revealLogin();
    return;
  }
  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const role = profileSnap.data()?.role;
    const destination = ROLE_DESTINATIONS[role];

    if (!profileSnap.exists() || !destination) {
      await signOut(auth);
      revealLogin();
      $("#login-error").textContent = "This account has no portal access.";
      return;
    }
    sessionStorage.removeItem("basayaSignedOut");
    window.location.replace(destination);
  } catch (error) {
    console.error(error);
    await signOut(auth);
    revealLogin();
    $("#login-error").textContent = "Could not verify your account.";
  }
});