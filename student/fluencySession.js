import { student, classId } from './data.js';
import { postToApi } from '../js/api.js';
import { readingDraft, advanceReading } from './fluencyStore.js';

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
            const bytes = new Uint8Array(await clip.blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            extra.audio = btoa(binary);
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
      await readingDraft(`${key}:backup:${Date.now()}`, draft);
      draft = { state: accepted, queue: [], clips: draft.clips, acknowledgedRevision: accepted.revision };
      await persist();
    },
    playback: async page => (await call('play-own', { page })).recordingUrl,
  };
  return api;
}
