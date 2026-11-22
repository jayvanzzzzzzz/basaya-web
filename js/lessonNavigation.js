// The Lessons workspace owns one leave guard, including nested lesson editors.
let guard = null;
let dirty = () => false;
let route = '';
let ownerId = null;
export function setLessonLeaveGuard(check, hasChanges = () => true, userId = null) {
  guard = check;
  dirty = hasChanges;
  route = location.hash;
  ownerId = userId;
}
export async function canLeaveLessons(userId) {
  if (userId !== undefined && ownerId !== userId) { guard = null; dirty = () => false; }
  if (!guard) return true;
  const target = location.hash;
  if (await guard()) {
    if (location.hash !== target) return false;
    guard = null;
    dirty = () => false;
    return true;
  }
  if (location.hash === target) history.replaceState(null, '', route);
  return false;
}
window.addEventListener('beforeunload', event => {
  if (guard && dirty()) { event.preventDefault(); event.returnValue = ''; }
});
