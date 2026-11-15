package ph.basaya.app.ui.game

import ph.basaya.app.data.assessment.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job

import ph.basaya.app.data.progress.ProgressSession

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.ActivityOptions
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import ph.basaya.app.R
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.entity.CrosswordProgress
import ph.basaya.app.data.model.CrosswordGameLevel
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.SkillProgressRepository
import ph.basaya.app.data.repository.CrosswordRepository
import ph.basaya.app.utils.Network
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import ph.basaya.app.data.progress.LessonResume
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

class CrosswordActivity : AppCompatActivity() {
    private var assessment: AssessmentSession? = null
    private var gameAttemptId = ""
    private var saveJob: Job? = null
    private lateinit var wordSaves: GameWordOutbox
    private lateinit var syncStatus: TextView
    private var saveRejected = false


    companion object {
        const val EXTRA_PREPARED_GAME = "PREPARED_GAME"
    }

    private var allGameLevels: List<CrosswordGameLevel> = emptyList()
    private lateinit var lessonId: String
    private lateinit var progressOwner: String
    private lateinit var progressKey: String

    private fun ownsProgress(): Boolean =
        FirebaseAuth.getInstance().currentUser?.uid == progressOwner &&
            ProgressSession.gameKey(lessonId, progressOwner) == progressKey

    private val db by lazy {
        AppDatabase.getDatabase(this@CrosswordActivity)
    }

    /** Found words, stored in their original (Firestore) spelling. */
    private var findWord = mutableListOf<String>()

    private var isSelecting = false
    private var isShuffling = false
    private var levelCompleted = false

    private val letterViews = mutableListOf<TextView>()
    private val selectedLetters = mutableListOf<TextView>()
    private val letterSlots = mutableListOf<Pair<Float, Float>>()

    private lateinit var lineView: LineView
    private lateinit var tempTv: TextView
    private lateinit var wordContainer: FrameLayout
    private lateinit var boardVerticalScroll: ScrollView
    private lateinit var boardHorizontalScroll: HorizontalScrollView
    private lateinit var letterContainer: ConstraintLayout
    private lateinit var btnShuffle: ImageButton
    private lateinit var tvLevel: TextView
    private lateinit var tvProgress: TextView
    private lateinit var progressChip: LinearLayout
    private lateinit var confettiView: ConfettiView

    val wordLetterBoxes = mutableListOf<List<TextView>>()
    private val cellViews = mutableMapOf<CrosswordCellPosition, TextView>()
    private var cellSizePx = 0

    private var currentLevel: CrosswordGameLevel? = null
    private var currentLevelWords: List<String>? = null

    private val ambientAnimators = mutableListOf<Animator>()
    private val density by lazy { resources.displayMetrics.density }
    private val letterTypeface by lazy { ResourcesCompat.getFont(this, R.font.be_vietnam_bold) }

    private fun dp(value: Float): Int = (value * density).toInt()

    private fun normalize(word: String): String = word.trim().uppercase(Locale.ROOT)

    private fun matchWordIndex(word: String): Int =
        currentLevelWords.orEmpty().indexOfFirst { normalize(it) == normalize(word) }

    private fun isWordFound(word: String): Boolean =
        findWord.any { normalize(it) == normalize(word) }

    // Board

