package ph.basaya.app.adapter

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import com.google.android.material.card.MaterialCardView
import com.google.android.material.progressindicator.CircularProgressIndicator
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.PopupWindow
import android.view.Gravity
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import ph.basaya.app.R
import ph.basaya.app.data.entity.LessonEntity
import ph.basaya.app.data.progress.LessonStatus
import ph.basaya.app.data.schedule.LessonSchedule
import ph.basaya.app.data.schedule.LessonSchedule.Availability

class LessonAdapter(
    private var lessonList: List<LessonEntity>,
    private val onItemClick: (LessonEntity) -> Unit,
    private val onDownloadClick: (LessonEntity, onProgress: (Int) -> Unit, onResult: (Boolean) -> Unit) -> Unit,
    private val onRemoveDownloadClick: (LessonEntity, onResult: (Boolean) -> Unit) -> Unit
) : RecyclerView.Adapter<LessonAdapter.LessonViewHolder>() {

    var sequenceLessons: List<LessonEntity> = emptyList()
    private var bulkDownloading = false

    private var highlightQuery: String = ""

    // Percent (0–100) of each lesson with a download in flight, so the progress ring survives view recycling and re-binds correctly.
    private val downloadProgress = mutableMapOf<String, Int>()

    // Tracks which lessonIds are currently being removed, so the remove menu can't be double-tapped mid-delete.
    private val removingIds = mutableSetOf<String>()

    // Lessons from a tapped notification; each glows once, the next time its card is shown.
    private val glowIds = mutableSetOf<String>()

    fun highlight(lessonIds: Collection<String>) {
        glowIds.clear()
        glowIds.addAll(lessonIds)
        lessonList.forEachIndexed { index, lesson ->
            if (lesson.id in glowIds) notifyItemChanged(index)
        }
    }

    inner class LessonViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {

        private val tvTitle: TextView = itemView.findViewById(R.id.tvTitle)
        private val tvContinue: TextView = itemView.findViewById(R.id.tvContinueLesson)
        private val tvMeta: TextView = itemView.findViewById(R.id.tvMeta)
        private val tvSchedule: TextView = itemView.findViewById(R.id.tvSchedule)
        private val progressRow: View = itemView.findViewById(R.id.progressRow)
        private val segLecture: View = itemView.findViewById(R.id.segLecture)
        private val segGame: View = itemView.findViewById(R.id.segGame)
        private val segActivity: View = itemView.findViewById(R.id.segActivity)
        private val segQuiz: View = itemView.findViewById(R.id.segQuiz)
        private val tvProgressLabel: TextView = itemView.findViewById(R.id.tvProgressLabel)
        private val ibDownload: ImageView = itemView.findViewById(R.id.ibDownload)
        private val pbDownload: CircularProgressIndicator = itemView.findViewById(R.id.pbDownload)
        private val downloadStatus: View = itemView.findViewById(R.id.downloadStatus)
        private val downloadButton: View = itemView.findViewById(R.id.downloadButton)

        fun bind(lesson: LessonEntity) {
            tvTitle.text = buildHighlightedTitle(tvTitle.context, lesson.title, highlightQuery)
            tvMeta.text = buildMeta(itemView.context, lesson)
            tvContinue.visibility = if (!lesson.practice && LessonStatus.of(lesson) == LessonStatus.IN_PROGRESS &&
                LessonSchedule.availability(itemView.context, lesson) == Availability.OPEN) View.VISIBLE else View.GONE

            bindSteps(lesson)
            bindDownloadState(lesson, animate = false)
            bindSchedule(tvSchedule, lesson)
            // The schedule explains availability; keep titles and dates fully readable.
            itemView.alpha = 1f
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

            if (glowIds.remove(lesson.id)) playGlow(itemView as MaterialCardView)

            itemView.setOnClickListener {
                // Download payloads only redraw the indicator, so resolve the lesson at tap time.
                val current = lessonList.firstOrNull { it.id == lesson.id } ?: return@setOnClickListener
                onItemClick(current)
            }

            downloadButton.setOnClickListener { showDownloadMenu(lesson) }
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

        /**
         * One segment per lesson part (lecture, game, Gawain, quiz); parts the teacher skipped are
         * hidden. Finished parts fill amber while the lesson is in progress and all turn green once
         * it is done. A Practice lesson saves no progress, so it has no step bar.
         */
        private fun bindSteps(lesson: LessonEntity) {
            if (lesson.practice) {
                progressRow.visibility = View.GONE
                return
            }
            progressRow.visibility = View.VISIBLE

            val context = itemView.context
            val parts = listOf(
                Triple(segLecture, lesson.lectureFinished, false),
                Triple(segGame, lesson.gameFinished, lesson.gameSkipped),
                Triple(segActivity, lesson.activityFinished, lesson.activitySkipped),
                Triple(segQuiz, lesson.quizFinished, false)
            )
            val shown = parts.filterNot { it.third }
            val doneCount = shown.count { it.second }
            val allDone = doneCount == shown.size

            val fill = ContextCompat.getColor(context, if (allDone) R.color.lesson_seg_done else R.color.lesson_seg_progress)
            val track = ContextCompat.getColor(context, R.color.lesson_card_track)
            parts.forEach { (segment, finished, skipped) ->
                segment.visibility = if (skipped) View.GONE else View.VISIBLE
                segment.backgroundTintList = ColorStateList.valueOf(if (finished) fill else track)
            }

            val labelColor = when (LessonStatus.of(lesson)) {
                LessonStatus.DONE -> R.color.lesson_status_done_fg
                LessonStatus.IN_PROGRESS -> R.color.lesson_status_progress_fg
                LessonStatus.NOT_STARTED -> R.color.lesson_status_new_fg
            }
            tvProgressLabel.setTextColor(ContextCompat.getColor(context, labelColor))
            if (allDone) {
                tvProgressLabel.setText(R.string.lesson_card_done)
                progressRow.contentDescription = context.getString(R.string.lesson_card_done_cd)
            } else {
                tvProgressLabel.text = context.getString(R.string.lesson_card_parts, doneCount, shown.size)
                progressRow.contentDescription = context.getString(R.string.lesson_card_parts_cd, doneCount, shown.size)
            }
        }

        private fun showDownloadMenu(lesson: LessonEntity) {
            val current = lessonList.firstOrNull { it.id == lesson.id } ?: return
            val context = itemView.context
            val busy = bulkDownloading || downloadProgress.containsKey(current.id) || removingIds.contains(current.id)
            val content = LayoutInflater.from(context).inflate(R.layout.popup_lesson_options, null)
            val density = context.resources.displayMetrics.density
            val popup = PopupWindow(
                content,
                minOf((240 * density).toInt(), context.resources.displayMetrics.widthPixels - (32 * density).toInt()),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                true
            ).apply {
                setBackgroundDrawable(ContextCompat.getDrawable(context, R.drawable.bg_lesson_options))
                elevation = 8 * density
                isOutsideTouchable = true
            }
            val downloadAction = content.findViewById<TextView>(R.id.actionDownload)
            downloadAction.setText(
                if (downloadProgress.containsKey(current.id)) R.string.lesson_card_downloading_cd
                else if (current.isDownloaded) R.string.lesson_card_update_download
                else R.string.lesson_card_download_cd
            )
            downloadAction.isEnabled = !busy && LessonSchedule.canOpen(context, current)
            downloadAction.alpha = if (downloadAction.isEnabled) 1f else 0.45f
            if (current.isDownloaded) {
                downloadAction.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_refresh, 0, 0, 0)
            }
            downloadAction.setOnClickListener {
                popup.dismiss()
                startDownload(current)
            }
            val removeAction = content.findViewById<TextView>(R.id.actionRemoveDownload)
            removeAction.visibility = if (current.isDownloaded) View.VISIBLE else View.GONE
            content.findViewById<View>(R.id.optionsDivider).visibility = removeAction.visibility
            removeAction.isEnabled = !busy
            removeAction.alpha = if (busy) 0.45f else 1f
            removeAction.setOnClickListener {
                popup.dismiss()
                if (!removingIds.contains(current.id) && !downloadProgress.containsKey(current.id)) {
                    removingIds.add(current.id)
                    onRemoveDownloadClick(current) { success ->
                        removingIds.remove(current.id)
                        if (success) markRemoved(current.id) else notifyDownloadChanged(current.id)
                    }
                }
            }
            popup.showAsDropDown(downloadButton, 0, (4 * density).toInt(), Gravity.END)
        }

        /** Progress or a green downloaded arrow appears immediately left of the options menu. */
        fun bindDownloadState(lesson: LessonEntity, animate: Boolean = true) {
            val context = itemView.context
            val progress = downloadProgress[lesson.id]
            downloadStatus.visibility = if (progress != null || lesson.isDownloaded) View.VISIBLE else View.GONE

            when {
                progress != null -> {
                    ibDownload.visibility = View.GONE
                    val indeterminate = progress == 0
                    if (pbDownload.isIndeterminate != indeterminate) {
                        // Switch modes while hidden; some Material versions refuse it while shown.
                        pbDownload.visibility = View.INVISIBLE
                        pbDownload.isIndeterminate = indeterminate
                    }
                    if (!indeterminate) pbDownload.setProgressCompat(progress, animate)
                    pbDownload.visibility = View.VISIBLE
                    downloadStatus.contentDescription = if (indeterminate) {
                        context.getString(R.string.lesson_card_downloading_cd)
                    } else {
                        context.getString(R.string.lesson_card_downloading_percent_cd, progress)
                    }
                }
                lesson.isDownloaded -> {
                    ibDownload.visibility = View.VISIBLE
                    pbDownload.visibility = View.GONE
                    ibDownload.setImageResource(R.drawable.ic_lesson_downloaded)
                    downloadStatus.contentDescription = context.getString(R.string.lesson_card_downloaded_cd)
                }
                else -> {
                    ibDownload.visibility = View.VISIBLE
                    pbDownload.visibility = View.GONE
                    ibDownload.visibility = View.GONE
                    downloadStatus.contentDescription = context.getString(R.string.lesson_card_download_cd)
                }
            }
        }
    }

    /** Short metadata; Practice remains explicit because its progress is not recorded. */
    private fun buildMeta(context: Context, lesson: LessonEntity): CharSequence {
        val meta = SpannableStringBuilder()


        if (lesson.practice) {
            if (meta.isNotEmpty()) meta.append(" · ")
            meta.appendSpan(context.getString(R.string.lesson_mode_practice),
                ContextCompat.getColor(context, R.color.pg_pagkilala))
        }

        if (lesson.difficulty.isNotBlank()) {
            val difficultyColor = ContextCompat.getColor(
                context,
                when (lesson.difficulty.lowercase()) {
                    "beginner"     -> R.color.lesson_diff_beginner
                    "intermediate" -> R.color.lesson_diff_intermediate
                    "advanced"     -> R.color.lesson_diff_advanced
                    else           -> R.color.lesson_diff_default
                }
            )
            if (meta.isNotEmpty()) meta.append(" · ")
            meta.appendSpan(lesson.difficulty.replaceFirstChar { it.uppercase() }, difficultyColor)
        }
        return meta
    }

    private fun SpannableStringBuilder.appendSpan(text: String, color: Int) {
        val start = length
        append(text)
        setSpan(ForegroundColorSpan(color), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        setSpan(StyleSpan(Typeface.BOLD), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /** A short outline cue locates a lesson opened from a notification without moving its text. */
    private fun playGlow(card: MaterialCardView) {
        val context = card.context
        val motionEnabled = if (android.os.Build.VERSION.SDK_INT >= 26) {
            ValueAnimator.areAnimatorsEnabled()
        } else {
            android.provider.Settings.Global.getFloat(
                context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f
            ) != 0f
        }
        if (!motionEnabled) return
        val density = context.resources.displayMetrics.density
        val originalStroke = card.strokeColorStateList
        val originalWidth = card.strokeWidth
        val accent = ContextCompat.getColor(context, R.color.home_accent)
        val outline = ContextCompat.getColor(context, R.color.lesson_card_stroke)

        card.strokeWidth = (2 * density).toInt()
        ValueAnimator.ofArgb(accent, outline).apply {
            duration = 240
            addUpdateListener { card.setStrokeColor(ColorStateList.valueOf(it.animatedValue as Int)) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    card.strokeWidth = originalWidth
                    card.setStrokeColor(originalStroke)
                }
            })
            start()
        }
    }

    /** "Bubukas: …" before the open date, "Deadline: …" while open, "Sarado na" after the deadline. */
    private fun bindSchedule(tvSchedule: TextView, lesson: LessonEntity) {
        val context = tvSchedule.context
        val availability = LessonSchedule.availability(context, lesson)

        val text: String
        val foregroundRes: Int
        when {
            availability == Availability.NOT_YET_OPEN || availability == Availability.NEEDS_INTERNET -> {
                text = context.getString(R.string.schedule_opens, LessonSchedule.format(lesson.openAt))
                foregroundRes = R.color.lesson_status_new_fg
            }
            availability == Availability.CLOSED -> {
                text = context.getString(R.string.schedule_closed, LessonSchedule.format(lesson.dueAt))
                foregroundRes = R.color.lesson_diff_advanced
            }
            lesson.dueAt != null -> {
                text = context.getString(R.string.schedule_due, LessonSchedule.format(lesson.dueAt))
                foregroundRes = R.color.lesson_status_progress_fg
            }
            else -> {
                tvSchedule.visibility = View.GONE
                return
            }
        }

        tvSchedule.visibility = View.VISIBLE
        tvSchedule.text = text
        tvSchedule.setTextColor(ContextCompat.getColor(context, foregroundRes))
    }

    private fun buildHighlightedTitle(context: Context, title: String, query: String): CharSequence {
        if (query.isBlank()) return title

        val startIndex = title.indexOf(query, ignoreCase = true)
        if (startIndex == -1) return title

        val endIndex = startIndex + query.length

        return SpannableString(title).apply {
            setSpan(
                BackgroundColorSpan(ContextCompat.getColor(context, R.color.lesson_search_highlight)),
                startIndex,
                endIndex,
                SpannableString.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LessonViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_lesson, parent, false)
        return LessonViewHolder(view)
    }

    override fun onBindViewHolder(holder: LessonViewHolder, position: Int) {
        holder.bind(lessonList[position])
    }

    override fun onBindViewHolder(holder: LessonViewHolder, position: Int, payloads: List<Any>) {
        // Update only the ring to avoid flashing the whole card.
        if (payloads.isNotEmpty() && payloads.all { it == PAYLOAD_DOWNLOAD_PROGRESS }) {
            holder.bindDownloadState(lessonList[position])
        } else {
            super.onBindViewHolder(holder, position, payloads)
        }
    }

    override fun getItemCount() = lessonList.size

    fun updateList(newList: List<LessonEntity>, query: String = "") {
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
    }

    fun hasActiveDownloads(): Boolean = downloadProgress.isNotEmpty() || removingIds.isNotEmpty()

    fun setBulkDownloading(active: Boolean) {
        // Popup enabled states are evaluated when opened; no card rebind is needed.
        bulkDownloading = active
    }

    fun showBulkProgress(lessonId: String, percent: Int) {
        if (downloadProgress[lessonId] == percent.coerceIn(0, 100)) return
        downloadProgress[lessonId] = percent.coerceIn(0, 100)
        notifyDownloadChanged(lessonId)
    }

    fun finishBulkLesson(lessonId: String, success: Boolean) {
        downloadProgress.remove(lessonId)
        if (success) markDownloaded(lessonId) else notifyDownloadChanged(lessonId)
    }

    /** Moves a lesson's progress ring; ignored once its download has finished. */
    private fun updateDownloadProgress(lessonId: String, percent: Int) {
        if (!downloadProgress.containsKey(lessonId)) return
        if (downloadProgress[lessonId] == percent.coerceIn(0, 100)) return
        downloadProgress[lessonId] = percent.coerceIn(0, 100)

        val index = lessonList.indexOfFirst { it.id == lessonId }
        if (index != -1) notifyItemChanged(index, PAYLOAD_DOWNLOAD_PROGRESS)
    }

    private fun notifyDownloadChanged(lessonId: String) {
        val index = lessonList.indexOfFirst { it.id == lessonId }
        if (index != -1) notifyItemChanged(index, PAYLOAD_DOWNLOAD_PROGRESS)
    }

    /** Flips a single lesson's isDownloaded flag to true and refreshes just that row. */
    private fun markDownloaded(lessonId: String) {
        val index = lessonList.indexOfFirst { it.id == lessonId }
        if (index == -1) return

        lessonList = lessonList.toMutableList().apply {
            this[index] = this[index].copy(isDownloaded = true)
        }
        notifyDownloadChanged(lessonId)
    }

    /** Flips a single lesson's isDownloaded flag back to false and refreshes just that row. */
    private fun markRemoved(lessonId: String) {
        val index = lessonList.indexOfFirst { it.id == lessonId }
        if (index == -1) return

        lessonList = lessonList.toMutableList().apply {
            this[index] = this[index].copy(isDownloaded = false)
        }
        notifyDownloadChanged(lessonId)
    }

    private companion object {
        const val PAYLOAD_DOWNLOAD_PROGRESS = "download_progress"
    }
}
