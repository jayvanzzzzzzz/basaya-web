// Shared with the API by tools/build-deadline-policy.mjs. Times are epoch ms.
export const deadlineMillis = value => typeof value === "number" && Number.isFinite(value) ? value : value?.toMillis?.() ?? null;
export function inactivePeriods(profile = {}) {
  const periods = (Array.isArray(profile.inactivePeriods) ? profile.inactivePeriods : []).filter(period => period && Number.isFinite(period.start)).map(period => ({ start: period.start, end: Number.isFinite(period.end) ? period.end : null }));
  // Older disabled accounts have no reliable start date. Never invent penalties
  // for that unknown interval; completed results remain available as history.
  if (profile.disabled === true && !periods.some(period => period.end === null)) periods.push({ start: deadlineMillis(profile.deactivatedAt) ?? 0, end: null });
  return periods;
}
export function lessonDeadline(link = {}, roster = {}, profile = {}, classroom = {}) {
  const key = link.mode === "practice" ? link.id : link.lessonId || link.id;
  const override = roster.deadlineOverrides?.[key] || {};
  const base = deadlineMillis(link.dueAt), individual = deadlineMillis(override.dueAt);
  const dueAt = base === null ? null : Math.max(base, individual ?? base);
  const assignedAt = deadlineMillis(override.firstAssignedAt) ?? Infinity;
  const changedAt = deadlineMillis(link.scheduleChangedAt) ?? 0;
  // A timely personal extension supersedes the earlier class deadline. Only
  // deadlines that actually elapsed remain candidates for permanent exemption.
  const classDeadlines = [base,...(link.deadlineHistory || [])].map(deadlineMillis).filter(due=>due!==null && (individual===null || individual<=due || assignedAt>due));
  const personal = individual!==null && (base===null || individual>=base || changedAt>individual) ? individual : null;
  const deadlines = [dueAt,personal,...classDeadlines,...(override.deadlineHistory || [])].map(deadlineMillis).filter(value => value !== null);
  const periods = [...inactivePeriods(profile), ...(roster.droppedPeriods || []), ...(classroom.archivePeriods || [])];
  const exempt = deadlines.some(due => periods.some(period => due >= period.start && (period.end === null || due < period.end)));
  return { dueAt, exempt };
}
export function monitoringTime(profile, now = Date.now(), roster = {}, classroom = {}) {
  const periods=[...(profile?.disabled===true?inactivePeriods(profile):[]),...(roster.droppedPeriods||[]),...(classroom.archivePeriods||[])];
  const starts=periods.filter(period=>period.end==null&&period.start>0).map(period=>period.start);
  return Math.min(now,...starts);
}
