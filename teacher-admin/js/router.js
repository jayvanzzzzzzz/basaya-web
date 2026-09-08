import { $, currentRoute, navigate, shell, empty } from "./helpers.js";
import { state, getTeacherLessons, getAllLessons } from "./state.js";
import { renderDashboard } from "./dashboard.js";
import { renderLibrary } from "./lessons.js";
import { renderClass } from "./classPage.js";
import { renderAddLessonPage } from "./addLesson.js";
import { renderStudentsPage } from "./students.js";

export async function renderRoute() {
  if (!state.user) return;
  shell();
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