    private fun renderCrosswordGrid(words: List<String>, foundWords: List<String>) {
        val grid = CrosswordGridBuilder.build(words)
        wordContainer.removeAllViews()
        wordLetterBoxes.clear()
        cellViews.clear()

        val gap = dp(4f)
        val boardPadding = dp(8f)
        val availableWidth = boardHorizontalScroll.width - boardPadding * 2
        val availableHeight = boardVerticalScroll.height -
            boardVerticalScroll.paddingTop - boardVerticalScroll.paddingBottom - boardPadding * 2

        // Fit the whole grid on screen when possible; scroll only for very large grids.
        val fitByWidth = (availableWidth - (grid.columns - 1) * gap) / grid.columns.coerceAtLeast(1)
        val fitByHeight = (availableHeight - (grid.rows - 1) * gap) / grid.rows.coerceAtLeast(1)
        cellSizePx = minOf(dp(46f), fitByWidth, fitByHeight).coerceAtLeast(dp(26f))
        val cellStep = cellSizePx + gap

        val gridWidth = boardPadding * 2 + (grid.columns - 1) * cellStep + cellSizePx
        val gridHeight = boardPadding * 2 + (grid.rows - 1) * cellStep + cellSizePx
        val boardWidth = maxOf(gridWidth, boardHorizontalScroll.width)
        val boardHeight = maxOf(gridHeight, availableHeight + boardPadding * 2)

        wordContainer.layoutParams = FrameLayout.LayoutParams(boardWidth, boardHeight)

        val leftOffset = (boardWidth - gridWidth) / 2 + boardPadding
        val topOffset = (boardHeight - gridHeight) / 2 + boardPadding
        val emptyTile = CandyTile.create(CandyTile.empty(this), cellSizePx)

        grid.placements.forEach { placement ->
            val word = words[placement.wordIndex]
            val boxes = word.indices.map { letterIndex ->
                val position = placement.positionAt(letterIndex)
                cellViews.getOrPut(position) {
                    TextView(this).apply {
                        gravity = Gravity.CENTER
                        includeFontPadding = false
                        typeface = letterTypeface
                        setTextSize(TypedValue.COMPLEX_UNIT_PX, cellSizePx * 0.5f)
                        setTextColor(Color.WHITE)
                        setPadding(0, 0, 0, (cellSizePx * 0.09f).toInt())
                        background = emptyTile.constantState?.newDrawable()?.mutate() ?: emptyTile
                        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                        layoutParams = FrameLayout.LayoutParams(cellSizePx, cellSizePx).apply {
                            gravity = Gravity.TOP or Gravity.START
                            leftMargin = leftOffset + position.column * cellStep
                            topMargin = topOffset + position.row * cellStep
                        }
                        // Entrance: tiles pop in as a diagonal wave
                        alpha = 0f
                        scaleX = 0.5f
                        scaleY = 0.5f
                        animate()
                            .alpha(1f).scaleX(1f).scaleY(1f)
                            .setStartDelay((position.row + position.column) * 28L)
                            .setDuration(320)
                            .setInterpolator(OvershootInterpolator(1.6f))
                            .start()
                    }.also { cell -> wordContainer.addView(cell) }
                }
            }
            wordLetterBoxes.add(boxes)
        }

        foundWords.forEach { foundWord ->
            val wordIndex = words.indexOfFirst { normalize(it) == normalize(foundWord) }
            if (wordIndex >= 0) {
                wordLetterBoxes[wordIndex].forEachIndexed { index, box ->
                    setCellFound(box, words[wordIndex][index], CandyTile.forWord(wordIndex))
                }
            }
        }
    }

    private fun setCellFound(box: TextView, letter: Char, colors: CandyTile.Colors) {
        box.text = letter.uppercaseChar().toString()
        // A crossing cell keeps the color of the word that filled it first
        if (box.tag == null) {
            box.background = CandyTile.create(colors, cellSizePx)
            box.tag = colors
        }
    }

    // Wheel

    /** Every letter needed to spell every word (max count per letter across words). */
    private fun wheelLetters(words: List<String>): List<String> {
        val counts = mutableMapOf<Char, Int>()
        words.forEach { word ->
            normalize(word).groupingBy { it }.eachCount().forEach { (letter, count) ->
                counts[letter] = maxOf(counts[letter] ?: 0, count)
            }
        }
        return counts.flatMap { (letter, count) -> List(count) { letter.toString() } }.shuffled()
    }

