// For legacy dictionary entries created before author roles/surnames were saved.
// FIREBASE_SERVICE_ACCOUNT is required. Dry run by default; --apply writes attribution only.
import { db } from '../notify-api/lib/firebase.js';
import { dictionaryLastName, dictionaryWasEdited } from '../js/dictionaryAttribution.js';
const database = db();
const apply = process.argv.includes('--apply');
let changed = 0, unresolved = 0;
try {
  const snapshot = await database.collection('dictionary').get();
  for (const entry of snapshot.docs) {
    const result = await database.runTransaction(async tx => {
      const current = await tx.get(entry.ref);
      if (!current.exists) return { changed: false, unresolved: 0 };
      const word = current.data(), patch = {};
      let missing = 0;
      for (const prefix of ['created', 'updated']) {
        const uid = word[`${prefix}By`];
        if (!uid || (word[`${prefix}ByRole`] && word[`${prefix}ByLastName`] !== undefined)) continue;
        const author = await tx.get(database.collection('users').doc(uid));
        const profile = author.data();
        if (!['teacher', 'admin'].includes(profile?.role)) { missing++; continue; }
        patch[`${prefix}ByRole`] = profile.role;
        patch[`${prefix}ByLastName`] = profile.role === 'teacher'
          ? profile.lastName || dictionaryLastName(profile.displayName || word[`${prefix}ByName`]) : '';
      }
      if (typeof word.edited !== 'boolean') patch.edited = dictionaryWasEdited(word);
      if (Object.keys(patch).length && apply) tx.update(entry.ref, patch);
      return { changed: Object.keys(patch).length > 0, unresolved: missing };
    });
    changed += Number(result.changed); unresolved += result.unresolved;
  }
  console.log(JSON.stringify({ apply, entries: snapshot.size, changed, unresolvedAuthors: unresolved }));
} finally { await database.terminate(); }
