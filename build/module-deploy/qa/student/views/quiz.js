import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml, navigate, toast } from "../../js/helpers.js";
import {
  availability,
  findLesson,
  loadLessonProgress,
  loadQuiz,
  saveProgress,
  resumeOf,
  clearResume,
  submitAnswer,
  assessmentRequest,
  student,
} from "../data.js";
import { beforeLeave, onLeave } from "../router.js";
import { confirmQuizExit } from "../quizExitDialog.js";
import { content, icon } from "../ui.js";
import { renderResults } from "./results.js";

// Pagsusulit (the app's QuizActivity): one question at a time, the rocket moves along the
// track, and a question is right only when exactly the correct choice(s) were picked.
// Opens only after the lecture. Saves the Pagsusulit skill. The questions and each question's
// choices come in a new random order every time. An answer is final once "Susunod" is pressed:
// the server saves it in resume.quiz. Confirming an exit abandons the unfinished attempt;
// opening the quiz again starts from question one. Submitted results remain locked.
//   resume.quiz = { done, total, score, answered: [question index as stored], missed: [question text] }

const LETTERS = "ABCDEFGH";

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffles the questions and their choices; the correct answers move with their choices. */
function shuffleQuiz(questions) {
  return shuffle(questions).map((question) => {
    const order = shuffle(question.choices.map((_, i) => i)); // order[new position] = old index
    return {
      ...question,
      choices: order.map((i) => question.choices[i]),
      choiceOrder: order,
      correct: new Set([...question.correct].map((i) => order.indexOf(i))),
    };
  });
}

