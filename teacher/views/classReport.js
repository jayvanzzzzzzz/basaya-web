import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, navigate, page } from "../../js/helpers.js";
import { SKILLS, LEVELS } from "../../js/scoring.js";
import { paginate } from "../../js/pagination.js";
import {
  loadClassContext,
  loadStudentProgress,
  completionOf,
  lecturesOf,
  classReport,
  classRemarks,
  itemAnalysis,
  RETEACH_THRESHOLD,
} from "./progressData.js";
import {
  remarkChip,
  scoreCell,
  remarksList,
  remarkLegend,
  skillIcon,
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

const DISTRIBUTION = [
  ["very-good", "Very good"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor"],
  ["no-data", "Not enough data"],
];

// The student app saves gender in Filipino; reports are in English.
const SEX = { Lalaki: "Male", Babae: "Female", "Ayokong sabihin": "Prefer not to say" };

/** Item analysis rows for Excel: every lesson's quiz questions and pronunciation words, hardest first. */
function itemAnalysisRows(analysis) {
  const rows = (lesson, kind, part) =>
    part.students
      ? part.items.map((item) => [
          `${lesson.number}. ${lesson.title}`,
          kind,
          item.text,
          item.missed,
          part.students,
          item.percent,
          item.reteach ? "Re-teach" : "",
        ])
      : [];
  return analysis.flatMap(({ lesson, quiz, words }) => [
    ...rows(lesson, "Quiz question", quiz),
    ...rows(lesson, "Pronunciation word", words),
  ]);
}

/** Workbook: every student's scores (alphabetical, for class records), then the class averages. */
async function exportClassExcel(classroom, entries, report, analysis) {
  // Gender lives on the student's profile; only read it when an export is asked for.
  const profiles = await Promise.all(
    entries.map(({ student }) =>
      getDoc(doc(db, "users", student.id))
        .then((snap) => snap.data() || null)
        .catch(() => null),
    ),
  );

  // The lecture has no score, so it shows lectures finished (like the table on screen).
  const scoredSkills = SKILLS.filter((skill) => skill.key !== "pagUnawa");

  const studentRows = entries.map(({ student, progress }, index) => {
    const gender = profiles[index]?.gender;
    const start = [index + 1, student.name, SEX[gender] || gender];
    if (progress.error) {
      const blanks = Array(4 + scoredSkills.length * 2).fill(null);
      return [...start, ...blanks, progress.error === "moved" ? "Moved to another class" : "Progress not available"];
    }
    const completion = completionOf(progress);
    const lectures = lecturesOf(progress);
    return [
      ...start,
      `${completion.done} of ${completion.total}`,
      completion.percent,
      `${lectures.done} of ${lectures.total}`,
      ...scoredSkills.flatMap((skill) => {
        const summary = progress.summary.skills[skill.key];
        return [summary.score, summary.score == null ? null : LEVELS[summary.level].label];
      }),
      progress.summary.needsHelp.map((key) => SKILLS.find((skill) => skill.key === key).name).join(", "),
      progress.hasData ? "" : "No activity yet",
    ];
  });

  const overall =
    report.overall == null ? null : `${report.overall}% (${report.overallRemark.label})`;

  await downloadWorkbook(`BaSaya Class Report - ${fileName(classroom.className)} - ${dateStamp()}.xlsx`, [
    {
      name: "Students",
      title: "Class Report",
      meta: [
        ["Class", classroom.className],
        ["Teacher", teacherName()],
        ["Date", today()],
        ["Students", entries.length],
        ["Overall class score", overall],
        ["Lessons finished", report.completion == null ? null : `${report.completion}%`],
      ],
      tables: [
        {
          heading: "Students",
          freeze: 2,
          filter: true,
          columns: [
            { header: "No.", type: "number", width: 6 },
            { header: "Student", width: 30, bold: true },
            { header: "Gender", type: "center", width: 11 },
            { header: "Lessons finished", type: "center", width: 12 },
            { header: "Completion", type: "percent", width: 12 },
            { header: "Lecture", type: "center", width: 13 },
            ...scoredSkills.flatMap((skill) => [
              { header: skill.name, type: "score", width: 17 },
              { header: `${skill.name} remark`, type: "remark", width: 20 },
            ]),
            { header: "Needs help in", width: 24, wrap: true },
            { header: "Note", width: 22 },
          ],
          rows: studentRows,
        },
      ],
    },
    {
      name: "Skill averages",
      title: "Class average per skill",
      meta: [["Class", classroom.className]],
      tables: [
        {
          columns: [
            { header: "Skill", width: 18, bold: true },
            { header: "Class average", type: "score", width: 12 },
            { header: "Remark", type: "remark", width: 16 },
            { header: "Students with results", type: "number", width: 13 },
            ...DISTRIBUTION.map(([, label]) => ({ header: label, type: "number", width: 11 })),
            { header: "Needs help", type: "number", width: 11 },
          ],
          rows: report.skills.map((skill) => [
            skill.name,
            skill.average,
            skill.average == null ? null : skill.remark.label,
            skill.scoredStudents,
            ...DISTRIBUTION.map(([key]) => skill.distribution[key]),
            skill.needsHelp.length,
          ]),
        },
      ],
    },
    {
      name: "Item analysis",
      title: "What to re-teach",
      meta: [
        ["Class", classroom.className],
        ["Re-teach", `Missed by ${RETEACH_THRESHOLD}% of students or more`],
      ],
      tables: [
        {
          freeze: 1,
          filter: true,
          columns: [
            { header: "Lesson", width: 26, wrap: true },
            { header: "Item", width: 14 },
            { header: "Question / word", width: 50, wrap: true, bold: true },
            { header: "Students who missed", type: "number", width: 12 },
            { header: "Students counted", type: "number", width: 12 },
            { header: "Missed", type: "percent", width: 10 },
            { header: "Flag", type: "center", width: 11 },
          ],
          rows: itemAnalysisRows(analysis),
        },
      ],
    },
  ]);
}

// ---------- What to re-teach ----------

const ALL_LESSONS_LIMIT = 10;

/** One ranked list (quiz questions or words). In "All lessons" each item names its lesson. */
function itemList(items, showLesson) {
  return `<ol class="ia-list">${items
    .map(
      (item) => `<li class="ia-item${item.reteach ? " ia-item--reteach" : ""}">
        <div class="ia-item__text">
          <span>${escapeHtml(item.text)}</span>
          ${showLesson ? `<small>Lesson ${item.lesson.number} · ${escapeHtml(item.lesson.title)}</small>` : ""}
          ${item.current ? "" : "<small>No longer in the lesson</small>"}
        </div>
        <div class="ia-item__stat" title="${item.missed} of ${item.students} students missed this">
          <span class="ia-bar" aria-hidden="true"><i style="width:${item.percent}%"></i></span>
          <b>${item.percent}%</b>
          <small>${item.missed} of ${item.students}</small>
        </div>
        ${item.reteach ? '<span class="rp-tag">Re-teach</span>' : '<span aria-hidden="true"></span>'}
      </li>`,
    )
    .join("")}</ol>`;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The quiz and word columns for one lesson, or the hardest items of every lesson. */
function itemAnalysisBody(analysis, lessonId, scopeLabel) {
  const all = !lessonId;
  const selected = all ? analysis : analysis.filter((entry) => entry.lesson.id === lessonId);
  const collect = (part) =>
    selected
      .filter((entry) => entry[part].students > 0)
      .flatMap((entry) =>
        entry[part].items.map((item) => ({ ...item, lesson: entry.lesson, students: entry[part].students })),
      )
      .sort((a, b) => b.percent - a.percent || b.missed - a.missed);
  const sum = (part, field) => selected.reduce((total, entry) => total + entry[part][field], 0);
  const quizItems = collect("quiz");
  const wordItems = collect("words");

  const notes = (part, noun) => {
    const lines = [];
    const missed = sum(part, "missedDeadline");
    if (missed && !all) {
      lines.push(`${plural(missed, "student", "students")} didn't finish by the deadline: every ${noun} they didn't reach counts as wrong.`);
    }
    const untracked = part === "quiz" ? sum("quiz", "untracked") : 0;
    if (untracked) {
      lines.push(`${plural(untracked, "quiz was", "quizzes were")} taken before question tracking began and ${untracked === 1 ? "isn't" : "aren't"} counted here.`);
    }
    return lines.map((line) => `<p class="ia-note">${escapeHtml(line)}</p>`).join("");
  };

  const column = (title, items, part, noun, empty) => {
    const shown = all ? items.slice(0, ALL_LESSONS_LIMIT) : items;
    const counted = all ? 0 : selected[0]?.[part].students || 0;
    return `<div class="ia-column">
      <h3>${title}${counted ? `<small>${plural(counted, "student", "students")} counted</small>` : ""}</h3>
      ${shown.length ? itemList(shown, all) : `<p class="rp-empty">${empty}</p>`}
      ${all && items.length > shown.length ? `<p class="ia-note">The ${shown.length} hardest of ${items.length}. Pick a lesson to see all of its items.</p>` : ""}
      ${notes(part, noun)}
    </div>`;
  };

  const flaggedQuiz = quizItems.filter((item) => item.reteach);
  const flaggedWords = wordItems.filter((item) => item.reteach);
  const counts = [
    flaggedQuiz.length && plural(flaggedQuiz.length, "quiz question", "quiz questions"),
    flaggedWords.length && plural(flaggedWords.length, "word", "words"),
  ].filter(Boolean);
  const hardest = [...flaggedQuiz, ...flaggedWords].sort((a, b) => b.percent - a.percent)[0];
  const summary =
    !quizItems.length && !wordItems.length
      ? ""
      : counts.length
        ? `<div class="ia-summary ia-summary--reteach">
            <strong>Re-teach first: ${counts.join(" and ")}</strong>
            <p>${escapeHtml(`Missed by ${RETEACH_THRESHOLD}% of the class or more. The hardest is “${hardest.text}” (${hardest.missed} of ${hardest.students} students).`)}</p>
          </div>`
        : `<div class="ia-summary">
            <strong>Nothing needs re-teaching</strong>
            <p>No question or word was missed by ${RETEACH_THRESHOLD}% of the class or more. The lists still show which were hardest.</p>
          </div>`;

  return `
    <p class="ia-scope">Showing: ${escapeHtml(scopeLabel)}</p>
    ${summary}
    <div class="ia-columns">
      ${column("Quiz questions", quizItems, "quiz", "question", "No quiz answers to analyse yet. Missed questions are saved for quizzes taken from now on.")}
      ${column("Pronunciation words", wordItems, "words", "word", "No pronunciation results yet.")}
    </div>`;
}

/** #/classes/{classId}/report — the whole class at a glance. */
export async function renderClassReport(classId) {
  const context = await loadClassContext(classId);
  if (!context) return navigate("/dashboard");
  const { classroom, lessons, students } = context;

  page(
    "Class Report",
    `How ${classroom.className} is doing in every skill`,
    "",
    {
      crumbs: [
        { label: "Classrooms", href: "#/dashboard" },
        { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
      ],
    },
  );

  if (!students.length) {
    $("#page-content").innerHTML = `<section class="card empty">
      <h3>No students yet</h3>
      <p>The report fills in once students join with the class code and start their lessons.</p>
      <code>${escapeHtml(classroom.classCode || "—")}</code>
    </section>`;
    return;
  }

  const entries = await Promise.all(
    students.map(async (student) => ({
      student,
      progress: await loadStudentProgress(student.id, lessons, student.joinedAt),
    })),
  );
  const report = classReport(entries);
  const remarks = classRemarks(report, entries, lessons);
  const analysis = itemAnalysis(entries, lessons);

  const flaggedCount = analysis.reduce(
    (sum, { quiz, words }) =>
      sum + [...quiz.items, ...words.items].filter((item) => item.reteach).length,
    0,
  );
  if (flaggedCount) {
    remarks.splice(Math.min(1, remarks.length), 0, {
      tone: "warn",
      title: `${flaggedCount} ${flaggedCount === 1 ? "item" : "items"} to re-teach`,
      text: `Quiz questions or pronunciation words that ${RETEACH_THRESHOLD}% or more of the class missed. See "What to re-teach" below.`,
    });
  }

  addExportActions({ excel: () => exportClassExcel(classroom, entries, report, analysis) });

  const pct = (value) => (value == null ? "—" : `${value}%`);
  const studentHref = (student) =>
    `#/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}`;
  const skillName = (key) => SKILLS.find((skill) => skill.key === key).name;
  const scoredSkills = SKILLS.filter((skill) => skill.key !== "pagUnawa");
  // The lecture has no score: count the students who read every lecture open so far.
  const lekturaRead = entries.filter(({ progress }) => {
    if (progress.error) return false;
    const lectures = lecturesOf(progress);
    return lectures.total > 0 && lectures.done === lectures.total;
  }).length;

  // ---------- Skill performance: one row per skill ----------
  const skillRows = report.skills
    .map((skill) => {
      const scoredSkill = skill.key !== "pagUnawa" || skill.average != null;
      const bands = DISTRIBUTION.filter(([key]) => skill.distribution[key]);
      const bar = bands
        .map(
          ([key, label]) =>
            `<i class="dist-bar__part dist-bar__part--${key}" style="flex:${skill.distribution[key]}" title="${skill.distribution[key]} ${label}"></i>`,
        )
        .join("");
      const flagged = skill.needsHelp;
      return `<tr style="--skill:${skill.color}">
        <th scope="row"><span class="rp-skill">
          <span class="rp-skill__icon">${skillIcon(skill.key)}</span>
          <span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.detail)}</small></span>
        </span></th>
        <td class="rp-num"><b>${scoredSkill ? pct(skill.average) : "—"}</b></td>
        <td>${scoredSkill ? remarkChip(skill.remark) : '<span class="remark remark--info">Completion only</span>'}</td>
        <td class="rp-dist">${
          scoredSkill
            ? `<div class="dist-bar" aria-hidden="true">${bar || '<i class="dist-bar__part dist-bar__part--no-data" style="flex:1"></i>'}</div>
               <ul class="dist-legend">${bands
                 .map(([key, label]) => `<li><i class="dist-dot dist-dot--${key}"></i>${skill.distribution[key]} ${label}</li>`)
                 .join("")}</ul>`
            : `<span class="rp-muted">${lekturaRead} of ${report.readableStudents} students read every lecture so far.</span>`
        }</td>
        <td class="rp-num">${
          scoredSkill
            ? `${skill.scoredStudents}<span class="rp-muted"> / ${report.readableStudents}</span>`
            : '<span class="rp-muted">—</span>'
        }</td>
        <td class="rp-help">${
          flagged.length
            ? `${flagged
                .slice(0, 3)
                .map((student) => `<a href="${studentHref(student)}">${escapeHtml(student.name)}</a>`)
                .join("")}${flagged.length > 3 ? `<span class="rp-muted">+${flagged.length - 3} more</span>` : ""}`
            : '<span class="rp-muted">None</span>'
        }</td>
      </tr>`;
    })
    .join("");

  // ---------- Needs attention: students with a flagged skill ----------
  const attention = report.studentsNeedingHelp
    .map(
      ({ student, progress }) => `<li>
        <a href="${studentHref(student)}"><span class="rp-avatar">${escapeHtml(initials(student.name))}</span>${escapeHtml(student.name)}</a>
        <span class="rp-attention__skills">${progress.summary.needsHelp
          .map((key) => `<span class="rp-tag">${escapeHtml(skillName(key))}</span>`)
          .join("")}</span>
      </li>`,
    )
    .join("");

  // ---------- Students: flagged first, then by name ----------
  const ordered = [...entries].sort((a, b) => {
    const flagA = a.progress.error ? 2 : a.progress.summary.needsHelp.length ? 0 : 1;
    const flagB = b.progress.error ? 2 : b.progress.summary.needsHelp.length ? 0 : 1;
    return flagA - flagB || a.student.name.localeCompare(b.student.name);
  });

  const studentRows = ordered
    .map(({ student, progress }) => {
      const name = `<a class="rp-student" href="${studentHref(student)}"><span class="rp-avatar">${escapeHtml(initials(student.name))}</span><strong>${escapeHtml(student.name)}</strong></a>`;
      if (progress.error) {
        return `<tr data-report-row class="rp-row--muted">
          <th scope="row">${name}</th>
          <td colspan="${scoredSkills.length + 1}" class="rp-muted">Progress not available</td>
          <td><span class="rp-status rp-status--muted">Moved</span></td>
        </tr>`;
      }
      const completion = completionOf(progress);
      const status = progress.summary.needsHelp.length
        ? '<span class="rp-status rp-status--alert">Needs help</span>'
        : progress.hasData
          ? '<span class="rp-status rp-status--good">On track</span>'
          : '<span class="rp-status rp-status--muted">Not started</span>';
      return `<tr data-report-row>
        <th scope="row">${name}</th>
        ${scoredSkills
          .map((skill) => {
            const summary = progress.summary.skills[skill.key];
            return scoreCell(summary.score).replace(
              "<td ",
              `<td title="${escapeHtml(`${skill.name}: ${LEVELS[summary.level].label}${summary.needsHelp ? " · needs help" : ""}`)}" `,
            );
          })
          .join("")}
        <td class="rp-lessons">
          <span class="rp-meter"><i style="width:${completion.percent ?? 0}%"></i></span>
          <span>${completion.total ? `${completion.done}/${completion.total}` : "—"}</span>
        </td>
        <td>${status}</td>
      </tr>`;
    })
    .join("");

  const needHelpCount = report.studentsNeedingHelp.length;

  $("#page-content").innerHTML = `
    <div class="progress-page report-page">
      ${printMeta("Class Report", [
        classroom.className,
        `Teacher: ${teacherName()}`,
        `${students.length} ${students.length === 1 ? "student" : "students"} · ${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`,
        `Printed ${today()}`,
      ])}

      <section class="rp-kpis" aria-label="Class summary">
        <div class="rp-kpi">
          <span class="rp-kpi__label">Overall class score</span>
          <span class="rp-kpi__value">${pct(report.overall)}</span>
          <span class="rp-kpi__foot">${remarkChip(report.overallRemark)}</span>
        </div>
        <div class="rp-kpi">
          <span class="rp-kpi__label">Students</span>
          <span class="rp-kpi__value">${students.length}</span>
          <span class="rp-kpi__foot">${report.activeStudents} active in lessons</span>
        </div>
        <div class="rp-kpi">
          <span class="rp-kpi__label">Lessons finished</span>
          <span class="rp-kpi__value">${pct(report.completion)}</span>
          <span class="rp-kpi__foot"><span class="rp-meter rp-meter--wide"><i style="width:${report.completion ?? 0}%"></i></span></span>
        </div>
        <div class="rp-kpi${needHelpCount ? " rp-kpi--alert" : ""}">
          <span class="rp-kpi__label">Need help</span>
          <span class="rp-kpi__value">${needHelpCount}</span>
          <span class="rp-kpi__foot">${needHelpCount === 1 ? "Student" : "Students"} with a flagged skill</span>
        </div>
      </section>

      <section class="rp-panel">
        <header class="rp-panel__head">
          <div><h2>Skill performance</h2><p>Class average per skill, and how students are spread across the remarks.</p></div>
          ${remarkLegend()}
        </header>
        <div class="rp-table-wrap"><table class="rp-table rp-table--skills">
          <thead><tr>
            <th scope="col">Skill</th>
            <th scope="col" class="rp-num">Average</th>
            <th scope="col">Remark</th>
            <th scope="col">Distribution</th>
            <th scope="col" class="rp-num">With results</th>
            <th scope="col">Needs help</th>
          </tr></thead>
          <tbody>${skillRows}</tbody>
        </table></div>
      </section>

      <div class="rp-columns">
        <section class="rp-panel">
          <header class="rp-panel__head"><div><h2>Key findings</h2><p>What stands out in this class right now.</p></div></header>
          ${remarksList(remarks)}
        </section>
        <section class="rp-panel">
          <header class="rp-panel__head"><div><h2>Needs attention</h2><p>Last two lessons in a skill were below 60%.</p></div></header>
          ${
            attention
              ? `<ul class="rp-attention">${attention}</ul>`
              : '<p class="rp-empty">No students are flagged right now.</p>'
          }
        </section>
      </div>

      <section class="rp-panel ia-panel" aria-labelledby="ia-title">
        <header class="rp-panel__head">
          <div>
            <h2 id="ia-title">What to re-teach</h2>
            <p>The quiz questions and pronunciation words the class missed most, to help you choose what to go over again. Anything missed by ${RETEACH_THRESHOLD}% of students or more is flagged.</p>
          </div>
          <label class="ia-filter">
            <span>Lesson</span>
            <select id="ia-lesson">
              <option value="">All lessons</option>
              ${lessons
                .map((lesson) => `<option value="${escapeHtml(lesson.id)}">${lesson.number}. ${escapeHtml(lesson.title)}</option>`)
                .join("")}
            </select>
          </label>
        </header>
        <div id="ia-body"></div>
      </section>

      <section class="rp-panel">
        <header class="rp-panel__head">
          <div><h2>Students</h2><p>Scores are first-try accuracy. Students who need help are listed first.</p></div>
        </header>
        <div class="rp-table-wrap"><table class="rp-table report-table">
          <thead><tr>
            <th scope="col">Student</th>
            ${scoredSkills.map((skill) => `<th scope="col" class="rp-score">${escapeHtml(skill.name)}</th>`).join("")}
            <th scope="col">Lessons</th>
            <th scope="col">Status</th>
          </tr></thead>
          <tbody>${studentRows}</tbody>
        </table></div>
      </section>
      ${printSignature()}
    </div>`;

  const select = $("#ia-lesson");
  // Start on the latest lesson that has results; "All lessons" when none has.
  const latest = [...analysis].reverse().find(({ quiz, words }) => quiz.students || words.students);
  if (latest) select.value = latest.lesson.id;
  const showItems = () => {
    $("#ia-body").innerHTML = itemAnalysisBody(analysis, select.value, select.selectedOptions[0]?.textContent || "");
  };
  select.addEventListener("change", showItems);
  showItems();

  paginate({
    rows: () => [...document.querySelectorAll("[data-report-row]")],
    after: $(".report-table").parentElement,
    label: ["student", "students"],
  });
}

