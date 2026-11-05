import { createHash } from 'node:crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { AssessmentError, context, assessmentOperation } from './assessments.js';
import { fluencyPages } from './fluencyContent.js';
import { validateFluencyAudio, putFluencyAudio, fluencyPlaybackUrl } from './fluencyStorage.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status, message) => { throw new AssessmentError(status, message); };
const keyFor = body => hash([body.classId, body.progressSession, body.lessonId, body.practice ? body.entryId : '']);
const stamp = () => Timestamp.now();
const nextStage = page => page.words.length ? 'words' : 'sentence';
const view = state => ({ revision: state.revision, pages: state.pages, page: state.page, word: state.word, stage: state.stage, status: state.status, clips: (state.clips || []).map(clip => clip ? { eventId: clip.eventId, duration: clip.duration } : null), grade: state.grade || null, feedback: state.feedback || '' });
const publicProgress = state => ({ page: state.page, word: state.word, stage: state.stage, total: state.pages.length, status: state.status, revision: state.revision });

export async function fluencyOperation(db, uid, body, storage = { put: putFluencyAudio, playback: fluencyPlaybackUrl }) {
  if (!body || !/^fluency-(begin|word|listen|upload|next|submit|list|play|play-own|grade)$/.test(body.operation)) fail(400, 'Invalid reading request.');
  if (['fluency-list', 'fluency-play', 'fluency-grade'].includes(body.operation)) return teacherOperation(db, uid, body, storage);
  const attemptId = keyFor(body);
  const ref = db.doc(`users/${uid}/fluencyAttempts/${attemptId}`);
  const progressRef = db.doc(`users/${uid}/assignedLessons/${body.lessonId}`);
  let bytes, digest;
  if (body.operation === 'fluency-upload') {
    if (!/^[a-f0-9-]{36}$/i.test(body.eventId || '')) fail(400, 'Invalid recording ID.');
    bytes = validateFluencyAudio(body.audio);
    digest = hash(bytes.toString('base64'));
  }
  const authorize = async (tx, allowClosed = false) => {
    const ctx = await context(tx, db, uid, body, { open: !allowClosed });
    const [saved, content] = await Promise.all([tx.get(ref), tx.get(db.doc(`lessons/${body.lessonId}/pronunciation/content`))]);
    let state = saved.data();
    if (!state) {
      const pages = fluencyPages(content.data());
      if (!pages.length || pages.length > 5 || pages.some(p => p.sentence.length > 200)) fail(409, 'This lesson has no valid reading pages.');
      state = { classId: body.classId, progressSession: body.progressSession, lessonId: body.lessonId, uid, practice: Boolean(body.practice), revision: 0, pages, page: 0, word: 0, stage: nextStage(pages[0]), status: 'draft', clips: pages.map(() => null), title: content.get('title') || 'Bigkas' };
    }
    return { ctx, saved, state };
  };
  // Upload only after authorizing the student and current page. Never accept a storage key from clients.
  if (bytes) {
    const checked = await db.runTransaction(tx => authorize(tx));
    const state = checked.state;
    if (state.status !== 'draft' || state.page !== body.page || !['record', 'preview'].includes(state.stage)) fail(409, 'Refresh your reading page.');
    const old = state.clips[state.page];
    if (old?.eventId === body.eventId) {
      if (old.digest !== digest) fail(409, 'This recording ID is already used.');
      return view(state);
    }
    if (body.revision !== state.revision) fail(409, 'Your reading progress changed. Reopen this activity.');
    await storage.put(`student-readings/${uid}/${attemptId}/${body.page}/${body.eventId}.wav`, bytes);
  }
  return db.runTransaction(async tx => {
    const { saved, state } = await authorize(tx, body.operation === 'fluency-begin');
    if (body.operation === 'fluency-play-own') {
      const clip = state.clips?.[body.page];
      if (!clip) fail(404, 'Recording not found.');
      return { recordingUrl: storage.playback(clip.storageKey) };
    }
    if (body.operation === 'fluency-begin') {
      if (state.practice && state.status === 'submitted') {
        state.status = 'draft'; state.page = 0; state.word = 0;
        state.stage = nextStage(state.pages[0]); state.clips = state.pages.map(() => null);
        state.revision++; state.lastEventId = '';
        tx.set(ref, { ...state, updatedAt: stamp() });
      } else if (!saved.exists) tx.set(ref, { ...state, updatedAt: stamp() });
      return view(state);
    }
    if (body.eventId && state.lastEventId === body.eventId) return view(state);
    if (state.status !== 'draft') {
      if (body.operation === 'fluency-submit' && ['submitted', 'graded'].includes(state.status)) return view(state);
      fail(409, 'This reading has already been submitted.');
    }
    if (body.operation === 'fluency-upload' && state.clips[state.page]?.eventId === body.eventId && state.clips[state.page]?.digest === digest) return view(state);
    if (state.revision !== body.revision || state.page !== body.page) fail(409, 'Your reading progress changed. Reopen this activity.');
    if (body.operation === 'fluency-word') {
      if (state.stage !== 'words' || state.word !== body.word) fail(409, 'Complete the current Get Ready word.');
      state.word++;
      if (state.word >= state.pages[state.page].words.length) state.stage = 'sentence';
    } else if (body.operation === 'fluency-listen') {
      if (state.stage !== 'sentence' && state.stage !== 'record') fail(409, 'Complete Get Ready first.');
      state.stage = 'record';
    } else if (body.operation === 'fluency-upload') {
      if (!['record', 'preview'].includes(state.stage)) fail(409, 'Complete Get Ready and listen first.');
      state.clips[state.page] = { eventId: body.eventId, digest, duration: (bytes.length - 44) / 32000, storageKey: `student-readings/${uid}/${attemptId}/${state.page}/${body.eventId}.wav` };
      state.stage = 'preview';
    } else if (body.operation === 'fluency-next') {
      if (state.stage !== 'preview' || !state.clips[state.page] || state.page >= state.pages.length - 1) fail(409, 'Save this page recording first.');
      state.page++; state.word = 0; state.stage = nextStage(state.pages[state.page]);
    } else if (body.operation === 'fluency-submit') {
      if (state.page !== state.pages.length - 1 || state.clips.some(clip => !clip) || state.stage !== 'preview') fail(409, 'Record every reading before submitting.');
      state.status = 'submitted'; state.submittedAt = stamp();
      if (!state.practice) tx.set(db.doc(`classes/${body.classId}/fluencySubmissions/${uid}_${attemptId}`), { uid, lessonId: body.lessonId, progressSession: body.progressSession, attemptId, title: state.title, status: 'submitted', submittedAt: state.submittedAt });
    }
    state.revision++;
    state.lastEventId = body.eventId || '';
    tx.set(ref, { ...state, updatedAt: stamp() });
    if (!state.practice) tx.set(progressRef, {
      classId: body.classId, progressSession: body.progressSession, fluency: publicProgress(state), updatedAt: stamp(),
      ...(state.status === 'submitted' ? { pronunciationFinished: true, pronunciationReviewStatus: 'pending', pronunciationScore: FieldValue.delete(), pronunciationTotal: FieldValue.delete() } : {}),
    }, { merge: true });
    return view(state);
  });
}

