import { $, escapeHtml, navigate, page } from "../../js/helpers.js";
import { SKILLS, LEVELS } from "../../js/scoring.js";
import { paginate } from "../../js/pagination.js";
import {
  loadClassContext,
  loadStudentProgress,
  completionOf,
  classReport,
  classRemarks,
} from "./progressData.js";
import {
  scoreRing,
  remarkChip,
  scoreCell,
  remarksList,
  remarkLegend,
  skillIcon,
  initials,
} from "./progressUi.js";

const DISTRIBUTION = [
  ["very-good", "Very good"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor"],
  ["no-data", "Not enough data"],
];

/** #/classes/{classId}/report — the whole class at a glance. */
export async function renderClassReport(classId) {
  const context = await loadClassContext(classId);
  if (!context) return navigate("/dashboard");
  const { classroom, lessons, students } = context;

  page(
    "Class Report",
    `${classroom.className} · how the class is doing in every skill`,
    `<button class="button secondary" id="back-to-class">← Back to class</button>`,
  );
  $("#back-to-class").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}`),
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
      progress: await loadStudentProgress(student.id, lessons),
    })),
  );
  const report = classReport(entries);
  const remarks = classRemarks(report, entries, lessons);

  const skillCards = report.skills
    .map((skill, index) => {
      const scoredSkill = skill.key !== "pagUnawa" || skill.average != null;
      const total = Object.values(skill.distribution).reduce((sum, count) => sum + count, 0) || 1;
      const bar = DISTRIBUTION.map(
        ([key]) =>
          skill.distribution[key]
            ? `<i class="dist-bar__part dist-bar__part--${key}" style="flex:${skill.distribution[key]}" title="${skill.distribution[key]} ${LEVELS[Object.keys(LEVELS).find((level) => LEVELS[level].key === key)].label}"></i>`
            : "",
      ).join("");
      return `<article class="skill-card skill-card--class" style="--skill:${skill.color}; --i:${index}">
        <header class="skill-card__head">
          <span class="skill-card__icon">${skillIcon(skill.key)}</span>
          <div><h3>${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.detail)}</p></div>
        </header>
        <div class="skill-card__meter">
          ${scoreRing(skill.average, { color: skill.color, sub: skill.average == null ? "" : "class avg" })}
          <div class="skill-card__verdict">
            ${scoredSkill ? remarkChip(skill.remark) : '<span class="remark remark--info">Completion only</span>'}
            <small>${skill.scoredStudents} of ${report.readableStudents} with results</small>
          </div>
        </div>
        ${
          scoredSkill
            ? `<div class="dist-bar" aria-label="Students by remark">${bar || '<i class="dist-bar__part dist-bar__part--no-data" style="flex:1"></i>'}</div>
               <ul class="dist-legend">${DISTRIBUTION.filter(([key]) => skill.distribution[key])
                 .map(([key, label]) => `<li><i class="dist-dot dist-dot--${key}"></i>${skill.distribution[key]} ${label}</li>`)
                 .join("")}</ul>`
            : '<p class="skill-card__note">Lectures have no comprehension questions yet.</p>'
        }
        ${
          skill.needsHelp.length
            ? `<footer class="skill-card__foot skill-card__foot--alert">
                <span>Needs help:</span>
                <span class="avatar-stack">${skill.needsHelp
                  .slice(0, 5)
                  .map((student) => `<a class="avatar-stack__item" href="#/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}" title="${escapeHtml(student.name)}">${escapeHtml(initials(student.name))}</a>`)
                  .join("")}${skill.needsHelp.length > 5 ? `<span class="avatar-stack__more">+${skill.needsHelp.length - 5}</span>` : ""}</span>
              </footer>`
            : `<footer class="skill-card__foot"><span>${scoredSkill ? "No one flagged" : `${total} students`}</span></footer>`
        }
      </article>`;
    })
    .join("");

  // Students who need help first, then by name.
  const ordered = [...entries].sort((a, b) => {
    const flagA = a.progress.error ? 2 : a.progress.summary.needsHelp.length ? 0 : 1;
    const flagB = b.progress.error ? 2 : b.progress.summary.needsHelp.length ? 0 : 1;
    return flagA - flagB || a.student.name.localeCompare(b.student.name);
  });

  const studentRows = ordered
    .map(({ student, progress }) => {
      const href = `#/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(student.id)}`;
      if (progress.error) {
        return `<tr data-report-row class="report-row--muted">
          <td><a class="report-student" href="${href}"><span class="report-student__avatar">${escapeHtml(initials(student.name))}</span><span><strong>${escapeHtml(student.name)}</strong><small>Moved to another class</small></span></a></td>
          <td colspan="5" class="score-cell score-cell--empty">Progress not available</td>
        </tr>`;
      }
      const completion = completionOf(progress);
      const flagged = progress.summary.needsHelp.length;
      return `<tr data-report-row>
        <td><a class="report-student" href="${href}">
          <span class="report-student__avatar">${escapeHtml(initials(student.name))}</span>
          <span><strong>${escapeHtml(student.name)}</strong>
            <small>${completion.total ? `${completion.done}/${completion.total} lessons finished` : "No open lessons"}</small></span>
          ${flagged ? '<span class="report-student__flag" title="Needs help">!</span>' : ""}
        </a></td>
        ${SKILLS.filter((skill) => skill.key !== "pagUnawa")
          .map((skill) => {
            const summary = progress.summary.skills[skill.key];
            return scoreCell(summary.score).replace(
              "<td ",
              `<td title="${escapeHtml(`${skill.name}: ${LEVELS[summary.level].label}${summary.needsHelp ? " · needs help" : ""}`)}" `,
            );
          })
          .join("")}
        <td class="report-progress"><span class="report-progress__bar"><i style="width:${completion.percent ?? 0}%"></i></span><b>${completion.percent ?? "—"}${completion.percent == null ? "" : "%"}</b></td>
      </tr>`;
    })
    .join("");

  const overallSub =
    report.overall == null ? "No results yet" : "Average of the class's skill scores";

  $("#page-content").innerHTML = `
    <div class="progress-page">
      <section class="report-hero">
        <article class="report-hero__score">
          ${scoreRing(report.overall, { color: "#ffffff", size: 132, stroke: 12, sub: "overall" })}
          <div>
            <span class="report-hero__eyebrow">Overall class score</span>
            <h2>${report.overall == null ? "Not enough data" : escapeHtml(report.overallRemark.label)}</h2>
            <p>${escapeHtml(overallSub)}</p>
          </div>
        </article>
        <article class="progress-stat">
          <span class="progress-stat__big">${students.length}</span>
          <div><strong>Students</strong><span>${report.activeStudents} active in lessons</span></div>
        </article>
        <article class="progress-stat">
          ${scoreRing(report.completion, { color: "#24994a", size: 76, stroke: 8 })}
          <div><strong>Lessons finished</strong><span>Across all open lessons</span></div>
        </article>
        <article class="progress-stat${report.studentsNeedingHelp.length ? " progress-stat--alert" : ""}">
          <span class="progress-stat__big">${report.studentsNeedingHelp.length}</span>
          <div><strong>Need help</strong><span>Students with a flagged skill</span></div>
        </article>
      </section>

      <section class="progress-section">
        <div class="progress-section__head">
          <div><span class="eyebrow">Skills</span><h2>Class average per skill</h2></div>
          ${remarkLegend()}
        </div>
        <div class="skill-grid">${skillCards}</div>
      </section>

      <section class="progress-section progress-panel">
        <div class="progress-section__head"><div><span class="eyebrow">Remarks</span><h2>What stands out</h2></div></div>
        ${remarksList(remarks)}
      </section>

      <section class="progress-section progress-panel">
        <div class="progress-section__head">
          <div><span class="eyebrow">Students</span><h2>Every student, every skill</h2></div>
          <span class="progress-section__note">Students who need help are listed first</span>
        </div>
        <div class="progress-table-wrap"><table class="progress-table report-table">
          <thead><tr>
            <th scope="col">Student</th>
            ${SKILLS.filter((skill) => skill.key !== "pagUnawa").map((skill) => `<th scope="col">${escapeHtml(skill.name)}</th>`).join("")}
            <th scope="col">Lessons</th>
          </tr></thead>
          <tbody>${studentRows}</tbody>
        </table></div>
      </section>
    </div>`;

  paginate({
    rows: () => [...document.querySelectorAll("[data-report-row]")],
    after: $(".report-table").parentElement,
    label: ["student", "students"],
  });
}
