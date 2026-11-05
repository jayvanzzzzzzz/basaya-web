import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { summarize, resultsFrom, withMissed, lessonParts } from "./assessmentScoring.js";

export class AssessmentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new AssessmentError(status, message); };
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const ms = value => value?.toMillis?.() ?? null;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const normalizeWord = value => value.trim().toUpperCase();
const contentOf = snap => snap.docs.find(d => d.id === "content")?.data() || snap.docs.find(d => d.id !== "status")?.data() || {};
const indices = (values, size) => [...new Set((values || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < size))];
const parts = ["lectures", "game", "activity", "pronunciation", "quiz"];
const finishedField = part => `${part === "lecture" ? "lecture" : part}Finished`;
const attemptKey = (body, lessonId = body.lessonId) => hash([body.classId, body.progressSession, lessonId]);

async function contents(tx, db, lessonId, selected = parts) {
  // An answer or page save needs only its own section. Keep the complete shape
  // for metadata and deadline summaries, which do need every section.
  const empty = { docs: [] };
  const snaps = await Promise.all(parts.map(part => selected.includes(part)
    ? tx.get(db.collection(`lessons/${lessonId}/${part}`)) : empty));
  const [lecture, game, activity, pronunciation, quiz] = snaps;
  const a = contentOf(activity), q = contentOf(quiz), p = contentOf(pronunciation);
  const levels = game.docs.filter(d => d.id !== "status").map(d => ({ level: Number(d.get("level")), words: (d.get("words") || []).map(String).map(s => s.trim()).filter(Boolean) })).filter(l => l.words.length).sort((a, b) => a.level - b.level);
  return {
    lecture: contentOf(lecture), levels,
    activity: { ...a, pages: (a.pages || []).map(page => ({ ...page, words: page.words || [], correctIndices: indices(page.correctIndices, (page.words || []).length) })) },
    quiz: { ...q, questions: (q.questions || []).map(question => ({ ...question, choices: question.choices || [], answers: indices(question.answers?.length ? question.answers : [Number(question.answer) || 0], (question.choices || []).length) })) },
    pronunciation: { ...p, words: (p.words || []).map(String).map(s => s.trim()).filter(Boolean) },
    gameSkipped: !levels.length || game.docs.some(d => d.id === "status" && d.get("completion") === "skipped"),
    activitySkipped: activity.docs.some(d => d.id === "status" && d.get("completion") === "skipped"),
  };
}

export async function context(tx, db, uid, body, { open = true, lesson = true } = {}) {
  if (!id(uid) || !id(body.classId) || (lesson && !id(body.lessonId))) fail(400, "Invalid assessment request.");
  const userRef = db.doc(`users/${uid}`);
  const [user, roster, classroom, links] = await Promise.all([
    tx.get(userRef), tx.get(db.doc(`classes/${body.classId}/students/${uid}`)),
    tx.get(db.doc(`classes/${body.classId}`)), tx.get(db.collection(`classes/${body.classId}/classLessons`)),
  ]);
  if (user.get("role") !== "student" || user.get("classId") !== body.classId || !roster.exists || !classroom.exists || classroom.get("membershipClosed") === true) fail(403, "You are not an approved member of this class.");
  if ((user.get("progressSession") || "") !== body.progressSession) fail(409, "Your class progress changed. Refresh the lessons.");
  const assigned = links.docs.filter(d => d.get("mode") !== "practice");
  const link = lesson && links.docs.find(d => d.id === (body.practice ? body.entryId : body.lessonId) && (d.get("lessonId") || d.id) === body.lessonId && (body.practice ? d.get("mode") === "practice" : d.get("mode") !== "practice")) ||
    (lesson && !body.practice && assigned.find(d => (d.get("lessonId") || d.id) === body.lessonId));
  if (lesson && !link) fail(403, "This assessment is not assigned to your class.");
  const now = Date.now();
  if (lesson && open && ((ms(link.get("openAt")) != null && now < ms(link.get("openAt"))) || (ms(link.get("dueAt")) != null && now > ms(link.get("dueAt"))))) fail(403, "This lesson is not open.");
  return { userRef, user, roster, links: assigned, allLinks: links.docs, link, now };
}

