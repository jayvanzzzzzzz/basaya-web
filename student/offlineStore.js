// Explicit lesson downloads are separate from Firestore's cached progress.
let opened;
function database() {
  return opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("basaya-downloads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("lessons", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", mode);
    const request = action(tx.objectStore("lessons"));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error("Hindi ma-save sa device."));
  });
}
const key = (uid, classId, id) => JSON.stringify([uid, classId, id]);
export const getDownload = (uid, classId, id) => transaction("readonly", (s) => s.get(key(uid, classId, id)));
export const putDownload = (uid, classId, lesson) => transaction("readwrite", (s) =>
  s.put({ ...lesson, key: key(uid, classId, lesson.meta.id), uid, classId }));
// Only update metadata on a record that still exists. Read and write in the same
// transaction so a refresh cannot restore a removed download or roll back new content.
export const updateDownloadMetadata = (uid, classId, meta) => transaction("readwrite", (store) => {
  const request = store.get(key(uid, classId, meta.id));
  request.onsuccess = () => {
    const saved = request.result;
    if (saved) {
      const updated = { ...meta, id: saved.meta.id, contentVersion: saved.meta.contentVersion };
      if (JSON.stringify(saved.meta) !== JSON.stringify(updated)) store.put({ ...saved, meta: updated });
    }
  };
  return request;
});
export async function listDownloads(uid, classId) {
  return (await transaction("readonly", (s) => s.getAll())).filter((item) => item.uid === uid && item.classId === classId);
}
export async function removeDownload(uid, classId, id) {
  const item = await getDownload(uid, classId, id);
  await transaction("readwrite", (s) => s.delete(key(uid, classId, id)));
  if (item?.audioCache) await caches.delete(item.audioCache);
}

export const snapshotOf = (rows) => ({
  empty: !rows.length,
  docs: rows.map(({ id, data }) => ({ id, get: (field) => data[field], data: () => data })),
});
