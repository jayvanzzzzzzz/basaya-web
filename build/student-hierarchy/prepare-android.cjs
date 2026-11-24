const fs = require('fs'), path = require('path');
const root = 'C:/Projects/BaSaya';
const out = 'build/student-hierarchy/android';
const base = 'app/src/main/java/ph/basaya/app/';
const manifest = [];
function write(name, text) { const target = path.join(out, name); fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target,text); manifest.push(name); }
function edit(name, fn) { write(name,fn(fs.readFileSync(path.join(root,name),'utf8'))); }
edit(base+'data/entity/LessonEntity.kt', s => s.replace('val started: Boolean = false', `val started: Boolean = false,
    @ColumnInfo(defaultValue = "''")
    val navigationMetadata: String = "",
    @ColumnInfo(defaultValue = "0")
    val pronunciationFinished: Boolean = false`));
edit(base+'data/database/AppDatabase.kt', s => s.replace('version = 18','version = 19').replace('        @Volatile', `        private val MIGRATION_18_19 = object : Migration(18, 19) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN navigationMetadata TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE lessons ADD COLUMN pronunciationFinished INTEGER NOT NULL DEFAULT 0")
            }
        }

        @Volatile`).replace('MIGRATION_16_17, MIGRATION_17_18\n','MIGRATION_16_17, MIGRATION_17_18, MIGRATION_18_19\n'));
edit(base+'data/dao/LessonDao.kt', s => s.replace('    @Query("SELECT * FROM lessons WHERE id = :lessonId LIMIT 1")', `    @Query("UPDATE lessons SET pronunciationFinished = :finished WHERE id = :lessonId AND userId = :userId")
    suspend fun updatePronunciation(userId: String, lessonId: String, finished: Boolean)

    @Query("SELECT * FROM lessons WHERE id = :lessonId LIMIT 1")`));
