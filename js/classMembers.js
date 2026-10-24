import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeHtml, initials, openModal } from "./helpers.js";
import { teacherName } from "./chat.js?v=teacher-title"; // ?v: every import uses the same ?v so they share one copy

// "Class members": the info (i) button in the class chat header, on the teacher side
// (teacher/views/messages.js) and the student side (student/views/chat.js); the Android app
// has the same sheet (ChatFragment). The teacher sits on top, then the students A–Z, and the
// signed-in account is tagged. Styles: css/components/class-members.css.

export const LABELS = {
  en: {
    eyebrow: "Class members",
    members: (count) => `${count} ${count === 1 ? "member" : "members"}`,
    teacher: "Teacher",
    teacherRole: "Class adviser",
    students: "Students",
    you: "You",
    noTeacher: "No assigned teacher yet",
    noTeacherBody: "The school admin will assign a teacher to this class.",
    noStudents: "No students have joined yet.",
    search: "Search students",
    noMatch: (text) => `No student matches “${text}”.`,
    failed: "Couldn't load the members. Check your connection and try again.",
    button: "Class Members",
  },
  fil: {
    eyebrow: "Mga miyembro",
    members: (count) => `${count} miyembro`,
    teacher: "Guro",
    teacherRole: "Guro ng klase",
    students: "Mga mag-aaral",
    you: "Ikaw",
    noTeacher: "Wala pang nakatalagang guro",
    noTeacherBody: "Ang admin ng paaralan ang magtatalaga ng guro sa klaseng ito.",
    noStudents: "Wala pang sumasali sa klase.",
    search: "Hanapin ang kaklase",
    noMatch: (text) => `Walang tumugma sa “${text}”.`,
    failed: "Hindi ma-load ang mga miyembro. Tingnan ang internet.",
    button: "Mga miyembro ng klase",
  },
};

