import { watchStudentNotifications } from './studentNotifications.js';

let stop;
export function leaveStudentRequestsBadge() { stop?.(); stop = null; }
export function watchStudentRequestsBadge(classId, initialLeaveCount = 0, lessonLinks = []) {
  leaveStudentRequestsBadge();
  const button = document.getElementById("view-students");
  const dot = button?.querySelector("[data-student-requests-dot]");
  if (!dot) return;
  dot.hidden = !initialLeaveCount;
  stop = watchStudentNotifications(classId, notice => {
    const labels = [notice.hasMessages && 'unread class messages', notice.hasReadings && 'recordings awaiting grading', notice.joins && 'pending join requests', [...notice.byStudent.values()].some(item => item.leave) && 'pending leave requests'].filter(Boolean);
    dot.hidden = !notice.hasPending;
    button.setAttribute('aria-label', labels.length ? `Students — ${labels.join(', ')}` : 'Students');
    button.title = labels.length ? labels.join(' · ') : 'View students';
    const review = document.querySelector('[data-reading-notice-dot]');
    const total = notice.grading?.total || 0;
    const dueSoon = notice.grading?.dueSoon || 0;
    if (review) {
      review.hidden = !total;
      review.textContent = total ? String(total) : '';
      const label = total ? `Review readings (${total} need grading)` : 'Review readings';
      review.parentElement.setAttribute('aria-label', label);
      review.parentElement.setAttribute('data-floating-tooltip', label);
    }
    const banner = document.querySelector('[data-grading-notice]');
    if (banner) {
      const count = banner.querySelector('[data-grading-count]');
      if (count) { count.hidden = !total; count.textContent = total ? String(total) : ''; }
      banner.hidden = !total && !notice.readingError;
      banner.classList.toggle('has-deadline', dueSoon > 0);
      const heading = banner.querySelector('[data-grading-total]');
      heading.hidden = !total;
      heading.textContent = `${total} reading${total === 1 ? ' needs' : 's need'} to be graded`;
      const deadline = banner.querySelector('[data-grading-deadline]');
      deadline.hidden = !dueSoon;
      deadline.textContent = `${dueSoon} ungraded reading${dueSoon === 1 ? ' is' : 's are'} due within 24 hours`;
      banner.querySelector('[data-grading-error]').hidden = !notice.readingError;
    }
    if (notice.readingError || notice.messageError || notice.membershipError) button.title += ' · Some updates are unavailable; refresh to check.';
  }, [], lessonLinks);
}
