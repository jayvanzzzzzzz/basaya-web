package ph.basaya.app.adapter

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.view.animation.AccelerateDecelerateInterpolator
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
import android.widget.PopupMenu
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

            bindSteps(lesson)
            bindDownloadState(lesson, animate = false)
            bindSchedule(tvSchedule, lesson)
            // Locked lessons stay visible but dimmed; tapping explains why.
            itemView.alpha = if (LessonSchedule.canOpen(itemView.context, lesson)) 1f else 0.6f
            if (glowIds.remove(lesson.id)) playGlow(itemView as MaterialCardView)

            itemView.setOnClickListener { onItemClick(lesson) }

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

    /** "Aralin 3 · Pagtataya · ● Beginner", with the mode and difficulty in their own colors. */
    private fun buildMeta(context: Context, lesson: LessonEntity): CharSequence {
        val meta = SpannableStringBuilder()
        if (lesson.order > 0) {
            meta.append(context.getString(R.string.lesson_card_number, lesson.order)).append(" · ")
        }

        val (modeText, modeColor) = if (lesson.practice) {
            R.string.lesson_mode_practice to R.color.pg_pagkilala
        } else {
            R.string.lesson_mode_assessment to R.color.pg_unawa
        }
        meta.appendSpan(context.getString(modeText), ContextCompat.getColor(context, modeColor))

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
            meta.append(" · ")
            meta.appendSpan("● " + lesson.difficulty.replaceFirstChar { it.uppercase() }, difficultyColor)
        }
        return meta
    }

    private fun SpannableStringBuilder.appendSpan(text: String, color: Int) {
        val start = length
        append(text)
        setSpan(ForegroundColorSpan(color), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        setSpan(StyleSpan(Typeface.BOLD), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    /** About 2.5 s of a gold-and-violet glowing outline and a gentle pulse, then back to normal. */
    private fun playGlow(card: MaterialCardView) {
        val context = card.context
        val density = context.resources.displayMetrics.density
        val originalStroke = card.strokeColorStateList
        val originalWidth = card.strokeWidth
        val gold = ContextCompat.getColor(context, R.color.tb_ring)
        val violet = ContextCompat.getColor(context, R.color.tb_end)

        card.strokeWidth = (3 * density).toInt()
        val glow = ValueAnimator.ofArgb(gold, violet, gold).apply {
            duration = 850
            repeatCount = 2
            addUpdateListener { card.setStrokeColor(ColorStateList.valueOf(it.animatedValue as Int)) }
        }
        val pulse = ObjectAnimator.ofPropertyValuesHolder(
            card,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.035f, 1f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.035f, 1f)
        ).apply {
            duration = 850
            repeatCount = 2
            interpolator = AccelerateDecelerateInterpolator()
        }
        AnimatorSet().apply {
            playTogether(glow, pulse)
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    card.strokeWidth = originalWidth
                    card.setStrokeColor(originalStroke)
                    card.scaleX = 1f
                    card.scaleY = 1f
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
