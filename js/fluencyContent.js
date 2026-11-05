// Shared page shape for the editor and student reading experience.
export const wordKey = value => String(value).normalize('NFC').toLocaleLowerCase('fil').replace(/’/g, "'");
export const wordsIn = text => [...new Map((String(text).match(/[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu) || []).map(word => [wordKey(word), word])).values()];

export function fluencyPages(content = {}) {
  const globalWords = content.words || [];
  return (content.pages || []).filter(page => typeof page.sentence === 'string' && page.sentence.trim()).map((page, index) => {
    const selected = new Set((Array.isArray(page.readyWords) ? page.readyWords : globalWords).map(wordKey));
    return {
      pageNumber: index + 1,
      sentence: page.sentence.trim(),
      audioUrl: /^https:\/\//.test(page.cloudAudio?.audioUrl || '') ? page.cloudAudio.audioUrl : '',
      words: wordsIn(page.sentence).filter(word => selected.has(wordKey(word))).map(word => {
        const at = globalWords.findIndex(value => wordKey(value) === wordKey(word));
        const clip = (content.cloudAudio || []).find(value => wordKey(value?.text || '') === wordKey(word)) || content.cloudAudio?.[at];
        return { word, audioUrl: /^https:\/\//.test(clip?.audioUrl || '') ? clip.audioUrl : '' };
      }),
    };
  });
}
