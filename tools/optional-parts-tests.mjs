import assert from 'node:assert/strict';
import { lessonParts, resultsFrom, withMissed, summarize } from '../js/scoring.js';
import * as server from '../notify-api/lib/assessmentScoring.js';

for (const scoring of [{ lessonParts, resultsFrom, withMissed, summarize }, server]) {
  for (const skipped of [{ quiz: true }, { pronunciation: true }, { quiz: true, pronunciation: true }, { quiz: true, pronunciation: true, activity: true, game: true }]) {
    assert.equal(scoring.lessonParts({}, skipped).started, false);
    assert.equal(scoring.lessonParts({}, skipped).finished, false);
    const progress = Object.fromEntries(['lecture', 'game', 'activity', 'quiz', 'pronunciation'].filter(part => !skipped[part]).map(part => [part+'Finished', true]));
    assert.equal(scoring.lessonParts(progress, skipped).finished, true);
    progress.lectureFinished = false;
    assert.equal(scoring.lessonParts(progress, skipped).finished, false);
  }
  const lessons = [{ id: 'optional', quizSkipped: true, pronunciationSkipped: true, dueAt: 1, items: { pagsusulit: 9, pagbigkas: 9, pagkilala: 2 } }];
  const docs = [{ id: 'optional', skills: { pagsusulit: { attempts: 9, correct: 0 }, pagbigkas: { attempts: 9, correct: 0 } } }];
  const result = scoring.withMissed(scoring.resultsFrom(docs), docs, lessons, 2);
  assert.deepEqual(result.pagsusulit, []);
  assert.deepEqual(result.pagbigkas, []);
  assert.equal(result.pagkilala[0].attempts, 2);
  assert.equal(scoring.summarize(result).skills.pagsusulit.score, null);
  assert.equal(scoring.summarize(result).skills.pagbigkas.score, null);
}
console.log('PASS: web/server completion with independently skipped sections, no fabricated start, no old or deadline scores, required sections still count');
