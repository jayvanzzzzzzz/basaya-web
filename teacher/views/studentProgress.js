import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, navigate, page } from "../../js/helpers.js";
import { SKILLS, LEVELS } from "../../js/scoring.js";
import {
  loadClassContext,
  loadStudentProgress,
  completionOf,
  lecturesOf,
  studentRemarks,
} from "./progressData.js";
import {
  scoreRing,
  sparkline,
  remarkChip,
  trendBadge,
  scoreCell,
  remarksList,
  remarkLegend,
  skillIcon,
  relativeTime,
  initials,
} from "./progressUi.js";
import {
  addExportActions,
  printMeta,
  printSignature,
  downloadWorkbook,
  teacherName,
  today,
  fileName,
  dateStamp,
} from "./reportExport.js";

const STATUS = {
  done: ["done", "Finished"],
  "in-progress": ["progress", "In progress"],
  "not-started": ["idle", "Not started"],
  overdue: ["overdue", "Missed deadline"],
  scheduled: ["scheduled", "Not open yet"],
  "before-joining": ["before", "Closed before joining"],
};

// The student app saves gender in Filipino; the teacher portal is in English.
const GENDERS = { Lalaki: "Male", Babae: "Female", "Ayokong sabihin": "Prefer not to say" };

const notSet = (label) => `${label} <em class="progress-identity__empty">not set</em>`;

/** "2016-10-12" → "Oct 12, 2016 (9 yrs old)". */
function formatBirthdate(dob = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const born = new Date(year, month - 1, day);
  const today = new Date();
  const hadBirthday =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  const date = born.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return age >= 0 ? `${date} (${age} ${age === 1 ? "yr" : "yrs"} old)` : date;
}

function personalDetails(profile) {
  const gender = GENDERS[profile?.gender] || profile?.gender;
  const birthdate = formatBirthdate(profile?.dob);
  return [
    gender ? `<strong>${escapeHtml(gender)}</strong>` : notSet("Gender"),
    birthdate ? `Born <strong>${escapeHtml(birthdate)}</strong>` : notSet("Birthdate"),
  ].join(" · ");
}

const TRENDS = { UP: "Improving", DOWN: "Slipping", STEADY: "Steady" };

/** Explains a score from a part left unfinished at the deadline. */
const missedCell = (row, skill, cell) =>
  row.missed.includes(skill)
    ? cell.replace("<td ", '<td title="Not finished by the deadline: the items left undone count as wrong" ')
    : cell;

const dateOf = (millis) =>
  millis
    ? new Date(millis).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

/** Workbook: summary and skills, lesson breakdown, and words to practice. */
function exportStudentExcel({ classroom, student, profile, progress, joined }) {
  const completion = completionOf(progress);
  const lectures = lecturesOf(progress);
  const score = (value, skipped) => (skipped ? "Skipped" : value);

  return downloadWorkbook(
    `BaSaya Progress - ${fileName(student.name)} - ${fileName(classroom.className)} - ${dateStamp()}.xlsx`,
    [
      {
        name: "Summary",
        title: "Student Progress Report",
        meta: [
          ["Student", student.name],
          ["Class", classroom.className],
          ["Teacher", teacherName()],
          ["Gender", GENDERS[profile?.gender] || profile?.gender],
          ["Birthdate", formatBirthdate(profile?.dob)],
          ["Joined", joined],
          ["Lessons finished", `${completion.done} of ${completion.total}${completion.percent == null ? "" : ` (${completion.percent}%)`}`],
          ["Lectures finished", `${lectures.done} of ${lectures.total}`],
        ],
        tables: [
          {
            heading: "Skills",
            columns: [
              { header: "Skill", width: 18, bold: true },
              { header: "Score", type: "score", width: 11 },
              { header: "Remark", type: "remark", width: 18 },
              { header: "Trend", type: "center", width: 12 },
              { header: "Lessons", type: "number", width: 10 },
              { header: "Items", type: "number", width: 10 },
              { header: "Needs help", type: "center", width: 12 },
            ],
            rows: SKILLS.map((skill) => {
              const summary = progress.summary.skills[skill.key];
              return [
                skill.name,
                summary.score,
                summary.score == null ? null : LEVELS[summary.level].label,
                TRENDS[summary.trend],
                summary.lessons,
                summary.items,
                summary.needsHelp ? "Yes" : "No",
              ];
            }),
          },
        ],
      },
      {
        name: "Teacher notes",
        title: `Teacher notes — ${student.name}`,
        tables: [
          {
            columns: [
              { header: "Note", width: 34, bold: true, wrap: true },
              { header: "Details", width: 80, wrap: true },
            ],
            rows: studentRemarks(progress).map((note) => [note.title, note.text]),
          },
        ],
      },
      {
        name: "Lessons",
        title: `Lesson breakdown — ${student.name}`,
        meta: [["Scores", "First-try accuracy per activity"]],
        tables: [
          {
            freeze: 2,
            filter: true,
            columns: [
              { header: "No.", type: "number", width: 6 },
              { header: "Lesson", width: 34, bold: true, wrap: true },
              { header: "Status", type: "center", width: 20 },
              { header: "Due", type: "center", width: 14 },
              { header: "Lecture", type: "center", width: 10 },
              { header: "Vocabulary", type: "score", width: 13 },
              { header: "Word Recognition", type: "score", width: 17 },
              { header: "Pronunciation", type: "score", width: 13 },
              { header: "Comprehension", type: "score", width: 15 },
            ],
            rows: progress.perLesson.map((row) => [
              row.lesson.number,
              row.lesson.title,
              STATUS[row.status][1],
              dateOf(row.lesson.dueAt),
              row.lectureDone ? "Done" : null,
              score(row.skills.talasalitaan, row.lesson.gameSkipped),
              score(row.skills.pagkilala, row.lesson.activitySkipped),
              score(row.skills.pagbigkas),
              score(row.skills.pagsusulit),
            ]),
          },
        ],
      },
      {
        name: "Words to practice",
        title: `Words to practice (Pronunciation) — ${student.name}`,
        meta: [["Words", "Missed at least once in pronunciation practice"]],
        tables: [
          {
            columns: [
              { header: "Word", width: 24, bold: true },
              { header: "Times missed", type: "number", width: 14 },
            ],
            rows: progress.hardWords.map((item) => [item.word, item.count]),
          },
        ],
      },
    ],
  );
}

