import { student, classId } from './data.js';
import { postToApi } from '../js/api.js';
import { readingDraft, advanceReading } from './fluencyStore.js';

async function encodedAudio(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function requireWordVerification(response) {
  if (response.wordVerification !== 1) throw Object.assign(new Error('Hindi pa handa ang pagsuri ng pagbigkas. Subukan muli mamaya.'), { code: 'WORD_VERIFICATION_UNAVAILABLE' });
}

export async function openReading(lesson) {
  const scope = { classId: classId(), progressSession: student.profile.progressSession || '', lessonId: lesson.contentId || lesson.id.replace(/^practice:/, ''), ...(lesson.practice ? { practice: true, entryId: lesson.id } : {}) };
  // The lesson data layer knows how a practice entry maps to its original lesson.
  if (lesson.lessonId) scope.lessonId = lesson.lessonId;
  const owner = student.uid;
  const key = JSON.stringify([owner, scope]);
  let draft = await readingDraft(key);
  let syncJob;
  const owns = () => student.uid === owner && classId() === scope.classId && (student.profile.progressSession || '') === scope.progressSession;
  const call = (op, fields = {}) => {
    if (!owns()) throw new Error('Nagbago ang account o klase. Buksan muli ang aralin.');
    return postToApi('assessment', { ...scope, operation: `fluency-${op}`, ...fields }, { signal: AbortSignal.timeout(op === 'begin' ? 12000 : 40000) });
  };
  if (draft?.queue.some(item => item.operation === 'word')) {
    const accepted = await call('begin');
    await readingDraft(`${key}:backup:${Date.now()}`, draft);
    draft = { state: accepted, queue: [], clips: draft.clips, acknowledgedRevision: accepted.revision };
    await readingDraft(key, draft);
  }
  if (!draft) {
    const state = await call('begin');
    draft = { state, queue: [], clips: {}, acknowledgedRevision: state.revision };
    await readingDraft(key, draft);
  } else if (navigator.onLine && !draft.queue.length) {
    try { draft.state = await call('begin'); await readingDraft(key, draft); }
    catch { /* The device draft remains usable during a temporary outage. */ }
  }
  const persist = () => {
    if (!owns()) throw new Error('Nagbago ang account.');
    return readingDraft(key, draft);
  };
  const api = {
    get state() { return draft.state; },
    get pending() { return draft.queue.length; },
    clip: page => draft.clips[page],
    async act(operation, clip) {
      if (operation === 'word') throw new Error('Kailangang masuri muna ang pagbigkas ng salita.');
      const current = draft.state;
      const fields = { revision: current.revision, page: current.page, word: current.word, eventId: clip?.eventId || crypto.randomUUID() };
      const previous = structuredClone(draft);
      if (clip) draft.clips[current.page] = clip;
      draft.queue.push({ operation, fields, ...(clip ? { clip } : {}) });
      draft.state = advanceReading(current, operation, clip);
      try { await persist(); }
      catch (error) { draft = previous; throw error; }
    },
    async sync() {
      if (syncJob) return syncJob;
      syncJob = (async () => {
        while (draft.queue.length) {
          const item = draft.queue[0];
          const extra = { ...item.fields };
          if (item.operation === 'upload') {
            const clip = item.clip;
            if (clip?.eventId !== item.fields.eventId) throw new Error('Hindi makita ang naka-save na recording.');
            extra.audio = await encodedAudio(clip.blob);
          }
          const accepted = await call(item.operation, extra);
          draft.queue.shift();
          draft.acknowledgedRevision = accepted.revision;
          if (!draft.queue.length) draft.state = accepted;
          await persist();
        }
      })().finally(() => { syncJob = null; });
      return syncJob;
    },
    async checkWord(clip) {
      await api.sync();
      const current = draft.state;
      if (current.stage !== 'words') throw new Error('Na-update ang iyong progreso. Sundin ang kasalukuyang pahina.');
      // Probe the running server, not a cached capability. Older APIs consume a
      // word request without checking its audio, so never send them a recording.
      const ready = await call('begin');
      requireWordVerification(ready);
      if (ready.revision !== current.revision || ready.page !== current.page || ready.word !== current.word || ready.stage !== current.stage) {
        await api.refresh();
        throw Object.assign(new Error('Na-update ang iyong progreso. Pakinggan at bigkasin ang kasalukuyang salita.'), { code: 'READING_PROGRESS_CHANGED' });
      }
      let accepted;
      try {
        accepted = await call('word', { revision: current.revision, page: current.page, word: current.word, eventId: clip.eventId,
          ...(['localhost', '127.0.0.1'].includes(globalThis.location?.hostname) ? { speechDebug: true } : {}),
          audio: await encodedAudio(clip.blob) });
      } catch (error) {
        if (error.status === 409) {
          await api.refresh();
          throw Object.assign(new Error('Na-update ang iyong progreso. Pakinggan at bigkasin ang kasalukuyang salita.'), { code: 'READING_PROGRESS_CHANGED' });
        }
        throw error;
      }
      requireWordVerification(accepted);
      if (typeof accepted.wordAccepted !== 'boolean') throw Object.assign(new Error('Hindi makumpirma ang pagbigkas. Subukan muli.'), { code: 'WORD_VERIFICATION_UNAVAILABLE' });
      if (accepted.wordAccepted === true) {
        draft.state = accepted;
        draft.acknowledgedRevision = accepted.revision;
        await persist();
      }
      return accepted;
    },
    async submit() {
      await api.sync();
      const accepted = await call('submit', { revision: draft.state.revision, page: draft.state.page, eventId: crypto.randomUUID() });
      draft.state = accepted;
      await persist();
      return accepted;
    },
    async refresh() {
      if (syncJob) await syncJob.catch(() => {});
      const accepted = await call('begin');
      if (draft.state.stage === 'words') requireWordVerification(accepted);
      await readingDraft(`${key}:backup:${Date.now()}`, draft);
      draft = { state: accepted, queue: [], clips: draft.clips, acknowledgedRevision: accepted.revision };
      await persist();
    },
    playback: async page => (await call('play-own', { page })).recordingUrl,
  };
  return api;
}