// A summary is always calculated from protected progress and server-read assignments.
async function summaryFor(tx, db, uid, ctx, replacement, replacementStates) {
  const [snap, attempts] = await Promise.all([tx.get(db.collection(`users/${uid}/assignedLessons`)), tx.get(db.collection(`users/${uid}/assessmentAttempts`))]);
  const docs = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
  if (replacement) docs.set(replacement.id, replacement);
  const privateStates = new Map(attempts.docs.map(d => [d.id, d.get("parts") || {}]));
  if (replacement) privateStates.set(attemptKey({ classId: ctx.user.get("classId"), progressSession: ctx.user.get("progressSession") || "" }, replacement.id), replacementStates);
  for (const doc of docs.values()) {
    const trusted = privateStates.get(attemptKey({ classId: ctx.user.get("classId"), progressSession: ctx.user.get("progressSession") || "" }, doc.id)) || {};
    doc.resume = { ...doc.resume };
    for (const part of Object.keys(doc.resume)) {
      if (!trusted[part]?.attemptId || trusted[part].attemptId !== doc.assessmentState?.[part]?.attemptId) delete doc.resume[part];
    }
  }
  const seen = new Set();
  const uniqueLinks = ctx.links.filter(link => {
    const lessonId = link.get("lessonId") || link.id;
    if (seen.has(lessonId)) return false;
    seen.add(lessonId);
    return true;
  });
  const lessons = (await Promise.all(uniqueLinks.map(async link => {
    const lessonId = link.get("lessonId") || link.id;
    const dueAt = ms(link.get("dueAt"));
    const progress = docs.get(lessonId) || {};
    const c = dueAt != null && dueAt < ctx.now ? await contents(tx, db, lessonId) : null;
    if (dueAt != null && ms(ctx.roster.get("joinedAt")) != null && dueAt < ms(ctx.roster.get("joinedAt")) && !lessonParts(progress, { game: c?.gameSkipped, activity: c?.activitySkipped }).finished) return null;
    return { id: lessonId, dueAt, gameSkipped: c?.gameSkipped, activitySkipped: c?.activitySkipped,
      items: c ? { talasalitaan: c.levels.reduce((n, l) => n + l.words.length, 0), pagkilala: c.activity.pages.length, pagbigkas: c.pronunciation.words.length, pagsusulit: c.quiz.questions.length } : {} };
  }))).filter(Boolean);
  const included = [...docs.values()].filter(d => lessons.some(l => l.id === d.id));
  const summary = summarize(withMissed(resultsFrom(included), included, lessons, ctx.now));
  return { ...summary, lessonsAssigned: lessons.length, updatedAt: Timestamp.fromMillis(ctx.now), validation: "server-v1" };
}

function publicContent(c) {
  return {
    quiz: { title: c.quiz.title || "", questions: c.quiz.questions.map(q => ({ question: q.question || "", choices: q.choices, multiple: q.answers.length > 1 })) },
    activity: { title: c.activity.title || "", instruction: c.activity.instruction || "", pages: c.activity.pages.map(p => ({ words: p.words, pickCount: p.correctIndices.length })) },
    counts: { lecture: c.lecture.pages?.length || 0, game: c.levels.length, activity: c.activity.pages.length, pronunciation: c.pronunciation.words.length, quiz: c.quiz.questions.length },
    skipped: { game: c.gameSkipped, activity: c.activitySkipped },
    items: { talasalitaan: c.levels.reduce((n, l) => n + l.words.length, 0), pagkilala: c.activity.pages.length, pagbigkas: c.pronunciation.words.length, pagsusulit: c.quiz.questions.length },
  };
}

function selection(raw, size) {
  if (!Array.isArray(raw) || raw.length > size || raw.some(n => !Number.isInteger(n) || n < 0 || n >= size) || new Set(raw).size !== raw.length) fail(400, "Invalid answer choices.");
  return [...raw].sort((a, b) => a - b);
}
function skill(correct, total, now, extras = {}) {
  return { correct, attempts: total, items: total, completedAt: Timestamp.fromMillis(now), validation: "server-v1", ...extras };
}

