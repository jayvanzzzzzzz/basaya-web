import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getPersistentCacheIndexManager, getDocFromCache, doc, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// This file lives in /js, so firebase-config.js (at the project root, next to index.html) is one directory up.
import { firebaseConfig } from "../firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const studentPortal = /\/student\//.test(location.pathname);
export const db = initializeFirestore(app, studentPortal ? {
  localCache: persistentLocalCache({
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    tabManager: persistentMultipleTabManager(),
  }),
} : {});
// Keep the teacher/admin portals' existing memory-only behavior.
export const offlineReady = studentPortal
  // A cache-only read starts the local store, including any memory fallback.
  // A missing probe document is expected; it never contacts the server.
  ? getDocFromCache(doc(db, "__offline__", "probe")).catch(() => {}).then(() =>
      getPersistentCacheIndexManager(db) !== null)
  : Promise.resolve(false);

// Secondary app instance: lets the admin create new teacher accounts
// without Firebase switching the active session to the new account
// (which would otherwise sign the admin out of their own session).
export const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
