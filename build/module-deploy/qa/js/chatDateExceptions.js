// Exact IDs of the user-approved class conversation; all other date labels are unchanged.
export const DATELESS_CHAT_IDS = new Set([
  "kaye-survey-20261119-mRlGEyuZYBuSRvOHzt5C-teacher",
  "kaye-survey-20261119-mRlGEyuZYBuSRvOHzt5C-reply1",
  "kaye-survey-20261119-nuaHuZualCwbr4l1cbYh-teacher",
  "kaye-survey-20261119-nuaHuZualCwbr4l1cbYh-reply1",
  "kaye-survey-20261119-MdGOsF5sQX83fv3YejUX-teacher",
  "kaye-survey-20261119-MdGOsF5sQX83fv3YejUX-reply1",
  "kaye-survey-20261119-MdGOsF5sQX83fv3YejUX-reply2",
  "kaye-survey-20261119-MdGOsF5sQX83fv3YejUX-reply3"
]);

export function showChatDate(message, previous, label) {
  return !DATELESS_CHAT_IDS.has(message.id) &&
    (!previous || DATELESS_CHAT_IDS.has(previous.id) || label(previous.sentAt) !== label(message.sentAt));
}
