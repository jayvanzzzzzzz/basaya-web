const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const manifest = [];
function change(file, edit) {
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  let text = original.replace(/\r\n/g, '\n');
  const once = (before, after) => {
    if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('Unexpected anchor in ' + file + ': ' + before);
    text = text.replace(before, after);
  };
  const get = () => text;
  const set = (next) => { text = next; };
  edit(once, get, set);
  const target = path.join(preview, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  manifest.push({ file, originalHash: sha(original), resultHash: sha(text) });
}
change('app/src/main/res/layout/fragment_home.xml', (once, get, set) => {
  const start = get().indexOf('        <com.google.android.material.button.MaterialButton\n            android:id="@+id/btnDownloadAll"');
  const end = get().indexOf(' />', start) + 3;
  if (start < 0 || end < start) throw new Error('Missing bulk download button');
  let button = get().slice(start, end);
  button = button.replace('android:layout_width="match_parent"', 'android:layout_width="0dp"\n            android:layout_weight="1"');
  button = button.replace(/            android:layout_margin(?:Start|End|Top)="[^"]*"\n/g, '');
  set(get().slice(0, start) + `        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginStart="18dp"
            android:layout_marginEnd="18dp"
            android:layout_marginTop="8dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:visibility="gone">
${button}
            <ImageButton
                android:id="@+id/btnCancelDownloadAll"
                android:layout_width="48dp"
                android:layout_height="48dp"
                android:layout_marginStart="8dp"
                android:background="?attr/selectableItemBackgroundBorderless"
                android:padding="12dp"
                android:src="@drawable/ic_close"
                android:contentDescription="@string/lesson_download_cancel_cd"
                android:visibility="gone"
                app:tint="@color/lesson_card_primary" />
        </LinearLayout>` + get().slice(end));
});
change('app/src/main/res/values/strings.xml', (once) => {
  once('</resources>', `    <string name="lesson_download_cancel_cd">Itigil ang pag-download</string>
    <string name="lesson_download_cancelled">Itinigil ang pag-download. Naka-save ang mga natapos na aralin.</string>
</resources>`);
});
change('app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt', (once) => {
  once('import kotlinx.coroutines.Job', 'import kotlinx.coroutines.Job\nimport kotlinx.coroutines.CancellationException');
  once('    private var isBulkDownloading = false', '    private var isBulkDownloading = false\n    private var bulkCancelRequested = false\n    private lateinit var btnCancelDownloadAll: ImageButton');
  once('        btnDownloadAll.setOnClickListener { downloadAllLessons() }', `        btnDownloadAll.setOnClickListener { downloadAllLessons() }
        btnCancelDownloadAll = view.findViewById(R.id.btnCancelDownloadAll)
        btnCancelDownloadAll.setOnClickListener {
            bulkCancelRequested = true
            btnCancelDownloadAll.isEnabled = false
            bulkDownloadJob?.cancel()
        }`);
  once('        if (!isBulkDownloading) btnDownloadAll.setText(R.string.lesson_download_all)', `        (btnDownloadAll.parent as View).visibility = btnDownloadAll.visibility
        btnCancelDownloadAll.visibility = if (isBulkDownloading) View.VISIBLE else View.GONE
        btnCancelDownloadAll.isEnabled = !bulkCancelRequested
        if (!isBulkDownloading) btnDownloadAll.setText(R.string.lesson_download_all)`);
  once('        isBulkDownloading = true\n        batchAdapter.setBulkDownloading(true)', '        isBulkDownloading = true\n        bulkCancelRequested = false\n        batchAdapter.setBulkDownloading(true)');
  once('                            if (view === ownerView && isBulkDownloading) {', '                            if (view === ownerView && isBulkDownloading && !bulkCancelRequested) {');
  once('                    Toast.LENGTH_LONG).show()\n            } finally {', `                    Toast.LENGTH_LONG).show()
            } catch (cancelled: CancellationException) {
                if (view === ownerView && bulkCancelRequested) {
                    Toast.makeText(context, R.string.lesson_download_cancelled, Toast.LENGTH_SHORT).show()
                }
                throw cancelled
            } finally {`);
  once('                isBulkDownloading = false\n                if (view === ownerView)', '                isBulkDownloading = false\n                bulkCancelRequested = false\n                if (view === ownerView)');
});
change('app/src/main/java/ph/basaya/app/data/repository/LessonRepository.kt', (once) => {
  once('import kotlinx.coroutines.async', 'import kotlinx.coroutines.CancellationException\nimport kotlinx.coroutines.currentCoroutineContext\nimport kotlinx.coroutines.ensureActive\nimport kotlinx.coroutines.async');
  once('        var reported = 0\n        fun report(percent: Int) {', '        val downloadContext = currentCoroutineContext()\n        var reported = 0\n        fun report(percent: Int) {\n            downloadContext.ensureActive()');
  once('            db.lessonDao().updateDownloaded(lessonId, true)', '            downloadContext.ensureActive()\n            db.lessonDao().updateDownloaded(lessonId, true)');
  once('            report(100)\n            true\n        } catch (e: Exception) {', '            report(100)\n            true\n        } catch (e: CancellationException) {\n            throw e\n        } catch (e: Exception) {');
});
change('app/src/main/java/ph/basaya/app/data/audio/LectureAudioStore.kt', (once) => {
  once('import kotlinx.coroutines.Dispatchers', `import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers`);
  once('    internal fun replaceDir(dir: File, fill: (staging: File) -> Unit) {', '    internal suspend fun replaceDir(dir: File, fill: suspend (staging: File) -> Unit) {');
  once('            fill(staging)\n        } catch', '            fill(staging)\n            currentCoroutineContext().ensureActive()\n        } catch');
  once('    internal fun downloadFile(url: String, target: File) {\n        val connection = URL(url).openConnection() as HttpURLConnection\n        try {', `    internal suspend fun downloadFile(url: String, target: File) = coroutineScope {
        val connection = URL(url).openConnection() as HttpURLConnection
        // A separate cancellable child closes the connection even while its read blocks.
        val cancellationWatcher = launch(Dispatchers.IO, start = CoroutineStart.UNDISPATCHED) {
            try { awaitCancellation() } finally { connection.disconnect() }
        }
        try {
            currentCoroutineContext().ensureActive()`);
  once('                temp.outputStream().use { output -> input.copyTo(output) }', `                temp.outputStream().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                }`);
  once('            if (!temp.renameTo(target)) {', '            currentCoroutineContext().ensureActive()\n            if (!temp.renameTo(target)) {');
  once('        } finally {\n            connection.disconnect()', '        } finally {\n            cancellationWatcher.cancel()\n            connection.disconnect()');
});
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared ' + manifest.length + ' Android cancellation files.');
