import { $, currentRoute, navigate, shell, empty } from "../js/helpers.js";
import { state } from "../js/state.js";
import { renderTeachers } from "./views/teachers.js";
import { renderClasses } from "./views/classes.js";

export async function renderRoute() {
  if (!state.user) return;
  shell("admin-summary", "Admin");
  const route = currentRoute();
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) =>
      a.classList.toggle("active", route.startsWith(`/${a.dataset.nav}`)),
    );
  try {
    if (route === "/teachers") await renderTeachers();
    else if (route === "/classes") await renderClasses();
    else navigate("/teachers");
  } catch (error) {
    console.error(error);
    $("#page-content").innerHTML = empty(
      "Something needs attention",
      "We could not load this page. Check your Firebase configuration and Firestore rules, then try again.",
      "Try again",
      "retry",
    );
    $("#retry")?.addEventListener("click", renderRoute);
  }
}