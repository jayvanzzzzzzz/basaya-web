const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const adapter = 'app/src/main/java/ph/basaya/app/adapter/LessonAdapter.kt';
const home = 'app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt';
const layout = 'app/src/main/res/layout/item_lesson.xml';
const homeLayout = 'app/src/main/res/layout/fragment_home.xml';
const strings = 'app/src/main/res/values/strings.xml';
const ribbon = 'app/src/main/res/drawable/bg_downloaded_ribbon.xml';
const originals = new Map();
const outputs = new Map();
function read(file) {
  const text = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
  originals.set(file, text);
  return text.replace(/\r\n/g, '\n');
}
function once(text, before, after) {
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('Expected unique anchor: ' + before.slice(0, 80));
  return text.replace(before, after);
}
let text = read(adapter);
text = once(text, '    private var highlightQuery:', '    private var bulkDownloading = false\n\n    private var highlightQuery:');
text = once(text, '        private val tvTitle:', '        private val downloadedRibbon: View = itemView.findViewById(R.id.downloadedRibbon)\n        private val tvTitle:');
text = once(text, '            val busy = downloadProgress.containsKey(current.id)', '            val busy = bulkDownloading || downloadProgress.containsKey(current.id)');
text = once(text, '            val progress = downloadProgress[lesson.id]', '            downloadedRibbon.visibility = if (lesson.isDownloaded) View.VISIBLE else View.GONE\n            val progress = downloadProgress[lesson.id]');
text = once(text, '    /** Moves a lesson\'s progress ring;', `    fun hasActiveDownloads(): Boolean = downloadProgress.isNotEmpty() || removingIds.isNotEmpty()

    fun setBulkDownloading(active: Boolean) {
        bulkDownloading = active
        notifyDataSetChanged()
    }

    fun showBulkProgress(lessonId: String, percent: Int) {
        downloadProgress[lessonId] = percent.coerceIn(0, 100)
        notifyDownloadChanged(lessonId)
    }

    fun finishBulkLesson(lessonId: String, success: Boolean) {
        downloadProgress.remove(lessonId)
        if (success) markDownloaded(lessonId) else notifyDownloadChanged(lessonId)
    }

    /** Moves a lesson's progress ring;`);
outputs.set(adapter, text);
text = read(layout);
text = once(text, '            <!-- A. Title -->', `            <TextView
                android:id="@+id/downloadedRibbon"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginBottom="6dp"
                android:background="@drawable/bg_downloaded_ribbon"
                android:paddingStart="8dp"
                android:paddingTop="4dp"
                android:paddingEnd="18dp"
                android:paddingBottom="4dp"
                android:text="@string/lesson_card_downloaded_ribbon"
                android:textColor="@color/lesson_status_done_fg"
                android:textSize="11sp"
                android:textStyle="bold"
                android:visibility="gone" />

            <!-- A. Title -->`);
