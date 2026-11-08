import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';

export async function readingLessonTitles(lessonIds) {
  const ids = [...new Set(lessonIds.filter(id => typeof id === 'string' && id && !id.includes('/')))];
  const results = await Promise.allSettled(ids.map(async id => {
    const lesson = await getDoc(doc(db, 'lessons', id));
    const title = lesson.data()?.title;
    return [id, typeof title === 'string' && title.trim() ? title : null];
  }));
  // Older/deleted lessons retain their saved submission title when unavailable.
  return Object.fromEntries(results.filter(result => result.status === 'fulfilled' && result.value[1]).map(result => result.value));
}

export async function readingRoster(classId) {
  const [classroom, roster, lessons] = await Promise.all([
    getDoc(doc(db, 'classes', classId)), getDocs(collection(db, 'classes', classId, 'students')),
    getDocs(collection(db, 'classes', classId, 'classLessons')),
  ]);
  return { className: classroom.data()?.className || 'Class', section: classroom.data()?.section || '', lessonLinks: lessons.docs.map(lesson => ({ id: lesson.id, ...lesson.data() })), students: roster.docs.map(student => ({
    uid: student.id, name: student.data().fullName || [student.data().firstName, student.data().lastName].filter(Boolean).join(' ') || 'Student',
  })) };
}
