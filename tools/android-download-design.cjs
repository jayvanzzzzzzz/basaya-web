const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const adapter = 'app/src/main/java/ph/basaya/app/adapter/LessonAdapter.kt';
const layout = 'app/src/main/res/layout/item_lesson.xml';
const strings = 'app/src/main/res/values/strings.xml';
const doneIcon = 'app/src/main/res/drawable/ic_lesson_downloaded.xml';
const moreIcon = 'app/src/main/res/drawable/ic_lesson_more.xml';
const allowed = [adapter, layout, strings, doneIcon, moreIcon, 'app/build.gradle.kts',
  'app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt',
  'app/src/main/res/layout/fragment_home.xml',
  'app/src/main/res/drawable/bg_downloaded_ribbon.xml',
  'app/src/main/java/ph/basaya/app/data/repository/LessonRepository.kt',
  'app/src/main/java/ph/basaya/app/data/audio/LectureAudioStore.kt',
  'app/src/main/java/ph/basaya/app/data/audio/PronunciationAudioStore.kt',
  'app/src/test/java/ph/basaya/app/data/audio/DownloadCancellationTest.kt'];
function replaceOnce(text, before, after) {
  if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('Expected unique source anchor: ' + before.slice(0, 70));
  return text.replace(before, after);
}
if (process.argv.includes('--apply')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(preview, 'manifest.json'), 'utf8'));
  for (const entry of manifest) {
    if (!allowed.includes(entry.file)) throw new Error('Unexpected target');
    const target = path.join(root, entry.file);
    const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (sha(old ?? '') !== entry.originalHash) throw new Error('File changed since preview: ' + entry.file);
    if (sha(fs.readFileSync(path.join(preview, entry.file), 'utf8')) !== entry.resultHash) throw new Error('Preview changed');
  }
  for (const entry of manifest) {
    const target = path.join(root, entry.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(preview, entry.file), target);
  }
  console.log('Applied Android download design to ' + manifest.length + ' files.');
  process.exit(0);
}
const original = new Map(allowed.map((file) => [file, fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : null]));
const outputs = new Map();
let source = original.get(adapter).replace(/\r\n/g, '\n');
source = replaceOnce(source, '        private val downloadButton: View', '        private val downloadStatus: View = itemView.findViewById(R.id.downloadStatus)\n        private val downloadButton: View');
const clickStart = source.indexOf('            downloadButton.setOnClickListener {');
const clickEnd = source.indexOf('\n        /**', clickStart);
if (clickStart < 0 || clickEnd < 0) throw new Error('Missing click block');
source = source.slice(0, clickStart) + `            downloadButton.setOnClickListener { showDownloadMenu(lesson) }
        }

        private fun startDownload(lesson: LessonEntity) {
            if (downloadProgress.containsKey(lesson.id) || removingIds.contains(lesson.id)) return
            downloadProgress[lesson.id] = 0
            notifyDownloadChanged(lesson.id)
            onDownloadClick(lesson, { percent -> updateDownloadProgress(lesson.id, percent) }) { success ->
                downloadProgress.remove(lesson.id)
                if (success) markDownloaded(lesson.id) else notifyDownloadChanged(lesson.id)
            }
        }
` + source.slice(clickEnd);
const menuStart = source.indexOf('        private fun showRemoveDownloadMenu(');
const menuEnd = source.indexOf('\n        /**', menuStart);
if (menuStart < 0 || menuEnd < 0) throw new Error('Missing popup block');
source = source.slice(0, menuStart) + `        private fun showDownloadMenu(lesson: LessonEntity) {
            val current = lessonList.firstOrNull { it.id == lesson.id } ?: return
            val context = itemView.context
            val busy = downloadProgress.containsKey(current.id) || removingIds.contains(current.id)
            val popup = PopupMenu(context, downloadButton)
            popup.menu.add(0, 1, 0, context.getString(
                if (downloadProgress.containsKey(current.id)) R.string.lesson_card_downloading_cd
                else if (current.isDownloaded) R.string.lesson_card_update_download
                else R.string.lesson_card_download_cd
            )).isEnabled = !busy && LessonSchedule.canOpen(context, current)
            if (current.isDownloaded) {
                popup.menu.add(0, 2, 1, R.string.lesson_card_remove_download).isEnabled = !busy
            }
            popup.setOnMenuItemClickListener { action ->
                when (action.itemId) {
                    1 -> startDownload(current)
                    2 -> {
                        if (!removingIds.contains(current.id) && !downloadProgress.containsKey(current.id)) {
                            removingIds.add(current.id)
                            onRemoveDownloadClick(current) { success ->
                                removingIds.remove(current.id)
                                if (success) markRemoved(current.id) else notifyDownloadChanged(current.id)
                            }
                        }
                    }
                }
                true
            }
            popup.show()
        }
` + source.slice(menuEnd);
const commentStart = source.lastIndexOf('        /**', source.indexOf('        fun bindDownloadState('));
const commentEnd = source.indexOf('        fun bindDownloadState(', commentStart);
source = source.slice(0, commentStart) + '        /** Progress or a green downloaded arrow appears immediately left of the options menu. */\n' + source.slice(commentEnd);
source = replaceOnce(source, '            val progress = downloadProgress[lesson.id]\n', '            val progress = downloadProgress[lesson.id]\n            downloadStatus.visibility = if (progress != null || lesson.isDownloaded) View.VISIBLE else View.GONE\n');
source = source.replaceAll('downloadButton.contentDescription =', 'downloadStatus.contentDescription =');
source = replaceOnce(source, 'ibDownload.setImageResource(R.drawable.ic_check_download)', 'ibDownload.setImageResource(R.drawable.ic_lesson_downloaded)');
source = replaceOnce(source, '                    ibDownload.setImageResource(R.drawable.ic_download)', '                    ibDownload.visibility = View.GONE');
source = replaceOnce(source, '        downloadProgress[lessonId] = percent', '        downloadProgress[lessonId] = percent.coerceIn(0, 100)');
source = replaceOnce(source, '    /** Flips a single lesson\'s isDownloaded flag to true', `    private fun notifyDownloadChanged(lessonId: String) {
        val index = lessonList.indexOfFirst { it.id == lessonId }
        if (index != -1) notifyItemChanged(index, PAYLOAD_DOWNLOAD_PROGRESS)
    }

    /** Flips a single lesson's isDownloaded flag to true`);