outputs.set(layout, text);
read(ribbon);
outputs.set(ribbon, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="112dp" android:height="24dp"
    android:viewportWidth="112" android:viewportHeight="24">
    <path android:fillColor="@color/lesson_status_done_bg"
        android:pathData="M0,0 H112 L104,12 L112,24 H0 Z" />
</vector>
`);
text = read(homeLayout);
text = once(text, '        <!-- Lahat / Bukas / Sarado.', `        <com.google.android.material.button.MaterialButton
            android:id="@+id/btnDownloadAll"
            style="@style/Widget.MaterialComponents.Button.OutlinedButton"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginStart="18dp"
            android:layout_marginEnd="18dp"
            android:layout_marginTop="8dp"
            android:minHeight="48dp"
            android:text="@string/lesson_download_all"
            android:textAllCaps="false"
            android:textColor="@color/lesson_card_primary"
            android:visibility="gone"
            app:strokeColor="@color/lesson_card_stroke" />

        <!-- Lahat / Bukas / Sarado.`);
outputs.set(homeLayout, text);
text = read(strings);
text = once(text, '</resources>', `    <string name="lesson_card_downloaded_ribbon">Naka-download</string>
    <string name="lesson_download_all">I-download lahat ng aralin</string>
    <string name="lesson_download_all_progress">Aralin %1$d/%2$d · %3$d%%</string>
    <string name="lesson_download_all_result">%1$d na-download · %2$d hindi natapos</string>
    <string name="lesson_download_all_stopped">Natigil ang pila. Pindutin muli para ituloy.</string>
</resources>`);
outputs.set(strings, text);
text = read(home);
text = once(text, 'import kotlinx.coroutines.launch', 'import kotlinx.coroutines.launch\nimport kotlinx.coroutines.Job\nimport kotlinx.coroutines.ensureActive');
text = once(text, '    private var isRefreshing = false', '    private var isRefreshing = false\n    private var bulkDownloadJob: Job? = null\n    private var isBulkDownloading = false\n    private lateinit var btnDownloadAll: MaterialButton');
text = once(text, '        this.adapter = adapter', '        this.adapter = adapter\n        btnDownloadAll = view.findViewById(R.id.btnDownloadAll)\n        btnDownloadAll.setOnClickListener { downloadAllLessons() }');
text = once(text, '    private fun showLessons() {', '    private fun showLessons() {\n        updateDownloadAllButton()');
text = once(text, '        val visibility = if (visible) View.VISIBLE else View.GONE', '        if (currentClassId == null || allLessons.isEmpty()) btnDownloadAll.visibility = View.GONE\n        val visibility = if (visible) View.VISIBLE else View.GONE');
text = once(text, '    private fun handleDownload(', `    private fun updateDownloadAllButton() {
        if (!::btnDownloadAll.isInitialized || !isAdded) return
        btnDownloadAll.visibility = if (currentClassId != null && allLessons.isNotEmpty()) View.VISIBLE else View.GONE
        btnDownloadAll.isEnabled = !isBulkDownloading && !adapter.hasActiveDownloads() && hasInternetConnection() &&
            allLessons.any { !it.isDownloaded && LessonSchedule.availability(requireContext(), it) == Availability.OPEN }
        if (!isBulkDownloading) btnDownloadAll.setText(R.string.lesson_download_all)
    }

    private fun downloadAllLessons() {
        if (isBulkDownloading || adapter.hasActiveDownloads() || !hasInternetConnection()) return
        val uid = authHelper.getCurrentUser()?.uid ?: return
        val classId = currentClassId ?: return
        val context = requireContext()
        val ownerView = view ?: return
        val batchAdapter = adapter
        val queue = allLessons.filter { !it.isDownloaded && LessonSchedule.availability(context, it) == Availability.OPEN }
        if (queue.isEmpty()) return
        isBulkDownloading = true
        batchAdapter.setBulkDownloading(true)
        updateDownloadAllButton()
        bulkDownloadJob = viewLifecycleOwner.lifecycleScope.launch {
            var downloaded = 0
            var failed = 0
            var stopped = false
            var activeId: String? = null
            try {
                val repo = LessonRepository(context)
                for ((index, entry) in queue.withIndex()) {
                    ensureActive()
                    if (!hasInternetConnection() || currentClassId != classId || authHelper.getCurrentUser()?.uid != uid) {
                        stopped = true
                        break
                    }
                    val lesson = allLessons.firstOrNull { it.id == entry.id } ?: continue
                    if (lesson.isDownloaded || LessonSchedule.availability(context, lesson) != Availability.OPEN) continue
                    activeId = lesson.id
                    batchAdapter.showBulkProgress(lesson.id, 0)
                    btnDownloadAll.text = getString(R.string.lesson_download_all_progress, index + 1, queue.size, 0)
                    val success = repo.downloadLesson(lesson.id) { percent ->
                        activity?.runOnUiThread {
                            if (view === ownerView && isBulkDownloading) {
                                batchAdapter.showBulkProgress(lesson.id, percent)
                                btnDownloadAll.text = getString(R.string.lesson_download_all_progress, index + 1, queue.size, percent)
                            }
                        }
                    }
                    ensureActive()
                    batchAdapter.finishBulkLesson(lesson.id, success)
                    activeId = null
                    if (success) {
                        downloaded++
                        allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = true) else it }
                    } else failed++
                    if (view === ownerView) showLessons()
                }
                if (view === ownerView) Toast.makeText(context,
                    getString(R.string.lesson_download_all_result, downloaded, failed) +
                        if (stopped) " " + getString(R.string.lesson_download_all_stopped) else "",
                    Toast.LENGTH_LONG).show()
            } finally {
                activeId?.let { batchAdapter.finishBulkLesson(it, false) }
                batchAdapter.setBulkDownloading(false)
                isBulkDownloading = false
                if (view === ownerView) updateDownloadAllButton()
            }
        }
    }

    private fun handleDownload(`);
text = once(text, '    private fun handleDownload(lesson: LessonEntity, onProgress: (Int) -> Unit, onResult: (Boolean) -> Unit) {', '    private fun handleDownload(lesson: LessonEntity, onProgress: (Int) -> Unit, onResult: (Boolean) -> Unit) {\n        updateDownloadAllButton()');
text = once(text, '            onResult(success)\n        }\n    }\n\n    private fun handleRemoveDownload', '            if (success) allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = true) else it }\n            onResult(success)\n            if (view != null && isAdded) showLessons()\n        }\n    }\n\n    private fun handleRemoveDownload');
text = once(text, '    private fun handleRemoveDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {', '    private fun handleRemoveDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {\n        updateDownloadAllButton()');
text = once(text, '            onResult(success)\n        }\n    }\n\n    private fun fetchLessons', '            if (success) allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = false) else it }\n            onResult(success)\n            if (view != null && isAdded) showLessons()\n        }\n    }\n\n    private fun fetchLessons');
text = once(text, '    override fun onDestroyView() {\n        super.onDestroyView()', '    override fun onDestroyView() {\n        bulkDownloadJob?.cancel()\n        super.onDestroyView()');
outputs.set(home, text);
const manifest = [];
for (const [file, result] of outputs) {
    const target = path.join(preview, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result);
    manifest.push({ file, originalHash: sha(originals.get(file)), resultHash: sha(result) });
}
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared ' + outputs.size + ' Android ribbon/bulk-download files.');
