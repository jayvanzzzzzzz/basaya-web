import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml, navigate, toast } from "../../js/helpers.js";
import {
  availability,
  findLesson,
  loadLessonProgress,
  loadQuiz,
  refreshSummary,
  saveProgress,
  resumeOf,
  saveResume,
  clearResume,
} from "../data.js";
import { onLeave } from "../router.js";
import { content, icon } from "../ui.js";
import { renderResults } from "./results.js";

// Pagsusulit (the app's QuizActivity): one question at a time, the rocket moves along the
// track, and a question is right only when exactly the correct choice(s) were picked.
// Opens only after the lecture. Saves the Pagsusulit skill. The questions and each question's
// choices come in a new random order every time. An answer is final once "Susunod" is pressed:
// it's saved in resume.quiz, so closing continues with the questions not answered yet, and at
// the deadline the answered ones count as given and the rest as wrong (js/scoring.js withMissed).
//   resume.quiz = { done, total, score, answered: [question index as stored], missed: [question text] }

const LETTERS = "ABCDEFGH";
const sameSet = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));

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
      correct: new Set([...question.correct].map((i) => order.indexOf(i))),
    };
  });
}

export async function renderQuiz(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  if (availability(lesson) !== "open" || lesson.quizFinished) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading st-focus-loading--space"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
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
  // Where the student stopped: only the questions not answered yet are asked.
  const total = quiz.questions.length;
  const resume = resumeOf(progress, "quiz", total);
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
        <a class="st-icon-button st-icon-button--light" href="#${pathUrl}" aria-label="Isara">${icon("close")}</a>
        <span class="st-quiz__label">Pagsusulit</span>
      </header>
      ${quiz.title ? `<h1 class="st-quiz__title">${escapeHtml(quiz.title)}</h1>` : ""}
      <div class="st-rocket" aria-hidden="true">
        <span class="st-rocket__fill" id="quiz-fill"></span>
        <span class="st-rocket__ship" id="quiz-rocket">${icon("rocket")}</span>
      </div>
      <p class="st-quiz__progress" id="quiz-progress"></p>
      <div class="st-quiz__question">
        <h2 id="quiz-question"></h2>
        <p class="st-quiz__hint" id="quiz-hint"></p>
      </div>
      <div class="st-choices" id="quiz-choices" role="group" aria-labelledby="quiz-question"></div>
      <div class="st-focus-footer">
        <button class="st-action st-action--next st-wide" type="button" id="quiz-next" disabled>Susunod</button>
      </div>
    </section>`;

  const choicesEl = $("#quiz-choices");
  const next = $("#quiz-next");
  const answers = quiz.questions.map(() => new Set());
  let index = 0;
  let saving = false;
  onLeave(() => {});

  const isRight = (i) => sameSet(answers[i], quiz.questions[i].correct);
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
    if (!button) return;
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
    drawChoices();
    choicesEl.querySelector(`[data-choice="${choice}"]`)?.focus();
  });

  const finish = async () => {
    if (saving) return;
    saving = true;
    next.disabled = true;
    const { score, missed } = answeredAfter(quiz.questions.length);
    try {
      await saveProgress(
        lessonId,
        {
          quizFinished: true,
          quizScore: score,
          quizTotal: total,
          quizCompletedAt: serverTimestamp(),
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
      refreshSummary();
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

  next.addEventListener("click", () => {
    if (index < quiz.questions.length - 1) {
      index += 1;
      saveResume(lessonId, "quiz", { done: answered.size + index, total, ...answeredAfter(index) });
      showQuestion();
    } else {
      finish();
    }
  });

  // Every answer was saved but finishing wasn't: finish now.
  if (quiz.questions.length) showQuestion();
  else finish();
}
