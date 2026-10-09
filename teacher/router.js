import { $, currentRoute, navigate, shell, empty } from "../js/helpers.js";
import { state, getTeacherLessons, getAllLessons, getTeacherClasses } from "../js/state.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderAccountSettings } from "./views/accountSettings.js";
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
  const classIdSegment = route.split("/")[2];
  let classId = null;
  if (classIdSegment) {
    try {
      classId = decodeURIComponent(classIdSegment);
    } catch {
      navigate("/dashboard");
      return;
    }
  }
  document
    .querySelectorAll("[data-nav]")
    .forEach((link) => {
      const section = link.dataset.nav;
      const isActive =
        section === "classes"
          ? route === "/dashboard" || route.startsWith("/classes/")
          : route.startsWith(`/${section}`);
      link.classList.toggle("active", isActive);
    });
  try {
    if (route === "/dashboard") await renderDashboard();
    else if (route === "/settings") await renderAccountSettings();
    else if (/^\/classes\/[^/]+\/students$/.test(route)) {
      await renderStudentsPage(classId);
    } else if (/^\/classes\/[^/]+\/add-lesson$/.test(route)) {
      await renderAddLessonPage(classId);
    } else if (route.startsWith("/classes/")) {
      await Promise.all([getTeacherLessons(), getAllLessons()]);
      await renderClass(classId);
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