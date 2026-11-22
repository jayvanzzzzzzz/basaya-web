package ph.basaya.app.data.progress

import android.util.Log
import ph.basaya.app.data.repository.ActivityStatus
import ph.basaya.app.data.repository.GameStatus
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Stores first-try results per skill per lesson and keeps the student's skill summary
 * up to date.
 *
 * Per lesson:  users/{uid}/assignedLessons/{lessonId}.skills.{skillKey}
 *              = { correct, attempts, items, completedAt, ...extras }
 * Summary:     users/{uid}.skillSummary  (read by the Progress screen and teacher dashboard)
 *
 * See README.md ("Paano kinukwenta ang progreso") for how the summary is computed.
 */
class SkillProgressRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) {

    private fun lessonDoc(uid: String, lessonId: String) =
        firestore.collection("users").document(uid).collection("assignedLessons").document(lessonId)

    /**
     * Saves one lesson's result for a skill (replaces any earlier result for that lesson).
     * Doesn't wait for the server: offline, Firestore sends it once the phone is back online.
     */
    fun recordResult(
        uid: String,
        lessonId: String,
        skill: Skill,
        correct: Int,
        attempts: Int,
        items: Int,
        extras: Map<String, Any> = emptyMap()
    ) {
        if (PracticeLessons.isPractice(lessonId)) return // Practice: nothing is saved
        val record = mapOf(
            "correct" to correct,
            "attempts" to attempts,
            "items" to items,
            "completedAt" to FieldValue.serverTimestamp()
        ) + extras
        lessonDoc(uid, lessonId)
            .set(ProgressSession.stamp(uid, mapOf("skills" to mapOf(skill.key to record))), SetOptions.merge())
            .addOnFailureListener { Log.w(TAG, "Could not save the ${skill.key} result", it) }
    }

    /**
     * Adds one finished crossword level to the lesson's Talasalitaan record. Levels of a lesson
     * are played separately, so the counts accumulate:
     * correct = attempts = items = words found (each word found counts once; wrong swipes don't count).
     * Doesn't wait for the server: offline, Firestore sends it once the phone is back online.
     */
    fun addCrosswordLevel(uid: String, lessonId: String, wordsFound: Int) {
        if (PracticeLessons.isPractice(lessonId)) return // Practice: nothing is saved
        val record = mapOf(
            "correct" to FieldValue.increment(wordsFound.toLong()),
            "attempts" to FieldValue.increment(wordsFound.toLong()),
            "items" to FieldValue.increment(wordsFound.toLong()),
            "levels" to FieldValue.increment(1),
            "completedAt" to FieldValue.serverTimestamp()
        )
        lessonDoc(uid, lessonId)
            .set(ProgressSession.stamp(uid, mapOf("skills" to mapOf(Skill.TALASALITAAN.key to record))), SetOptions.merge())
            .addOnFailureListener { Log.w(TAG, "Could not save the crossword level", it) }
    }

    /** Recomputes the summary from every assigned lesson and saves it on the user document. */
    suspend fun refreshSummary(uid: String): StudentSummary {
        val allDocs = firestore.collection("users").document(uid)
            .collection("assignedLessons").get().await().documents

        // Only the lessons of the student's class count (see LessonCompletion), and never Practice ones (they save nothing).
        val classId = firestore.collection("users").document(uid).get().await().getString("classId")
        val links = if (classId.isNullOrBlank()) {
            emptyList()
        } else {
            firestore.collection("classes").document(classId).collection("classLessons")
                .get().await().documents
                .filterNot { PracticeLessons.isPracticeLink(it) }
        }
        val classLessonIds = links
            .map { link -> link.getString("lessonId")?.takeIf { it.isNotBlank() } ?: link.id }
            .toSet()
        val docs = allDocs.filter { it.id in classLessonIds }

        val summary = SkillScoring.summarize(scoredResults(docs, heldLessons(uid, classId, links), firestore))
        saveSummary(uid, summary, lessonsAssigned = classLessonIds.size)
        return summary
    }

