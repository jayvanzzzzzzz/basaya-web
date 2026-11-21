const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../../admin/views/teachers.js');
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('const ICON_USER_MINUS =');
if (start < 0) throw Error('Removal implementation not found');
fs.writeFileSync(file, source.slice(0, start) + `const teacherName = (teacher) => teacher.displayName || teacher.email || "this teacher";

async function changeTeacherAccess(teacher, button) {
  if (button.disabled) return;
  const reactivate = teacher.disabled === true;
  button.disabled = true;
  try {
    if (!await confirmAction({
      title: reactivate ? 'Reactivate teacher?' : 'Deactivate teacher?',
      message: reactivate
        ? teacherName(teacher) + ' will be able to sign in again. Their classes and records stay assigned to them.'
        : teacherName(teacher) + ' will be signed out and unable to sign in. Their account, classes, lessons and student records will be kept. You can reactivate them later.',
      confirm: reactivate ? 'Reactivate teacher' : 'Deactivate teacher',
      danger: !reactivate,
    })) return;
    await postToApi('teacher-onboarding', { action: reactivate ? 'reactivate' : 'deactivate', userId: teacher.id });
    toast(reactivate ? 'Teacher account reactivated.' : 'Teacher account deactivated. Classes and records have been kept.');
    if (captureRoute('/teachers')()) await renderTeachers();
  } catch (error) {
    toast(error.message || 'Could not update teacher access. Please try again.');
  } finally {
    button.disabled = false;
  }
}
`);
