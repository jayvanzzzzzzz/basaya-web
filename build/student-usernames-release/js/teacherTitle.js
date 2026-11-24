import { TEACHER_TITLES, teacherName } from "./chat.js?v=removed-preview";

/** "Ma'am", "Sir" or "" for a saved title. */
export const titleLabel = (title) => TEACHER_TITLES[title] || "";

/** "Magandang umaga, Ma'am Reyes" by time of day; the full name when no title is picked. */
export function greeting({ displayName = "", title = "" } = {}) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "umaga" : hour < 18 ? "hapon" : "gabi";
  const name = TEACHER_TITLES[title] ? teacherName(displayName, title) : displayName.trim();
  return name ? `Magandang ${part}, ${name}` : `Magandang ${part}!`;
}

export const titleForGender = gender => gender === "female" ? "maam" : gender === "male" ? "sir" : "";
export function genderMarkup(selected = "", preserveExisting = false) {
  return '<label>Gender<select name="gender"' + (preserveExisting ? '' : ' required') + ' data-missing="Select the teacher gender."><option value="">' + (preserveExisting ? 'Keep existing title' : 'Select gender') + '</option><option value="female"' + (selected === "female" ? " selected" : "") + '>Female — Ma’am</option><option value="male"' + (selected === "male" ? " selected" : "") + '>Male — Sir</option></select></label>';
}
