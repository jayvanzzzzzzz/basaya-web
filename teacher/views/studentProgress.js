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
  remarkChip,
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
import { watchTeacherTooltips } from './classActions.js';
import { paginate } from '../../js/pagination.js';

const reportIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 15v3M12 12v6M16 14v4"/></svg>';
const meter = (value, label) => `<span class="sp-meter" role="img" aria-label="${escapeHtml(label)}"><i style="width:${value == null ? 0 : Math.max(0, Math.min(100, value))}%"></i></span>`;

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

const SKILL_PARTS = { talasalitaan: 'game', pagkilala: 'activity', pagbigkas: 'pronunciation', pagsusulit: 'quiz' };
// Completion flags are independent of scores: missed deadlines can have scores,
// while a submitted recording can be finished but still awaiting a grade.
function skillCompletion(progress, key) {
  const rows = progress.perLesson.filter(row =>
    row.status !== 'scheduled' && row.status !== 'before-joining' &&
    !(key === 'talasalitaan' && row.lesson.gameSkipped) &&
    !(key === 'pagkilala' && row.lesson.activitySkipped));
  const done = rows.filter(row => row.parts.parts[SKILL_PARTS[key]] === true).length;
  return { done, total: rows.length, notStarted: rows.length > 0 && rows.every(row => row.status === 'not-started') };
}

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
    "Student progress",
    `Learning record for ${classroom.className}`,
    `<button class="button secondary sp-action" id="open-class-report" type="button" aria-label="Class report" data-teacher-tooltip data-floating-tooltip="Class report">${reportIcon}</button>`,
    {
      crumbs: [
        { label: "Classrooms", href: "#/dashboard" },
        { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
        { label: "Students", href: `#/classes/${encodeURIComponent(classId)}/students` },
      ],
    },
  );
  $("#open-class-report").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/report`),
  );

  if (progress.error) {
    $("#page-content").innerHTML = `<div class="student-progress-workspace"><section class="sp-unavailable" role="status">
      <h3>Progress isn't available</h3>
      <p>${
        progress.error === "moved"
          ? "This student has joined another class, so their progress can't be shown here. You can remove them from this class on the Students page."
          : "We couldn't load this student's progress. Check your connection and try again."
      }</p>
    </section></div>`;
    watchTeacherTooltips();
    return;
  }

  const completion = completionOf(progress);
  const lectures = lecturesOf(progress);
  const needsHelp = progress.summary.needsHelp;
  const remarks = studentRemarks(progress);

  addExportActions({
    iconOnly: true,
    excel: () => exportStudentExcel({ classroom, student, profile, progress, joined }),
  });
  document.querySelectorAll('#print-report, #export-excel').forEach(button => {
    button.classList.add('sp-action');
    button.setAttribute('data-teacher-tooltip', '');
    button.dataset.floatingTooltip = button.getAttribute('aria-label');
  });
  watchTeacherTooltips();

  const skillRows = SKILLS.map((skill) => {
    const summary = progress.summary.skills[skill.key];
    // The lecture has no score — show lectures finished like the app.
    if (skill.key === "pagUnawa" && summary.lessons === 0) {
      const percent = lectures.total ? Math.round((lectures.done * 100) / lectures.total) : null;
      return `<tr class="sp-skill-row sp-skill-row--lecture">
        <th scope="row"><div class="sp-skill-identity"><span class="sp-skill-icon">${skillIcon(skill.key)}</span><div><strong>${escapeHtml(skill.name)}</strong><small>${lectures.done} of ${lectures.total} open lectures completed</small></div></div></th>
        <td><div class="sp-score"><strong>${lectures.done}<small> / ${lectures.total}</small></strong>${meter(percent, percent == null ? 'No lectures open yet' : `${percent}% of lectures finished`)}</div></td>
        <td><span class="remark remark--info">Completion only</span><small class="sp-cell-note">Lectures are not scored.</small></td>
      </tr>`;
    }
    const completion = skillCompletion(progress, skill.key);
    const awaitingResults = summary.score == null && completion.done > 0;
    const emptyLabel = awaitingResults ? 'Awaiting results' : completion.notStarted ? 'Not started' : 'No results yet';
    const assessment = summary.score == null
      ? `<span class="remark remark--no-data">${completion.total ? emptyLabel : 'No open activities'}</span>`
      : remarkChip(summary.level);
    return `<tr class="sp-skill-row" data-skill="${skill.key}">
      <th scope="row"><div class="sp-skill-identity"><span class="sp-skill-icon">${skillIcon(skill.key)}</span><div><strong>${escapeHtml(skill.name)}</strong><small>${completion.total ? `${completion.done} of ${completion.total} open ${completion.total === 1 ? 'activity' : 'activities'} completed` : 'No open activities'}</small></div></div></th>
      <td><div class="sp-score${summary.score == null ? ' sp-score--empty' : ''}"><strong>${summary.score == null ? '—' : `${summary.score}<small>%</small>`}</strong>${summary.score == null ? `<small>${completion.total ? emptyLabel : 'No results yet'}</small>` : meter(summary.score, `${summary.score}% first-try accuracy`)}</div></td>
      <td>${assessment}${summary.needsHelp ? '<span class="sp-help-flag">Needs help</span>' : ''}</td>
    </tr>`;
  }).join("");

  const statusChip = (status) => {
    const [key, label] = STATUS[status];
    return `<span class="status-chip status-chip--${key}">${label}</span>`;
  };

  const lessonRows = progress.perLesson
    .map(
      (row) => `<tr>
        <td><span class="lesson-index">${String(row.lesson.number).padStart(2, "0")}</span></td>
        <th scope="row" class="lesson-name">${escapeHtml(row.lesson.title)}</th>
        <td>${statusChip(row.status)}</td>
        <td class="score-cell ${row.lectureDone ? "score-cell--check" : "score-cell--empty"}"><span aria-hidden="true">${row.lectureDone ? "✓" : "—"}</span><span class="sr-only">${row.lectureDone ? 'Lecture finished' : 'Lecture not finished'}</span></td>
        ${missedCell(row, "talasalitaan", scoreCell(row.skills.talasalitaan, { skipped: row.lesson.gameSkipped }))}
        ${missedCell(row, "pagkilala", scoreCell(row.skills.pagkilala, { skipped: row.lesson.activitySkipped }))}
        ${missedCell(row, "pagbigkas", scoreCell(row.skills.pagbigkas))}
        ${missedCell(row, "pagsusulit", scoreCell(row.skills.pagsusulit))}
      </tr>`,
    )
    .join("");

  $("#page-content").innerHTML = `
    <div class="progress-page student-progress-workspace">
      ${printMeta("Student Progress Report", [
        classroom.className,
        `Teacher: ${teacherName()}`,
        `Printed ${today()}`,
      ])}
      <section class="progress-overview">
        <article class="progress-identity">
          <span class="progress-identity__avatar" aria-hidden="true">${escapeHtml(initials(student.name))}</span>
          <div>
            <h2>${escapeHtml(student.name)}</h2>
            ${joined ? `<p class="sp-joined">Joined ${escapeHtml(joined)}</p>` : ''}
            <p>Last active · <strong>${escapeHtml(relativeTime(progress.lastActive))}</strong></p>
            <p class="progress-identity__details">${personalDetails(profile)}</p>
          </div>
        </article>
        <article class="progress-stat">
          <div><span class="sp-stat-label">Lessons finished</span><strong class="sp-stat-value">${completion.done}<small> / ${completion.total}</small></strong>${meter(completion.percent, `${completion.done} of ${completion.total} open lessons finished`)}<span>${completion.total ? `${completion.percent}% of open lessons` : "No lessons open yet"}</span></div>
        </article>
        <article class="progress-stat${needsHelp.length ? " progress-stat--alert" : ""}">
          <div><span class="sp-stat-label">${needsHelp.length === 1 ? "Skill needs" : "Skills need"} help</span><strong class="sp-stat-value">${needsHelp.length}</strong>
            <span>${needsHelp.length ? needsHelp.map((key) => SKILLS.find((skill) => skill.key === key).name).join(", ") : "Nothing flagged right now"}</span>
          </div>
        </article>
      </section>

      <section class="progress-section progress-panel sp-skills" aria-labelledby="sp-skills-title">
        <div class="progress-section__head">
          <div><span class="eyebrow">Learning profile</span><h2 id="sp-skills-title">Skill performance</h2><p class="sp-section-description">Accuracy and assessment, supported by lesson evidence.</p></div>
        </div>
        <p class="sp-scroll-hint">Scroll across to compare all skill details.</p>
        <div class="sp-table-wrap" role="region" aria-label="Skill performance" tabindex="0"><table class="sp-skill-table"><caption class="sr-only">Skill results; lecture measures completion only. Missing results are not failing scores.</caption><thead><tr><th scope="col">Skill &amp; evidence</th><th scope="col">Current result</th><th scope="col">Assessment</th></tr></thead><tbody>${skillRows}</tbody></table></div>
        <div class="sp-legend">${remarkLegend()}<p>Results reflect recorded work and may change as more activities are completed. — means no result recorded; missing results are not failing scores.</p><p>Completion counts open activities, excluding skipped activities and lessons closed before joining. Missed deadlines may contribute scores without completed work. A remark may require more lesson evidence.</p></div>
      </section>

        <section class="progress-section progress-panel">
          <div class="progress-section__head"><div><span class="eyebrow">Remarks</span><h2>Teacher notes</h2></div></div>
          ${remarksList(remarks)}
        </section>

      <section class="progress-section progress-panel">
        <div class="progress-section__head">
          <div><span class="eyebrow">Lesson by lesson</span><h2>Lesson breakdown</h2></div>
          <span class="progress-section__note">First-try accuracy per activity</span>
        </div>
        ${
          lessons.length
            ? `<p class="sp-scroll-hint">Scroll across to see every activity result.</p><div class="progress-table-wrap" role="region" aria-label="Lesson breakdown" tabindex="0"><table class="progress-table">
                <caption class="sr-only">First-try accuracy by lesson and activity</caption>
                <thead><tr>
                  <th scope="col">#</th><th scope="col">Lesson</th><th scope="col">Status</th>
                  <th scope="col">Lecture</th><th scope="col">Vocabulary</th><th scope="col">Word Recognition</th>
                  <th scope="col">Pronunciation</th><th scope="col">Comprehension</th>
                </tr></thead>
                <tbody>${lessonRows}</tbody>
              </table></div><p class="sp-table-key">— No result recorded · Skipped activities are not scored. Unfinished items after a deadline count as wrong.</p>`
            : '<p class="progress-panel__empty">No lessons assigned to this class yet.</p>'
        }
      </section>
      ${printSignature()}
    </div>`;

  if (progress.perLesson.length) {
    const labelPagination = () => {
      document.querySelectorAll('.student-progress-workspace .pagination__button--nav').forEach(button => {
        button.setAttribute('data-teacher-tooltip', '');
        button.dataset.floatingTooltip = button.getAttribute('aria-label');
      });
    };
    paginate({
      rows: () => [...document.querySelectorAll('.student-progress-workspace .progress-table tbody tr')],
      after: $('.student-progress-workspace .progress-table-wrap'),
      label: ['lesson', 'lessons'],
      pageSizes: Array.from({ length: Math.max(5, Math.ceil(progress.perLesson.length / 5)) }, (_, index) => (index + 1) * 5),
      onChange: labelPagination,
    });
    labelPagination();
  }
}

