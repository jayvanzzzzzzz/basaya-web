// A class lesson link (classes/{classId}/classLessons/{linkId}) is an Assessment
// (id = lesson id), a Practice copy of the same lesson ("{lessonId}__practice"), or an older
// auto-id link that keeps the lesson id in a field. Students know each one by its entry id
// (student/data.js entryId, the app's LessonEntity.id), so notifications list entry ids.

/** The library lesson the link shows (lessons/{id}). */
export const linkLessonId = (link) => link.get("lessonId") || link.id;

export const isPracticeLink = (link) => link.get("mode") === "practice";

/** The id students' apps know the class lesson by. */
export const linkEntryId = (link) => (isPracticeLink(link) ? link.id : linkLessonId(link));
