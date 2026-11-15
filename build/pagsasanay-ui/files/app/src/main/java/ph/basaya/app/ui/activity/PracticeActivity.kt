package ph.basaya.app.ui.activity

import ph.basaya.app.data.assessment.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay

import android.animation.ObjectAnimator
import android.content.Intent
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import ph.basaya.app.ui.feedback.StudioDialogBuilder
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import ph.basaya.app.ui.feedback.StudioToast as Toast
import androidx.activity.enableEdgeToEdge
import androidx.annotation.ColorRes
import androidx.annotation.DrawableRes
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import ph.basaya.app.R
import ph.basaya.app.data.model.ActivityPage
import ph.basaya.app.data.model.PracticeActivityData
import ph.basaya.app.data.progress.Skill
import ph.basaya.app.data.progress.SkillProgressRepository
import ph.basaya.app.ui.game.ConfettiView
import ph.basaya.app.ui.pronunciation.PronunciationBookView
import ph.basaya.app.ui.theme.useDarkStatusBarIconsInLightTheme
import com.google.android.flexbox.FlexboxLayout
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch

class PracticeActivity : AppCompatActivity() {
    private var assessment: AssessmentSession? = null
    private lateinit var preparedState: PreparedPractice
    private lateinit var attempts: ActivityAttemptQueue
    private lateinit var syncStatus: TextView
    private var saveJob: Job? = null
    private var saveRejected = false
    private var finishQueued = false


    private lateinit var lessonId: String
    private lateinit var practiceData: PracticeActivityData

    private var currentPageIndex = 0
    private var hasChecked = false
    private val selectedIndices = mutableSetOf<Int>()
    /** Pages answered correctly within their lives. */
    private var score = 0
    private var retries = 0
    /** Lives left on the current page; at 0 the page counts as wrong and the answer is shown. */
    private var lives = MAX_LIVES

    private lateinit var tvPageTag: TextView
    private lateinit var tvActivityTitle: TextView
    private lateinit var chipsContainer: FlexboxLayout
    private lateinit var feedbackContainer: LinearLayout
    private lateinit var feedbackBuddy: PronunciationBookView
    private lateinit var tvFeedback: TextView
    private lateinit var btnAction: TextView
    private lateinit var llProgressBars: LinearLayout
    private lateinit var tvPickCount: TextView
    private lateinit var confettiView: ConfettiView
    private lateinit var llLives: LinearLayout

    private val trackSegments = mutableListOf<View>()
    private val hearts = mutableListOf<ImageView>()

    private enum class TileState(
        @param:ColorRes val fill: Int,
        @param:ColorRes val lip: Int,
        @param:ColorRes val text: Int,
        @param:DrawableRes val icon: Int?
    ) {
        IDLE(R.color.ac_tile, R.color.ac_tile_lip, R.color.ac_ink, null),
        PICKED(R.color.ac_pick, R.color.ac_pick_lip, R.color.ac_on_pick, null),
        RIGHT(R.color.ac_right, R.color.ac_right_lip, android.R.color.white, R.drawable.ac_ic_check),
        WRONG(R.color.ac_wrong, R.color.ac_wrong_lip, android.R.color.white, R.drawable.ac_ic_cross),
        /** A correct word the child missed, shown once the lives run out. */
        ANSWER(R.color.ac_right, R.color.ac_right_lip, android.R.color.white, null)
    }

    private val density by lazy { resources.displayMetrics.density }
    private fun dp(value: Float): Int = (value * density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_practice)

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        useDarkStatusBarIconsInLightTheme()

        lessonId = intent.getStringExtra("LESSON_ID") ?: ""

