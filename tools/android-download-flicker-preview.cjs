const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const file = 'app/src/main/java/ph/basaya/app/adapter/LessonAdapter.kt';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const original = fs.readFileSync(path.join(root, file), 'utf8');
let text = original.replace(/\r\n/g, '\n');
function once(before, after) {
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('Unexpected source: ' + before);
  text = text.replace(before, after);
}
once(`    fun updateList(newList: List<LessonEntity>, query: String = "") {
        lessonList = newList
        highlightQuery = query
        notifyDataSetChanged()
    }`, `    fun updateList(newList: List<LessonEntity>, query: String = "") {
        val previous = lessonList
        val sameRows = highlightQuery == query && previous.map { it.id } == newList.map { it.id }
        lessonList = newList
        highlightQuery = query
        if (!sameRows) {
            notifyDataSetChanged()
            return
        }
        newList.forEachIndexed { index, lesson ->
            val old = previous[index]
            if (old != lesson) {
                if (old.copy(isDownloaded = lesson.isDownloaded) == lesson) {
                    notifyDownloadChanged(lesson.id)
                } else notifyItemChanged(index)
            }
        }
    }`);
once(`    fun setBulkDownloading(active: Boolean) {
        bulkDownloading = active
        notifyDataSetChanged()
    }`, `    fun setBulkDownloading(active: Boolean) {
        // Popup enabled states are evaluated when opened; no card rebind is needed.
        bulkDownloading = active
    }`);
once(`    fun showBulkProgress(lessonId: String, percent: Int) {
        downloadProgress[lessonId] = percent.coerceIn(0, 100)`, `    fun showBulkProgress(lessonId: String, percent: Int) {
        if (downloadProgress[lessonId] == percent.coerceIn(0, 100)) return
        downloadProgress[lessonId] = percent.coerceIn(0, 100)`);
once(`        if (!downloadProgress.containsKey(lessonId)) return
        downloadProgress[lessonId] = percent.coerceIn(0, 100)`, `        if (!downloadProgress.containsKey(lessonId)) return
        if (downloadProgress[lessonId] == percent.coerceIn(0, 100)) return
        downloadProgress[lessonId] = percent.coerceIn(0, 100)`);
once(`            this[index] = this[index].copy(isDownloaded = true)
        }
        notifyItemChanged(index)`, `            this[index] = this[index].copy(isDownloaded = true)
        }
        notifyDownloadChanged(lessonId)`);
once(`            this[index] = this[index].copy(isDownloaded = false)
        }
        notifyItemChanged(index)`, `            this[index] = this[index].copy(isDownloaded = false)
        }
        notifyDownloadChanged(lessonId)`);
fs.writeFileSync(path.join(preview, file), text);
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify([{ file, originalHash: sha(original), resultHash: sha(text) }], null, 2));
console.log('Prepared Android updates that preserve unchanged lesson cards.');
