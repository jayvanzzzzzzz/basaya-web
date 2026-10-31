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
    if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw new Error('Unexpected source: ' + before);
    text = text.replace(before, after);
  };
  edit(once, () => text, (next) => { text = next; });
  const target = path.join(preview, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  manifest.push({ file, originalHash: sha(original), resultHash: sha(text) });
}
change('app/src/main/java/ph/basaya/app/adapter/LessonAdapter.kt', (once) => {
  once('        private val downloadedRibbon: View = itemView.findViewById(R.id.downloadedRibbon)\n', '');
  once('            downloadedRibbon.visibility = if (lesson.isDownloaded) View.VISIBLE else View.GONE\n', '');
});
change('app/src/main/res/layout/item_lesson.xml', (once, get, set) => {
  const id = get().indexOf('android:id="@+id/downloadedRibbon"');
  if (id < 0) throw new Error('Missing card ribbon');
  const start = get().lastIndexOf('            <TextView', id);
  const end = get().indexOf(' />', id) + 3;
  set(get().slice(0, start) + get().slice(end).replace(/^\n\n/, ''));
});
change('app/src/main/res/values/strings.xml', (once) => {
  once('</resources>', `    <string name="lesson_tab_downloaded">Na-download (%1$d)</string>
    <string name="empty_no_downloaded_lessons">Walang na-download na aralin. Gamitin ang menu ng aralin o I-download lahat.</string>
</resources>`);
});
change('app/src/main/res/layout/fragment_home.xml', (once, get, set) => {
  const button = get().indexOf('android:id="@+id/btnDownloadAll"');
  const rowStart = get().lastIndexOf('        <LinearLayout', button);
  const rowEnd = get().indexOf('        </LinearLayout>', button) + '        </LinearLayout>'.length;
  let row = get().slice(rowStart, rowEnd);
  row = row.replace('            android:orientation="horizontal"', '            app:layout_scrollFlags="scroll"\n            android:orientation="horizontal"');
  set(get().slice(0, rowStart) + row + get().slice(rowEnd));
  const id = get().indexOf('android:id="@+id/lessonTabs"');
  const start = get().lastIndexOf('        <LinearLayout', id);
  const end = get().indexOf('        </LinearLayout>', id) + '        </LinearLayout>'.length;
  let tabs = get().slice(start, end);
  tabs = tabs.replace('            android:id="@+id/lessonTabs"\n', '');
  tabs = tabs.replace('android:layout_width="match_parent"', 'android:layout_width="wrap_content"');
  tabs = tabs.replace(/            android:layout_margin(?:Start|Top|End|Bottom)="[^"]*"\n/g, '');
  tabs = tabs.replace('            android:visibility="gone"\n            tools:visibility="visible"', '            android:gravity="center_vertical"');
  tabs = tabs.replaceAll('                style="@style/LessonTab"', '                style="@style/LessonTab"\n                android:layout_width="wrap_content"\n                android:minWidth="80dp"\n                android:paddingStart="12dp"\n                android:paddingEnd="12dp"');
  tabs = tabs.replace('        </LinearLayout>', `            <TextView
                android:id="@+id/tabDownloaded"
                style="@style/LessonTab"
                android:layout_width="wrap_content"
                android:minWidth="112dp"
                android:paddingStart="12dp"
                android:paddingEnd="12dp"
                android:layout_marginStart="4dp"
                tools:text="Na-download (2)" />
        </LinearLayout>`);
  const wrapper = `        <HorizontalScrollView
            android:id="@+id/lessonTabs"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginStart="18dp"
            android:layout_marginEnd="18dp"
            android:layout_marginTop="10dp"
            android:layout_marginBottom="4dp"
            android:fillViewport="true"
            android:scrollbars="none"
            android:visibility="gone"
            tools:visibility="visible">
${tabs}
        </HorizontalScrollView>`;
  set(get().slice(0, start) + wrapper + get().slice(end));
});
change('app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt', (once) => {
  once('private enum class LessonTab { ALL, OPEN, CLOSED }', 'private enum class LessonTab { ALL, OPEN, CLOSED, DOWNLOADED }');
  once('            LessonTab.CLOSED to view.findViewById(R.id.tabClosed)', '            LessonTab.CLOSED to view.findViewById(R.id.tabClosed),\n            LessonTab.DOWNLOADED to view.findViewById(R.id.tabDownloaded)');
  once('        tabViews.forEach { (tab, tabView) -> tabView.isSelected = tab == currentTab }', '        tabViews.getValue(LessonTab.DOWNLOADED).text = getString(R.string.lesson_tab_downloaded, allLessons.count { it.isDownloaded })\n        tabViews.forEach { (tab, tabView) -> tabView.isSelected = tab == currentTab }');
  once('            LessonTab.CLOSED -> allLessons.filter { it.id in closedIds }', '            LessonTab.CLOSED -> allLessons.filter { it.id in closedIds }\n            LessonTab.DOWNLOADED -> allLessons.filter { it.isDownloaded }');
  once('                currentTab == LessonTab.CLOSED ->', '                currentTab == LessonTab.DOWNLOADED ->\n                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_downloaded_lessons)\n                currentTab == LessonTab.CLOSED ->');
});
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared ' + manifest.length + ' Android Home tab and scrolling-control changes.');
