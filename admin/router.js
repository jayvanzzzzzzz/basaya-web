import { $, currentRoute, navigate, shell, empty } from "../js/helpers.js";
import { state } from "../js/state.js";
import { renderTeachers } from "./views/teachers.js";
import { renderStudents } from "./views/students.js";
import { renderClasses } from "./views/classes.js";
import { renderLessons } from "./views/lessons.js";
import { renderAccount } from "./views/account.js";
import { renderDictionary } from "../teacher/views/dictionary.js";
import { refreshDeletionBadge } from "./views/classDeletion.js";

export async function renderRoute() {
  if (!state.user) return;
  shell("admin-summary", "Admin");
  const route = currentRoute();
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.classList.toggle("active", route.startsWith(`/${a.dataset.nav}`)),
  );
  try {
    if (route === "/teachers") await renderTeachers();
    else if (route === "/students") await renderStudents();
    else if (route === "/classes") await renderClasses();
    else if (route === "/lessons") await renderLessons();
    else if (route === "/dictionary") await renderDictionary();
    else if (route === "/settings") renderAccount();
    else navigate("/teachers");
    // Keep the "All classes" badge (pending deletion requests) current on every page.
    if (route !== "/classes") refreshDeletionBadge();
  } catch (error) {
    console.error(error);
    $("#page-content").innerHTML = empty("Something needs attention", "We could not load this page. Check your Firebase configuration and Firestore rules, then try again.", "Try again", "retry");
    $("#retry")?.addEventListener("click", renderRoute);
  }
}