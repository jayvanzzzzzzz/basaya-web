// Apply the native half from the web workspace, with a fixed, checked Android root.
const fs = require('fs');
const path = require('path');
const root = path.resolve('C:/Projects/BaSaya');
if (root.toLowerCase() !== 'c:\\projects\\basaya') throw Error('Unexpected Android root');
const resolve = relative => {
  const target = path.resolve(root, relative);
  if (!target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Path outside Android project');
  return target;
};
const edit = (relative, change) => {
  const target = resolve(relative), before = fs.readFileSync(target, 'utf8');
  const after = change(before);
  if (before !== after) fs.writeFileSync(target, after);
};
const java = 'app/src/main/java/ph/basaya/app/';
for (const name of ['ReadingActivity.kt', 'ReadingSession.kt']) fs.copyFileSync(path.join(__dirname, name), resolve(java + 'ui/pronunciation/' + name));
edit(java + 'speech/VoiceRecorder.kt', source => source.replace('class VoiceRecorder {', 'class VoiceRecorder(private val maximumFrames: Int = 350) {').replace('held.frames < MAX_FRAMES', 'held.frames < maximumFrames'));
edit(java + 'data/model/PronunciationActivityData.kt', source => {
  if (source.includes('PronunciationReadingPage')) return source;
  return source.replace('val audioRefs: List<String> = emptyList()', 'val audioRefs: List<String> = emptyList(),\n    val pages: List<PronunciationReadingPage> = emptyList()') + `
data class PronunciationReadingWord(val word: String = "", val audioUrl: String = "")
data class PronunciationReadingPage(val sentence: String = "", val audioUrl: String = "", val words: List<PronunciationReadingWord> = emptyList())
`;
});
edit(java + 'data/repository/PronunciationRepository.kt', source => {
  if (source.includes('private fun readingPages(')) return source;
  source = source.replace('import ph.basaya.app.data.model.PronunciationActivityData', 'import ph.basaya.app.data.model.PronunciationActivityData\nimport ph.basaya.app.data.model.PronunciationReadingPage\nimport ph.basaya.app.data.model.PronunciationReadingWord');
  source = source.replace('            PronunciationActivityData(\n                id = lessonId,', '            val readingPages = readingPages(doc.get("pages"), words, audioRefs)\n            context.getSharedPreferences("pronunciation_reading_pages", Context.MODE_PRIVATE).edit().putString(lessonId, gson.toJson(readingPages)).apply()\n            PronunciationActivityData(\n                id = lessonId,');
  source = source.replace('                audioRefs = audioRefs\n', '                audioRefs = audioRefs + readingPages.map { it.audioUrl }.filter { it.isNotBlank() },\n                pages = readingPages\n');
  source = source.replace('            audioRefs = gson.fromJson(audioRefsJson, listType)', '            audioRefs = gson.fromJson(audioRefsJson, listType),\n            pages = runCatching { gson.fromJson<List<PronunciationReadingPage>>(context.getSharedPreferences("pronunciation_reading_pages", Context.MODE_PRIVATE).getString(lessonId, "[]"), object : TypeToken<List<PronunciationReadingPage>>() {}.type) }.getOrDefault(emptyList())');
  const helper = `
    private fun readingPages(raw: Any?, words: List<String>, refs: List<String>): List<PronunciationReadingPage> {
        fun key(value: String) = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFC).lowercase(java.util.Locale.ROOT).replace('’', '\\'')
        val token = Regex("[\\\\p{L}\\\\p{M}\\\\p{N}]+(?:[-'’][\\\\p{L}\\\\p{M}\\\\p{N}]+)*")
        return (raw as? List<*>).orEmpty().mapNotNull { item ->
            val page = item as? Map<*, *> ?: return@mapNotNull null
            val sentence = (page["sentence"] as? String)?.trim().orEmpty()
            if (sentence.isBlank()) return@mapNotNull null
            val selected = ((page["readyWords"] as? List<*>)?.filterIsInstance<String>() ?: words).map(::key).toSet()
            val ready = token.findAll(sentence).map { it.value }.distinctBy(::key).filter { key(it) in selected }.map { word ->
                val at = words.indexOfFirst { key(it) == key(word) }
                PronunciationReadingWord(word, refs.getOrNull(at).orEmpty().takeIf { it.startsWith("https://") }.orEmpty())
            }.toList()
            val audio = (page["cloudAudio"] as? Map<*, *>)?.get("audioUrl") as? String ?: ""
            PronunciationReadingPage(sentence, audio.takeIf { it.startsWith("https://") }.orEmpty(), ready)
        }
    }

`;
  return source.replace('    // Mapping helpers', helper + '    // Mapping helpers');
});
edit(java + 'ui/pronunciation/PronunciationActivity.kt', source => {
  if (!source.includes('ReadingSession.hasDraft')) source = source.replace('    private fun loadWords() {', `    private fun loadWords() {
        if (ReadingSession.hasDraft(this, lessonId)) {
            startActivity(Intent(this, ReadingActivity::class.java).putExtra("LESSON_ID", lessonId))
            finish()
            return
        }`);
  if (source.includes('ReadingActivity::class.java')) return source;
  const old = '            if (!PracticeLessons.refresh(this@PronunciationActivity, lessonId)) assessment = AssessmentSession.open(this@PronunciationActivity, lessonId)\n            val fetched = pronunciationRepository.getActivity(lessonId)';
  if (!source.includes(old)) throw Error('Pronunciation entry point changed; review before applying');
  return source.replace(old, `            val fetched = pronunciationRepository.getActivity(lessonId)
            if (fetched?.pages?.isNotEmpty() == true) {
                startActivity(Intent(this@PronunciationActivity, ReadingActivity::class.java).apply {
                    putExtra("LESSON_ID", lessonId)
                    putExtra("READING_CONTENT", com.google.gson.Gson().toJson(fetched))
                })
                finish()
                return@run
            }
            if (!PracticeLessons.refresh(this@PronunciationActivity, lessonId)) assessment = AssessmentSession.open(this@PronunciationActivity, lessonId)`);
});
edit(java + 'ui/DashboardActivity.kt', source => {
  if (!source.includes('destination == PronunciationActivity::class.java &&')) source = source.replace(
    '    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {',
    '    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {\n        if (destination == PronunciationActivity::class.java && ph.basaya.app.ui.pronunciation.ReadingSession.hasDraft(this, lessonId)) return AudioWait.READY'
  );
  if (!source.includes('private var readingBased')) {
    source = source.replace('    private var pronunciationIsFinished = false', '    private var pronunciationIsFinished = false\n    private var readingBased = false');
    source = source.replace('                pronunciationIsFinished = pronunciationFinished', '                pronunciationIsFinished = pronunciationFinished\n                readingBased = doc.get("fluency") != null');
    const place = '                if (pronunciationFinished) {';
    const note = `                if (readingBased) {
                    val reviewStatus = doc.getString("pronunciationReviewStatus")
                    val reading = doc.get("fluency") as? Map<*, *>
                    tvPronunciationCount.text = when (reviewStatus) {
                        "pending" -> "Naipasa • hinihintay ang guro"
                        "graded" -> "Puntos • $pronunciationScore/$pronunciationTotal"
                        else -> "Pahina "+(((reading?.get("page") as? Number)?.toInt() ?: 0)+1)+"/"+((reading?.get("total") as? Number)?.toInt() ?: 0)
                    }
                    hasPronunciationScore = true
                }
`;
    if (!source.includes(place)) throw Error('Dashboard completion marker changed');
    source = source.replace(place, note + place);
  }
  if (source.includes('ReadingSession.hasDraft')) return source.replace('pronunciationIsFinished && ph.basaya.app.ui.pronunciation.ReadingSession.hasDraft(this, lessonId)', 'pronunciationIsFinished && (readingBased || ph.basaya.app.ui.pronunciation.ReadingSession.hasDraft(this, lessonId))');
  return source.replace('            if (pronunciationIsFinished) {', `            if (pronunciationIsFinished && (readingBased || ph.basaya.app.ui.pronunciation.ReadingSession.hasDraft(this, lessonId))) {
                startActivity(Intent(this, ph.basaya.app.ui.pronunciation.ReadingActivity::class.java).putExtra("LESSON_ID", lessonId))
            } else if (pronunciationIsFinished) {`);
});
edit('app/src/main/AndroidManifest.xml', source => source.includes('.ui.pronunciation.ReadingActivity') ? source : source.replace('android:name=".ui.pronunciation.PronunciationActivity"', 'android:name=".ui.pronunciation.ReadingActivity"\n              android:exported="false" />\n          <activity\n              android:name=".ui.pronunciation.PronunciationActivity"'));
console.log('Applied page-based native reading flow, repository mapping, and hold recorder support.');