        if (lessonId.isBlank()) {
            Toast.makeText(this, getString(R.string.ac_missing_lesson), Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val ready = PreparedPractice.take(intent.getStringExtra(EXTRA_PREPARED_ACTIVITY), lessonId)
        if (ready == null) {
            // Direct entry or process recreation must prepare on the dashboard as well.
            startActivity(Intent(this, ph.basaya.app.ui.DashboardActivity::class.java).apply {
                putExtra("LESSON_ID", lessonId)
                putExtra(ph.basaya.app.ui.DashboardActivity.EXTRA_PREPARE_ACTIVITY, true)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
            finish()
            return
        }

        tvPageTag = findViewById(R.id.tvPageTag)
        tvActivityTitle = findViewById(R.id.tvActivityTitle)
        chipsContainer = findViewById(R.id.chipsContainer)
        feedbackContainer = findViewById(R.id.feedbackContainer)
        feedbackBuddy = findViewById(R.id.feedbackBuddy)
        tvFeedback = findViewById(R.id.tvFeedback)
        btnAction = findViewById(R.id.btnAction)
        llProgressBars = findViewById(R.id.llProgressBars)
        tvPickCount = findViewById(R.id.tvPickCount)
        confettiView = findViewById(R.id.confettiView)
        llLives = findViewById(R.id.llLives)

        findViewById<ImageButton>(R.id.btnClose).setOnClickListener { finish() }
        announceAsButton(btnAction)

        preparedState = ready
        attempts = ActivityAttemptSaves.open(this, ready.queueKey, ready::isCurrent)
        syncStatus = findViewById(R.id.acSyncStatus)
        syncStatus.setOnClickListener { if (saveRejected) finish() else syncAttempts() }
        assessment = ready.assessment
        practiceData = ready.content
        currentPageIndex = ready.pageIndex
        score = ready.score
        retries = ready.retries
        lives = ready.lives
        tvActivityTitle.text = practiceData.title
        findViewById<View>(R.id.btnInstruction).apply {
            visibility = if (practiceData.instruction.isBlank()) View.GONE else View.VISIBLE
            setOnClickListener {
                StudioDialogBuilder(this@PracticeActivity)
                    .setTitle(R.string.ac_instruction_title)
                    .setMessage(practiceData.instruction)
                    .setPositiveButton(R.string.ac_close, null)
                    .show()
            }
        }
        if (ready.completion != null) {
            showCompletion(ready.completion)
            return
        }

        setupProgressTrack()
        setupLives()
        showPage(currentPageIndex, animateIn = false)

        btnAction.setOnClickListener {
            pressBounce(btnAction)
            if (saveRejected || finishQueued || !preparedState.isCurrent()) return@setOnClickListener
            if (!hasChecked) {
                val right = isPageCorrect(practiceData.pages[currentPageIndex])
                val nextLives = if (right) lives else lives - 1
                val over = right || nextLives == 0
                if (assessment != null && assessment?.practice != true) {
                    try {
                        attempts.enqueue(fields("operation" to "answer", "index" to currentPageIndex,
                            "selected" to selectedIndices.sorted(), "attemptId" to preparedState.attemptId,
                            "contentVersion" to preparedState.contentVersion), fields(
                            "right" to right, "done" to if (over) currentPageIndex + 1 else currentPageIndex,
                            "score" to score + if (right) 1 else 0,
                            "retries" to retries + if (right) 0 else 1,
                            "lives" to if (over) MAX_LIVES else nextLives))
                    } catch (e: Exception) {
                        showSyncStatus(getString(R.string.ac_save_local_error))
                        return@setOnClickListener
                    }
                }
                checkAnswer()
                syncAttempts()
            } else {
                goToNext()
            }
        }
    }

    // Progress

    private fun setupProgressTrack() {
        llProgressBars.removeAllViews()
        trackSegments.clear()

        val gapPx = dp(8f)
        for (i in practiceData.pages.indices) {
            val segment = View(this).apply {
                setBackgroundResource(R.drawable.ac_track)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply {
                    if (i != 0) marginStart = gapPx
                }
            }
            llProgressBars.addView(segment)
            trackSegments.add(segment)
        }
    }

    private fun updateProgressTrack() {
        trackSegments.forEachIndexed { i, segment ->
            val isDone = i < currentPageIndex || (i == currentPageIndex && isPageOver())
            val wasDone = segment.tag == true
            if (isDone != wasDone) {
                segment.tag = isDone
                segment.setBackgroundResource(if (isDone) R.drawable.ac_track_done else R.drawable.ac_track)
                if (isDone) {
                    segment.scaleY = 1.6f
                    segment.animate().scaleY(1f).setDuration(380)
                        .setInterpolator(OvershootInterpolator(3f)).start()
                }
            }
        }
        tvPageTag.text = getString(R.string.ac_page, currentPageIndex + 1, practiceData.pages.size)
        updateLives()
    }

    // Lives

    private fun setupLives() {
        llLives.removeAllViews()
        hearts.clear()
        repeat(MAX_LIVES) { i ->
            val heart = ImageView(this).apply {
                setImageResource(R.drawable.ic_heart_filled)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                layoutParams = LinearLayout.LayoutParams(dp(26f), dp(26f)).apply {
                    if (i != 0) marginStart = dp(3f)
                }
            }
            llLives.addView(heart)
            hearts.add(heart)
        }
    }

    private fun updateLives() {
        hearts.forEachIndexed { i, heart ->
            val lost = i >= lives
            heart.setColorFilter(ContextCompat.getColor(this, if (lost) R.color.ac_star_off else R.color.ac_wrong))
            heart.animate().scaleX(if (lost) 0.8f else 1f).scaleY(if (lost) 0.8f else 1f).setDuration(240).start()
        }
        llLives.contentDescription = getString(R.string.ac_lives_cd, lives, MAX_LIVES)
    }

    // Page & tiles

    private fun showPage(index: Int, animateIn: Boolean = true) {
        val page = practiceData.pages[index]

        // Tell the child how many words to pick (pages can have more than one answer)
        val pickCount = page.pickCount ?: page.correctIndices.distinct().size
        tvPickCount.visibility = if (pickCount > 0) View.VISIBLE else View.GONE
        tvPickCount.text = getString(R.string.ac_pick_count, pickCount)

        selectedIndices.clear()
        hasChecked = false
        hideFeedback()
        setButton(R.string.ac_check, R.drawable.ac_btn_check)
        btnAction.isEnabled = false

        // A new page starts at its first choice, including after feedback auto-scroll.
        findViewById<android.widget.ScrollView>(R.id.worksheetScroll).scrollTo(0, 0)
        chipsContainer.animate().cancel()
        chipsContainer.translationX = 0f
        chipsContainer.alpha = 1f
        chipsContainer.removeAllViews()

        page.words.forEachIndexed { wordIndex, word ->
            val tile = TextView(this).apply {
                text = word
                typeface = ResourcesCompat.getFont(this@PracticeActivity, R.font.be_vietnam_bold)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
                gravity = Gravity.CENTER
                minHeight = dp(52f)
                minWidth = dp(48f)
                compoundDrawablePadding = dp(6f)
                setPadding(dp(16f), dp(8f), dp(16f), dp(12f))
                isClickable = true
                isFocusable = true
                announceAsButton(this)

                layoutParams = FlexboxLayout.LayoutParams(
                    FlexboxLayout.LayoutParams.WRAP_CONTENT,
                    FlexboxLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(dp(5f), dp(6f), dp(5f), dp(6f))
                }

                setOnClickListener {
                    if (hasChecked || saveRejected || finishQueued || !preparedState.isCurrent()) return@setOnClickListener

                    if (selectedIndices.contains(wordIndex)) {
                        selectedIndices.remove(wordIndex)
                        applyTileState(this, word, TileState.IDLE)
                        animate().rotation(0f).setDuration(200).start()
                    } else {
                        selectedIndices.add(wordIndex)
                        applyTileState(this, word, TileState.PICKED)
                        animate().rotation(if (wordIndex % 2 == 0) -2.5f else 2.5f).setDuration(200).start()
                    }
                    performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    pop(this, 1.12f)

                    btnAction.isEnabled = selectedIndices.isNotEmpty()
                }
            }
            applyTileState(tile, word, TileState.IDLE)
            chipsContainer.addView(tile)

            // Tiles pop onto the worksheet one after another
            tile.alpha = 0f
            tile.scaleX = 0.6f
            tile.scaleY = 0.6f
            tile.animate()
                .alpha(1f).scaleX(1f).scaleY(1f)
                .setStartDelay((if (animateIn) 160L else 80L) + wordIndex * 45L)
                .setDuration(320)
                .setInterpolator(OvershootInterpolator(2f))
                .start()
        }

        if (animateIn) {
            chipsContainer.translationX = chipsContainer.width * 0.3f
            chipsContainer.alpha = 0f
            chipsContainer.animate().translationX(0f).alpha(1f).setDuration(320)
                .setInterpolator(DecelerateInterpolator()).start()
        }

        updateProgressTrack()
    }

    private fun applyTileState(tile: TextView, word: String, state: TileState) {
        tile.background = candyTile(
            ContextCompat.getColor(this, state.fill),
            ContextCompat.getColor(this, state.lip)
        )
        tile.setTextColor(ContextCompat.getColor(this, state.text))
        tile.setCompoundDrawablesRelativeWithIntrinsicBounds(state.icon ?: 0, 0, 0, 0)
        tile.contentDescription = when (state) {
            TileState.IDLE -> word
            TileState.PICKED -> getString(R.string.ac_word_selected, word)
            TileState.RIGHT, TileState.ANSWER -> getString(R.string.ac_word_correct, word)
            TileState.WRONG -> getString(R.string.ac_word_wrong, word)
        }
    }

    /** A rounded word tile with a darker lip underneath, like a real game piece. */
    private fun candyTile(fill: Int, lip: Int): Drawable {
        val radius = dp(16f).toFloat()
        val lipHeight = dp(4f)
        val base = GradientDrawable().apply {
            cornerRadius = radius
            setColor(lip)
        }
        val face = GradientDrawable().apply {
            cornerRadius = radius
            setColor(fill)
        }
        return LayerDrawable(arrayOf(base, face)).apply {
            setLayerInset(0, 0, lipHeight, 0, 0)
            setLayerInset(1, 0, 0, 0, lipHeight)
        }
    }

    // Checking

    /**
     * A page is right when the child picked exactly the correct words. A page saved in
     * basaya-web without any correct answers can't be answered, so it never blocks the child.
     */
    private fun isPageCorrect(page: ActivityPage): Boolean {
        val correctSet = page.correctIndices.toSet()
        return correctSet.isEmpty() || selectedIndices == correctSet
    }

    private fun isCurrentAnswerCorrect(): Boolean = isPageCorrect(practiceData.pages[currentPageIndex])

    /** The page is over once it's right or its lives ran out. */
    private fun isPageOver(): Boolean = hasChecked && (isCurrentAnswerCorrect() || lives == 0)

    private fun checkAnswer() {
        val page = practiceData.pages[currentPageIndex]
        val correctSet = page.correctIndices.toSet()
        val isCorrect = isPageCorrect(page)
        // Every pick is right, but some correct words are still missing
        val isIncomplete = !isCorrect && selectedIndices.isNotEmpty() && correctSet.containsAll(selectedIndices)
        val explanation = page.explanation ?: practiceData.explanation
        // Any check that isn't fully right costs a life
        if (!isCorrect) {
            lives--
            retries++
        }
        val outOfLives = lives == 0

        for (i in 0 until chipsContainer.childCount) {
            val tile = chipsContainer.getChildAt(i) as TextView
            val wasSelected = selectedIndices.contains(i)
            val shouldBeSelected = correctSet.contains(i)

            tile.isEnabled = false

            when {
                wasSelected && shouldBeSelected -> {
                    applyTileState(tile, page.words[i], TileState.RIGHT)
                    tile.animate().rotation(0f).setDuration(200).start()
                    tile.postDelayed({ pop(tile, 1.18f) }, i * 60L)
                }
                wasSelected && !shouldBeSelected -> {
                    applyTileState(tile, page.words[i], TileState.WRONG)
                    tile.animate().rotation(0f).setDuration(200).start()
                    tile.postDelayed({ shake(tile) }, i * 60L)
                }
                outOfLives && shouldBeSelected -> {
                    applyTileState(tile, page.words[i], TileState.ANSWER)
                    tile.postDelayed({ pop(tile, 1.12f) }, i * 60L)
                }
                else -> {
                    // Unpicked tiles fade back so the result stands out
                    tile.animate().alpha(0.55f).setDuration(250).start()
                }
            }
        }

        hasChecked = true
        btnAction.isEnabled = true
        updateProgressTrack()

        // A page right within its lives earns the point; wrong checks are counted as retries so they still show up in the student's progress.
        if (isCorrect) score++
        savePlace(if (isPageOver()) currentPageIndex + 1 else currentPageIndex)
        val lastPage = currentPageIndex == practiceData.pages.lastIndex

        if (outOfLives) {
            shake(llLives)
            showFeedback(good = false, text = "${getString(R.string.ac_out_of_lives)} $explanation".trim())
            setButton(if (lastPage) R.string.ac_finish else R.string.ac_next, R.drawable.ac_btn_next)
        } else if (isCorrect) {
            val text = if (correctSet.isEmpty()) {
                getString(R.string.ac_no_answer_set)
            } else {
                "${getString(R.string.ac_good)} $explanation".trim()
            }
            showFeedback(good = true, text = text)
            setButton(if (lastPage) R.string.ac_finish else R.string.ac_next, R.drawable.ac_btn_next)
            celebrate()
        } else if (isIncomplete) {
            showFeedback(good = false, text = getString(R.string.ac_incomplete, correctSet.size))
            setButton(R.string.ac_retry, R.drawable.ac_btn_retry)
        } else {
            showFeedback(good = false, text = "${getString(R.string.ac_try_again)} $explanation".trim())
            setButton(R.string.ac_retry, R.drawable.ac_btn_retry)
        }
    }

    /** Saves the place: `done` pages finished, and the lives left on page `done`. */
    private fun savePlace(done: Int) { /* Server receipts own assessed progress. */ }

    private fun goToNext() {
        if (!isPageOver()) {
            showPage(currentPageIndex) // try the same page again
            return
        }

        if (currentPageIndex < practiceData.pages.lastIndex) {
            currentPageIndex++
            lives = MAX_LIVES
            showPage(currentPageIndex)
        } else {
            finishActivity()
        }
    }

    private fun finishActivity() {
        if (finishQueued || saveRejected || !preparedState.isCurrent()) return
        if (assessment == null || assessment?.practice == true) {
            showCompletion(null)
            return
        }
        try {
            attempts.enqueue(fields("operation" to "finish", "attemptId" to preparedState.attemptId,
                "contentVersion" to preparedState.contentVersion))
        } catch (e: Exception) {
            showSyncStatus(getString(R.string.ac_save_local_error))
            return
        }
        finishQueued = true
        btnAction.isEnabled = false
        showSyncStatus(getString(R.string.ac_sync_finishing))
        syncAttempts()
    }

    private fun showSyncStatus(message: String) {
        syncStatus.text = message
        syncStatus.visibility = View.VISIBLE
    }

    private fun syncAttempts() {
        val session = assessment?.takeUnless { it.practice } ?: return
        if (saveJob?.isActive == true || saveRejected || !preparedState.isCurrent()) return
        saveJob = lifecycleScope.launch {
            var retry = 0
            while (preparedState.isCurrent()) {
                try {
                    val result = attempts.drain { command ->
                        session.request(command.text("operation"), "activity", command)
                    }
                    if (!preparedState.isCurrent()) { finish(); return@launch }
                    syncStatus.visibility = View.GONE
                    if (finishQueued && result?.flag("finished") == true) showCompletion(result)
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (!preparedState.isCurrent()) { finish(); return@launch }
                    if (e is AssessmentFailure && !e.retryable) {
                        saveRejected = true
                        btnAction.isEnabled = false
                        for (i in 0 until chipsContainer.childCount) chipsContainer.getChildAt(i).isEnabled = false
                        showSyncStatus(getString(R.string.ac_sync_rejected))
                        return@launch
                    }
                    showSyncStatus(getString(R.string.ac_sync_pending))
                    delay((1000L shl retry.coerceAtMost(4)).coerceAtMost(10000L))
                    retry++
                }
            }
        }
    }

    private fun showCompletion(accepted: com.google.gson.JsonObject?) {
        val intent = Intent(this, PracticeCompleteScreen::class.java).apply {
            putExtra("SCORE", accepted?.number("score", score) ?: score)
            putExtra("TOTAL", accepted?.number("total", practiceData.pages.size) ?: practiceData.pages.size)
            putExtra("ACTIVITY_TITLE", practiceData.title)
            putExtra("LESSON_ID", lessonId)
        }
        startActivity(intent)
        finish()
    }

    // Feedback

    private fun showFeedback(good: Boolean, text: String) {
        feedbackContainer.setBackgroundResource(if (good) R.drawable.ac_feedback_good else R.drawable.ac_feedback_retry)
        tvFeedback.setTextColor(ContextCompat.getColor(this, if (good) R.color.ac_good_text else R.color.ac_retry_text))
        tvFeedback.text = text

        feedbackContainer.animate().cancel()
        feedbackContainer.visibility = View.VISIBLE
        feedbackContainer.alpha = 0f
        feedbackContainer.translationY = dp(24f).toFloat()
        feedbackContainer.animate()
            .alpha(1f).translationY(0f)
            .setDuration(340)
            .setInterpolator(OvershootInterpolator(1.4f))
            .start()

        // Make sure the bubble is visible on short screens
        val scroll = findViewById<android.widget.ScrollView>(R.id.worksheetScroll)
        scroll.post { scroll.smoothScrollTo(0, feedbackContainer.bottom) }

        feedbackBuddy.setMood(if (good) PronunciationBookView.Mood.HAPPY else PronunciationBookView.Mood.CHEER)
    }

    private fun hideFeedback() {
        feedbackContainer.animate().cancel()
        feedbackContainer.visibility = View.GONE
        feedbackBuddy.setMood(PronunciationBookView.Mood.IDLE)
    }

    private fun setButton(textRes: Int, backgroundRes: Int) {
        btnAction.setText(textRes)
        btnAction.setBackgroundResource(backgroundRes)
    }

    private fun celebrate() {
        btnAction.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        val cardLoc = IntArray(2)
        val confettiLoc = IntArray(2)
        chipsContainer.getLocationInWindow(cardLoc)
        confettiView.getLocationInWindow(confettiLoc)
        confettiView.burst(
            cardLoc[0] - confettiLoc[0] + chipsContainer.width / 2f,
            cardLoc[1] - confettiLoc[1] + chipsContainer.height / 2f,
            34
        )
    }

    // Motion helpers

    private fun pop(view: View, peak: Float) {
        view.animate().cancel()
        view.scaleX = peak
        view.scaleY = peak
        view.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(320)
            .setInterpolator(OvershootInterpolator(3f)).start()
    }

    private fun shake(view: View) {
        ObjectAnimator.ofFloat(
            view, View.TRANSLATION_X,
            0f, -dp(8f).toFloat(), dp(8f).toFloat(), -dp(5f).toFloat(), dp(5f).toFloat(), 0f
        ).apply {
            duration = 380
            start()
        }
    }

    private fun pressBounce(view: View) {
        view.animate().scaleX(0.96f).scaleY(0.96f).setDuration(70)
            .withEndAction {
                view.animate().scaleX(1f).scaleY(1f).setDuration(220)
                    .setInterpolator(OvershootInterpolator(3f)).start()
            }
            .start()
    }

    /** Lets TalkBack announce custom tiles and the action bar as buttons. */
    private fun announceAsButton(view: View) {
        view.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = Button::class.java.name
            }
        }
    }

    companion object {
        const val EXTRA_PREPARED_ACTIVITY = "PREPARED_ACTIVITY"
        private const val MAX_LIVES = 3
    }
}
