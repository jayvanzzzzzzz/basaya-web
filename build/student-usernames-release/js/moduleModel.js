export function orderedLessonIds(ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Add at least one lesson to the module.');
  if (ids.some(id => typeof id !== 'string' || !id || id.includes('/')) || new Set(ids).size !== ids.length)
    throw new Error('Each lesson can appear only once in a module.');
  if (ids.length > 100) throw new Error('A module can contain up to 100 lessons.');
  return [...ids];
}
export function nextCopyNumber(baseTitle, lessons) {
  const prefix = `${baseTitle} 1.`;
  return lessons.reduce((highest, lesson) => {
    const title = lesson.title || '';
    const suffix = title.startsWith(prefix) ? title.slice(prefix.length) : '';
    return /^\d+$/.test(suffix) ? Math.max(highest, Number(suffix)) : highest;
  }, 0) + 1;
}
export function contentBaseTitle(item = {}) {
  if (item.versionBaseTitle) return item.versionBaseTitle;
  const title = String(item.title || '').trim();
  return item.sourceLessonId || item.sourceModuleId ? title.replace(/\s+(?:-\s*)?1\.\d+$/, '') : title;
}
export function moveLesson(ids, from, to) {
  const result = [...ids];
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return result;
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}
