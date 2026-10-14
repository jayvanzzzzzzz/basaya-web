import { $, escapeHtml, navigate, page } from "../../js/helpers.js";
import { SKILLS } from "../../js/scoring.js";
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

const STATUS = {
  done: ["done", "Finished"],
  "in-progress": ["progress", "In progress"],
  "not-started": ["idle", "Not started"],
  overdue: ["overdue", "Missed deadline"],
  scheduled: ["scheduled", "Not open yet"],
  "before-joining": ["before", "Closed before joining"],
};

/** #/classes/{classId}/students/{studentId} — one student's progress, with remarks. */
export async function renderStudentProgress(classId, studentId) {
  const context = await loadClassContext(classId);
  if (!context) return navigate("/dashboard");
  const { classroom, lessons } = context;
  const student = context.students.find((item) => item.id === studentId);
  if (!student) return navigate(`/classes/${encodeURIComponent(classId)}/students`);

  const progress = await loadStudentProgress(studentId, lessons, student.joinedAt);
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

  const skillCards = SKILLS.map((skill, index) => {
    const summary = progress.summary.skills[skill.key];
    // Pag-unawa has no comprehension score yet — show lecture completion like the app.
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
        ${scoreCell(row.skills.talasalitaan, { skipped: row.lesson.gameSkipped })}
        ${scoreCell(row.skills.pagkilala)}
        ${scoreCell(row.skills.pagbigkas)}
        ${scoreCell(row.skills.pagsusulit)}
      </tr>`,
    )
    .join("");

  $("#page-content").innerHTML = `
    <div class="progress-page">
      <section class="progress-overview">
        <article class="progress-identity">
          <span class="progress-identity__avatar">${escapeHtml(initials(student.name))}</span>
          <div>
            <h2>${escapeHtml(student.name)}</h2>
            <p>Last active · <strong>${escapeHtml(relativeTime(progress.lastActive))}</strong></p>
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
          <div class="progress-section__head"><div><span class="eyebrow">Pagbigkas</span><h2>Words to practice</h2></div></div>
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
                  <th scope="col">Lecture</th><th scope="col">Talasalitaan</th><th scope="col">Pagkilala</th>
                  <th scope="col">Pagbigkas</th><th scope="col">Pagsusulit</th>
                </tr></thead>
                <tbody>${lessonRows}</tbody>
              </table></div>`
            : '<p class="progress-panel__empty">No lessons assigned to this class yet.</p>'
        }
      </section>
    </div>`;
}

