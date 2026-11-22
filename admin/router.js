import { $, currentRoute, navigate, shell, empty, page } from "../js/helpers.js";
import { beginRoute } from "../js/route-lifecycle.js";
import { beginPageLoading, routeLoadingInfo, prepareLoadingHeader } from '../js/page-loading.js';
import { state } from "../js/state.js";
import { renderTeachers } from "./views/teachers.js";
import { renderStudents } from "./views/students.js";
import { renderClasses } from "./views/classes.js";
import { renderLessonWorkspace } from '../js/lessonWorkspace.js';
import { canLeaveLessons } from '../js/lessonNavigation.js';
import { renderAccount } from "./views/account.js";
import { renderDictionary } from "../teacher/views/dictionary.js";
import { refreshDeletionBadge } from "./views/classDeletion.js";
import { renderAdminDashboard } from "./views/dashboard.js";
import { renderHandbook, leaveHandbook } from '../js/handbook.js';

export async function renderRoute() {
  if (!await canLeaveLessons(state.user?.uid || null)) return;
  const isCurrent = beginRoute();
  leaveHandbook();
  if (!state.user) return;
  shell("admin-summary", "Admin");
  const route = currentRoute();
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = route.startsWith(`/${a.dataset.nav}`);
    a.classList.toggle("active", active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const [title, kind] = routeLoadingInfo(route, 'admin');
  const finishLoading = beginPageLoading(route, `admin:${state.user.uid}`, kind);
  page(title, "");
  prepareLoadingHeader(kind);
  let success = true;
  try {
    if (route === "/dashboard") await renderAdminDashboard();
    else if (route === "/teachers") await renderTeachers();
    else if (route === "/students") await renderStudents();
    else if (route === "/classes") await renderClasses();
    else if (route === "/lessons") await renderLessonWorkspace();
    else if (route === "/dictionary") await renderDictionary();
    else if (route === "/handbook") renderHandbook("admin");
    else if (route === "/settings") renderAccount();
    else navigate("/dashboard");
    // Keep the "All classes" badge (pending deletion requests) current on every page.
    if (isCurrent() && route !== "/classes") refreshDeletionBadge();
  } catch (error) {
    success = false;
    if (!isCurrent()) return;
    console.error(error);
    $("#page-content").innerHTML = empty("Something needs attention", "We could not load this page. Check your Firebase configuration and Firestore rules, then try again.", "Try again", "retry");
    $("#retry")?.addEventListener("click", renderRoute);
  } finally {
    if (isCurrent()) finishLoading(success);
  }
}