/** #/classes/{classId}/students/{studentId} — one student's progress, with remarks. */
export async function renderStudentProgress(classId, studentId) {
  const context = await loadClassContext(classId);
  if (!context) return navigate("/dashboard");
  const { classroom, lessons } = context;
  const student = context.students.find((item) => item.id === studentId);
  if (!student) return navigate(`/classes/${encodeURIComponent(classId)}/students`);

  const [progress, profile] = await Promise.all([
    loadStudentProgress(studentId, lessons, student.joinedAt),
    getDoc(doc(db, "users", studentId))
      .then((snap) => snap.data() || null)
      .catch(() => null),
  ]);
  const joined = student.joinedAt?.toDate?.().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  page(
    student.name,
    `${classroom.className}${joined ? ` · Joined ${joined}` : ""}`,
    `<button class="button secondary" id="back-to-students">← All students</button>
     <button class="button primary" id="open-class-report">Class Report</button>`,
  );
  $("#back-to-students").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/students`),
  );
  $("#open-class-report").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/report`),
  );

  if (progress.error) {
    $("#page-content").innerHTML = `<section class="card empty">
      <h3>Progress isn't available</h3>
      <p>${
        progress.error === "moved"
          ? "This student has joined another class, so their progress can't be shown here. You can remove them from this class on the Students page."
          : "We couldn't load this student's progress. Check your connection and try again."
      }</p>
    </section>`;
    return;
  }

  const completion = completionOf(progress);
  const lectures = lecturesOf(progress);
  const needsHelp = progress.summary.needsHelp;
  const remarks = studentRemarks(progress);

  addExportActions({
    excel: () => exportStudentExcel({ classroom, student, profile, progress, joined }),
  });

  const skillCards = SKILLS.map((skill, index) => {
    const summary = progress.summary.skills[skill.key];
    // The lecture has no score — show lectures finished like the app.
    if (skill.key === "pagUnawa" && summary.lessons === 0) {
      const percent = lectures.total ? Math.round((lectures.done * 100) / lectures.total) : null;
      return `<article class="skill-card" style="--skill:${skill.color}; --i:${index}">
        <header class="skill-card__head">
          <span class="skill-card__icon">${skillIcon(skill.key)}</span>
          <div><h3>${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.detail)}</p></div>
        </header>
        <div class="skill-card__meter">
          ${scoreRing(percent, { color: skill.color, label: `${lectures.done}/${lectures.total}`, sub: "lectures" })}
          <div class="skill-card__verdict">
            <span class="remark remark--info">Completion only</span>
            <small>No comprehension score yet</small>
          </div>
        </div>
        <footer class="skill-card__foot"><span>Lectures finished</span></footer>
      </article>`;
    }
    return `<article class="skill-card${summary.needsHelp ? " skill-card--alert" : ""}" style="--skill:${skill.color}; --i:${index}">
      ${summary.needsHelp ? '<span class="skill-card__flag">Needs help</span>' : ""}
      <header class="skill-card__head">
        <span class="skill-card__icon">${skillIcon(skill.key)}</span>
        <div><h3>${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.detail)}</p></div>
      </header>
      <div class="skill-card__meter">
        ${scoreRing(summary.score, { color: skill.color, unit: "" })}
        <div class="skill-card__verdict">
          ${remarkChip(summary.level)}
          ${trendBadge(summary.trend) || `<small>${summary.lessons ? "Trend after 3 lessons" : "No results yet"}</small>`}
        </div>
      </div>
      ${sparkline(summary.lessonScores, skill.color)}
      <footer class="skill-card__foot">
        <span>${summary.lessons} ${summary.lessons === 1 ? "lesson" : "lessons"} · ${summary.items} ${summary.items === 1 ? "item" : "items"}</span>
      </footer>
    </article>`;
  }).join("");

  const statusChip = (status) => {
    const [key, label] = STATUS[status];
    return `<span class="status-chip status-chip--${key}">${label}</span>`;
  };

  const lessonRows = progress.perLesson
    .map(
      (row) => `<tr>
        <td><span class="lesson-index">${String(row.lesson.number).padStart(2, "0")}</span></td>
        <td class="lesson-name">${escapeHtml(row.lesson.title)}</td>
        <td>${statusChip(row.status)}</td>
        <td class="score-cell ${row.lectureDone ? "score-cell--check" : "score-cell--empty"}">${row.lectureDone ? "✓" : "—"}</td>
        ${missedCell(row, "talasalitaan", scoreCell(row.skills.talasalitaan, { skipped: row.lesson.gameSkipped }))}
        ${missedCell(row, "pagkilala", scoreCell(row.skills.pagkilala, { skipped: row.lesson.activitySkipped }))}
        ${missedCell(row, "pagbigkas", scoreCell(row.skills.pagbigkas))}
        ${missedCell(row, "pagsusulit", scoreCell(row.skills.pagsusulit))}
      </tr>`,
    )
    .join("");

  $("#page-content").innerHTML = `
    <div class="progress-page">
      ${printMeta("Student Progress Report", [
        classroom.className,
        `Teacher: ${teacherName()}`,
        `Printed ${today()}`,
      ])}
      <section class="progress-overview">
        <article class="progress-identity">
          <span class="progress-identity__avatar">${escapeHtml(initials(student.name))}</span>
          <div>
            <h2>${escapeHtml(student.name)}</h2>
            <p>Last active · <strong>${escapeHtml(relativeTime(progress.lastActive))}</strong></p>
            <p class="progress-identity__details">${personalDetails(profile)}</p>
          </div>
        </article>
        <article class="progress-stat">
          ${scoreRing(completion.percent, { color: "#24994a", size: 76, stroke: 8, label: `${completion.done}/${completion.total}` })}
          <div><strong>Lessons finished</strong><span>${completion.total ? `${completion.percent}% of open lessons` : "No lessons open yet"}</span></div>
        </article>
        <article class="progress-stat${needsHelp.length ? " progress-stat--alert" : ""}">
          <span class="progress-stat__big">${needsHelp.length}</span>
          <div><strong>${needsHelp.length === 1 ? "Skill needs" : "Skills need"} help</strong>
            <span>${needsHelp.length ? needsHelp.map((key) => SKILLS.find((skill) => skill.key === key).name).join(", ") : "Nothing flagged right now"}</span>
          </div>
        </article>
      </section>

      <section class="progress-section">
        <div class="progress-section__head">
          <div><span class="eyebrow">Skills</span><h2>How they're doing</h2></div>
          ${remarkLegend()}
        </div>
        <div class="skill-grid">${skillCards}</div>
      </section>

      <div class="progress-columns">
        <section class="progress-section progress-panel">
          <div class="progress-section__head"><div><span class="eyebrow">Remarks</span><h2>Teacher notes</h2></div></div>
          ${remarksList(remarks)}
        </section>
        <section class="progress-section progress-panel">
          <div class="progress-section__head"><div><span class="eyebrow">Pronunciation</span><h2>Words to practice</h2></div></div>
          ${
            progress.hardWords.length
              ? `<div class="word-chips">${progress.hardWords
                  .map(
                    (item, index) =>
                      `<span class="word-chip" style="--i:${index}">${escapeHtml(item.word)}${item.count > 1 ? `<b>×${item.count}</b>` : ""}</span>`,
                  )
                  .join("")}</div>
                <p class="progress-panel__hint">Words missed at least once in pronunciation practice.</p>`
              : '<p class="progress-panel__empty">No difficult words recorded yet.</p>'
          }
        </section>
      </div>

      <section class="progress-section progress-panel">
        <div class="progress-section__head">
          <div><span class="eyebrow">Lesson by lesson</span><h2>Lesson breakdown</h2></div>
          <span class="progress-section__note">First-try accuracy per activity</span>
        </div>
        ${
          lessons.length
            ? `<div class="progress-table-wrap"><table class="progress-table">
                <thead><tr>
                  <th scope="col">#</th><th scope="col">Lesson</th><th scope="col">Status</th>
                  <th scope="col">Lecture</th><th scope="col">Vocabulary</th><th scope="col">Word Recognition</th>
                  <th scope="col">Pronunciation</th><th scope="col">Comprehension</th>
                </tr></thead>
                <tbody>${lessonRows}</tbody>
              </table></div>`
            : '<p class="progress-panel__empty">No lessons assigned to this class yet.</p>'
        }
      </section>
      ${printSignature()}
    </div>`;
}

