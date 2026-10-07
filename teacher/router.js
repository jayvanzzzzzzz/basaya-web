import { $, currentRoute, navigate, shell, empty } from "../js/helpers.js";
import { state, getTeacherLessons, getAllLessons, getTeacherClasses } from "../js/state.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderLibrary } from "./views/lessons.js";
import { renderClass } from "./views/classPage.js";
import { renderAddLessonPage } from "./views/addLesson.js";
import { renderStudentsPage } from "./views/students.js";

let statsLoaded = false;

async function loadSidebarStats() {
  if (statsLoaded) return;
  statsLoaded = true;
  await Promise.all([getTeacherClasses(), getTeacherLessons()]);
  const el = $("#teacher-stats-text");
  if (el) {
    el.textContent = `${state.classes.length} classes · ${state.lessons.length} lessons`;
  }
}

export async function renderRoute() {
  if (!state.user) return;
  shell();
  loadSidebarStats(); // fire-and-forget, doesn't block page render
  const route = currentRoute();
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) =>
      a.classList.toggle("active", route.startsWith(`/${a.dataset.nav}`)),
    );
  try {
    if (route === "/dashboard") await renderDashboard();
    else if (route === "/lessons") await renderLibrary();
    else if (/^\/classes\/[^/]+\/students$/.test(route)) {
      await renderStudentsPage(route.split("/")[2]);
    } else if (/^\/classes\/[^/]+\/add-lesson$/.test(route)) {
      await renderAddLessonPage(route.split("/")[2]);
    } else if (route.startsWith("/classes/")) {
      await Promise.all([getTeacherLessons(), getAllLessons()]);
      await renderClass(route.split("/")[2]);
    } else navigate("/dashboard");
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