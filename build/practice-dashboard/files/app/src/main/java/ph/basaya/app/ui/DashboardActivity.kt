package ph.basaya.app.ui

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.util.Log
import android.view.View
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.widget.LinearLayout
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.cardview.widget.CardView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.core.view.updateLayoutParams
import androidx.lifecycle.lifecycleScope
import android.widget.TextView
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import ph.basaya.app.R
import ph.basaya.app.data.cache.CompletionStateCache
import ph.basaya.app.data.dictionary.Dictionary
import ph.basaya.app.data.progress.LessonResume
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.audio.LectureAudioCache
import ph.basaya.app.data.repository.ActivityStatus
import ph.basaya.app.data.repository.GameStatus
import ph.basaya.app.data.repository.ActivityRepository
import ph.basaya.app.data.repository.CrosswordRepository
import ph.basaya.app.data.repository.LectureRepository
import ph.basaya.app.data.repository.LessonContentPrefetch
import ph.basaya.app.data.repository.PronunciationRepository
import ph.basaya.app.data.repository.QuizRepository
import ph.basaya.app.ui.activity.PreparedPractice
import ph.basaya.app.ui.activity.PracticeAlreadyFinished
import ph.basaya.app.ui.activity.PracticeActivity
import ph.basaya.app.ui.pronunciation.PronunciationActivity
import ph.basaya.app.ui.pronunciation.ReadingActivity
import ph.basaya.app.ui.pronunciation.ReadingSession
import ph.basaya.app.ui.pronunciation.PreparedReading
import ph.basaya.app.ui.game.CrosswordActivity
import ph.basaya.app.ui.game.PreparedCrossword
import ph.basaya.app.ui.game.GameAlreadyFinished
import ph.basaya.app.ui.quiz.QuizActivity
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import ph.basaya.app.data.cache.ContentCountsCache
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.schedule.LessonSchedule
import android.app.Activity
import ph.basaya.app.ui.feedback.StudioDialog as Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.ViewGroup
import android.widget.ImageView
import org.json.JSONArray
import com.google.android.material.button.MaterialButton

class DashboardActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PREPARE_GAME = "PREPARE_GAME"
        const val EXTRA_PREPARE_ACTIVITY = "PREPARE_ACTIVITY"
        private const val CONTENT_PREPARATION_TIMEOUT_MS = 60_000L

        /** How long the lecture card waits for the audio before asking the child. */
        private const val LECTURE_AUDIO_WAIT_MS = 10_000L
    }

    private lateinit var gameCard: CardView
    private lateinit var lectureCard: CardView
    private lateinit var quizCard: CardView
    private lateinit var activityCard: CardView
    private lateinit var pronunciationCard: CardView
    private lateinit var quizLockOverlay: LinearLayout
    private lateinit var contentLoadingOverlay: View
    private var isPreparingContent = false
    private var preparedPracticeToken: String? = null
    private var preparedGameToken: String? = null
    private var preparedReadingToken: String? = null

    private var gameIsFinished = false
    private var activityIsFinished = false
    private var quizIsFinished = false
    private var lectureFinished = false
    private var pronunciationIsFinished = false
    private var readingBased = false

    private var hasGameScore = false
    private var hasActivityScore = false
    private var hasQuizScore = false
    private var hasPronunciationScore = false
    private var hasLectureProgress = false
    private var lectureTotalPages = 0

    private lateinit var lectureRepository: LectureRepository
    private lateinit var lessonId: String

    private lateinit var tvLectureCount: TextView
    private lateinit var tvGameCount: TextView
    private lateinit var tvActivityCount: TextView
    private lateinit var tvQuizCount: TextView
    private lateinit var tvPronunciationCount: TextView

    private lateinit var tvLessonTitle: TextView
    private lateinit var tvLessonDescription: TextView

    private lateinit var lectureCompletedBadge: LinearLayout
    private lateinit var gameCompletedBadge: LinearLayout
    private lateinit var activityCompletedBadge: LinearLayout
    private lateinit var quizCompletedBadge: LinearLayout
    private lateinit var pronunciationCompletedBadge: LinearLayout

    private lateinit var countsCache: ContentCountsCache
    private lateinit var completionCache: CompletionStateCache

    private val firestore by lazy { FirebaseFirestore.getInstance() }

    private val db by lazy { AppDatabase.getDatabase(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_dashboard)

        val header = findViewById<View>(R.id.dashboardHeader)
        val content = findViewById<View>(R.id.dashboardContent)
        val backButton = findViewById<View>(R.id.btnBack)
        val loadingOverlay = findViewById<View>(R.id.contentLoadingOverlay)
        val headerTop = header.paddingTop
        val contentBottom = content.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.updatePadding(left = bars.left, right = bars.right)
            header.updatePadding(top = headerTop + bars.top)
            content.updatePadding(bottom = contentBottom + bars.bottom)
            // Keep the existing Back action reachable while lesson content prepares.
            loadingOverlay.updateLayoutParams<ViewGroup.MarginLayoutParams> {
                topMargin = headerTop + bars.top + backButton.layoutParams.height
            }
            insets
        }

        val isLightTheme = resources.configuration.uiMode and
            Configuration.UI_MODE_NIGHT_MASK != Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = isLightTheme
            isAppearanceLightNavigationBars = isLightTheme
        }

        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }

        lessonId = intent.getStringExtra("LESSON_ID") ?: ""

        gameCard = findViewById(R.id.gameCard)
        lectureCard = findViewById(R.id.lectureCard)
        quizCard = findViewById(R.id.quizCard)
        activityCard = findViewById(R.id.activityCard)
        pronunciationCard = findViewById(R.id.pronunciationCard)
        quizLockOverlay = findViewById(R.id.quizLockOverlay)
        contentLoadingOverlay = findViewById(R.id.contentLoadingOverlay)

        lectureCompletedBadge = findViewById(R.id.lectureCompletedBadge)
        gameCompletedBadge = findViewById(R.id.gameCompletedBadge)
        activityCompletedBadge = findViewById(R.id.activityCompletedBadge)
        quizCompletedBadge = findViewById(R.id.quizCompletedBadge)
        pronunciationCompletedBadge = findViewById(R.id.pronunciationCompletedBadge)

        tvLectureCount = findViewById(R.id.tvLectureCount)
        tvGameCount = findViewById(R.id.tvGameCount)
        tvActivityCount = findViewById(R.id.tvActivityCount)
        tvQuizCount = findViewById(R.id.tvQuizCount)
        tvPronunciationCount = findViewById(R.id.tvPronunciationCount)

        lectureRepository = LectureRepository(this)

        countsCache = ContentCountsCache(this)
        completionCache = CompletionStateCache(this)

        loadContentCounts()

        tvLessonTitle = findViewById(R.id.tvLessonTitle)
        tvLessonDescription = findViewById(R.id.tvLessonDesc)

        hideSkippedParts()

        // Pagsasanay or Pagtataya. A Practice lesson saves nothing, so every part stays open.
        lifecycleScope.launch {
            val practice = PracticeLessons.refresh(this@DashboardActivity, lessonId)
            findViewById<TextView>(R.id.tvLessonEyebrow).setText(
                if (practice) R.string.lesson_dash_eyebrow_practice else R.string.lesson_dash_eyebrow_assessment
            )
            if (practice) {
                findViewById<TextView>(R.id.tvPathSub).setText(R.string.practice_path_sub)
                showPracticeState()
            }
        }

        lifecycleScope.launch {
            val savedLesson = try {
                db.lessonDao().getLesson(lessonId)
            } catch (e: Exception) {
                Log.w("DashboardActivity", "Failed to read saved lesson details", e)
                null
            }
            if (savedLesson != null) {
                tvLessonTitle.text = savedLesson.title.ifBlank { "BASAya" }
                tvLessonDescription.text = savedLesson.description
            } else {
                tvLessonTitle.text = "BASAya"
                tvLessonDescription.text = ""
            }

            try {
                val lessonDoc = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .get()
                    .await()

                tvLessonTitle.text = lessonDoc.getString("title") ?: "BASAya"
                tvLessonDescription.text = lessonDoc.getString("description") ?: ""

            } catch (e: Exception) {
                Log.w("DashboardActivity", "Failed to refresh lesson details", e)
            }
        }

        gameCard.setOnClickListener {
            if (gameIsFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang larong ito. Hindi na ito maaaring ulitin."
                )
            } else {
                openContentIfAvailable(CrosswordActivity::class.java)
            }
        }

        lectureCard.setOnClickListener {
            if (lectureFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Natapos mo na ang leksyon na ito. Maaari mo pa rin itong basahin muli anumang oras.",
                    primaryText = "Basahin muli",
                    onPrimary = {
                        openContentIfAvailable(LectureActivity::class.java, reviewing = true)
                    },
                    secondaryText = "Isara"
                )
            } else {
                openContentIfAvailable(LectureActivity::class.java)
            }
        }

        activityCard.setOnClickListener {
            if (activityIsFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang gawaing ito. Hindi na ito maaaring ulitin."
                )
            } else {
                openContentIfAvailable(PracticeActivity::class.java)
            }
        }

        quizCard.setOnClickListener {
            if (quizIsFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Natapos mo na ang pagsusulit. Hindi na ito maaaring ulitin."
                )
            } else {
                openContentIfAvailable(QuizActivity::class.java)
            }
        }

        quizLockOverlay.setOnClickListener {
            showLessonDialog(
                iconRes = R.drawable.ic_lock_small,
                title = "Naka-lock",
                message = getString(R.string.lesson_dash_locked_msg)
            )
        }

        pronunciationCard.setOnClickListener {
            if (pronunciationIsFinished && (readingBased || ReadingSession.hasDraft(this, lessonId))) {
                openContentIfAvailable(ReadingActivity::class.java, reviewing = true)
            } else if (pronunciationIsFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang bigkas na ito. Hindi na ito maaaring ulitin."
                )
            } else {
                openContentIfAvailable(PronunciationActivity::class.java)
            }
        }
        if (intent.getBooleanExtra(EXTRA_PREPARE_ACTIVITY, false)) {
            intent.removeExtra(EXTRA_PREPARE_ACTIVITY)
            openContentIfAvailable(PracticeActivity::class.java)
        }
        if (intent.getBooleanExtra(EXTRA_PREPARE_GAME, false)) {
            intent.removeExtra(EXTRA_PREPARE_GAME)
            openContentIfAvailable(CrosswordActivity::class.java)
        }
    }

    override fun onResume() {
        super.onResume()

        checkQuizUnlockState()
        loadCompletionState()
    }

    private fun checkQuizUnlockState() {
        if (lessonId.isBlank()) return

        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return

        completionCache.get(lessonId)?.let { cached ->
            lectureFinished = cached.lectureFinished
            quizIsFinished = cached.quizFinished
            setQuizLocked(!cached.lectureFinished && !cached.quizFinished)
        }

        lifecycleScope.launch {
            val isFinished = lectureRepository.checkCompletion(uid, lessonId)
            if (isFinished != null) {
                lectureFinished = isFinished
                // A finished quiz stays unlocked even if the lecture flag lags behind.
                setQuizLocked(!isFinished && !quizIsFinished)
            }
        }
    }

    private fun setQuizLocked(locked: Boolean) {
        quizCard.isClickable = !locked
        quizCard.importantForAccessibility = if (locked) {
            View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        } else {
            View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        }
        quizLockOverlay.visibility = if (locked) View.VISIBLE else View.GONE
        updateDashboardProgress()
    }

    /** Summarize the same completion flags used by the existing badges and actions. */
    private fun updateDashboardProgress() {
        val label = findViewById<TextView>(R.id.tvDashboardProgress)
        val progress = findViewById<android.widget.ProgressBar>(R.id.dashboardProgress)
        if (PracticeLessons.isPractice(lessonId)) {
            label.setText(R.string.dash_progress_practice)
            progress.visibility = View.GONE
            return
        }
        val parts = listOf(
            lectureCard to lectureFinished, gameCard to gameIsFinished,
            activityCard to activityIsFinished, pronunciationCard to pronunciationIsFinished,
            quizCard to quizIsFinished
        ).filter { (card, _) -> (card.parent as View).visibility != View.GONE }
        val done = parts.count { it.second }
        label.text = getString(R.string.dash_progress_count, done, parts.size)
        progress.visibility = View.VISIBLE
        val target = if (parts.isEmpty()) 0 else done * 100 / parts.size
        val motionEnabled = if (android.os.Build.VERSION.SDK_INT >= 26) {
            android.animation.ValueAnimator.areAnimatorsEnabled()
        } else {
            android.provider.Settings.Global.getFloat(
                contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f
            ) != 0f
        }
        // Animate a changed milestone only; cached state appears immediately on entry.
        progress.setProgress(target, motionEnabled && progress.isLaidOut && target > progress.progress)
    }

    /** Practice: nothing is ever finished or locked, so each part can be done again. */
    private fun showPracticeState() {
        lectureFinished = false
        gameIsFinished = false
        activityIsFinished = false
        quizIsFinished = false
        pronunciationIsFinished = false
        listOf(
            lectureCompletedBadge, gameCompletedBadge, activityCompletedBadge,
            quizCompletedBadge, pronunciationCompletedBadge
        ).forEach { it.visibility = View.GONE }
        setQuizLocked(false)
    }

    private fun loadCompletionState() {
        if (lessonId.isBlank()) return
        if (PracticeLessons.isPractice(lessonId)) return showPracticeState()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return

        completionCache.get(lessonId)?.let { cached ->
            lectureFinished = cached.lectureFinished
            lectureCompletedBadge.visibility =
                if (cached.lectureFinished) View.VISIBLE else View.GONE

            gameIsFinished = cached.gameFinished
            if (cached.gameTotal > 0) {
                tvGameCount.text = "${cached.gameScore}/${cached.gameTotal} levels"
                hasGameScore = true
            }
            gameCompletedBadge.visibility = if (cached.gameFinished) View.VISIBLE else View.GONE

            activityIsFinished = cached.activityFinished
            if (cached.activityScore != null && cached.activityTotal != null) {
                tvActivityCount.text = "Pahina • ${cached.activityScore}/${cached.activityTotal}"
                hasActivityScore = true
            }
            activityCompletedBadge.visibility = if (cached.activityFinished) View.VISIBLE else View.GONE

            quizIsFinished = cached.quizFinished
            if (cached.quizScore != null && cached.quizTotal != null) {
                tvQuizCount.text = "Puntos • ${cached.quizScore}/${cached.quizTotal}"
                hasQuizScore = true
            }
            quizCompletedBadge.visibility = if (cached.quizFinished) View.VISIBLE else View.GONE
            if (cached.quizFinished) setQuizLocked(false)

            pronunciationIsFinished = cached.pronunciationFinished
            if (cached.pronunciationScore != null && cached.pronunciationTotal != null) {
                tvPronunciationCount.text = "Salita • ${cached.pronunciationScore}/${cached.pronunciationTotal}"
                hasPronunciationScore = true
            }
            pronunciationCompletedBadge.visibility = if (cached.pronunciationFinished) View.VISIBLE else View.GONE
            updateDashboardProgress()
        }

        lifecycleScope.launch {
            try {
                val doc = firestore
                    .collection("users")
                    .document(uid)
                    .collection("assignedLessons")
                    .document(lessonId)
                    .get()
                    .await()

                // Lecture check only not close
                lectureFinished = doc.getBoolean("lectureFinished") ?: false
                lectureCompletedBadge.visibility =
                    if (lectureFinished) View.VISIBLE else View.GONE

                val gameFinished = doc.getBoolean("gameFinished") ?: false
                gameIsFinished = gameFinished

                val gameScore = doc.getLong("gameScore") ?: 0
                val gameTotal = doc.getLong("gameTotal") ?: 0

                if (gameTotal > 0) {
                    tvGameCount.text = "$gameScore/$gameTotal levels"
                    hasGameScore = true
                }

                if (gameFinished) {
                    gameCompletedBadge.visibility = View.VISIBLE
                } else {
                    gameCompletedBadge.visibility = View.GONE
                }

                // Activity score shows as soon as it exists; lock only depends on finished
                val activityFinished = doc.getBoolean("activityFinished") ?: false
                activityIsFinished = activityFinished

                val activityScore = doc.getLong("activityScore")
                val activityTotal = doc.getLong("activityTotal")

                if (activityScore != null && activityTotal != null) {
                    tvActivityCount.text = "Pahina • $activityScore/$activityTotal"
                    hasActivityScore = true
                }

                if (activityFinished) {
                    activityCompletedBadge.visibility = View.VISIBLE
                } else {
                    activityCompletedBadge.visibility = View.GONE
                }

                // Quiz score shows as soon as it exists; lock only depends on finished
                val quizFinished = doc.getBoolean("quizFinished") ?: false
                quizIsFinished = quizFinished

                val quizScore = doc.getLong("quizScore")
                val quizTotal = doc.getLong("quizTotal")

                if (quizScore != null && quizTotal != null) {
                    tvQuizCount.text = "Puntos • $quizScore/$quizTotal"
                    hasQuizScore = true
                }

                if (quizFinished) {
                    quizCompletedBadge.visibility = View.VISIBLE
                    setQuizLocked(false)
                } else {
                    quizCompletedBadge.visibility = View.GONE
                }

                // score shows as soon as it exists; lock only depends on finished
                val pronunciationFinished = doc.getBoolean("pronunciationFinished") ?: false
                pronunciationIsFinished = pronunciationFinished
                readingBased = doc.get("fluency") != null

                val pronunciationScore = doc.getLong("pronunciationScore")
                val pronunciationTotal = doc.getLong("pronunciationTotal")

                if (pronunciationScore != null && pronunciationTotal != null) {
                    tvPronunciationCount.text = "Salita • $pronunciationScore/$pronunciationTotal"
                    hasPronunciationScore = true
                }

                if (readingBased) {
                    val reviewStatus = doc.getString("pronunciationReviewStatus")
                    val reading = doc.get("fluency") as? Map<*, *>
                    tvPronunciationCount.text = when (reviewStatus) {
                        "pending" -> "Naipasa • hinihintay ang guro"
                        "graded" -> "Puntos • $pronunciationScore/$pronunciationTotal"
                        else -> "Pahina "+(((reading?.get("page") as? Number)?.toInt() ?: 0)+1)+"/"+((reading?.get("total") as? Number)?.toInt() ?: 0)
                    }
                    hasPronunciationScore = true
                }
                if (pronunciationFinished) {
                    pronunciationCompletedBadge.visibility = View.VISIBLE
                } else {
                    pronunciationCompletedBadge.visibility = View.GONE
                }

                showStartedParts(doc)
                updateDashboardProgress()

                completionCache.save(
                    lessonId,
                    CompletionStateCache.State(
                        lectureFinished = lectureFinished,
                        gameFinished = gameIsFinished,
                        gameScore = gameScore,
                        gameTotal = gameTotal,
                        activityFinished = activityIsFinished,
                        activityScore = activityScore,
                        activityTotal = activityTotal,
                        quizFinished = quizIsFinished,
                        quizScore = quizScore,
                        quizTotal = quizTotal,
                        pronunciationFinished = pronunciationIsFinished,
                        pronunciationScore = pronunciationScore,
                        pronunciationTotal = pronunciationTotal
                    )
                )

            } catch (e: Exception) {
                Log.e("DashboardActivity", "Failed to load completion state", e)
            }
        }
    }

    /**
     * A part left halfway (see LessonResume) shows how far the child got, e.g. "2/5 pages",
     * until it has a score. The has* flags keep loadContentCounts() from writing "0/5" over it.
     */
    private fun showStartedParts(doc: DocumentSnapshot) {
        fun started(part: String): Pair<Int, Int>? {
            val total = LessonResume.total(doc, part) ?: return null
            return LessonResume.done(doc, part).coerceAtMost(total) to total
        }
        if (lectureFinished) {
            // Just finished: back to the plain page count.
            if (hasLectureProgress) tvLectureCount.text = "$lectureTotalPages pages"
            hasLectureProgress = false
        } else {
            started(LessonResume.LECTURE)?.let { (done, total) ->
                tvLectureCount.text = "$done/$total pages"
                hasLectureProgress = true
                lectureTotalPages = total
            }
        }
        if (!hasActivityScore) {
            started(LessonResume.ACTIVITY)?.let { (done, total) ->
                tvActivityCount.text = "$done/$total pages"
                hasActivityScore = true
            }
        }
        if (!hasPronunciationScore) {
            started(LessonResume.PRONUNCIATION)?.let { (done, total) ->
                tvPronunciationCount.text = "$done/$total salita"
                hasPronunciationScore = true
            }
        }
        if (!hasQuizScore) {
            started(LessonResume.QUIZ)?.let { (done, total) ->
                tvQuizCount.text = "$done/$total questions"
                hasQuizScore = true
            }
        }
    }

    private fun loadContentCounts() {
        if (lessonId.isBlank()) return

        countsCache.get(lessonId)?.let { cached ->
            if (!hasLectureProgress) tvLectureCount.text = "${cached.lecturePages} pages"
            if (!hasGameScore) tvGameCount.text = "0/${cached.gameLevels} levels"
            if (!hasActivityScore) tvActivityCount.text = "0/${cached.activityPages} pages"
            if (!hasQuizScore) tvQuizCount.text = "0/${cached.quizQuestions} questions"
            if (!hasPronunciationScore) tvPronunciationCount.text = "0/${cached.pronunciationWordCount} salita"
        }

        lifecycleScope.launch {
            try {
                val isDownloaded = db.lessonDao().isLessonDownloaded(lessonId) == true
                if (isDownloaded) {
                    val localCounts = try {
                        val lecture = db.lectureDao().getLecture(lessonId)
                        val activity = db.activityDao().getActivity(lessonId)
                        val quiz = db.quizDao().getQuiz(lessonId)
                        val pronunciation = db.pronunciationDao().getActivity(lessonId)
                        ContentCountsCache.Counts(
                            lecturePages = lecture?.pagesJson?.let(::JSONArray)?.length() ?: 0,
                            gameLevels = db.crosswordLevelDao().getLevelsForLesson(lessonId).size,
                            activityPages = activity?.pagesJson?.let(::JSONArray)?.length() ?: 0,
                            quizQuestions = quiz?.questionsJson?.let(::JSONArray)?.length() ?: 0,
                            pronunciationWordCount = pronunciation?.wordsJson?.let(::JSONArray)?.length() ?: 0
                        )
                    } catch (e: Exception) {
                        Log.e("DashboardActivity", "Failed to read downloaded lesson counts", e)
                        null
                    }

                    localCounts?.let { cached ->
                        if (!hasLectureProgress) tvLectureCount.text = "${cached.lecturePages} pages"
                        if (!hasGameScore) tvGameCount.text = "0/${cached.gameLevels} levels"
                        if (!hasActivityScore) tvActivityCount.text = "0/${cached.activityPages} pages"
                        if (!hasQuizScore) tvQuizCount.text = "0/${cached.quizQuestions} questions"
                        if (!hasPronunciationScore) {
                            tvPronunciationCount.text = "0/${cached.pronunciationWordCount} salita"
                        }
                        countsCache.save(lessonId, cached)
                    }
                }

                val lectureSnapshot = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .collection("lectures")
                    .limit(1)
                    .get()
                    .await()

                val lectureDoc = lectureSnapshot.documents.first()

                val gameSnapshot = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .collection("game")
                    .get()
                    .await()

                val activitySnapshot = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .collection("activity")
                    .limit(1)
                    .get()
                    .await()

                val activityDoc = activitySnapshot.documents.first()

                val quizSnapshot = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .collection("quiz")
                    .limit(1)
                    .get()
                    .await()

                val quizDoc = quizSnapshot.documents.first()

                val pronunciationSnapshot = firestore
                    .collection("lessons")
                    .document(PracticeLessons.contentId(lessonId))
                    .collection("pronunciation")
                    .limit(1)
                    .get()
                    .await()

                val pronunciationDoc = pronunciationSnapshot.documents.first()

                val lecturePages = (lectureDoc.get("pages") as? List<*>)?.size ?: 0
                val gameLevels = gameSnapshot.documents.size
                val activityPages = (activityDoc.get("pages") as? List<*>)?.size ?: 0
                val quizQuestions = (quizDoc.get("questions") as? List<*>)?.size ?: 0
                val pronunciationWordCount = (pronunciationDoc.get("words") as? List<*>)?.size ?: 0

                if (!hasLectureProgress) tvLectureCount.text = "$lecturePages pages"

                if (!hasGameScore) {
                    tvGameCount.text = "0/$gameLevels levels"
                }
                if (!hasActivityScore) {
                    tvActivityCount.text = "0/$activityPages pages"
                }
                if (!hasQuizScore) {
                    tvQuizCount.text = "0/$quizQuestions questions"
                }
                if (!hasPronunciationScore) {
                    tvPronunciationCount.text = "0/$pronunciationWordCount salita"
                }

                // Successful fetch — refresh the cache for next time we're offline
                countsCache.save(
                    lessonId,
                    ContentCountsCache.Counts(
                        lecturePages = lecturePages,
                        gameLevels = gameLevels,
                        activityPages = activityPages,
                        quizQuestions = quizQuestions,
                        pronunciationWordCount = pronunciationWordCount
                    )
                )

            } catch (e: Exception) {
                if (countsCache.get(lessonId) == null) {
                    tvLectureCount.text = "0 pages"
                    if (!hasGameScore) tvGameCount.text = "0/0 levels"
                    if (!hasActivityScore) tvActivityCount.text = "0/0 pages"
                    if (!hasQuizScore) tvQuizCount.text = "0/0 questions"
                    if (!hasPronunciationScore) tvPronunciationCount.text = "0/0 salita"
                }
            }
        }
    }

    private fun hasInternetConnection(): Boolean {
        val connectivityManager =
            getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val network = connectivityManager.activeNetwork ?: return false
        val capabilities =
            connectivityManager.getNetworkCapabilities(network) ?: return false

        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun openContentIfAvailable(destination: Class<out Activity>, reviewing: Boolean = false) {
        if (isPreparingContent) return

        setContentLoading(true, destination)
        lifecycleScope.launch {
            try {
                // Completed local recordings were already reviewable without a download.
                val localReadingReview = destination == ReadingActivity::class.java && reviewing &&
                    ReadingSession.hasDraft(this@DashboardActivity, lessonId)
                if (!localReadingReview && !canOpenContent(reviewing)) return@launch
                val audioWait = withTimeoutOrNull(CONTENT_PREPARATION_TIMEOUT_MS) {
                    prepareContent(destination)
                } ?: throw IllegalStateException("Timed out while preparing lesson content")

                when (audioWait) {
                    AudioWait.READY -> launchContent(destination)
                    AudioWait.SLOW, AudioWait.FAILED -> showLectureAudioDialog(audioWait, reviewing)
                }
            } catch (e: PracticeAlreadyFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang gawaing ito. Hindi na ito maaaring ulitin."
                )
            } catch (e: GameAlreadyFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang larong ito. Hindi na ito maaaring ulitin."
                )
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e("DashboardActivity", "Failed to prepare lesson content", e)
                showLessonDialog(
                    iconRes = R.drawable.ic_speaker_mute,
                    title = "Hindi maihanda ang aralin",
                    message = getString(R.string.lesson_dash_content_load_failed),
                    primaryText = "Subukan muli",
                    onPrimary = { openContentIfAvailable(destination, reviewing) }
                )
            } finally {
                setContentLoading(false, destination)
            }
        }
    }

    private fun setContentLoading(loading: Boolean, destination: Class<out Activity>) {
        isPreparingContent = loading
        if (destination == PracticeActivity::class.java) {
            findViewById<View>(R.id.activityPlayIcon).visibility = if (loading) View.INVISIBLE else View.VISIBLE
            findViewById<View>(R.id.activityPreparing).visibility = if (loading) View.VISIBLE else View.GONE
            tvActivityCount.visibility = if (loading) View.GONE else View.VISIBLE
            findViewById<View>(R.id.activityPreparingText).visibility = if (loading) View.VISIBLE else View.GONE
            activityCard.isEnabled = !loading
            return
        }
        if (destination == CrosswordActivity::class.java) {
            findViewById<View>(R.id.gamePlayIcon).visibility = if (loading) View.INVISIBLE else View.VISIBLE
            findViewById<View>(R.id.gamePreparing).visibility = if (loading) View.VISIBLE else View.GONE
            tvGameCount.visibility = if (loading) View.GONE else View.VISIBLE
            findViewById<View>(R.id.gamePreparingText).visibility = if (loading) View.VISIBLE else View.GONE
            gameCard.isEnabled = !loading
            return
        }
        if (destination == PronunciationActivity::class.java || destination == ReadingActivity::class.java) {
            findViewById<View>(R.id.pronunciationPlayIcon).visibility = if (loading) View.INVISIBLE else View.VISIBLE
            findViewById<View>(R.id.pronunciationPreparing).visibility = if (loading) View.VISIBLE else View.GONE
            tvPronunciationCount.visibility = if (loading) View.GONE else View.VISIBLE
            findViewById<View>(R.id.pronunciationPreparingText).visibility = if (loading) View.VISIBLE else View.GONE
            pronunciationCard.isEnabled = !loading
            return
        }
        contentLoadingOverlay.visibility = if (loading) View.VISIBLE else View.GONE
        contentLoadingOverlay.importantForAccessibility = if (loading) {
            View.IMPORTANT_FOR_ACCESSIBILITY_YES
        } else {
            View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
    }

    /**
     * Loads the tapped part and its resume state before leaving the dashboard. Content is handed
     * to the destination through LessonContentPrefetch so it does not fetch again on entry.
     */
    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {
        if (destination == PracticeActivity::class.java) {
            preparedPracticeToken = null
            preparedPracticeToken = PreparedPractice.store(PreparedPractice.prepare(this, lessonId))
            return AudioWait.READY
        }
        if (destination == CrosswordActivity::class.java) {
            preparedGameToken = null
            val game = PreparedCrossword.prepare(this, lessonId)
            preparedGameToken = PreparedCrossword.store(game)
            return AudioWait.READY
        }
        if (destination == PronunciationActivity::class.java || destination == ReadingActivity::class.java) {
            preparedReadingToken = null
            if (destination == ReadingActivity::class.java || ReadingSession.hasDraft(this, lessonId)) {
                preparedReadingToken = PreparedReading.store(PreparedReading.prepare(this, lessonId))
                return AudioWait.READY
            }
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        val online = hasInternetConnection()
        val progress = uid?.let { LessonResume.loadProgress(it, lessonId, cacheOnly = !online) }
        if (uid != null) {
            LessonResume.preload(uid, lessonId, progress)
        }

        return when (destination) {
            LectureActivity::class.java -> {
                val lecture = lectureRepository.getLecture(lessonId)
                    ?.takeIf { it.pages.isNotEmpty() }
                    ?: throw IllegalStateException("No lecture content is available")
                LessonContentPrefetch.store(lessonId, lecture)
                waitForLectureAudio(lecture, progress)
            }
            QuizActivity::class.java -> {
                val quiz = QuizRepository(this).getQuiz(lessonId)
                    ?.takeIf { it.questions.isNotEmpty() }
                    ?: throw IllegalStateException("No quiz content is available")
                LessonContentPrefetch.storeQuiz(lessonId, quiz)
                AudioWait.READY
            }
            PronunciationActivity::class.java -> {
                val pronunciation = PronunciationRepository(this).getActivity(lessonId)
                    ?.takeIf { it.words.isNotEmpty() || it.pages.isNotEmpty() }
                    ?: throw IllegalStateException("No pronunciation content is available")
                if (pronunciation.pages.isNotEmpty()) {
                    preparedReadingToken = PreparedReading.store(PreparedReading.prepare(this, lessonId, pronunciation))
                    return AudioWait.READY
                }
                val lookupLimit = Semaphore(6)
                val entries = coroutineScope {
                    pronunciation.words.map { word ->
                        async {
                            lookupLimit.withPermit {
                                Dictionary.lookup(this@DashboardActivity, word)
                            }
                        }
                    }.awaitAll()
                }
                LessonContentPrefetch.storePronunciation(lessonId, pronunciation, entries)
                AudioWait.READY
            }
            else -> throw IllegalArgumentException("Unsupported lesson content screen")
        }
    }

    private fun launchContent(destination: Class<out Activity>, muted: Boolean = false) {
        val reading = preparedReadingToken.takeIf {
            destination == PronunciationActivity::class.java || destination == ReadingActivity::class.java
        }
        val screen = if (reading != null) ReadingActivity::class.java else destination
        startActivity(Intent(this, screen).apply {
            putExtra("LESSON_ID", lessonId)
            if (reading != null) putExtra(ReadingActivity.EXTRA_PREPARED_READING, reading)
            if (destination == PracticeActivity::class.java) {
                putExtra(PracticeActivity.EXTRA_PREPARED_ACTIVITY, preparedPracticeToken)
            }
            if (destination == CrosswordActivity::class.java) {
                putExtra(CrosswordActivity.EXTRA_PREPARED_GAME, preparedGameToken)
            }
            if (destination == LectureActivity::class.java) {
                putExtra(LectureActivity.EXTRA_MUTED, muted)
            }
        })
    }

    /** The schedule allows it and the content is downloaded or online; otherwise says why. */
    private suspend fun canOpenContent(reviewing: Boolean): Boolean {
        if (scheduleBlocks(reviewing)) return false

        val isDownloaded = db.lessonDao()
            .isLessonDownloaded(lessonId) ?: false

        if (isDownloaded || hasInternetConnection()) return true
        showLessonDialog(
            iconRes = R.drawable.ic_download_modern,
            title = "Hindi available offline",
            message = "Walang internet at hindi pa na-download ang aralin na ito.",
            primaryText = "OK"
        )
        return false
    }

    // Lecture: opens only once its first page's audio is ready

    private enum class AudioWait { READY, SLOW, FAILED }

    /** Downloads the audio of the page the lecture opens on (downloaded lessons already have it). Gives up waiting after 10 s; the download keeps going for "Subukan muli". */
    private suspend fun waitForLectureAudio(
        lecture: ph.basaya.app.data.model.Lecture,
        progress: DocumentSnapshot?
    ): AudioWait {
        val page = lecture.pages[LessonResume.lectureStartPage(progress, lecture.pages.size)]

        val download = LectureAudioCache.preparePage(this, lessonId, page)
        val ready = withTimeoutOrNull(LECTURE_AUDIO_WAIT_MS) { download.await() }
        return when (ready) {
            null -> AudioWait.SLOW
            true -> AudioWait.READY
            false -> AudioWait.FAILED
        }
    }

    /** The lecture card's arrow becomes a spinner, and "Inihahanda…" replaces its page count. */
    private var preparingLecture = false

    private fun setLecturePreparing(preparing: Boolean) {
        preparingLecture = preparing
        findViewById<View>(R.id.lecturePlayIcon).visibility = if (preparing) View.INVISIBLE else View.VISIBLE
        findViewById<View>(R.id.lecturePreparing).visibility = if (preparing) View.VISIBLE else View.GONE
        if (preparing) {
            lectureCountBeforePreparing = tvLectureCount.text
            tvLectureCount.text = getString(R.string.lesson_dash_preparing)
        } else {
            lectureCountBeforePreparing?.let { tvLectureCount.text = it }
            lectureCountBeforePreparing = null
        }
        lectureCard.isEnabled = !preparing
    }

    private var lectureCountBeforePreparing: CharSequence? = null

    /** The teacher's schedule: nothing opens before the open date, and after the deadline only finished parts can be reviewed. Shows why and returns true when blocked. */
    private fun showLectureAudioDialog(wait: AudioWait, reviewing: Boolean) {
        showLessonDialog(
            iconRes = R.drawable.ic_speaker_mute,
            title = if (wait == AudioWait.SLOW) "Matagal ma-load ang tunog" else "Hindi ma-load ang tunog",
            message = if (wait == AudioWait.SLOW) {
                "Mabagal ang internet kaya hindi pa handa ang tunog ng aralin."
            } else {
                "Hindi ma-download ang tunog ng aralin. Suriin ang iyong internet."
            },
            primaryText = "Subukan muli",
            onPrimary = { openContentIfAvailable(LectureActivity::class.java, reviewing) },
            secondaryText = "Buksan nang walang tunog",
            onSecondary = { launchContent(LectureActivity::class.java, muted = true) }
        )
    }

    private suspend fun scheduleBlocks(reviewing: Boolean): Boolean {
        val lesson = db.lessonDao().getLesson(lessonId) ?: return false
        val opens = LessonSchedule.format(lesson.openAt)
        val (title, message) = when (LessonSchedule.availability(this, lesson)) {
            LessonSchedule.Availability.OPEN -> return false
            LessonSchedule.Availability.CLOSED ->
                if (reviewing) return false
                else getString(R.string.schedule_closed_title) to getString(R.string.schedule_closed_part_msg)
            LessonSchedule.Availability.NOT_YET_OPEN ->
                getString(R.string.schedule_not_open_title) to
                    getString(R.string.schedule_not_open_msg, lesson.title, opens)
            LessonSchedule.Availability.NEEDS_INTERNET ->
                getString(R.string.schedule_not_open_title) to
                    getString(R.string.schedule_needs_internet_msg, lesson.title, opens)
        }
        showLessonDialog(iconRes = R.drawable.ic_lock_small, title = title, message = message)
        return true
    }

    /** When the teacher chose "Skip game" or "Skip Gawain for this lesson" in basaya-web, that stop is removed from the path and the remaining stops are renumbered. */
    private fun hideSkippedParts() {
        if (lessonId.isBlank()) return
        lifecycleScope.launch {
            val uid = FirebaseAuth.getInstance().currentUser?.uid
            val game = GameStatus.isSkipped(PracticeLessons.contentId(lessonId))
            val activity = ActivityStatus.isSkipped(PracticeLessons.contentId(lessonId))
            // Offline and never read: fall back to what the last lesson sync saved.
            val saved = if (game == null || activity == null) {
                uid?.let { id ->
                    AppDatabase.getDatabase(this@DashboardActivity).lessonDao()
                        .getLessonsForUser(id).firstOrNull { it.id == lessonId }
                }
            } else {
                null
            }
            val gameSkipped = game ?: saved?.gameSkipped ?: false
            val activitySkipped = activity ?: saved?.activitySkipped ?: false
            if (!gameSkipped && !activitySkipped) return@launch

            if (gameSkipped) (gameCard.parent as? View)?.visibility = View.GONE
            if (activitySkipped) (activityCard.parent as? View)?.visibility = View.GONE
            // Lecture stays 1; the stops after it count on from 2.
            var number = if (gameSkipped) 2 else 3
            if (!activitySkipped) findViewById<TextView>(R.id.stepActivity).text = (number++).toString()
            findViewById<TextView>(R.id.stepPronunciation).text = (number++).toString()
            findViewById<TextView>(R.id.stepQuiz).text = number.toString()
            updateDashboardProgress()
        }
    }

    private fun showLessonDialog(
        iconRes: Int,
        title: String,
        message: String,
        primaryText: String = "OK",
        onPrimary: (() -> Unit)? = null,
        secondaryText: String? = null,
        onSecondary: (() -> Unit)? = null
    ) {
        val dialog = Dialog(this)
        val dialogView = layoutInflater.inflate(R.layout.dialog_lesson_status, null)

        dialogView.findViewById<ImageView>(R.id.ivDialogIcon)
            .setImageResource(iconRes)

        dialogView.findViewById<TextView>(R.id.tvDialogTitle).text = title
        dialogView.findViewById<TextView>(R.id.tvDialogMessage).text = message

        dialogView.findViewById<MaterialButton>(R.id.btnDialogPrimary).apply {
            text = primaryText
            setOnClickListener {
                dialog.dismiss()
                onPrimary?.invoke()
            }
        }

        dialogView.findViewById<TextView>(R.id.btnDialogSecondary).apply {
            if (secondaryText != null) {
                visibility = View.VISIBLE
                text = secondaryText
                setOnClickListener {
                    dialog.dismiss()
                    onSecondary?.invoke()
                }
            }
        }

        dialog.setContentView(dialogView)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.show()

        dialog.window?.setLayout(
            (resources.displayMetrics.widthPixels * 0.88f).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

}