    private fun buildWheel(letters: List<String>) {
        lineView = LineView(this)
        letterContainer.addView(
            lineView, 0,
            ConstraintLayout.LayoutParams(
                ConstraintLayout.LayoutParams.MATCH_PARENT,
                ConstraintLayout.LayoutParams.MATCH_PARENT
            )
        )

        val centerX = letterContainer.width / 2f
        val centerY = letterContainer.height / 2f
        val letterSizePx = dp(
            when {
                letters.size <= 5 -> 60f
                letters.size <= 7 -> 52f
                else -> 46f
            }
        )
        val inset = dp(16f)
        val radius = (minOf(letterContainer.width, letterContainer.height) / 2f) - (letterSizePx / 2f) - inset
        val angleStep = 360.0 / letters.size

        letterSlots.clear()
        for (i in letters.indices) {
            val angleRad = Math.toRadians(i * angleStep - 90)
            val x = centerX + (radius * cos(angleRad)).toFloat()
            val y = centerY + (radius * sin(angleRad)).toFloat()
            letterSlots += x to y

            val letterView = TextView(this).apply {
                text = letters[i]
                typeface = letterTypeface
                includeFontPadding = false
                setTextSize(TypedValue.COMPLEX_UNIT_PX, letterSizePx * 0.52f)
                setTextColor(ContextCompat.getColor(this@CrosswordActivity, R.color.cw_ink))
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, dp(4f))
                layoutParams = ViewGroup.LayoutParams(letterSizePx, letterSizePx)
                this.x = x - letterSizePx / 2f
                this.y = y - letterSizePx / 2f
                scaleX = 0f
                scaleY = 0f
            }

            letterContainer.addView(letterView)
            letterViews.add(letterView)

            letterView.animate()
                .scaleX(1f).scaleY(1f)
                .setStartDelay(250L + i * 60L)
                .setDuration(360)
                .setInterpolator(OvershootInterpolator(2.2f))
                .start()
        }
    }

    private fun selectLetter(letter: TextView) {
        letter.isSelected = true
        letter.background = ContextCompat.getDrawable(this, R.drawable.cw_letter_selected)
        letter.setTextColor(Color.WHITE)
        letter.animate().scaleX(1.12f).scaleY(1.12f).setStartDelay(0).setDuration(120)
            .setInterpolator(DecelerateInterpolator()).start()
        letter.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    private fun deselectLetter(letter: TextView) {
        letter.isSelected = false
        letter.background = null
        letter.setTextColor(ContextCompat.getColor(this, R.color.cw_ink))
        letter.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(160)
            .setInterpolator(DecelerateInterpolator()).start()
    }

    private fun shuffleLetters() {
        if (isShuffling || isSelecting || letterViews.size < 2) return
        isShuffling = true

        btnShuffle.animate().rotationBy(360f).setDuration(520)
            .setInterpolator(AccelerateDecelerateInterpolator()).start()

        val centerX = letterContainer.width / 2f
        val centerY = letterContainer.height / 2f
        var order = letterSlots.indices.shuffled()
        if (order == letterSlots.indices.toList()) order = order.reversed()

        letterViews.forEachIndexed { index, letter ->
            val half = letter.width / 2f
            letter.animate()
                .x(centerX - half).y(centerY - half)
                .scaleX(0.55f).scaleY(0.55f)
                .setStartDelay(0)
                .setDuration(200)
                .setInterpolator(AccelerateInterpolator())
                .withEndAction {
                    val (slotX, slotY) = letterSlots[order[index]]
                    letter.animate()
                        .x(slotX - half).y(slotY - half)
                        .scaleX(1f).scaleY(1f)
                        .setStartDelay(40)
                        .setDuration(380)
                        .setInterpolator(OvershootInterpolator(1.8f))
                        .withEndAction {
                            if (index == letterViews.lastIndex) isShuffling = false
                        }
                        .start()
                }
                .start()
        }
    }

    // Preview pill

    private fun showPreview(text: String) {
        tempTv.animate().cancel()
        tempTv.text = text
        if (tempTv.visibility != View.VISIBLE || tempTv.alpha < 1f) {
            resetPreviewStyle()
            tempTv.visibility = View.VISIBLE
            tempTv.translationX = 0f
            tempTv.translationY = 0f
            tempTv.alpha = 0f
            tempTv.scaleX = 0.85f
            tempTv.scaleY = 0.85f
            tempTv.animate().alpha(1f).scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(140)
                .setInterpolator(DecelerateInterpolator()).start()
        } else {
            // Gentle bump each time a letter is added
            tempTv.scaleX = 1.08f
            tempTv.scaleY = 1.08f
            tempTv.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(160)
                .setInterpolator(DecelerateInterpolator()).start()
        }
    }

    private fun hidePreview(delayMs: Long = 0L) {
        tempTv.animate()
            .alpha(0f)
            .setStartDelay(delayMs)
            .setDuration(160)
            .withEndAction {
                tempTv.visibility = View.INVISIBLE
                tempTv.text = ""
                tempTv.translationX = 0f
                tempTv.translationY = 0f
                tempTv.scaleX = 1f
                tempTv.scaleY = 1f
                resetPreviewStyle()
            }
            .start()
    }

    private fun resetPreviewStyle() {
        tempTv.background = ContextCompat.getDrawable(this, R.drawable.cw_preview_pill)
        tempTv.setTextColor(ContextCompat.getColor(this, R.color.cw_ink))
    }

    private fun previewSuccess() {
        tempTv.background = ContextCompat.getDrawable(this, R.drawable.cw_preview_pill_success)
        tempTv.setTextColor(ContextCompat.getColor(this, R.color.cw_success))
        tempTv.animate().cancel()
        tempTv.animate()
            .scaleX(1.18f).scaleY(1.18f)
            .translationY(-dp(14f).toFloat())
            .setStartDelay(0)
            .setDuration(260)
            .setInterpolator(OvershootInterpolator(2f))
            .withEndAction { hidePreview(delayMs = 220) }
            .start()
    }

    private fun previewError() {
        tempTv.background = ContextCompat.getDrawable(this, R.drawable.cw_preview_pill_error)
        tempTv.setTextColor(ContextCompat.getColor(this, R.color.cw_error))
        tempTv.animate().cancel()
        val d = density
        ObjectAnimator.ofFloat(
            tempTv, "translationX",
            0f, -14f * d, 14f * d, -10f * d, 10f * d, -5f * d, 5f * d, 0f
        ).apply {
            duration = 420
            interpolator = DecelerateInterpolator()
            start()
        }
        hidePreview(delayMs = 420)
    }

    private fun previewAlreadyFound(wordIndex: Int) {
        tempTv.animate().cancel()
        hidePreview(delayMs = 200)
        wordLetterBoxes.getOrNull(wordIndex)?.forEachIndexed { i, box ->
            box.animate().scaleX(1.15f).scaleY(1.15f)
                .setStartDelay(i * 40L).setDuration(140)
                .setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    box.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(200)
                        .setInterpolator(OvershootInterpolator(2f)).start()
                }
                .start()
        }
    }

    // Progress

    private fun updateProgress(animate: Boolean) {
        val words = currentLevelWords.orEmpty()
        val found = words.count { isWordFound(it) }
        tvProgress.text = getString(R.string.cw_progress, found, words.size)
        progressChip.contentDescription = getString(R.string.cw_progress_cd, found, words.size)
        if (animate) {
            progressChip.animate().cancel()
            progressChip.scaleX = 1.2f
            progressChip.scaleY = 1.2f
            progressChip.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(380)
                .setInterpolator(OvershootInterpolator(3f)).start()
        }
    }

    private fun burstFrom(view: View, count: Int) {
        val viewLoc = IntArray(2)
        val confettiLoc = IntArray(2)
        view.getLocationInWindow(viewLoc)
        confettiView.getLocationInWindow(confettiLoc)
        confettiView.burst(
            viewLoc[0] - confettiLoc[0] + view.width / 2f,
            viewLoc[1] - confettiLoc[1] + view.height / 2f,
            count
        )
    }

    private fun revealWord(wordIndex: Int) {
        val word = currentLevelWords?.getOrNull(wordIndex) ?: return
        val colors = CandyTile.forWord(wordIndex)
        wordLetterBoxes[wordIndex].forEachIndexed { i, box ->
            box.animate()
                .scaleX(0.6f).scaleY(0.6f)
                .setStartDelay(i * 80L)
                .setDuration(110)
                .setInterpolator(AccelerateInterpolator())
                .withEndAction {
                    setCellFound(box, word[i], colors)
                    box.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(300)
                        .setInterpolator(OvershootInterpolator(3f)).start()
                }
                .start()
        }
    }

    private fun celebrateLevel() {
        confettiView.rain()
        val lift = -dp(12f).toFloat()
        cellViews.forEach { (position, cell) ->
            cell.animate()
                .translationY(lift)
                .setStartDelay(600L + position.column * 45L + position.row * 20L)
                .setDuration(220)
                .setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    cell.animate().translationY(0f).setStartDelay(0).setDuration(380)
                        .setInterpolator(OvershootInterpolator(2.5f)).start()
                }
                .start()
        }
    }

    // Ambient sky

    private fun startAmbientAnimations() {
        val sun = findViewById<ImageView>(R.id.cwSun)
        val cloudTop = findViewById<ImageView>(R.id.cwCloudTop)
        val cloudMid = findViewById<ImageView>(R.id.cwCloudMid)

        ambientAnimators += ObjectAnimator.ofFloat(sun, View.ROTATION, 0f, 360f).apply {
            duration = 40_000
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
        }
        ambientAnimators += ObjectAnimator.ofFloat(cloudTop, View.TRANSLATION_X, 0f, 46f * density).apply {
            duration = 7_000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
        }
        ambientAnimators += ObjectAnimator.ofFloat(cloudMid, View.TRANSLATION_X, 0f, -38f * density).apply {
            duration = 9_000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
        }
        ambientAnimators.forEach { it.start() }
    }

    override fun onDestroy() {
        ambientAnimators.forEach { it.cancel() }
        ambientAnimators.clear()
        super.onDestroy()
    }

    // Lifecycle

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lessonId = intent.getStringExtra("LESSON_ID") ?: ""
        val ready = PreparedCrossword.take(intent.getStringExtra(EXTRA_PREPARED_GAME), lessonId)
        if (ready == null) {
            // Direct entry and process restoration prepare on the dashboard first.
            startActivity(Intent(this, ph.basaya.app.ui.DashboardActivity::class.java).apply {
                putExtra("LESSON_ID", lessonId)
                putExtra(ph.basaya.app.ui.DashboardActivity.EXTRA_PREPARE_GAME, true)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
            finish()
            return
        }
        progressOwner = ready.owner
        progressKey = ready.progressKey
        assessment = ready.assessment
        gameAttemptId = ready.attemptId
        wordSaves = GameWordSaves.open(this, progressKey, ::ownsProgress)
        allGameLevels = ready.levels
        currentLevel = ready.level
        currentLevelWords = ready.level.words.map { it.trim() }
        findWord = ready.foundWords.toMutableList()
        setContentView(R.layout.activity_crossword)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }

        letterContainer = findViewById(R.id.letterContainer)
        wordContainer = findViewById(R.id.wordContainer)
        boardVerticalScroll = findViewById(R.id.boardVerticalScroll)
        boardHorizontalScroll = findViewById(R.id.boardHorizontalScroll)
        btnShuffle = findViewById(R.id.btnShuffle)
        tvLevel = findViewById(R.id.tvLevel)
        tvProgress = findViewById(R.id.tvProgress)
        progressChip = findViewById(R.id.progressChip)
        confettiView = findViewById(R.id.confettiView)
        syncStatus = findViewById(R.id.cwSyncStatus)
        syncStatus.setOnClickListener {
            if (saveRejected) finish() else syncWords()
        }
        tempTv = findViewById(R.id.tempTv)
        tempTv.visibility = View.INVISIBLE

        findViewById<ImageButton>(R.id.btnBack).setOnClickListener { finish() }
        btnShuffle.setOnClickListener { shuffleLetters() }
        startAmbientAnimations()

        tvLevel.text = getString(R.string.cw_level, ready.level.level)
        updateProgress(animate = false)
        boardVerticalScroll.post {
            renderCrosswordGrid(currentLevelWords.orEmpty(), findWord)
        }
        val letters = wheelLetters(currentLevelWords.orEmpty())
        letterContainer.post { buildWheel(letters) }

        // touch controls
        letterContainer.setOnTouchListener { _, event ->

            if (!::lineView.isInitialized || isShuffling || levelCompleted || saveRejected) return@setOnTouchListener false

            val touchX = event.x
            val touchY = event.y

            when (event.actionMasked) {

                MotionEvent.ACTION_DOWN -> {
                    val touchLetter = findTouchLetter(touchX, touchY)
                    if (touchLetter != null) {
                        isSelecting = true
                        selectedLetters.clear()
                        selectedLetters.add(touchLetter)
                        lineView.selectedPoints.clear()

                        val centerX = touchLetter.x + touchLetter.width / 2f
                        val centerY = touchLetter.y + touchLetter.height / 2f

                        lineView.selectedPoints.add(centerX to centerY)
                        lineView.fingerX = touchX
                        lineView.fingerY = touchY
                        lineView.invalidate()

                        selectLetter(touchLetter)
                        showPreview(touchLetter.text.toString())
                    }
                }

                MotionEvent.ACTION_MOVE -> {
                    if (!isSelecting) return@setOnTouchListener true

                    lineView.fingerX = touchX
                    lineView.fingerY = touchY
                    lineView.invalidate()

                    val touchedLetter = findTouchLetter(touchX, touchY)
                    if (touchedLetter != null && !selectedLetters.contains(touchedLetter)) {
                        selectedLetters.add(touchedLetter)

                        val centerX = touchedLetter.x + touchedLetter.width / 2f
                        val centerY = touchedLetter.y + touchedLetter.height / 2f
                        lineView.selectedPoints.add(centerX to centerY)

                        selectLetter(touchedLetter)
                        showPreview(selectedLetters.joinToString("") { it.text.toString() })
                    }
                }

                MotionEvent.ACTION_UP -> finishSelection(submit = true)

                MotionEvent.ACTION_CANCEL -> finishSelection(submit = false)
            }
            true
        }
    }

    private fun finishSelection(submit: Boolean) {
        if (!isSelecting) return

        val word = selectedLetters.joinToString("") { it.text.toString() }

        selectedLetters.forEach { deselectLetter(it) }
        selectedLetters.clear()
        lineView.selectedPoints.clear()
        lineView.invalidate()
        isSelecting = false

        val wordIndex = matchWordIndex(word)

        when {
            !submit -> hidePreview()

            wordIndex == -1 -> {
                // A single tapped letter is just a cancel, not a wrong answer
                if (word.length < 2) {
                    hidePreview()
                } else {
                    previewError()
                }
            }

            isWordFound(currentLevelWords!![wordIndex]) -> previewAlreadyFound(wordIndex)

            else -> onWordFound(wordIndex)
        }
    }

    private fun onWordFound(wordIndex: Int) {
        if (!ownsProgress() || levelCompleted || saveRejected) return
        val word = currentLevelWords?.getOrNull(wordIndex) ?: return
        if (isWordFound(word)) return
        val words = findWord + word
        val completed = currentLevelWords.orEmpty().all { target -> words.any { normalize(it) == normalize(target) } }
        // Persist before revealing; swipes never wait for the network.
        try {
            wordSaves.enqueue(fields("operation" to if (completed) "finish" else "answer",
                "level" to currentLevel!!.level, "attemptId" to gameAttemptId,
                "word" to word, "words" to words))
        } catch (e: Exception) {
            showSyncStatus(getString(R.string.cw_save_local_error))
            return
        }
        findWord = words.toMutableList()
        previewSuccess()
        revealWord(wordIndex)
        updateProgress(animate = true)
        if (completed) {
            levelCompleted = true
            celebrateLevel()
            showSyncStatus(getString(R.string.cw_sync_finishing))
        }
        syncWords()
    }

    private fun showSyncStatus(message: String) {
        syncStatus.text = message
        syncStatus.visibility = View.VISIBLE
    }

    private fun syncWords() {
        if (saveJob?.isActive == true || saveRejected || !ownsProgress()) return
        saveJob = lifecycleScope.launch {
            var retry = 0
            while (ownsProgress()) {
                try {
                    val accepted = wordSaves.drain { command ->
                        GameWordSaves.send(this@CrosswordActivity, progressKey, allGameLevels,
                            assessment, command, ::ownsProgress)
                    }
                    if (!ownsProgress()) { finish(); return@launch }
                    syncStatus.visibility = View.GONE
                    if (levelCompleted && accepted != null) {
                        // The board celebrates immediately; recorded completion waits for acceptance.
                        delay(2000)
                        if (!ownsProgress()) { finish(); return@launch }
                        startActivity(Intent(this@CrosswordActivity, CrosswordCompleteScreen::class.java).apply {
                            putExtra("NEXT_LEVEL", allGameLevels.indexOf(currentLevel) + 1)
                            putExtra("LESSON_ID", lessonId)
                        })
                        finish()
                    }
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (!ownsProgress()) { finish(); return@launch }
                    if (e is AssessmentFailure && !e.retryable) {
                        saveRejected = true
                        showSyncStatus(getString(R.string.cw_sync_rejected))
                        return@launch
                    }
                    showSyncStatus(getString(R.string.cw_sync_pending))
                    delay((1000L shl retry.coerceAtMost(4)).coerceAtMost(10000L))
                    retry++
                }
            }
        }
    }

    private fun findTouchLetter(
        touchX: Float,
        touchY: Float
    ): TextView? {

        for (letter in letterViews) {

            val centerX = letter.x + letter.width / 2f
            val centerY = letter.y + letter.height / 2f
            // Slightly generous hit area so small fingers don't miss letters
            val radius = letter.width / 2f * 1.1f

            val distance = kotlin.math.sqrt(
                (touchX - centerX) * (touchX - centerX) +
                        (touchY - centerY) * (touchY - centerY)
            )

            if (distance <= radius) {
                return letter
            }
        }

        return null
    }

}