/** The HTTP caller supplies answers only. No score, total, timestamp or skill map is accepted. */
export async function assessmentOperation(db, uid, body, speechEvidence = null) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid assessment request.");
  const allowed = ["operation", "classId", "progressSession", "lessonId", "part", "index", "selected", "eventId", "level", "word", "words", "done", "practice", "entryId", "attemptId"];
  if (Object.keys(body).some(k => !allowed.includes(k))) fail(400, "Submit answers, not assessment results.");
  if (!["metadata-list", "metadata", "content", "begin", "abandon", "answer", "finish", "resume", "summary", "speech-check"].includes(body.operation)) fail(400, "Unknown assessment operation.");
  if ("words" in body && (body.operation !== "finish" || body.part !== "game")) fail(400, "Word batches are only supported for crossword finalization.");
  if (body.practice && !["metadata", "content", "answer"].includes(body.operation)) fail(400, "Practice does not save results.");
  return db.runTransaction(async tx => {
    const ctx = await context(tx, db, uid, body, { open: !["summary", "content", "metadata", "metadata-list", "abandon"].includes(body.operation), lesson: !["summary", "metadata-list"].includes(body.operation) });
    if (body.operation === "metadata-list") {
      const ids = [...new Set(ctx.allLinks.map(link => link.get("lessonId") || link.id))];
      const lessons = await Promise.all(ids.map(async lessonId => {
        const { counts, skipped, items } = publicContent(await contents(tx, db, lessonId));
        return [lessonId, { counts, skipped, items }];
      }));
      return { lessons: Object.fromEntries(lessons) };
    }
    if (body.operation === "summary") {
      const summary = await summaryFor(tx, db, uid, ctx);
      tx.update(ctx.userRef, { skillSummary: summary });
      return { summary };
    }
    const section = body.part === "lecture" ? "lectures" : body.part;
    if (!["metadata", "content"].includes(body.operation) && !parts.includes(section)) fail(400, "Invalid assessment part.");
    const readOnly = ["metadata", "content"].includes(body.operation);
    const ref = !readOnly && !body.practice ? db.doc(`users/${uid}/assignedLessons/${body.lessonId}`) : null;
    const attemptRef = ref ? db.doc(`users/${uid}/assessmentAttempts/${attemptKey(body)}`) : null;
    // These reads are independent after membership and schedule validation.
    const [c, saved, attempt] = await Promise.all([
      contents(tx, db, body.lessonId, readOnly ? parts : [section]),
      ref ? tx.get(ref) : null,
      attemptRef ? tx.get(attemptRef) : null,
    ]);
    if (body.operation === "metadata") {
      const { counts, skipped, items } = publicContent(c);
      return { counts, skipped, items };
    }
    if (body.operation === "content") {
      if (ms(ctx.link.get("openAt")) != null && ctx.now < ms(ctx.link.get("openAt"))) fail(403, "This lesson has not opened yet.");
      return publicContent(c);
    }
    const { part, operation } = body;
    if (!["quiz", "activity", "game", "lecture", "pronunciation"].includes(part)) fail(400, "Invalid assessment part.");
    if ((operation === "begin" && !["quiz", "game", "pronunciation"].includes(part)) ||
        (operation === "abandon" && part !== "quiz")) fail(400, "Invalid assessment start or exit.");
    if ((part === "game" && c.gameSkipped) || (part === "activity" && c.activitySkipped)) fail(403, "This part is skipped.");
    if (body.practice) {
      if (operation !== "answer" || !["quiz", "activity"].includes(part) || !Number.isInteger(body.index)) fail(400, "Invalid practice answer.");
      const item = part === "quiz" ? c.quiz.questions[body.index] : c.activity.pages[body.index];
      if (!item) fail(400, "Invalid practice item.");
      const selected = selection(body.selected, (item.choices || item.words).length);
      const correct = item.answers || item.correctIndices;
      return { right: same(selected, correct) || (part === "activity" && !correct.length), correctIndices: part === "activity" ? correct : [], explanation: item.explanation ?? c.activity.explanation ?? "" };
    }
    const progress = saved.data() || {};
    if (saved.exists && ((progress.classId && progress.classId !== body.classId) || (progress.progressSession || "") !== body.progressSession)) fail(409, "Your class progress changed. Refresh the lessons.");
    if (part === "game" && operation === "begin" && progress.gameFinished) return { finished: true };
    if (part === "pronunciation" && operation === "begin" && progress.pronunciationFinished) return { finished: true };
    if (part === "quiz" && !progress.lectureFinished && !body.practice) fail(403, "Finish the lecture first.");
    // Authority lives in a collection that was never client-writable, including
    // before rollout. A forged legacy assessmentState on progress is not evidence.
    const privateParts = attempt.get("parts") || {};
    if (operation === "abandon") {
      // Completion can win a race on another device. Never erase a submitted result.
      if (progress.quizFinished) return { abandoned: false, finished: true };
      const previous = privateParts.quiz;
      if (!id(body.attemptId)) fail(400, "The quiz attempt ID is required.");
      if (previous?.abandoned && previous.abandonedAttemptId === body.attemptId) return { abandoned: true };
      if (previous?.attemptId !== body.attemptId || progress.assessmentState?.quiz?.attemptId !== body.attemptId) fail(409, "This quiz attempt changed. Refresh before continuing.");
      // Accepted partial answers stay frozen once the deadline passes.
      if ((ms(ctx.link.get("dueAt")) != null && ctx.now > ms(ctx.link.get("dueAt"))) || (ms(ctx.link.get("openAt")) != null && ctx.now < ms(ctx.link.get("openAt")))) return { abandoned: false, closed: true };
      const empty = { attemptId: randomUUID(), abandoned: true, abandonedAttemptId: body.attemptId };
      const nextParts = { ...privateParts, quiz: empty };
      const updated = { ...progress, assessmentState: { ...progress.assessmentState, quiz: empty }, resume: { ...progress.resume }, skills: { ...progress.skills } };
      delete updated.resume.quiz;
      delete updated.skills.pagsusulit;
      for (const field of ["quizScore", "quizTotal", "quizCompletedAt", "quizFinished"]) delete updated[field];
      const summary = await summaryFor(tx, db, uid, ctx, { id: body.lessonId, ...updated }, nextParts);
      tx.set(ref, updated);
      tx.set(attemptRef, { parts: nextParts });
      tx.update(ctx.userRef, { skillSummary: summary });
      return { abandoned: true };
    }
    const trustedState = privateParts[part];
    const state = structuredClone(trustedState?.attemptId && trustedState.attemptId === progress.assessmentState?.[part]?.attemptId ? trustedState : {});
    state.attemptId ||= randomUUID();
    const version = hash(part === "quiz" ? c.quiz : part === "activity" ? c.activity : part === "game" ? c.levels : part === "pronunciation" ? c.pronunciation.words : c.lecture);
    if (state.version && state.version !== version) fail(409, "The lesson changed during your attempt. Ask your teacher to reset it.");
    state.version = version;
    const eventHash = hash({ ...body, eventId: undefined });
    let receiptRef;
    if (["answer", "speech-check"].includes(operation)) {
      if (!id(body.eventId)) fail(400, "An answer submission ID is required.");
      const receiptId = hash([body.classId, body.progressSession, body.lessonId, part, state.attemptId, body.eventId]);
      receiptRef = db.doc(`users/${uid}/assessmentReceipts/${receiptId}`);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        const expectedHash = operation === "speech-check" ? hash({ ...body, operation: "answer", eventId: undefined }) : eventHash;
        if (receipt.get("hash") !== expectedHash) fail(409, "This submission ID already has a different answer.");
        return operation === "speech-check" ? { replay: receipt.get("reply") } : receipt.get("reply");
      }
    }
    if (progress[finishedField(part)] && !body.practice) {
      if (operation === "finish") return { finished: true, score: progress[`${part}Score`] ?? null, total: progress[`${part}Total`] ?? null };
      fail(409, "This assessment part is already finalized.");
    }
    if (part === "quiz" && ["answer", "finish"].includes(operation) && body.attemptId !== state.attemptId) fail(409, "This quiz attempt ended. Open the quiz again to start over.");
    if (part === "game" && ["answer", "finish"].includes(operation) && body.attemptId && body.attemptId !== state.attemptId)
      fail(409, "This crossword attempt changed. Reopen the game.");
    const stamp = Timestamp.fromMillis(ctx.now);
    let reply = {}, resume = {}, record;
    const total = part === "quiz" ? c.quiz.questions.length : part === "activity" ? c.activity.pages.length : part === "pronunciation" ? c.pronunciation.words.length : part === "game" ? c.levels.length : c.lecture.pages?.length || 0;
    if (!total) fail(409, "This lesson has no items for this part.");

    if (part === "game" && operation === "begin") {
      // Establish an attempt ID before the browser persists pending words. Old
      // queued words then cannot be submitted after staff resets this attempt.
      if (!trustedState?.attemptId || trustedState.attemptId !== progress.assessmentState?.game?.attemptId) {
        tx.set(attemptRef, { parts: { ...privateParts, game: state } });
        tx.set(ref, { ...progress, classId: body.classId, progressSession: body.progressSession,
          assessmentState: { ...progress.assessmentState, game: state } });
      }
      const completedLevels = state.done || 0;
      const level = c.levels[completedLevels];
      return {
        level: level?.level ?? null, completedLevels, totalLevels: total, finished: !level, attemptId: state.attemptId,
        resume: { level: level?.level ?? null, foundWords: state.found || [] },
      };
    }

    if (part === "quiz") {
      const answers = state.answers ||= {};
      if (operation === "answer") {
        if (!Number.isInteger(body.index) || !c.quiz.questions[body.index]) fail(400, "Invalid question.");
        const q = c.quiz.questions[body.index], selected = selection(body.selected, q.choices.length);
        if (!selected.length) fail(400, "Choose an answer.");
        if (answers[body.index]) {
          if (!same(answers[body.index].selected, selected)) fail(409, "That question's answer is already final.");
        } else answers[body.index] = { selected, right: same(selected, q.answers) };
      } else if (!["finish", "begin"].includes(operation)) fail(400, "Submit quiz answers individually.");
      const answered = Object.keys(answers).map(Number);
      const score = Object.values(answers).filter(a => a.right).length;
      const missed = answered.filter(i => !answers[i].right).map(i => c.quiz.questions[i].question || "");
      resume = { done: answered.length, total, score, answered, missed };
      reply = { score, total, done: answered.length, ...(operation === "begin" ? { attemptId: state.attemptId, resume } : {}) };
      if (operation === "finish") {
        if (answered.length !== total) fail(409, "Answer every question before finishing.");
        record = skill(score, total, ctx.now, { missedQuestions: missed });
      }
    } else if (part === "activity" || part === "pronunciation") {
      const done = state.done || 0;
      if (operation === "speech-check") {
        if (part !== "pronunciation" || body.index !== done) fail(409, "Refresh the current pronunciation word.");
        return { word: c.pronunciation.words[done] };
      }
      if (operation === "answer") {
        if (body.index !== done || done >= total) fail(409, "Submit the current item in order.");
        let right;
        if (part === "activity") {
          const page = c.activity.pages[done];
          const selected = selection(body.selected, page.words.length);
          right = page.correctIndices.length === 0 || same(selected, page.correctIndices);
          reply = { right, correctIndices: right ? page.correctIndices : [], explanation: right ? page.explanation ?? c.activity.explanation ?? "" : "" };
        } else {
          if (!speechEvidence || speechEvidence.index !== body.index) fail(400, "Submit recorded audio for pronunciation.");
          right = speechEvidence.band === "great" || speechEvidence.band === "okay";
          reply = { band: speechEvidence.band, right };
        }
        const misses = state.misses || 0;
        if (right) {
          state.correct = (state.correct || 0) + 1;
          if (!misses) state.firstTryCorrect = (state.firstTryCorrect || 0) + 1;
        } else {
          state.retries = (state.retries || 0) + 1;
          state.misses = misses + 1;
          if (part === "pronunciation") state.hardWords = [...new Set([...(state.hardWords || []), c.pronunciation.words[done]])];
        }
        const over = right || state.misses >= 3;
        if (over) { state.done = done + 1; state.misses = 0; }
        if (part === "activity" && over) {
          const page = c.activity.pages[done];
          reply.correctIndices = page.correctIndices;
          reply.explanation = page.explanation ?? c.activity.explanation ?? "";
        }
        reply.over = over;
      } else if (operation !== "finish" && !(part === "pronunciation" && operation === "begin")) fail(400, "Submit each attempt to the server.");
      resume = { done: state.done || 0, total, score: state.correct || 0, correct: state.correct || 0, firstTryCorrect: state.firstTryCorrect || 0, retries: state.retries || 0, lives: 3 - (state.misses || 0), misses: state.misses || 0, hardWords: state.hardWords || [] };
      reply = { ...reply, ...resume };
      if (operation === "finish") {
        if (resume.done !== total) fail(409, "Complete every item before finishing.");
        record = part === "activity" ? skill(resume.score, total, ctx.now, { retries: resume.retries }) : skill(resume.firstTryCorrect, total, ctx.now, { eventuallyCorrect: resume.correct, hardWords: resume.hardWords });
      }
    } else if (part === "game") {
      const levelIndex = state.done || 0;
      const level = c.levels[levelIndex];
      if (operation === "finish" && c.levels.slice(0, levelIndex).some(l => l.level === body.level)) return { score: levelIndex, total, finished: levelIndex === total };
      if (!level || body.level !== level.level) fail(409, "Refresh the current crossword level.");
      const words = [...new Set(level.words.map(normalizeWord))];
      if (operation === "finish" && body.words !== undefined) {
        if (!Array.isArray(body.words) || body.words.length > words.length ||
            body.words.some(word => typeof word !== "string" || word.length > 128 || !words.includes(normalizeWord(word))))
          fail(400, "Submit only words from the current crossword level.");
        state.found = [...new Set([...(state.found || []), ...body.words.map(normalizeWord)])];
      }
      if (operation === "answer") {
        if (typeof body.word !== "string" || body.word.length > 128 || !words.includes(normalizeWord(body.word))) fail(400, "This word is not in the current level.");
        state.found = [...new Set([...(state.found || []), normalizeWord(body.word)])];
      } else if (operation !== "finish") fail(400, "Submit found words to the server.");
      resume = { done: state.found?.length || 0, total: words.length, level: level.level, foundWords: state.found || [] };
      reply = { ...resume };
      if (operation === "finish") {
        if (resume.done !== words.length) fail(409, "Find every word before finishing this level.");
        state.done = levelIndex + 1;
        state.found = [];
        const items = c.levels.slice(0, state.done).reduce((n, l) => n + l.words.length, 0);
        record = skill(items, items, ctx.now, { levels: state.done });
        reply = { score: state.done, total, finished: state.done === total };
      }
    } else {
      const done = state.done || 0;
      if (operation === "resume") {
        if (!Number.isInteger(body.done) || body.done < done || body.done > Math.min(done + 1, total)) fail(400, "Read lecture pages in order.");
        state.done = body.done;
      } else if (operation !== "finish") fail(400, "Invalid lecture operation.");
      resume = { done: state.done || 0, total };
      if (operation === "finish" && resume.done < total) fail(409, "Finish every lecture page first.");
    }

    if (body.practice) return reply;
    const updated = { ...progress, classId: body.classId, progressSession: body.progressSession,
      assessmentState: { ...progress.assessmentState, [part]: state },
      resume: { ...progress.resume, [part]: { ...resume, updatedAt: stamp } } };
    if (operation === "finish") {
      const complete = part !== "game" || state.done === total;
      updated[finishedField(part)] = complete;
      updated[`${part}CompletedAt`] = stamp;
      if (part !== "lecture") {
        updated[`${part}Score`] = part === "game" ? state.done : reply.score;
        updated[`${part}Total`] = total;
      }
      if (record) {
        const key = { quiz: "pagsusulit", activity: "pagkilala", game: "talasalitaan", pronunciation: "pagbigkas" }[part];
        updated.skills = { ...progress.skills, [key]: record };
      }
      delete updated.resume[part];
      reply = { ...reply, finished: complete };
    }
    // All reads precede all writes; retries serialize simultaneous devices and finalization.
    const nextPrivateParts = { ...privateParts, [part]: state };
    const summary = operation === "finish" ? await summaryFor(tx, db, uid, ctx, { id: body.lessonId, ...updated }, nextPrivateParts) : null;
    tx.set(ref, updated);
    tx.set(attemptRef, { parts: nextPrivateParts });
    if (operation === "answer") tx.set(receiptRef, { hash: eventHash, reply, createdAt: stamp });
    if (summary) tx.update(ctx.userRef, { skillSummary: summary });
    return reply;
  });
}
