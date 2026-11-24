let opened;
function database() {
  return opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('basaya-reading-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readingDraft(key, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', value === undefined ? 'readonly' : 'readwrite');
    const request = value === undefined ? tx.objectStore('drafts').get(key) : tx.objectStore('drafts').put(value, key);
    tx.oncomplete = () => resolve(value === undefined ? request.result : value);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Hindi ma-save sa device. Magbakante ng storage at subukan muli.'));
  });
}

// Only teaching progress is optimistic. Grades and final submission come from the server.
export function advanceReading(state, operation, clip) {
  const next = structuredClone(state);
  if (operation === 'word') {
    next.word++;
    if (next.word >= next.pages[next.page].words.length) next.stage = 'sentence';
  } else if (operation === 'listen') next.stage = 'record';
  else if (operation === 'upload') { next.stage = 'preview'; next.clips[next.page] = { eventId: clip.eventId }; }
  else if (operation === 'next') {
    next.page++; next.word = 0;
    next.stage = next.pages[next.page].words.length ? 'words' : 'sentence';
  }
  next.revision++;
  return next;
}