    /**
     * The class lessons whose deadline has passed, minus those that closed before the student
     * joined, with their skipped parts, for [scoredResults]. Lessons still open can't be missed.
     */
    private suspend fun heldLessons(uid: String, classId: String?, links: List<DocumentSnapshot>): List<HeldLesson> {
        if (classId.isNullOrBlank()) return emptyList()
        val now = System.currentTimeMillis()
        val closed = links.mapNotNull { link ->
            val dueAt = link.getTimestamp("dueAt")?.toDate()?.time ?: return@mapNotNull null
            val id = link.getString("lessonId")?.takeIf { it.isNotBlank() } ?: link.id
            (id to dueAt).takeIf { dueAt < now }
        }
        if (closed.isEmpty()) return emptyList()
        val joinedAt = try {
            firestore.collection("classes").document(classId)
                .collection("students").document(uid).get().await()
                .getTimestamp("joinedAt")?.toDate()?.time
        } catch (e: Exception) {
            null
        }
        return coroutineScope {
            closed
                .filter { (_, dueAt) -> joinedAt == null || dueAt >= joinedAt }
                .map { (id, dueAt) ->
                    async {
                        HeldLesson(
                            lessonId = id,
                            dueAt = dueAt,
                            gameSkipped = GameStatus.isSkipped(id, firestore) == true,
                            activitySkipped = ActivityStatus.isSkipped(id, firestore) == true,
                            items = emptyMap()
                        )
                    }
                }
                .awaitAll()
        }
    }

    suspend fun saveSummary(uid: String, summary: StudentSummary, lessonsAssigned: Int) {
        val skills = summary.skills.values.associate { s ->
            s.skill.key to mapOf(
                "score" to s.score,
                "level" to s.level.name,
                "trend" to s.trend?.name,
                "lessons" to s.lessons,
                "items" to s.items,
                "needsHelp" to s.needsHelp,
                "lessonScores" to s.lessonScores
            )
        }
        val data = mapOf(
            "skillSummary" to mapOf(
                "needsHelp" to summary.needsHelp.map { it.key },
                "lessonsAssigned" to lessonsAssigned,
                "skills" to skills,
                "updatedAt" to FieldValue.serverTimestamp()
            )
        )
        // mergeFields replaces skillSummary as a whole and leaves the rest of the user doc alone.
        firestore.collection("users").document(uid)
            .set(data, SetOptions.mergeFields("skillSummary"))
            .await()
    }