edit(base+'data/repository/LessonRepository.kt', s => {
 s=s.replace('val practice: Boolean\n', 'val practice: Boolean,\n            val navigation: String\n');
 s=s.replace('practice = practice\n', `practice = practice,
                navigation = org.json.JSONObject().apply {
                    for (key in listOf("learningPathAssignmentId", "learningPathTitle", "moduleId", "moduleTitle")) put(key, link.getString(key) ?: "")
                    for (key in listOf("learningPathOrder", "learningPathModuleOrder", "moduleOrder")) put(key, link.getLong(key) ?: link.getLong("order") ?: 0L)
                    put("exempt", link.getBoolean("exempt") == true)
                }.toString()
`);
 s=s.replace('started = LessonResume.started(progressDocs[link.entryId])', `started = LessonResume.started(progressDocs[link.entryId]),
                navigationMetadata = link.navigation,
                pronunciationFinished = progressDocs[link.entryId]?.getBoolean("pronunciationFinished") == true`);
 s=s.replace('            val doc = docs[lesson.id]\n', '            val doc = docs[lesson.id]\n            db.lessonDao().updatePronunciation(userId, lesson.id, doc?.getBoolean("pronunciationFinished") == true)\n');
 s=s.replace('quizFinished = finished("quiz", lesson.quizFinished), started', 'quizFinished = finished("quiz", lesson.quizFinished), pronunciationFinished = finished("pronunciation", lesson.pronunciationFinished), started');
 return s;
});
write(base+'data/schedule/StudentHierarchy.kt', `package ph.basaya.app.data.schedule

import org.json.JSONObject
import ph.basaya.app.data.entity.LessonEntity

/** Class order is independent of list filtering and downloads. */
object StudentHierarchy {
    fun meta(lesson: LessonEntity): JSONObject = runCatching { JSONObject(lesson.navigationMetadata) }.getOrDefault(JSONObject())
    fun path(lesson: LessonEntity) = meta(lesson).optString("learningPathAssignmentId")
    fun module(lesson: LessonEntity) = meta(lesson).optString("moduleId").ifBlank { "__lessons" }
    fun complete(lesson: LessonEntity) = lesson.lectureFinished && (lesson.gameFinished || lesson.gameSkipped) &&
        (lesson.activityFinished || lesson.activitySkipped) && lesson.pronunciationFinished && lesson.quizFinished
    fun ordered(lessons: List<LessonEntity>) = lessons.sortedWith(compareBy<LessonEntity> { meta(it).optInt("learningPathOrder", it.order) }
        .thenBy { meta(it).optInt("learningPathModuleOrder", it.order) }.thenBy { it.order }.thenBy { it.id })
    fun blocker(lesson: LessonEntity, lessons: List<LessonEntity>): String? {
        if (path(lesson).isBlank()) return null
        val paths = ordered(lessons).groupBy { path(it) }.filterKeys { it.isNotBlank() }.values.toList()
        val pathIndex = paths.indexOfFirst { group -> group.any { it.id == lesson.id } }
        if (pathIndex < 0) return null
        fun unfinished(item: LessonEntity) = !item.practice && !meta(item).optBoolean("exempt") && !complete(item)
        paths.take(pathIndex).firstOrNull { it.any(::unfinished) }?.let { return meta(it.first()).optString("learningPathTitle", "Lesson path") }
        val modules = paths[pathIndex].groupBy { module(it) }.values.toList()
        val moduleIndex = modules.indexOfFirst { group -> group.any { it.id == lesson.id } }
        modules.take(moduleIndex).firstOrNull { it.any(::unfinished) }?.let { return meta(it.first()).optString("moduleTitle", "Module") }
        return modules[moduleIndex].takeWhile { it.id != lesson.id }.firstOrNull(::unfinished)?.title
    }
}
`);
// Hierarchy cards use the existing lesson surface and theme tokens, with separate navigation rows.
write(base+'adapter/StudentGroupAdapter.kt', `package ph.basaya.app.adapter

import android.view.View
import android.view.ViewGroup
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.card.MaterialCardView
import ph.basaya.app.R

data class StudentGroup(val id: String, val title: String, val count: String, val done: Int, val total: Int, val locked: Boolean, val reason: String)
class StudentGroupAdapter(private val groups: List<StudentGroup>, private val open: (StudentGroup) -> Unit) : RecyclerView.Adapter<StudentGroupAdapter.Holder>() {
    class Holder(val card: MaterialCardView) : RecyclerView.ViewHolder(card)
    override fun onCreateViewHolder(parent: ViewGroup, type: Int): Holder {
        val c = parent.context; val d = c.resources.displayMetrics.density
        return Holder(MaterialCardView(c).apply {
            layoutParams = RecyclerView.LayoutParams(-1, -2).apply { bottomMargin = (16*d).toInt() }
            radius = 12*d; cardElevation = 0f; strokeWidth = (d).toInt().coerceAtLeast(1)
            setCardBackgroundColor(ContextCompat.getColor(c,R.color.lesson_card_surface))
            strokeColor = ContextCompat.getColor(c,R.color.lesson_card_stroke)
            isClickable = true; isFocusable = true
        })
    }
    override fun getItemCount() = groups.size
    override fun onBindViewHolder(holder: Holder, position: Int) {
        val group = groups[position]; val card = holder.card; val c = card.context; val d = c.resources.displayMetrics.density
        card.removeAllViews()
        val frame = FrameLayout(c)
        val column = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; setPadding((20*d).toInt(),(22*d).toInt(),(54*d).toInt(),(22*d).toInt()) }
        fun text(value: String, size: Float, color: Int) = TextView(c).apply { text=value; textSize=size; setTextColor(ContextCompat.getColor(c,color)); setPadding(0,0,0,(10*d).toInt()) }
        column.addView(text(group.title,21f,R.color.home_ink).apply { typeface=android.graphics.Typeface.create("sans-serif-medium",0) })
        column.addView(text(group.count,14f,R.color.home_body))
        column.addView(text("\${group.done}/\${group.total} aralin na natapos",13f,R.color.home_body))
        column.addView(text(if(group.locked) group.reason else "Buksan  →",14f,R.color.home_ink))
        frame.addView(column)
        if(group.locked) frame.addView(android.widget.ImageView(c).apply {
            setImageResource(R.drawable.ic_lock_small); setColorFilter(ContextCompat.getColor(c,R.color.home_ink)); importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
        },FrameLayout.LayoutParams((26*d).toInt(),(26*d).toInt(),Gravity.TOP or Gravity.END).apply { topMargin=(22*d).toInt();rightMargin=(18*d).toInt() })
        card.addView(frame); card.contentDescription = group.title + ". " + group.count + ". " + if(group.locked) group.reason else "Buksan"
        card.setOnClickListener { open(group) }
    }
}
`);
edit(base+'ui/fragment/HomeFragment.kt', s => {
 s=s.replace('class HomeFragment : Fragment() {', `class HomeFragment : Fragment() {
    private var selectedPath: String? = null
    private var selectedModule: String? = null
    private lateinit var hierarchyBack: TextView
    private val hierarchy get() = ph.basaya.app.data.schedule.StudentHierarchy
    private fun leaveLevel() { if (selectedModule != null) selectedModule = null else selectedPath = null; etSearch.setText(""); showLessons() }
`);
 s=s.replace('        checkClassMembershipAndLoad()\n\n        return view', `        hierarchyBack = TextView(requireContext()).apply {
            textSize = 14f; minHeight = (48 * resources.displayMetrics.density).toInt()
            gravity = Gravity.CENTER_VERTICAL; setTextColor(ContextCompat.getColor(context, R.color.home_ink))
            isClickable = true; isFocusable = true; setOnClickListener { leaveLevel() }
        }
        view.findViewById<LinearLayout>(R.id.homeHeader).addView(hierarchyBack)
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, object : androidx.activity.OnBackPressedCallback(false) {
            override fun handleOnBackPressed() { leaveLevel() }
        }.also { hierarchyBackCallback = it })
        checkClassMembershipAndLoad()

        return view`);
 s=s.replace('    private lateinit var adapter: LessonAdapter', '    private var hierarchyBackCallback: androidx.activity.OnBackPressedCallback? = null\n    private lateinit var adapter: LessonAdapter');
 s=s.replace('        updateDownloadAllButton()\n        val context = requireContext()', `        updateDownloadAllButton()
        if (selectedPath != null && allLessons.none { hierarchy.path(it) == selectedPath }) { selectedPath = null; selectedModule = null }
        hierarchyBack.visibility = if(selectedPath == null) View.GONE else View.VISIBLE
        hierarchyBack.text = if(selectedModule == null) "← Mga lesson path" else "← Mga module"
        hierarchyBackCallback?.isEnabled = selectedPath != null
        view?.findViewById<TextView>(R.id.tvSectionLabel)?.text = if(selectedModule != null) "Mga aralin" else if(selectedPath != null) "Mga module" else "Lesson Path"
        etSearch.hint = if(selectedModule != null) "Hanapin ang aralin" else if(selectedPath != null) "Hanapin ang module" else "Hanapin ang lesson path"
        if (selectedModule == null) { showGroups(); return }
        recyclerView.adapter = adapter
        val scopedLessons = allLessons.filter { hierarchy.path(it) == selectedPath && hierarchy.module(it) == selectedModule }
        val context = requireContext()`);
 s=s.replace('LessonTab.ALL -> allLessons\n', 'LessonTab.ALL -> scopedLessons\n').replace('LessonTab.DOWNLOADED -> allLessons.filter { it.isDownloaded }', 'LessonTab.DOWNLOADED -> scopedLessons.filter { it.isDownloaded }');
 const start=s.indexOf('        shownLessons = LessonSchedule.sortForList('), end=s.indexOf('\n\n        if (shownLessons.isEmpty())',start);
 s=s.slice(0,start)+`        shownLessons = hierarchy.ordered(if(query.isEmpty()) filtered else filtered.filter { it.title.contains(query, ignoreCase=true) })`+s.slice(end);
 s=s.replace('    private fun inStatus(', `    private fun showGroups() {
        val ordered = hierarchy.ordered(allLessons.filter { hierarchy.path(it).isNotBlank() })
        val groups = if(selectedPath == null) ordered.groupBy { hierarchy.path(it) } else ordered.filter { hierarchy.path(it) == selectedPath }.groupBy { hierarchy.module(it) }
        val query = etSearch.text.toString().trim()
        val rows = groups.map { (id, members) ->
            val first=members.first(); val metadata=hierarchy.meta(first)
            val title=if(selectedPath == null) metadata.optString("learningPathTitle").ifBlank { "Lesson path" } else metadata.optString("moduleTitle").ifBlank { "Mga aralin" }
            val reason=hierarchy.blocker(first,allLessons)
            val unlocked=members.any { hierarchy.blocker(it,allLessons)==null && LessonSchedule.canOpen(requireContext(),it) }
            ph.basaya.app.adapter.StudentGroup(id,title,if(selectedPath == null) "\${members.map { hierarchy.module(it) }.distinct().size} modules · \${members.size} aralin" else "\${members.size} aralin",
                members.count { hierarchy.complete(it) },members.size,!unlocked,
                if(reason!=null) "Tapusin muna: $reason" else if(first.openAt!=null) "Bubukas: \${LessonSchedule.format(first.openAt)}" else "Sarado na")
        }.filter { it.title.contains(query,ignoreCase=true) }
        lessonTabs.visibility=View.GONE
        btnFilters.visibility=View.GONE
        btnDownloadAll.visibility=View.GONE
        recyclerView.visibility=if(rows.isEmpty()) View.GONE else View.VISIBLE
        tvEmptyLessons.text=if(query.isBlank()) "Wala pang nakatalagang lesson path." else "Walang nahanap."
        setEmptyVisible(rows.isEmpty())
        recyclerView.adapter=ph.basaya.app.adapter.StudentGroupAdapter(rows) { row ->
            if(row.locked) { Toast.makeText(requireContext(),row.reason,Toast.LENGTH_LONG).show() }
            else { if(selectedPath==null) selectedPath=row.id else selectedModule=row.id; currentTab=LessonTab.ALL; currentStatus=null; currentAvailability=ScheduleFilter.ALL; etSearch.setText(""); btnFilters.visibility=View.VISIBLE; showLessons() }
        }
    }

    private fun inStatus(`);
 s=s.replace('        if (!LessonSchedule.canOpen(requireContext(), lesson)) {', `        val blocker = hierarchy.blocker(lesson, allLessons)
        if (blocker != null) { Toast.makeText(requireContext(), "Tapusin muna: $blocker", Toast.LENGTH_LONG).show(); return }
        if (!LessonSchedule.canOpen(requireContext(), lesson)) {`);
 // Notification highlighting must respect the same locked hierarchy.
 s=s.replace('        pendingHighlight = null\n', `        pendingHighlight = null
        allLessons.firstOrNull { it.id in ids }?.takeIf { hierarchy.blocker(it,allLessons)==null && LessonSchedule.canOpen(requireContext(),it) }?.let {
            selectedPath=hierarchy.path(it); selectedModule=hierarchy.module(it); showLessons()
        }
`);
 return s;
});
edit(base+'adapter/LessonAdapter.kt', s=>s.replace('        if (lesson.order > 0) {\n            meta.append(context.getString(R.string.lesson_card_number, lesson.order))\n        }','')
 .replace('            itemView.alpha = 1f', `            itemView.alpha = 1f
            val lock = itemView.findViewWithTag<android.widget.ImageView>("sequenceLock") ?: android.widget.ImageView(itemView.context).apply {
                tag="sequenceLock"; setImageResource(R.drawable.ic_lock_small)
                setColorFilter(ContextCompat.getColor(context,R.color.home_ink))
                importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
                val d=resources.displayMetrics.density
                (itemView as MaterialCardView).addView(this,android.widget.FrameLayout.LayoutParams((24*d).toInt(),(24*d).toInt(),Gravity.TOP or Gravity.END).apply { topMargin=(18*d).toInt();rightMargin=(18*d).toInt() })
            }
            val siblings = sequenceLessons
            val blocker = ph.basaya.app.data.schedule.StudentHierarchy.blocker(lesson,siblings)
            lock.visibility=if(blocker!=null || !LessonSchedule.canOpen(itemView.context,lesson)) View.VISIBLE else View.GONE
            if(blocker!=null) { tvSchedule.visibility=View.VISIBLE; tvSchedule.text="Tapusin muna: $blocker" }
`)
 .replace('    private var bulkDownloading = false', '    var sequenceLessons: List<LessonEntity> = emptyList()\n    private var bulkDownloading = false'));
// Supply the complete classroom, never just the currently filtered rows.
const home=path.join(out,base+'ui/fragment/HomeFragment.kt');
fs.writeFileSync(home,fs.readFileSync(home,'utf8').replace('        adapter.updateList(shownLessons, query)','        adapter.sequenceLessons = allLessons\n        adapter.updateList(shownLessons, query)'));
fs.writeFileSync('build/student-hierarchy/android-files.json',JSON.stringify(manifest,null,2));
