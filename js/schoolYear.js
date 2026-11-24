// Classes predating school-year selection belong to the agreed legacy year.
export const LEGACY_SCHOOL_YEAR = '2026-2027';
export function currentSchoolYear(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const start = Number(parts.year) - (Number(parts.month) < 6 ? 1 : 0);
  return `${start}-${start + 1}`;
}
export const schoolYearOf = classroom => /^[0-9]{4}-[0-9]{4}$/.test(classroom.schoolYear) ? classroom.schoolYear : LEGACY_SCHOOL_YEAR;
export const matchesSchoolYear = (classroom, selected) => selected === 'all' || schoolYearOf(classroom) === selected;
export function schoolYearOptions(classes = []) {
  const start = Number(currentSchoolYear().slice(0, 4));
  return [...new Set([LEGACY_SCHOOL_YEAR, ...classes.map(schoolYearOf),
    ...Array.from({ length: 5 }, (_, i) => `${start - 2 + i}-${start - 1 + i}`)])].sort().reverse();
}
export function schoolYearRibbons(classes, selected) {
  const years = [...new Set([currentSchoolYear(), ...classes.map(schoolYearOf), ...(selected === 'all' ? [] : [selected])])].sort().reverse();
  return `<div class="school-year-filter"><span class="school-year-filter__label">School Year</span><div class="school-year-ribbons" role="group" aria-label="Filter classes by School Year">${['all', ...years].map(year => `<button type="button" class="student-ribbon" data-school-year="${year}" aria-pressed="${selected === year}"><span>${year === 'all' ? 'All School Years' : year}</span><span class="student-ribbon__count">${classes.filter(c => matchesSchoolYear(c, year)).length}</span></button>`).join('')}</div></div>`;
}
