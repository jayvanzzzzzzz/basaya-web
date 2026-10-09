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
const loginForm = $("#login-form");
const loginButton = loginForm.querySelector('[type="submit"]');
const loginButtonLabel = loginButton.querySelector(".login-submit__label");
let signingIn = false;
const carousel = document.querySelector(".auth-carousel");
const carouselSlides = [...(carousel?.querySelectorAll("[data-carousel-slide]") || [])];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let carouselIndex = 0;
let carouselTimer;
let pointerPaused = false;
let focusPaused = false;

function showCarouselSlide(index) {
  carouselIndex = (index + carouselSlides.length) % carouselSlides.length;
  carouselSlides.forEach((slide, slideIndex) => {
    const active = slideIndex === carouselIndex;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", String(!active));
    slide.inert = !active;
  });
}

function stopCarousel() {
  window.clearInterval(carouselTimer);
  carouselTimer = undefined;
}

function startCarousel() {
  stopCarousel();
  if (
    !carousel ||
    carouselSlides.length < 2 ||
    reducedMotion.matches ||
    loginView.hidden ||
    document.hidden ||
    pointerPaused ||
    focusPaused
  ) {
    return;
  }
  carouselTimer = window.setInterval(() => {
    showCarouselSlide(carouselIndex + 1);
  }, 2500);
}

if (carousel && carouselSlides.length) {
  showCarouselSlide(0);
  carousel.addEventListener("pointerenter", () => {
    pointerPaused = true;
    stopCarousel();
  });
  carousel.addEventListener("pointerleave", () => {
    pointerPaused = false;
    startCarousel();
  });
  carousel.addEventListener("focusin", () => {
    focusPaused = true;
    stopCarousel();
  });
  carousel.addEventListener("focusout", (event) => {
    if (!carousel.contains(event.relatedTarget)) {
      focusPaused = false;
      startCarousel();
    }
  });
  document.addEventListener("visibilitychange", startCarousel);
  reducedMotion.addEventListener("change", startCarousel);
}

function revealLogin() {
  loading.hidden = true;
  loginView.hidden = false;
  clearSignedOutCredentials();
  setSigningIn(false);
  startCarousel();
}

function clearSignedOutCredentials() {
  if (sessionStorage.getItem("basayaSignedOut") !== "true") return;
  $("#email").value = "";
  $("#password").value = "";
  $("#login-error").textContent = "";
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
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (signingIn) return;
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const error = $("#login-error");
  error.textContent = "";
  setSigningIn(true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setSigningIn(false);
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