async function teacherOperation(db, uid, body, storage) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(body.classId || '')) fail(400, 'Invalid class.');
  const [profile, classroom] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`classes/${body.classId}`).get()]);
  if (profile.get('role') !== 'teacher' || classroom.get('teacherId') !== uid) fail(403, 'Only this class teacher can review readings.');
  const submissions = db.collection(`classes/${body.classId}/fluencySubmissions`);
  if (body.operation === 'fluency-list') {
    const snap = await submissions.limit(100).get();
    const rows = await Promise.all(snap.docs.map(async doc => {
      const row = doc.data();
      const student = await db.doc(`users/${row.uid}`).get();
      return { id: doc.id, ...row, submittedAt: row.submittedAt?.toMillis?.() || 0, name: student.get('fullName') || [student.get('firstName'), student.get('lastName')].filter(Boolean).join(' ') || 'Student' };
    }));
    return { submissions: rows.sort((a, b) => Number(a.status === 'graded') - Number(b.status === 'graded') || a.submittedAt - b.submittedAt) };
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(body.submissionId || '')) fail(400, 'Invalid submission.');
  const indexRef = submissions.doc(body.submissionId);
  const index = await indexRef.get();
  if (!index.exists) fail(404, 'Submission not found.');
  const entry = index.data();
  const attemptRef = db.doc(`users/${entry.uid}/fluencyAttempts/${entry.attemptId}`);
  const state = (await attemptRef.get()).data();
  if (!state || state.classId !== body.classId || state.uid !== entry.uid || state.progressSession !== entry.progressSession) fail(403, 'Invalid submission.');
  if (body.operation === 'fluency-play') return { ...view(state), pages: state.pages.map((page, index) => ({ ...page, recordingUrl: storage.playback(state.clips[index].storageKey) })) };
  const grade = body.grade;
  if (!grade || !['accuracy', 'smoothness', 'expression'].every(key => Number.isInteger(grade[key]) && grade[key] >= 1 && grade[key] <= 4)) fail(400, 'Choose a score from 1 to 4 for each criterion.');
  if (typeof body.feedback !== 'string' || body.feedback.length > 1000) fail(400, 'Keep feedback within 1000 characters.');
  await db.runTransaction(async tx => {
    const studentBody = { classId: body.classId, progressSession: entry.progressSession, lessonId: entry.lessonId };
    await context(tx, db, entry.uid, studentBody, { open: false });
    const current = (await tx.get(attemptRef)).data();
    if (!['submitted', 'graded'].includes(current?.status)) fail(409, 'This reading is not submitted.');
    const score = grade.accuracy + grade.smoothness + grade.expression;
    tx.update(attemptRef, { grade, feedback: body.feedback.trim(), status: 'graded', gradedAt: stamp(), gradedBy: uid });
    tx.update(indexRef, { status: 'graded' });
    tx.set(db.doc(`users/${entry.uid}/assignedLessons/${entry.lessonId}`), {
      pronunciationReviewStatus: 'graded', pronunciationScore: score, pronunciationTotal: 12,
      fluency: { ...publicProgress(current), status: 'graded' },
      skills: { pagbigkas: { correct: score, attempts: 12, items: 12, completedAt: stamp(), validation: 'server-v1', teacherGraded: true } },
    }, { merge: true });
  });
  await assessmentOperation(db, entry.uid, { operation: 'summary', classId: body.classId, progressSession: entry.progressSession }).catch(error => console.warn('Reading grade summary deferred:', error.message));
  return { graded: true };
}
