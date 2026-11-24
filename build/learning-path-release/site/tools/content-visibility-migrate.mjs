// Run with FIREBASE_SERVICE_ACCOUNT configured. Defaults to a read-only report.
import { db } from '../notify-api/lib/firebase.js';
const database = db();
const apply = process.argv.includes('--apply');
let count = 0;
try {
  const snapshot = await database.collection('lessons').get();
  for (const lesson of snapshot.docs) {
    if (lesson.get('visibility') !== undefined) continue;
    count++;
    if (apply) await database.runTransaction(async tx => {
      const current = await tx.get(lesson.ref);
      if (current.exists && current.get('visibility') === undefined) tx.update(lesson.ref, { visibility: 'shared' });
    });
  }
  console.log((apply ? 'Backfilled ' : 'Would backfill ') + count + ' legacy lessons as Shared; existing explicit visibility and all modules are preserved.');
} finally { await database.terminate(); }
