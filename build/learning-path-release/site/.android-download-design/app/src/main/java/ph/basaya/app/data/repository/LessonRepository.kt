package ph.basaya.app.data.repository

import android.content.Context
import android.util.Log
import ph.basaya.app.data.audio.LectureAudioStore
import ph.basaya.app.data.audio.PronunciationAudioStore
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.entity.ClassNotificationEntity
import ph.basaya.app.data.entity.LessonEntity
import ph.basaya.app.data.notifications.LessonInbox
import ph.basaya.app.data.notifications.NotificationReadState
import ph.basaya.app.data.notifications.NotificationScheduler
import ph.basaya.app.data.progress.LessonCompletion
import ph.basaya.app.data.progress.LessonResume
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.schedule.TrustedClock
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class LessonRepository(private val context: Context) {

    private val db = AppDatabase.getDatabase(context)
    private val firestore = FirebaseFirestore.getInstance()

    suspend fun syncLessons(userId: String) {
        try {
            coroutineScope {
                // Refreshes the server time used to lock scheduled lessons (no-op offline).
                launch { TrustedClock.sync(context, userId) }
                syncLessonList(userId)
            }
        } finally {
            // Notifications and deadline reminders follow the freshly synced lessons.
            NotificationScheduler.run(context)
            LessonInbox.notifyChanged()
        }
    }

    private suspend fun syncLessonList(userId: String) {

        // 1. Find the student's class — no class, no lessons.
        val userDoc = firestore.collection("users").document(userId).get().await()
        val classId = userDoc.getString("classId")
        Log.d(TAG, "syncLessons uid=$userId classId=$classId")
        NotificationReadState.mergeRemote(
            context, userId, userDoc.getTimestamp("notifReadAt")?.toDate()?.time
        )

        if (classId.isNullOrBlank()) {
            db.lessonDao().deleteLessonsForUser(userId)
            PracticeLessons.set(emptyList())
            return
        }

        syncNotifications(classId)

        // 2. Progress flags per lesson (unchanged — still per-user)
        data class ProgressInfo(
            val lectureFinished: Boolean,
            val gameFinished: Boolean,
            val activityFinished: Boolean,
            val quizFinished: Boolean
        )

        val assignedSnapshot = firestore
            .collection("users")
            .document(userId)
            .collection("assignedLessons")
            .get()
            .await()

        val progressMap = assignedSnapshot.documents.associate { doc ->
            doc.id to ProgressInfo(
                lectureFinished = doc.getBoolean("lectureFinished") ?: false,
                gameFinished = doc.getBoolean("gameFinished") ?: false,
                activityFinished = doc.getBoolean("activityFinished") ?: false,
                quizFinished = doc.getBoolean("quizFinished") ?: false
            )
        }

        // 3a. Get the pointer list — which lessonIds belong to this class
        val classLessonsSnapshot = firestore
            .collection("classes")
            .document(classId)
            .collection("classLessons")
            .get()
            .await()

        // Link docs may be keyed by the lesson id, or carry it in a "lessonId" field
        // (auto-id links written by the teacher side). A lesson can be in the class twice:
        // as an Assessment and as Practice ("{lessonId}__practice"), so each link is its own
        // entry: LessonEntity.id is the entry id, PracticeLessons.contentId() its lesson.
        // The link's "order" is the teacher's ordering for this class.
        data class Link(
            val entryId: String,
            val lessonId: String,
            val order: Int?,
            val openAt: Long?,
            val dueAt: Long?,
            val assignedAt: Long?,
            val practice: Boolean
        )
        val links = classLessonsSnapshot.documents.map { link ->
            val lessonId = link.getString("lessonId")?.takeIf { it.isNotBlank() } ?: link.id
            // Practice: nothing the student does in it is saved.
            val practice = PracticeLessons.isPracticeLink(link)
            Link(
                entryId = if (practice) link.id else lessonId,
                lessonId = lessonId,
                order = link.getLong("order")?.toInt(),
                openAt = link.getTimestamp("openAt")?.toDate()?.time,
                dueAt = link.getTimestamp("dueAt")?.toDate()?.time,
                // When the teacher added the lesson to the class.
                assignedAt = link.getTimestamp("createdAt")?.toDate()?.time,
                practice = practice
            )
        }
        val lessonIds = links.map { it.lessonId }.distinct()
        Log.d(TAG, "classes/$classId/classLessons -> ${links.size} links, lessons: $lessonIds")

        if (lessonIds.isEmpty()) {
            db.lessonDao().deleteLessonsForUser(userId)
            PracticeLessons.set(emptyList())
            return
        }

        // 3b. Fetch the actual lesson content docs by those IDs.
        // whereIn supports up to 30 values per query — fine for a class-sized lesson list.
        // If a class ever exceeds 30 lessons, this needs to be chunked into multiple queries.
        val lessonsSnapshot = firestore
            .collection("lessons")
            .whereIn(com.google.firebase.firestore.FieldPath.documentId(), lessonIds)
            .get()
            .await()
        Log.d(TAG, "lessons whereIn -> ${lessonsSnapshot.size()} docs")
        val lessonDocs = lessonsSnapshot.documents.associateBy { it.id }

        // preserve isDownloaded flags already stored locally
        val existingLessons = db.lessonDao().getLessonsForUser(userId)
        val existingDownloadedIds = existingLessons
            .filter { it.isDownloaded }
            .map { it.id }
            .toSet()

        // Which lessons the teacher set to "Skip game" (read in parallel; offline keeps the last known value)
        val skippedGames = coroutineScope {
            lessonDocs.keys.map { id -> async { id to GameStatus.isSkipped(id, firestore) } }.awaitAll()
        }.toMap()
        val previousSkipped = existingLessons.associate { PracticeLessons.contentId(it.id) to it.gameSkipped }
        // Same for "Skip Gawain"
        val skippedActivities = coroutineScope {
            lessonDocs.keys.map { id -> async { id to ActivityStatus.isSkipped(id, firestore) } }.awaitAll()
        }.toMap()
        val previousSkippedActivities = existingLessons.associate { PracticeLessons.contentId(it.id) to it.activitySkipped }
        val gameSkipped = { lessonId: String -> skippedGames[lessonId] ?: previousSkipped[lessonId] ?: false }
        val activitySkipped = { lessonId: String ->
            skippedActivities[lessonId] ?: previousSkippedActivities[lessonId] ?: false
        }

        // When the student joined the class. A lesson whose deadline passed before then (and that they never finished) is left out: they could never have done it.
        val joinedAt = try {
            firestore.collection("classes").document(classId)
                .collection("students").document(userId).get().await()
                .getTimestamp("joinedAt")?.toDate()?.time
        } catch (e: Exception) {
            null
        }
        val progressDocs = assignedSnapshot.documents.associateBy { it.id }
        val shownLinks = links.filter { it.lessonId in lessonDocs }.filterNot { link ->
            val finished = progressDocs[link.entryId]?.let {
                LessonCompletion.isFinished(
                    it,
                    gameSkipped = gameSkipped(link.lessonId),
                    activitySkipped = activitySkipped(link.lessonId)
                )
            } == true
            joinedAt != null && link.dueAt != null && link.dueAt < joinedAt && !finished
        }

        val lessons = shownLinks.map { link ->
            val doc = lessonDocs.getValue(link.lessonId)
            val progress = progressMap[link.entryId]

            LessonEntity(
                id = link.entryId,
                userId = userId,
                classId = classId,
                title = doc.getString("title") ?: "",
                description = doc.getString("description") ?: "",
                difficulty = doc.getString("difficulty") ?: "",
                order = link.order ?: doc.getLong("order")?.toInt() ?: 0,
                unlocked = true,
                lectureFinished = progress?.lectureFinished ?: false,
                gameFinished = progress?.gameFinished ?: false,
                activityFinished = progress?.activityFinished ?: false,
                quizFinished = progress?.quizFinished ?: false,
                isDownloaded = existingDownloadedIds.contains(link.entryId),
                gameSkipped = gameSkipped(link.lessonId),
                activitySkipped = activitySkipped(link.lessonId),
                openAt = link.openAt,
                dueAt = link.dueAt,
                assignedAt = link.assignedAt,
                practice = link.practice,
                started = LessonResume.started(progressDocs[link.entryId])
            )
        }

        db.lessonDao().deleteLessonsForUser(userId)
        db.lessonDao().insertAll(lessons)
        PracticeLessons.set(links.filter { it.practice }.map { it.entryId })

        // Finishing a crossword level always saves gameScore, so a phone past level 1 with no
        // gameScore in Firestore is stale: the teacher removed the lesson (which deletes the
        // class's progress) and added it back. Start the game over, like the rest of the lesson.
        val gameScored = assignedSnapshot.documents
            .filter { it.getLong("gameScore") != null }
            .map { it.id }
            .toSet()
        val resetGames = lessons.map { it.id }.filter { it !in gameScored }
        if (resetGames.isNotEmpty()) db.crosswordProgressDao().deleteAdvancedProgress(resetGames)
    }

    /** The class's "new lesson" notifications (classes/{classId}/notifications) into Room. */
    private suspend fun syncNotifications(classId: String) {
        try {
            val snapshot = firestore
                .collection("classes")
                .document(classId)
                .collection("notifications")
                .orderBy("visibleAt", Query.Direction.DESCENDING)
                .limit(50)
                .get()
                .await()
            val items = snapshot.documents.mapNotNull { doc ->
                ClassNotificationEntity(
                    id = doc.id,
                    classId = classId,
                    title = doc.getString("title") ?: return@mapNotNull null,
                    body = doc.getString("body").orEmpty(),
                    lessonIds = (doc.get("lessonIds") as? List<*>)
                        ?.filterIsInstance<String>()?.joinToString(",").orEmpty(),
                    visibleAt = doc.getTimestamp("visibleAt")?.toDate()?.time
                        ?: return@mapNotNull null
                )
            }
            db.classNotificationDao().upsertAll(items)
        } catch (e: Exception) {
            Log.w(TAG, "Notification sync failed", e)
        }
    }

    /**
     * Re-reads only the progress flags (one query) into the stored lessons, so the list is
     * current after the student comes back from a lesson. A lesson with no progress doc (e.g.
     * the teacher reset it) goes back to not started. Offline, Firestore's cache answers.
     */
    suspend fun refreshProgress(userId: String) {
        val docs = try {
            firestore.collection("users").document(userId)
                .collection("assignedLessons").get().await()
                .documents.associateBy { it.id }
        } catch (e: Exception) {
            Log.w(TAG, "Progress refresh failed", e)
            return
        }
        db.lessonDao().getLessonsForUser(userId).forEach { lesson ->
            val doc = docs[lesson.id]
            db.lessonDao().updateProgress(
                userId, lesson.id,
                lectureFinished = doc?.getBoolean("lectureFinished") ?: false,
                gameFinished = doc?.getBoolean("gameFinished") ?: false,
                activityFinished = doc?.getBoolean("activityFinished") ?: false,
                quizFinished = doc?.getBoolean("quizFinished") ?: false,
                started = LessonResume.started(doc)
            )
        }
    }

    suspend fun getLessons(userId: String): List<LessonEntity> {
        return db.lessonDao().getLessonsForUser(userId).also { lessons ->
            PracticeLessons.set(lessons.filter { it.practice }.map { it.id })
        }
    }

    /**
     * Saves every part of the lesson for offline use. [onProgress] gets 0–100 and may be called
     * on a background thread. The audio files take most of the time, so the lecture and
     * pronunciation steps get the biggest share and move per file; the text steps are 5% each.
     */
    suspend fun downloadLesson(lessonId: String, onProgress: (Int) -> Unit = {}): Boolean {
        val downloadContext = currentCoroutineContext()
        var reported = 0
        fun report(percent: Int) {
            downloadContext.ensureActive()
            if (percent > reported) {
                reported = percent
                onProgress(percent)
            }
        }
        fun audioShare(start: Int, end: Int) = { done: Int, total: Int ->
            report(start + (end - start) * done / total.coerceAtLeast(1))
        }

        return try {
            val lectureRepo = LectureRepository(context)
            val crosswordRepo = CrosswordRepository(context)
            val activityRepo = ActivityRepository(context)
            val quizRepo = QuizRepository(context)
            val pronunciationRepo = PronunciationRepository(context)

            lectureRepo.downloadLecture(lessonId, audioShare(0, 50))
            report(50)
            crosswordRepo.syncLevels(lessonId)
            report(55)
            crosswordRepo.syncProgress(lessonId)
            report(60)
            activityRepo.downloadActivity(lessonId)
            report(65)
            quizRepo.downloadQuiz(lessonId)
            report(70)
            pronunciationRepo.downloadPronunciation(lessonId, audioShare(70, 100))

            downloadContext.ensureActive()
            db.lessonDao().updateDownloaded(lessonId, true)
            report(100)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    suspend fun removeDownload(lessonId: String): Boolean {
        return try {
            db.lectureDao().deleteByLessonId(lessonId)
            db.activityDao().deleteByLessonId(lessonId)
            db.quizDao().deleteByLessonId(lessonId)
            db.crosswordLevelDao().deleteByLessonId(lessonId)
            db.pronunciationDao().deleteByLessonId(lessonId)
            LectureAudioStore.delete(context, lessonId)
            PronunciationAudioStore.delete(context, lessonId)

            db.lessonDao().markLessonRemoved(lessonId)
            true
        } catch (e: Exception) {
            false
        }
    }

    private companion object {
        const val TAG = "LESSON_SYNC"
    }
}