export async function renderQuiz(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  if (!navigator.onLine) { toast("Kumonekta upang masagutan at masuri ang pagsusulit."); return navigate(pathUrl); }
  if (availability(lesson) !== "open" || lesson.quizFinished) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading st-focus-loading--space"><div class="st-loading" role="status" aria-label="Inihahanda ang pagsusulit..."><span></span><span></span><span></span></div></div>`;
  const [quiz, progress] = await Promise.all([loadQuiz(lessonId), loadLessonProgress(lessonId)]);
  if (progress.quizFinished) return navigate(pathUrl);
  // A Practice lesson saves nothing, so its quiz never waits for the lecture.
  if (!progress.lectureFinished && !lesson.practice) {
    toast("Tapusin muna ang aralin para mabuksan ang pagsusulit");
    return navigate(pathUrl);
  }
  if (!quiz?.questions.length) {
    toast("Walang pagsusulit para sa araling ito.");
    return navigate(pathUrl);
  }
  // Recover an interrupted connection, but a confirmed exit clears this on the server.
  const total = quiz.questions.length;
  const attempt = lesson.practice ? null : await assessmentRequest(lessonId, "begin", { part: "quiz" });
  const resume = attempt?.resume || resumeOf(progress, "quiz", total);
  const answered = new Set(
    (Array.isArray(resume?.answered) ? resume.answered : []).map(Number).filter((i) => i >= 0 && i < total),
  );
  const earlierMissed = Array.isArray(resume?.missed) ? resume.missed.filter((text) => typeof text === "string") : [];
  const earlierScore = Math.min(Math.max(Number(resume?.score) || 0, 0), answered.size);
  quiz.questions = shuffleQuiz(
    quiz.questions.map((question, position) => ({ ...question, position })).filter((question) => !answered.has(question.position)),
  );

  content().innerHTML = `
    <section class="st-quiz">
      <header class="st-focus-bar">
        <button class="st-quiz__back" type="button" id="quiz-back" aria-label="Bumalik sa aralin">${icon("back")}<span>Bumalik</span></button>
        <span class="st-quiz__label">${lesson.practice ? "Pagsasanay" : "Pagtataya"}</span>
      </header>
      <header class="st-quiz__heading"><h1 class="st-quiz__title">${escapeHtml(quiz.title || "Pagsusulit")}</h1></header>
      <div class="st-rocket" aria-hidden="true">
        <span class="st-rocket__fill" id="quiz-fill"></span>
        <span class="st-rocket__ship" id="quiz-rocket">${icon("rocket")}</span>
      </div>
      <p class="st-quiz__progress" id="quiz-progress"></p>
      <div class="st-quiz__workspace">
      <div class="st-quiz__question">
        <span class="st-quiz__eyebrow">Pag-unawa sa binasa</span>
        <h2 id="quiz-question"></h2>
        <p class="st-quiz__hint" id="quiz-hint"></p>
        <p class="st-quiz__submit-note">Ipinapasa ang iyong sagot kapag pinindot ang Susunod o Tapusin.</p>
      </div>
      <div class="st-quiz__answers">
      <div class="st-choices" id="quiz-choices" role="group" aria-labelledby="quiz-question" aria-describedby="quiz-hint"></div>
      <div class="st-focus-footer">
        <button class="st-action st-action--next st-wide" type="button" id="quiz-next" disabled>Susunod</button>
      </div>
      </div></div>
    </section>`;

  const choicesEl = $("#quiz-choices");
  const next = $("#quiz-next");
  const back = $("#quiz-back");
  const answers = quiz.questions.map(() => new Set());
  const accepted = quiz.questions.map(() => false);
  const eventIds = quiz.questions.map(() => crypto.randomUUID());
  let index = 0;
  let saving = false;
  let leaving = false;
  let completed = false;
  let pendingSave = Promise.resolve();
  const enrollment = JSON.stringify([student.uid, student.profile.classId, student.profile.progressSession]);
  const releaseGuard = beforeLeave(async () => {
    if (completed || enrollment !== JSON.stringify([student.uid, student.profile.classId, student.profile.progressSession])) return true;
    leaving = true;
    back.disabled = true;
    next.disabled = true;
    try {
      await pendingSave;
      if (completed) return true;
      if (!(await confirmQuizExit())) return false;
      if (!lesson.practice) await assessmentRequest(lessonId, "abandon", { part: "quiz", attemptId: attempt.attemptId });
      return true;
    } catch (error) {
      toast("Hindi makumpirma ang pag-alis. Kumonekta sa internet at subukan muli. Mananatili muna ang iyong mga sagot.");
      return false;
    } finally {
      leaving = false;
      back.disabled = false;
      next.disabled = saving || !answers[index]?.size;
      if (back.isConnected) back.focus();
    }
  });
  onLeave(releaseGuard);
  back.addEventListener("click", () => { if (!leaving) navigate(pathUrl); });

  const isRight = (i) => accepted[i];
  /** Answers given so far, earlier sessions included, after `count` questions of this one. */
  const answeredAfter = (count) => {
    const asked = quiz.questions.slice(0, count);
    return {
      answered: [...answered, ...asked.map((question) => question.position)],
      missed: [
        ...earlierMissed,
        ...asked.filter((_, i) => !isRight(i)).map((question) => question.question.trim()),
      ],
      score: earlierScore + asked.filter((_, i) => isRight(i)).length,
    };
  };

  const moveRocket = () => {
    const fraction = (answered.size + index + 1) / total;
    $("#quiz-fill").style.width = `${fraction * 100}%`;
    $("#quiz-rocket").style.left = `calc(${fraction * 100}% - ${fraction * 2.4}rem)`;
  };

  const drawChoices = () => {
    const question = quiz.questions[index];
    choicesEl.innerHTML = question.choices
      .map((choice, i) => {
        const picked = answers[index].has(i);
        return `
          <button class="st-choice st-choice--${i % 4}${picked ? " is-picked" : ""}" type="button"
            data-choice="${i}" role="${question.multiple ? "checkbox" : "radio"}" aria-checked="${picked}" style="--i:${i}">
            <span class="st-choice__letter" aria-hidden="true">${LETTERS[i] || "?"}</span>
            <span class="st-choice__text">${escapeHtml(choice)}</span>
            <span class="st-choice__check" aria-hidden="true">${icon("check")}</span>
          </button>`;
      })
      .join("");
    next.disabled = answers[index].size === 0;
  };

  const showQuestion = () => {
    const question = quiz.questions[index];
    $("#quiz-progress").textContent = `Tanong ${answered.size + index + 1} ng ${total}`;
    $("#quiz-question").textContent = question.question;
    $("#quiz-hint").textContent = question.multiple ? "Piliin lahat ng tamang sagot" : "Piliin ang tamang sagot";
    next.textContent = index === quiz.questions.length - 1 ? "Tapusin" : "Susunod";
    moveRocket();
    drawChoices();
  };

  choicesEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-choice]");
    if (!button || saving || leaving) return;
    const choice = Number(button.dataset.choice);
    const picked = answers[index];
    if (quiz.questions[index].multiple) {
      // Tap to pick, tap again to unpick.
      if (picked.has(choice)) picked.delete(choice);
      else picked.add(choice);
    } else {
      picked.clear();
      picked.add(choice);
    }
    choicesEl.querySelectorAll("[data-choice]").forEach((tile) => {
      const selected = picked.has(Number(tile.dataset.choice));
      tile.classList.toggle("is-picked", selected);
      tile.setAttribute("aria-checked", String(selected));
    });
    next.disabled = picked.size === 0;
    button.focus();
  });

  const finish = async () => {
    if (saving) return;
    saving = true;
    next.disabled = true;
    let { score, missed } = answeredAfter(quiz.questions.length);
    try {
      const result = await saveProgress(
        lessonId,
        {
          quizFinished: true,
          quizScore: score,
          quizTotal: total,
          quizCompletedAt: serverTimestamp(),
          attemptId: attempt?.attemptId,
          ...clearResume("quiz"),
        },
        {
          key: "pagsusulit",
          correct: score,
          attempts: total,
          items: total,
          // The questions' text (they're shuffled), for the teacher's item analysis.
          extras: { missedQuestions: missed },
        },
      );
      if (result) score = result.score;
    } catch (error) {
      console.error("Failed to save quiz result", error);
      toast(
        error?.code === "permission-denied"
          ? "Sarado na ang aralin. Hindi na-save ang iyong sagot."
          : "Hindi na-save ang iyong sagot. Subukan muli.",
      );
      next.disabled = false;
      saving = false;
      return;
    }

    completed = true;
    releaseGuard();
    const percent = Math.floor((score * 100) / total);
    renderResults({
      lessonId,
      title: quiz.title,
      heading: "Natapos mo ang Pagsusulit!",
      scoreLabel: "tamang sagot",
      score,
      total,
      showPercent: true,
      starCount: percent >= 90 ? 3 : percent >= 75 ? 2 : percent >= 50 ? 1 : 0,
      remark:
        percent === 100
          ? "Napakahusay! Perpekto ang iyong iskor!"
          : percent >= 90
            ? "Napakahusay! Ipagpatuloy mo!"
            : percent >= 75
              ? "Mahusay! Magpatuloy sa pag-aaral."
              : percent >= 50
                ? "Maganda ang iyong pagsisikap. Subukan muli upang mas mapabuti."
                : "Huwag panghinaan ng loob. Mag-aral pa at subukan muli.",
      celebrate: percent >= 75,
    });
  };

  const submitCurrent = async () => {
    saving = true;
    next.disabled = true;
    try {
      const before = earlierScore + accepted.slice(0, index).filter(Boolean).length;
      const question = quiz.questions[index];
      const result = await submitAnswer(lessonId, "quiz", { index: question.position,
        selected: [...answers[index]].map(i => question.choiceOrder[i]), eventId: eventIds[index], ...(attempt ? { attemptId: attempt.attemptId } : {}) });
      accepted[index] = lesson.practice ? result.right : result.score > before;
      saving = false;
      if (index < quiz.questions.length - 1) { index += 1; showQuestion(); }
      else await finish();
    } catch (error) {
      saving = false;
      next.disabled = false;
      toast(error.message || "Hindi na-save ang sagot. Subukan muli.");
    }
  };
  next.addEventListener("click", () => {
    if (saving || leaving) return;
    pendingSave = submitCurrent();
  });

  // Every answer was saved but finishing wasn't: finish now.
  if (quiz.questions.length) showQuestion();
  else pendingSave = finish();
}
