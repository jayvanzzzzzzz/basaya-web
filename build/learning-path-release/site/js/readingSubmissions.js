// Review only the newest attempt for each student and lesson.
export function latestReadingSubmissions(rows = []) {
  const latest = new Map();
  const time = value => value?.toMillis?.() || Number(value) || 0;
  for (const row of rows) {
    const key = JSON.stringify([row.uid, row.lessonId || row.id]);
    const old = latest.get(key);
    if (!old || time(row.submittedAt) > time(old.submittedAt) ||
      (time(row.submittedAt) === time(old.submittedAt) && String(row.id).localeCompare(String(old.id)) > 0)) latest.set(key, row);
  }
  return [...latest.values()];
}