outputs.set(adapter, source);
source = original.get(layout).replace(/\r\n/g, '\n');
source = replaceOnce(source, '        android:gravity="center_vertical"\n        android:orientation="horizontal"', '        android:gravity="top"\n        android:orientation="horizontal"');
const tail = source.indexOf('        <!-- E. Offline download:');
if (tail < 0) throw new Error('Missing download layout');
source = source.slice(0, tail) + `        <!-- Download status is separate from the 48dp options target. -->
        <FrameLayout
            android:id="@+id/downloadStatus"
            android:layout_width="32dp"
            android:layout_height="48dp"
            android:layout_marginStart="4dp"
            android:importantForAccessibility="yes"
            android:visibility="gone">

            <ImageView
                android:id="@+id/ibDownload"
                android:layout_width="24dp"
                android:layout_height="24dp"
                android:layout_gravity="center"
                android:importantForAccessibility="no"
                android:src="@drawable/ic_lesson_downloaded" />

            <com.google.android.material.progressindicator.CircularProgressIndicator
                android:id="@+id/pbDownload"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_gravity="center"
                android:importantForAccessibility="no"
                android:indeterminate="true"
                android:max="100"
                android:visibility="gone"
                app:indicatorColor="@color/lesson_card_primary"
                app:indicatorSize="22dp"
                app:trackColor="@color/lesson_card_track"
                app:trackCornerRadius="2dp"
                app:trackThickness="2.5dp" />
        </FrameLayout>

        <FrameLayout
            android:id="@+id/downloadButton"
            android:layout_width="48dp"
            android:layout_height="48dp"
            android:background="?attr/selectableItemBackgroundBorderless"
            android:clickable="true"
            android:contentDescription="@string/lesson_card_download_options_cd"
            android:focusable="true">

            <ImageView
                android:layout_width="24dp"
                android:layout_height="24dp"
                android:layout_gravity="center"
                android:importantForAccessibility="no"
                android:src="@drawable/ic_lesson_more" />
        </FrameLayout>
    </LinearLayout>
</com.google.android.material.card.MaterialCardView>
`;
outputs.set(layout, source);
source = original.get(strings).replace(/\r\n/g, '\n');
source = replaceOnce(source, 'Na-download na. I-tap para alisin ang download.', 'Na-download na ang aralin.');
source = replaceOnce(source, '</resources>', `    <string name="lesson_card_download_options_cd">Mga opsyon sa download</string>
    <string name="lesson_card_update_download">I-update ang download</string>
    <string name="lesson_card_remove_download">Alisin ang download</string>
</resources>`);
outputs.set(strings, source);
outputs.set(doneIcon, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="@android:color/transparent"
        android:pathData="M12,3 L12,15 M8,11 L12,15 L16,11 M5,16 L5,20 L19,20 L19,16"
        android:strokeColor="@color/lesson_downloaded_check" android:strokeWidth="2"
        android:strokeLineCap="round" android:strokeLineJoin="round" />
</vector>
`);
outputs.set(moreIcon, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="@color/lesson_card_body"
        android:pathData="M12,3 A2,2 0,1 0,12,7 A2,2 0,1 0,12,3 M12,10 A2,2 0,1 0,12,14 A2,2 0,1 0,12,10 M12,17 A2,2 0,1 0,12,21 A2,2 0,1 0,12,17" />
</vector>
`);
const manifest = [];
for (const [file, text] of outputs) {
  const target = path.join(preview, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  manifest.push({ file, originalHash: sha(original.get(file) ?? ''), resultHash: sha(text) });
}
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared ' + outputs.size + ' Android files in ' + preview);
