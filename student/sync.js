import { onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { offlineReady } from "../js/firebase.js";

let pending = false;
let failure = "";
let stop;
let owner = "";
const applying = new Set();
const receiptKey = (uid) => `basaya.pendingSaves.${uid}`;
const receipts = (uid) => JSON.parse(localStorage.getItem(receiptKey(uid)) || "{}");
// Ignore server timestamps when checking a receipt after a browser restart.
function expectedFields(data, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(data)) {
    if (["updatedAt", "completedAt"].includes(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && "_methodName" in value) {
      if (value._methodName.includes("deleteField")) result[path] = { deleted: true };
    } else if (value && typeof value === "object" && !Array.isArray(value)) expectedFields(value, path, result);
    else result[path] = { value };
  }
  return result;
}
function acknowledged(document, fields) {
  return Object.entries(fields).every(([path, expected]) => {
    const value = path.split(".").reduce((item, key) => item?.[key], document);
    return expected.deleted ? value === undefined : JSON.stringify(value) === JSON.stringify(expected.value);
  });
}
function paint() {
  let banner = document.getElementById("st-sync-status");
  if (!banner) {
    banner = document.createElement("p");
    banner.id = "st-sync-status";
    banner.className = "st-sync-status";
    banner.setAttribute("role", "status");
    document.getElementById("app-view")?.prepend(banner);
  }
  banner.hidden = navigator.onLine && !pending && !failure;
  banner.textContent = failure || (!navigator.onLine
    ? "Offline • Mga na-download na aralin lamang. Kumonekta bago ang deadline para maipasa ang mga sagot."
    : "Ipinapadala ang mga sagot… Huwag munang mag-sign out.");
  if (failure) {
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Nabasa ko na";
    dismiss.className = "button secondary";
    dismiss.addEventListener("click", () => {
      localStorage.removeItem(`basaya.syncError.${owner}`);
      failure = "";
      paint();
    });
    banner.append(" ", dismiss);
  }
}
window.addEventListener("online", paint);
window.addEventListener("offline", paint);
export function watchSync(uid, reference, onSynced = () => {}) {
  stop?.();
  owner = uid;
  failure = localStorage.getItem(`basaya.syncError.${uid}`) || "";
  stop = onSnapshot(reference, { includeMetadataChanges: true }, (snap) => {
    pending = snap.metadata.hasPendingWrites;
    if (!snap.metadata.fromCache && !pending) {
      const saved = receipts(uid);
      let received = false;
      for (const [id, fields] of Object.entries(saved)) {
        if (applying.has(id)) continue;
        received = true;
        const doc = snap.docs.find((item) => item.id === id);
        if (!acknowledged(doc?.data() || {}, fields)) reportSyncFailure(uid);
        delete saved[id];
      }
      localStorage.setItem(receiptKey(uid), JSON.stringify(saved));
      if (received) Promise.resolve(onSynced()).catch(console.warn);
    }
    paint();
  }, () => { failure = "Hindi ma-sync ang progreso. Kumonekta at i-refresh ang pahina."; paint(); });
  paint();
}
export function hasPendingSaves() { return pending || (owner && Object.keys(receipts(owner)).length > 0); }
export function reportSyncFailure(uid) {
  const message = "May sagot na hindi tinanggap ng server. Maaaring sarado na ang aralin o nagbago ang iyong klase. I-refresh ang mga aralin upang makita ang naitalang progreso.";
  localStorage.setItem(`basaya.syncError.${uid}`, message);
  if (owner === uid) { failure = message; paint(); }
}

// Resolve on a durable local snapshot, rather than waiting forever for a server
// acknowledgement while offline. Firestore persists and retries the write itself.
export async function saveLocally(reference, data, options, uid) {
  const durable = await offlineReady;
  if (!durable) {
    if (!navigator.onLine) throw new Error("Hindi available ang offline storage.");
    return setDoc(reference, data, options);
  }
  const saved = receipts(uid);
  const fields = expectedFields(data);
  const previous = saved[reference.id] || {};
  // A completion deletes resume.part: remove the older child receipt too.
  for (const path of Object.keys(fields)) for (const old of Object.keys(previous)) {
    if (old.startsWith(`${path}.`) || path.startsWith(`${old}.`)) delete previous[old];
  }
  saved[reference.id] = { ...previous, ...fields };
  localStorage.setItem(receiptKey(uid), JSON.stringify(saved));
  applying.add(reference.id);
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      applying.delete(reference.id);
      queueMicrotask(() => unsubscribe?.());
      error ? reject(error) : resolve();
    };
    // Attach after enqueueing the write; the initial snapshot includes this mutation.
    const write = setDoc(reference, data, options);
    unsubscribe = onSnapshot(reference, { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.hasPendingWrites) finish();
    }, finish);
    write.then(() => finish(), (error) => {
      reportSyncFailure(uid);
      finish(error);
    });
  });
}