const ICONS = {
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" />',
  teacher: '<path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" /><path d="M7 11v4.2c0 .9 2.2 2.3 5 2.3s5-1.4 5-2.3V11" /><path d="M21 9v5" />',
  noTeacher: '<circle cx="10" cy="8" r="3.6" /><path d="M3.5 19.5a6.5 6.5 0 0 1 10.3-5.3" /><path d="m16 15 5 5m0-5-5 5" />',
  students: '<circle cx="9" cy="8.5" r="3.3" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M15.5 5.4a3.3 3.3 0 0 1 0 6.2M17.5 14.2A6 6 0 0 1 21 19" />',
  search: '<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** The (i) button for a chat header. */
export const membersButton = (labels) =>
  `<button type="button" class="chat-info" data-members aria-haspopup="dialog" aria-label="${escapeHtml(labels.button)}">${svg("info")}<span class="chat-info__tip" aria-hidden="true">${escapeHtml(labels.button)}</span></button>`;

/** A stable hue per name, so each person keeps their avatar color (same as the chat). */
const hueOf = (text) => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

/** "Singca, Jay Vanz" → "JS" (first name, then surname); other names as usual. */
function personInitials(name) {
  const [last, first] = name.split(",").map((part) => part.trim());
  return first ? `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() : initials(name);
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** "Ñ" and "É" file under N and E; anything that isn't a letter goes under "#". */
const letterOf = (name) => {
  const first = name.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
};

/**
 * The class's teacher and students (A–Z). Students are on the roster as "Last, First";
 * the teacher's one display name is shown the same way. A class whose teacher account
 * is missing (removed by the admin) has no teacher.
 */
export async function loadClassMembers(classId) {
  const [classSnap, rosterSnap] = await Promise.all([
    getDoc(doc(db, "classes", classId)),
    getDocs(collection(db, "classes", classId, "students")),
  ]);

  let teacher = null;
  const teacherId = classSnap.get("teacherId");
  if (teacherId) {
    try {
      const teacherSnap = await getDoc(doc(db, "users", teacherId));
      if (teacherSnap.exists() && teacherSnap.get("role") === "teacher") {
        teacher = { id: teacherId, name: teacherName(teacherSnap.get("displayName") || "", teacherSnap.get("title")) || "Teacher" };
      }
    } catch (error) {
      console.warn("Couldn't read the class's teacher", error);
    }
  }

  const students = rosterSnap.docs
    .map((snap) => ({ id: snap.id, name: (snap.get("fullName") || "").trim().replace(/^,\s*|,\s*$/g, "") }))
    .map((student) => ({ ...student, name: student.name || "—" }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { teacher, students };
}

const youTag = (labels) => `<span class="cm-you">${escapeHtml(labels.you)}</span>`;

function teacherHtml(teacher, meId, labels) {
  if (!teacher) {
    return `<div class="cm-teacher is-empty">
      <span class="cm-teacher__icon">${svg("noTeacher")}</span>
      <span class="cm-teacher__text">
        <strong>${escapeHtml(labels.noTeacher)}</strong>
        <span>${escapeHtml(labels.noTeacherBody)}</span>
      </span>
    </div>`;
  }
  const me = teacher.id === meId;
  return `<div class="cm-teacher${me ? " is-me" : ""}">
    <span class="cm-teacher__avatar" style="--h:${hueOf(teacher.name)}">${escapeHtml(personInitials(teacher.name))}<i>${svg("teacher")}</i></span>
    <span class="cm-teacher__text">
      <strong><span class="cm-name">${escapeHtml(teacher.name)}</span>${me ? youTag(labels) : ""}</strong>
      <span>${escapeHtml(labels.teacherRole)}</span>
    </span>
  </div>`;
}

function studentsHtml(students, meId, labels, filter = "") {
  if (!students.length) {
    return `<li class="cm-empty">${svg("students")}<span>${escapeHtml(labels.noStudents)}</span></li>`;
  }
  const needle = filter.trim().toLocaleLowerCase();
  const shown = needle ? students.filter((student) => student.name.toLocaleLowerCase().includes(needle)) : students;
  if (!shown.length) {
    return `<li class="cm-empty">${svg("search")}<span>${escapeHtml(labels.noMatch(filter.trim()))}</span></li>`;
  }
  let letter = "";
  return shown
    .map((student) => {
      const me = student.id === meId;
      const nextLetter = letterOf(student.name);
      const divider = nextLetter !== letter ? `<li class="cm-letter" aria-hidden="true">${(letter = nextLetter)}</li>` : "";
      return `${divider}<li class="cm-row${me ? " is-me" : ""}">
        <span class="cm-row__avatar" style="--h:${hueOf(student.name)}" aria-hidden="true">${escapeHtml(personInitials(student.name))}</span>
        <span class="cm-name">${escapeHtml(student.name)}</span>
        ${me ? youTag(labels) : ""}
      </li>`;
    })
    .join("");
}

const skeleton = (rows) =>
  Array.from({ length: rows }, () => '<li class="cm-row is-skeleton" aria-hidden="true"><span class="cm-row__avatar"></span><span class="cm-bar"></span></li>').join("");

/** Opens the members dialog for a class. `meId` is the signed-in account. */
export function openClassMembers({ classId, className, meId, labels = LABELS.en }) {
  const name = className || "—";
  openModal(
    `<div class="cm">
      <header class="cm-head">
        <span class="cm-head__tile" style="--h:${hueOf(name)}" aria-hidden="true">${escapeHtml(initials(name))}</span>
        <span class="cm-head__text">
          <span class="cm-eyebrow">${escapeHtml(labels.eyebrow)}</span>
          <h2 id="cm-title">${escapeHtml(name)}</h2>
          <span class="cm-head__meta" data-cm-count>&nbsp;</span>
        </span>
      </header>

      <section class="cm-section" aria-labelledby="cm-teacher-label">
        <h3 class="cm-label" id="cm-teacher-label">${escapeHtml(labels.teacher)}</h3>
        <div data-cm-teacher><div class="cm-teacher is-skeleton" aria-hidden="true"><span class="cm-teacher__avatar"></span><span class="cm-bar"></span></div></div>
      </section>

      <section class="cm-section" aria-labelledby="cm-students-label">
        <div class="cm-label-row">
          <h3 class="cm-label" id="cm-students-label">${escapeHtml(labels.students)}</h3>
          <span class="cm-badge" data-cm-student-count hidden></span>
        </div>
        <label class="cm-search" data-cm-search hidden>
          ${svg("search")}
          <input type="search" placeholder="${escapeHtml(labels.search)}…" aria-label="${escapeHtml(labels.search)}" autocomplete="off" />
        </label>
        <ol class="cm-list" data-cm-students aria-live="polite">${skeleton(5)}</ol>
      </section>
    </div>`,
    async (backdrop, close) => {
      const modal = backdrop.querySelector(".modal");
      modal.classList.add("cm-modal");
      modal.setAttribute("aria-labelledby", "cm-title");
      const onKey = (event) => {
        if (event.key === "Escape") close();
      };
      document.addEventListener("keydown", onKey);
      new MutationObserver((_, observer) => {
        if (!backdrop.isConnected) {
          observer.disconnect();
          document.removeEventListener("keydown", onKey);
        }
      }).observe(document.body, { childList: true });
      backdrop.querySelector(".modal-close").focus();

      const $ = (selector) => backdrop.querySelector(selector);
      try {
        const { teacher, students } = await loadClassMembers(classId);
        if (!backdrop.isConnected) return;
        $("[data-cm-teacher]").innerHTML = teacherHtml(teacher, meId, labels);
        $("[data-cm-count]").textContent = labels.members(students.length + (teacher ? 1 : 0));
        const count = $("[data-cm-student-count]");
        count.hidden = false;
        count.textContent = String(students.length);
        const list = $("[data-cm-students]");
        list.innerHTML = studentsHtml(students, meId, labels);
        if (students.length > 8) {
          const search = $("[data-cm-search]");
          search.hidden = false;
          search.querySelector("input").addEventListener("input", (event) => {
            list.innerHTML = studentsHtml(students, meId, labels, event.target.value);
          });
        }
      } catch (error) {
        console.error("Class members failed to load", error);
        if (!backdrop.isConnected) return;
        $("[data-cm-teacher]").innerHTML = "";
        $("[data-cm-count]").textContent = "";
        $("[data-cm-students]").innerHTML = `<li class="cm-empty">${svg("students")}<span>${escapeHtml(labels.failed)}</span></li>`;
      }
    },
  );
}
