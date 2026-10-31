// One lesson at a time limits memory/storage pressure and lets a failed lesson
// leave the remaining queue usable. Eligibility is checked again before each item.
export async function downloadLessons(lessons, { shouldContinue, isEligible, download, onProgress, onResult, signal }) {
  const result = { downloaded: 0, failed: 0, skipped: 0, stopped: false };
  for (const [index, lesson] of lessons.entries()) {
    if (signal?.aborted || !shouldContinue()) { result.stopped = true; break; }
    if (!isEligible(lesson)) { result.skipped++; continue; }
    onProgress(lesson, index, lessons.length, 0);
    let error = null;
    try {
      await download(lesson, (percent) => onProgress(lesson, index, lessons.length, percent));
      result.downloaded++;
    } catch (failure) {
      error = failure;
      if (signal?.aborted || failure?.name === "AbortError") result.stopped = true;
      else result.failed++;
    }
    await onResult(lesson, error);
    if (result.stopped) break;
  }
  return result;
}
