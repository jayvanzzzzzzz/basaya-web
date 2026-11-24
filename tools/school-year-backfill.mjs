// Requires FIREBASE_SERVICE_ACCOUNT. Dry run by default; --apply writes missing years only.
import { db } from '../notify-api/lib/firebase.js';
import { LEGACY_SCHOOL_YEAR } from '../js/schoolYear.js';
const database = db();
const apply = process.argv.includes('--apply');
try {
  const snapshot = await database.collection('classes').get();
  let changed = 0;
  for (const classroom of snapshot.docs) {
    const result = await database.runTransaction(async tx => {
      const current = await tx.get(classroom.ref);
      if (!current.exists || current.get('schoolYear')) return false;
      if (apply) tx.update(classroom.ref, { schoolYear: LEGACY_SCHOOL_YEAR });
      return true;
    });
    changed += Number(result);
  }
  console.log(JSON.stringify({ apply, classes: snapshot.size, changed, schoolYear: LEGACY_SCHOOL_YEAR }));
} finally { await database.terminate(); }
