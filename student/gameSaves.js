// Durable requests outlive the game screen. Each request has its own storage
// key so another tab cannot overwrite unrelated pending words.
const PREFIX = "basaya.gameSave.v1.";
const browserStorage = {
  get length() { return localStorage.length; },
  key: index => localStorage.key(index), getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key),
};
const sameOwner = (a, b) => a && b && a.uid === b.uid && a.classId === b.classId && a.progressSession === b.progressSession;
const sameLevel = (a, b) => sameOwner(a, b) && a.lessonId === b.lessonId && a.level === b.level && a.attemptId === b.attemptId;
const transient = error => !error.status || error.status === 408 || error.status === 429 || error.status >= 500;

export function createGameSaves({ getScope, send, storage = browserStorage,
  online = () => navigator.onLine, schedule = setTimeout, cancel = clearTimeout }) {
  const jobs = new Map();
  const listeners = new Set();
  let running = null;
  let timer = null;
  let disposed = false;
  let storageFailed = false;
  let rerun = false;
  const emit = event => {
    for (const listener of listeners) {
      try { listener(event); } catch (error) { console.error(error); }
    }
  };
  const persist = job => storage.setItem(PREFIX + job.eventId, JSON.stringify(job));
  const remove = job => { storage.removeItem(PREFIX + job.eventId); jobs.delete(job.eventId); };
  const read = () => {
    const stored = new Map();
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const job = JSON.parse(storage.getItem(key));
        if (job?.eventId && key === PREFIX + job.eventId && job.uid && job.classId && job.lessonId && job.attemptId &&
            ["answer", "finish"].includes(job.kind) && Number.isFinite(job.level) &&
            (job.kind === "finish" || typeof job.word === "string")) stored.set(job.eventId, job);
      } catch { /* A corrupt record must not stop other pending saves. */ }
    }
    jobs.clear();
    for (const [id, job] of stored) jobs.set(id, job);
  };
  const owned = () => [...jobs.values()].filter(job => sameOwner(job, getScope()));
  const ready = job => !job.error || transient(job.error);
  const rejectedLevel = job => [...jobs.values()].some(other => sameLevel(other, job) && other.error && !transient(other.error));
  const covers = (job, other) => job.kind === "finish" && Array.isArray(job.words) && job.words.includes(other.word);
  const blocked = job => job.kind === "finish"
    ? [...jobs.values()].some(other => other.kind === "answer" && sameLevel(other, job) && !covers(job, other))
    : [...jobs.values()].some(other => sameLevel(other, job) && covers(other, job));
  const priority = job => job.kind === "finish" && Array.isArray(job.words) ? 0 : job.kind === "answer" ? 1 : 2;
  const later = () => {
    if (disposed || storageFailed || !online()) return;
    const waiting = owned().filter(job => ready(job) && !blocked(job) && !rejectedLevel(job));
    if (!waiting.length) return;
    const delay = Math.max(0, Math.min(...waiting.map(job => job.retryAt || 0)) - Date.now());
    timer = schedule(() => { timer = null; flush(); }, delay);
  };
  const flush = () => {
    if (running) { rerun = true; return running; }
    if (disposed) return Promise.resolve();
    if (timer !== null) { cancel(timer); timer = null; }
    running = (async () => {
      await Promise.resolve();
      storageFailed = false;
      read();
      while (!disposed && online()) {
        const job = owned().sort((a, b) => priority(a) - priority(b) || a.createdAt - b.createdAt)
          .find(item => ready(item) && !blocked(item) && !rejectedLevel(item) && (item.retryAt || 0) <= Date.now());
        if (!job) break;
        try {
          const result = await send({ ...job });
          // A validated batch finalization accepts these words atomically.
          // Retain them until that response, including across lost responses.
          for (const other of [...jobs.values()]) {
            if (other.kind === "answer" && sameLevel(job, other) && covers(job, other)) remove(other);
          }
          remove(job);
          emit({ type: "saved", job, result });
        } catch (error) {
          if (!storage.getItem(PREFIX + job.eventId)) continue;
          job.error = { message: error.message || "Hindi ma-save ang sagot.", status: error.status || 0 };
          job.retries = (job.retries || 0) + 1;
          job.retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(job.retries - 1, 5));
          persist(job);
          jobs.set(job.eventId, job);
          emit({ type: "error", job, error: job.error });
          // A dropped connection should not produce a burst of failing requests.
          if (transient(job.error)) break;
        }
      }
    })().catch(error => { storageFailed = true; emit({ type: "storage-error", error }); }).finally(() => {
      running = null;
      if (rerun && !disposed) { rerun = false; flush(); }
      else later();
    });
    return running;
  };
  return {
    enqueue(fields) {
      if (!sameOwner(fields, getScope())) throw new Error("Nagbago ang account o klase. Buksan muli ang laro.");
      if (!fields.attemptId) throw new Error("I-update ang server at buksan muli ang laro bago sumagot.");
      read();
      const duplicate = [...jobs.values()].find(job => sameLevel(job, fields) && job.kind === fields.kind &&
        (job.kind === "finish" || job.word === fields.word));
      if (duplicate) {
        if (fields.kind === "finish" && Array.isArray(fields.words)) {
          duplicate.words = [...new Set([...(duplicate.words || []), ...fields.words])];
          persist(duplicate); jobs.set(duplicate.eventId, duplicate); flush();
        }
        return duplicate;
      }
      const job = { ...fields, createdAt: Date.now() };
      persist(job); // Persist before showing an answer as found.
      jobs.set(job.eventId, job);
      emit({ type: "queued", job });
      flush();
      return job;
    },
    entries(fields) { return owned().filter(job => !fields || sameLevel(job, { ...getScope(), ...fields })); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    reconcile(fields, acceptedWords = []) {
      read();
      const current = { ...getScope(), ...fields };
      for (const job of owned()) {
        if (job.lessonId !== fields.lessonId) continue;
        if (!sameLevel(job, current) || (job.kind === "answer" && acceptedWords.includes(job.word))) remove(job);
      }
      emit({ type: "reconciled" });
      flush();
    },
    retry(fields) {
      read();
      for (const job of owned()) if (!fields || sameLevel(job, { ...getScope(), ...fields })) {
        delete job.error; job.retryAt = 0; persist(job);
      }
      return flush();
    },
    resume({ immediate = false } = {}) {
      if (immediate) {
        try {
          read();
          for (const job of owned()) if (job.error && transient(job.error)) { job.retryAt = 0; persist(job); }
        } catch (error) { emit({ type: "storage-error", error }); }
      }
      return flush();
    },
    dispose() { disposed = true; if (timer !== null) cancel(timer); listeners.clear(); },
  };
}