    companion object {
        private const val TAG = "SkillProgress"

        // Outlives the activity that finished the lesson, so the summary still updates after the screen closes.
        private val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        fun refreshInBackground(uid: String) {
            backgroundScope.launch {
                try {
                    SkillProgressRepository().refreshSummary(uid)
                } catch (e: Exception) {
                    Log.w(TAG, "Could not refresh skill summary", e)
                }
            }
        }

        /**
         * Every lesson's skill records, plus a 0 for each part left undone when a lesson in
         * [lessons] closed ([SkillScoring.withMissed]). [lessons] are the class lessons the
         * student is held to; their item counts are read here ([LessonItems]).
         */
        suspend fun scoredResults(
            docs: List<DocumentSnapshot>,
            lessons: List<HeldLesson>,
            firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
            now: Long = System.currentTimeMillis()
        ): Map<Skill, List<LessonSkillResult>> {
            var monitorNow=now
            var eligible=lessons
            val uid=com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
            if(uid!=null) {
                try {
                    val profile=firestore.collection("users").document(uid).get().await()
                    val cid=profile.getString("classId").orEmpty()
                    if(cid.isNotBlank()) {
                        val classroom=firestore.collection("classes").document(cid).get().await()
                        val roster=firestore.collection("classes").document(cid).collection("students").document(uid).get().await()
                        val links=firestore.collection("classes").document(cid).collection("classLessons").get().await().documents
                        monitorNow=minOf(now,ph.basaya.app.data.membership.EnrollmentPolicy.monitoringNow(profile,roster,classroom))
                        eligible=lessons.mapNotNull { lesson ->
                            val link=links.firstOrNull { it.getString("mode")!="practice" && (it.getString("lessonId") ?: it.id)==lesson.lessonId }
                            if(link==null || ph.basaya.app.data.membership.EnrollmentPolicy.exempt(link,roster,profile,classroom))null
                            else lesson.copy(dueAt=ph.basaya.app.data.membership.EnrollmentPolicy.due(link,roster))
                        }
                    }
                } catch(e: kotlinx.coroutines.CancellationException) { throw e }
                catch(e: Exception) { return resultsFrom(docs) }
            }
            val closed = eligible.filter { it.dueAt != null && it.dueAt < monitorNow }
            val withItems = coroutineScope {
                closed.map { lesson -> async { lesson.copy(items = LessonItems.counts(lesson.lessonId, firestore)) } }
                    .awaitAll()
            }
            val finished = docs.associate { doc ->
                val resume = doc.get("resume") as? Map<*, *>
                fun saved(part: String, field: String) =
                    ((resume?.get(part) as? Map<*, *>)?.get(field) as? Number)?.toInt()
                doc.id to FinishedParts(
                    game = doc.getBoolean("gameFinished") == true,
                    activity = doc.getBoolean("activityFinished") == true,
                    pronunciation = doc.getBoolean("pronunciationFinished") == true,
                    quiz = doc.getBoolean("quizFinished") == true,
                    correctSoFar = listOfNotNull(
                        saved(LessonResume.GAME, "done")?.let { Skill.TALASALITAAN to it },
                        saved(LessonResume.ACTIVITY, "score")?.let { Skill.PAGKILALA to it },
                        saved(LessonResume.PRONUNCIATION, "firstTryCorrect")?.let { Skill.PAGBIGKAS to it },
                        saved(LessonResume.QUIZ, "score")?.let { Skill.PAGSUSULIT to it }
                    ).toMap()
                )
            }
            return SkillScoring.withMissed(resultsFrom(docs), finished, withItems, monitorNow)
        }

        /** Reads every lesson's skill records. Lessons without a record are simply absent. */
        fun resultsFrom(docs: List<DocumentSnapshot>): Map<Skill, List<LessonSkillResult>> {
            val results = Skill.values().associateWith { mutableListOf<LessonSkillResult>() }

            docs.forEach { doc ->
                val skills = doc.get("skills") as? Map<*, *>
                Skill.values().forEach { skill ->
                    val record = skills?.get(skill.key) as? Map<*, *>
                    val parsed = record?.let { parseRecord(doc.id, it) }
                        ?: if (skill == Skill.PAGSUSULIT) legacyQuiz(doc) else null
                    // Crossword: every word found counts once. Older records also counted wrong
                    // swipes in attempts; those no longer lower the score.
                    parsed?.let {
                        results.getValue(skill).add(if (skill == Skill.TALASALITAAN) it.copy(attempts = it.items) else it)
                    }
                }
            }
            return results
        }

        private fun parseRecord(lessonId: String, record: Map<*, *>): LessonSkillResult? {
            val attempts = (record["attempts"] as? Number)?.toInt() ?: return null
            return LessonSkillResult(
                lessonId = lessonId,
                correct = (record["correct"] as? Number)?.toInt() ?: 0,
                attempts = attempts,
                items = (record["items"] as? Number)?.toInt() ?: attempts,
                completedAtMillis = millis(record["completedAt"])
            )
        }

        /**
         * Quizzes taken before skill tracking already saved quizScore/quizTotal with the same
         * meaning, so they still count. Older Gawain/game/pronunciation scores used different
         * rules (retries counted as correct) and are not mixed in.
         */
        private fun legacyQuiz(doc: DocumentSnapshot): LessonSkillResult? {
            val score = doc.getLong("quizScore") ?: return null
            val total = doc.getLong("quizTotal") ?: return null
            if (total <= 0) return null
            return LessonSkillResult(
                lessonId = doc.id,
                correct = score.toInt(),
                attempts = total.toInt(),
                items = total.toInt(),
                completedAtMillis = millis(doc.get("quizCompletedAt"))
            )
        }

        // A server timestamp still pending (offline write) reads as null: treat it as "now".
        private fun millis(value: Any?): Long =
            (value as? Timestamp)?.toDate()?.time ?: System.currentTimeMillis()
    }
}
