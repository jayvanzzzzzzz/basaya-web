import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { skippedParts } from "../../js/skippedParts.js";
import { lessonItems } from "../../js/lessonItems.js";
import { state, getAllLessons } from "../../js/state.js";
import {
  SKILLS,
  LEVELS,
  remarkFor,
  summarize,
  resultsFrom,
  lessonParts,
  withMissed,
} from "../../js/scoring.js";

// Loads a class's lessons and students' progress for the student progress page and the
// Class Report, and turns the numbers into plain-English remarks for the teacher.

const skillName = (key) => SKILLS.find((skill) => skill.key === key)?.name || key;
const toMillis = (value) => (value?.toMillis ? value.toMillis() : null);

/** The class (if the teacher owns it), its lessons in plan order, and its roster. */
export async function loadClassContext(classId) {
  const classSnap = await getDoc(doc(db, "classes", classId));
  if (!classSnap.exists() || classSnap.data().teacherId !== state.user.uid) return null;

  const [linksSnap, rosterSnap] = await Promise.all([
    getDocs(collection(db, "classes", classId, "classLessons")),
    getDocs(collection(db, "classes", classId, "students")),
    state.allLessons.length ? null : getAllLessons(),
  ]);

  // Practice lessons save no scores, so the reports leave them out.
  const links = linksSnap.docs
    .map((link) => ({ id: link.id, ...link.data() }))
    .filter((link) => link.mode !== "practice")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // A skipped game or Gawain counts as done (js/skippedParts.js). Item counts weigh a
  // missed part's 0; the quiz questions and Bigkas words feed the item analysis.
  const ids = links.map((link) => link.lessonId || link.id);
  const noItems = { items: {}, questions: [], words: [] };
  const [skipped, contents] = await Promise.all([
    Promise.all(ids.map((id) => skippedParts(id))),
    Promise.all(ids.map((id) => lessonItems(id).catch(() => noItems))),
  ]);

  const lessons = links.map((link, index) => {
    const id = link.lessonId || link.id;
    const lesson = state.allLessons.find((item) => item.id === id);
    return {
      id,
      number: index + 1,
      title: lesson?.title || "Untitled lesson",
      openAt: toMillis(link.openAt),
      dueAt: toMillis(link.dueAt),
      gameSkipped: skipped[index].game,
      activitySkipped: skipped[index].activity,
      items: contents[index].items,
      questions: contents[index].questions,
      words: contents[index].words,
    };
  });

  const students = rosterSnap.docs
    .map((student) => ({ id: student.id, ...student.data() }))
    .map((student) => ({ ...student, name: student.fullName || "Student" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { classroom: { id: classSnap.id, ...classSnap.data() }, lessons, students };
}

/**
 * One student's progress in this class: skill summary (same rules as the app), each
 * lesson's parts and scores, hard words and last activity. `error` is set when their
 * records can't be read (e.g. they have moved to another class).
 * `joinedAt` (the roster's Firestore timestamp): lessons whose deadline passed before the student joined are
 * "before-joining" — they could never have done them, so they don't count against them.
 */
export async function loadStudentProgress(studentId, lessons, joinedAt = null) {
  const joinedMillis = toMillis(joinedAt);
  let progressDocs;
  try {
    const snap = await getDocs(collection(db, "users", studentId, "assignedLessons"));
    progressDocs = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    return { error: error.code === "permission-denied" ? "moved" : "unavailable" };
  }

  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const docs = progressDocs.filter((item) => lessonIds.has(item.id));
  const now = Date.now();
  // Lessons that closed before they joined don't count; parts left unfinished at any other
  // deadline count as 0 (js/scoring.js withMissed).
  const held = lessons.filter(
    (lesson) => !(lesson.dueAt != null && joinedMillis != null && lesson.dueAt < joinedMillis),
  );
  const results = withMissed(resultsFrom(docs), docs, held, now);
  const summary = summarize(results);

  let lastActive = null;
  const hardWordCounts = new Map();
  const perLesson = lessons.map((lesson) => {
    const data = docs.find((item) => item.id === lesson.id) || {};
    const parts = lessonParts(data, { game: lesson.gameSkipped, activity: lesson.activitySkipped });
    const missed = [];
    const skills = Object.fromEntries(
      SKILLS.map(({ key }) => {
        const result = results[key].find((item) => item.lessonId === lesson.id);
        if (result?.missed) missed.push(key);
        const score =
          result && result.attempts > 0 ? Math.round((result.correct * 100) / result.attempts) : null;
        const at = toMillis(data.skills?.[key]?.completedAt);
        if (at && (!lastActive || at > lastActive)) lastActive = at;
        return [key, score];
      }),
    );
    const quizRecord = data.skills?.pagsusulit;
    const speechRecord = data.skills?.pagbigkas;
    (data.skills?.pagbigkas?.hardWords || []).forEach((word) =>
      hardWordCounts.set(word, (hardWordCounts.get(word) || 0) + 1),
    );

    const open = !lesson.openAt || lesson.openAt <= now;
    const overdue = !parts.finished && lesson.dueAt != null && lesson.dueAt < now;
    const closedBeforeJoining = overdue && joinedMillis != null && lesson.dueAt < joinedMillis;
    const status = parts.finished
      ? "done"
      : closedBeforeJoining
        ? "before-joining"
        : !open
          ? "scheduled"
          : overdue
            ? "overdue"
            : parts.started
              ? "in-progress"
              : "not-started";
    return {
      lesson,
      parts,
      skills,
      status,
      lectureDone: parts.parts.lecture,
      // Parts counted as 0 because the deadline passed.
      missed,
      // Item analysis: null when there's nothing to count (not taken, or taken before tracking).
      missedQuestions: Array.isArray(quizRecord?.missedQuestions) ? quizRecord.missedQuestions : null,
      quizTakenUntracked: data.quizFinished === true && !Array.isArray(quizRecord?.missedQuestions),
      hardWords: speechRecord ? (Array.isArray(speechRecord.hardWords) ? speechRecord.hardWords : []) : null,
      // How far the student got in an unfinished quiz / Bigkas (student/views/quiz.js, pronunciation.js).
      quizResume: data.resume?.quiz || null,
      speechResume: data.resume?.pronunciation || null,
    };
  });

  const hardWords = [...hardWordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  return { summary, perLesson, hardWords, lastActive, hasData: docs.length > 0 };
}

/** Lessons the student can be held to: open now, and not closed before they joined. */
const counted = (progress) =>
  progress.perLesson.filter((row) => row.status !== "scheduled" && row.status !== "before-joining");

/** Lessons finished / lessons open so far (not-yet-open and closed-before-joining don't count). */
export function completionOf(progress) {
  const open = counted(progress);
  const done = open.filter((row) => row.status === "done").length;
  return { done, total: open.length, percent: open.length ? Math.round((done * 100) / open.length) : null };
}

/** Lectures finished — the lecture has no score, so the app shows completion instead. */
export function lecturesOf(progress) {
  const open = counted(progress);
  return { done: open.filter((row) => row.lectureDone).length, total: open.length };
}

// ---------- Remarks ----------

/**
 * Plain-English notes about one student, most urgent first.
 * Each: { tone: "alert" | "warn" | "info" | "good", title, text }.
 */
export function studentRemarks(progress) {
  const notes = [];
  const { summary } = progress;
  const skills = SKILLS.map(({ key }) => summary.skills[key]);

  if (!progress.hasData) {
    return [{
      tone: "info",
      title: "No activity yet",
      text: "This student hasn't finished any lesson activities in this class.",
    }];
  }

  skills.filter((skill) => skill.needsHelp).forEach((skill) => {
    const lastTwo = skill.lessonScores.slice(-2).map((score) => `${score}%`).join(" and ");
    notes.push({
      tone: "alert",
      title: `Needs help with ${skillName(skill.skill)}`,
      text: `The last two lessons scored ${lastTwo}, both below 60%. A quick one-on-one check-in is recommended.`,
    });
  });

  skills
    .filter((skill) => !skill.needsHelp && skill.trend === "DOWN")
    .forEach((skill) =>
      notes.push({
        tone: "warn",
        title: `${skillName(skill.skill)} is slipping`,
        text: "Recent lessons are more than 10 points lower than the ones before.",
      }),
    );

  skills
    .filter((skill) => !skill.needsHelp && skill.level === "KAILANGAN_NG_TULONG")
    .forEach((skill) =>
      notes.push({
        tone: "warn",
        title: `Low score in ${skillName(skill.skill)}`,
        text: `Overall ${skill.score}% (Poor). Extra practice on this skill will help.`,
      }),
    );

  const overdue = progress.perLesson.filter((row) => row.status === "overdue");
  if (overdue.length) {
    notes.push({
      tone: "warn",
      title: `Missed ${overdue.length === 1 ? "a deadline" : `${overdue.length} deadlines`}`,
      text: `Unfinished after the deadline: ${overdue.map((row) => row.lesson.title).join(", ")}. Whatever was left undone counts as wrong.`,
    });
  }

  if (progress.hardWords.length) {
    notes.push({
      tone: "info",
      title: "Words to practice",
      text: `Missed in pronunciation: ${progress.hardWords
        .slice(0, 8)
        .map((item) => item.word)
        .join(", ")}.`,
    });
  }

  const notStarted = progress.perLesson.filter((row) => row.status === "not-started").length;
  if (notStarted) {
    notes.push({
      tone: "info",
      title: `${notStarted} open ${notStarted === 1 ? "lesson" : "lessons"} not started`,
      text: "Remind the student to open these lessons in the app.",
    });
  }

  skills
    .filter((skill) => skill.trend === "UP")
    .forEach((skill) =>
      notes.push({
        tone: "good",
        title: `Improving in ${skillName(skill.skill)}`,
        text: "Recent lessons are more than 10 points higher than before. Keep it up!",
      }),
    );

  const strongest = skills
    .filter((skill) => skill.level === "MAHUSAY")
    .sort((a, b) => b.score - a.score)[0];
  if (strongest) {
    notes.push({
      tone: "good",
      title: `Strong in ${skillName(strongest.skill)}`,
      text: `${strongest.score}% overall — Very good.`,
    });
  }

  if (!notes.some((note) => note.tone === "alert" || note.tone === "warn")) {
    notes.unshift({
      tone: "good",
      title: "On track",
      text: "No skill needs attention right now.",
    });
  }
  return notes;
}

// ---------- Class Report ----------

/**
 * Class-wide numbers from every student's own skill scores (same rules as the app):
 * - skill average = mean of the students' scores in that skill (students with data);
 * - overall class score = mean of the skill averages that have data.
 */
export function classReport(entries) {
  const readable = entries.filter((entry) => !entry.progress.error);

  const skills = SKILLS.map((skill) => {
    const summaries = readable.map((entry) => ({
      student: entry.student,
      skill: entry.progress.summary.skills[skill.key],
    }));
    const scored = summaries.filter((item) => item.skill.score != null);
    const average = scored.length
      ? Math.round(scored.reduce((sum, item) => sum + item.skill.score, 0) / scored.length)
      : null;
    const distribution = Object.fromEntries(Object.values(LEVELS).map((level) => [level.key, 0]));
    summaries.forEach((item) => {
      distribution[LEVELS[item.skill.level].key] += 1;
    });
    return {
      ...skill,
      average,
      remark: remarkFor(average),
      scoredStudents: scored.length,
      distribution,
      needsHelp: summaries.filter((item) => item.skill.needsHelp).map((item) => item.student),
    };
  });

  const withAverage = skills.filter((skill) => skill.average != null);
  const overall = withAverage.length
    ? Math.round(withAverage.reduce((sum, skill) => sum + skill.average, 0) / withAverage.length)
    : null;

  const completions = readable.map((entry) => completionOf(entry.progress));
  const doneSum = completions.reduce((sum, item) => sum + item.done, 0);
  const totalSum = completions.reduce((sum, item) => sum + item.total, 0);

  return {
    skills,
    overall,
    overallRemark: remarkFor(overall),
    completion: totalSum ? Math.round((doneSum * 100) / totalSum) : null,
    studentsNeedingHelp: readable.filter((entry) => entry.progress.summary.needsHelp.length),
    activeStudents: readable.filter((entry) => entry.progress.hasData).length,
    readableStudents: readable.length,
  };
}

/** Plain-English notes about the whole class, most useful first. */
export function classRemarks(report, entries, lessons) {
  const notes = [];
  const scored = report.skills.filter((skill) => skill.average != null);

  if (!scored.length) {
    return [{
      tone: "info",
      title: "Waiting for results",
      text: "Scores appear here once students finish lesson activities in the app.",
    }];
  }

  const weakest = [...scored].sort((a, b) => a.average - b.average)[0];
  const strongest = [...scored].sort((a, b) => b.average - a.average)[0];

  if (weakest.average < 70) {
    notes.push({
      tone: weakest.average < 50 ? "alert" : "warn",
      title: `${weakest.name} is the class's hardest skill`,
      text: `Class average ${weakest.average}% (${weakest.remark.label}). Consider reviewing it together.`,
    });
  }

  if (report.studentsNeedingHelp.length) {
    const names = report.studentsNeedingHelp.map((entry) => entry.student.name);
    notes.push({
      tone: "alert",
      title: `${names.length} ${names.length === 1 ? "student needs" : "students need"} help`,
      text: `${names.slice(0, 6).join(", ")}${names.length > 6 ? ` and ${names.length - 6} more` : ""}. Open a student to see which skill.`,
    });
  }

  const now = Date.now();
  lessons
    .filter((lesson) => lesson.dueAt != null && lesson.dueAt < now)
    .forEach((lesson) => {
      const missed = entries.filter(
        (entry) =>
          !entry.progress.error &&
          entry.progress.perLesson.find((row) => row.lesson.id === lesson.id)?.status === "overdue",
      ).length;
      if (missed) {
        notes.push({
          tone: "warn",
          title: `${missed} missed the deadline for ${lesson.title}`,
          text: "Their progress for this lesson can no longer be saved. Whatever was left undone counts as wrong.",
        });
      }
    });

  if (strongest !== weakest && strongest.average >= 70) {
    notes.push({
      tone: "good",
      title: `Strongest skill: ${strongest.name}`,
      text: `Class average ${strongest.average}% (${strongest.remark.label}).`,
    });
  }

  const inactive = report.readableStudents - report.activeStudents;
  if (inactive > 0) {
    notes.push({
      tone: "info",
      title: `${inactive} ${inactive === 1 ? "student hasn't" : "students haven't"} started`,
      text: "They have no lesson activity in this class yet.",
    });
  }
  return notes;
}

// ---------- Item analysis ("What to re-teach") ----------

/** Share of the class that has to miss an item before it's flagged "Re-teach". */
export const RETEACH_THRESHOLD = 50;

const itemKey = (text) => String(text ?? "").trim().toLowerCase();

/**
 * Counts how many students missed each item, ranked hardest first. `known` are the lesson's
 * current items; saved ones that are no longer in the lesson (it was edited) are kept too.
 * `answers` is one list of missed items per student who counts.
 */
function rankItems(known, answers) {
  const items = new Map();
  const add = (text) => {
    const key = itemKey(text);
    if (key && !items.has(key)) items.set(key, { text: String(text).trim(), missed: 0, current: known.includes(text) });
  };
  known.forEach(add);
  answers.forEach((missed) => missed.forEach(add));
  answers.forEach((missed) => {
    new Set(missed.map(itemKey)).forEach((key) => {
      if (items.has(key)) items.get(key).missed += 1;
    });
  });
  const students = answers.length;
  return [...items.values()]
    .map((item, order) => ({
      ...item,
      order,
      percent: students ? Math.round((item.missed * 100) / students) : null,
      reteach: students > 0 && (item.missed * 100) / students >= RETEACH_THRESHOLD,
    }))
    .filter((item) => item.current || item.missed)
    .sort((a, b) => b.missed - a.missed || a.order - b.order);
}

/** A saved place only fits the lesson when it was made for the same number of items. */
const fits = (resume, total) => resume && Number(resume.total) === total;
const textsOf = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === "string") : []);

/** Unfinished at the deadline: the questions answered wrong, plus every one not answered. */
function unfinishedQuiz(questions, resume) {
  if (!fits(resume, questions.length)) return questions;
  const answered = new Set((Array.isArray(resume.answered) ? resume.answered : []).map(Number));
  return [...textsOf(resume.missed), ...questions.filter((_, position) => !answered.has(position))];
}

/** Unfinished at the deadline: the words missed so far, plus every word not reached (in order). */
function unfinishedWords(words, resume) {
  if (!fits(resume, words.length)) return words;
  const done = Math.min(Math.max(Number(resume.done) || 0, 0), words.length);
  return [...textsOf(resume.hardWords), ...words.slice(done)];
}

/**
 * Per lesson: which quiz questions and Bigkas words the class missed, so the teacher can
 * decide what to re-teach.
 * - Quiz: students whose quiz saved its missed questions. A student who didn't finish by the
 *   deadline counts with the answers they gave, and as wrong on every question they didn't
 *   reach. Quizzes taken before question tracking began are only counted in `untracked`.
 * - Words: students who finished Bigkas (their hardWords: words not right on the first try).
 *   A student who didn't finish by the deadline counts with the words they said, and as
 *   missing every word they didn't reach.
 * Students who moved, or whose lesson closed before they joined, are left out.
 */
export function itemAnalysis(entries, lessons) {
  return lessons.map((lesson) => {
    const rows = entries
      .filter((entry) => !entry.progress.error)
      .map((entry) => entry.progress.perLesson.find((row) => row.lesson.id === lesson.id))
      .filter((row) => row && row.status !== "before-joining");

    const quizAnswers = [];
    let untracked = 0;
    let quizMissedDeadline = 0;
    const wordAnswers = [];
    let wordsMissedDeadline = 0;
    rows.forEach((row) => {
      if (row.missed.includes("pagsusulit")) {
        quizMissedDeadline += 1;
        quizAnswers.push(unfinishedQuiz(lesson.questions, row.quizResume));
      } else if (row.missedQuestions) {
        quizAnswers.push(row.missedQuestions);
      } else if (row.quizTakenUntracked) {
        untracked += 1;
      }
      if (row.missed.includes("pagbigkas")) {
        wordsMissedDeadline += 1;
        wordAnswers.push(unfinishedWords(lesson.words, row.speechResume));
      } else if (row.hardWords) {
        wordAnswers.push(row.hardWords);
      }
    });

    return {
      lesson,
      quiz: {
        students: quizAnswers.length,
        missedDeadline: quizMissedDeadline,
        untracked,
        items: rankItems(lesson.questions, quizAnswers),
      },
      words: {
        students: wordAnswers.length,
        missedDeadline: wordsMissedDeadline,
        items: rankItems(lesson.words, wordAnswers),
      },
    };
  });
}
