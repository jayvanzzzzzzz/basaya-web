package ph.basaya.app.ui.activity

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.gson.JsonObject
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.model.ActivityPage
import ph.basaya.app.data.model.PracticeActivityData
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.data.repository.ActivityRepository
import ph.basaya.app.utils.Network
import java.util.UUID

/** Questions, keys, authoritative resume state and queued attempts are prepared on the dashboard. */
internal data class PreparedPractice(
    val lessonId: String,
    val owner: String,
    val sessionStamp: Map<String, Any>,
    val assessment: AssessmentSession?,
    val content: PracticeActivityData,
    val pageIndex: Int,
    val score: Int,
    val retries: Int,
    val lives: Int,
    val completion: JsonObject?,
    val attemptId: String,
    val contentVersion: String,
    val queueKey: String
) {
    fun isCurrent() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
        ProgressSession.stamp(owner, emptyMap()) == sessionStamp

    companion object {
        private var pending: Pair<String, PreparedPractice>? = null

        suspend fun prepare(context: Context, lessonId: String): PreparedPractice {
            val owner = FirebaseAuth.getInstance().currentUser?.uid
                ?: throw AssessmentFailure(401, "Mag-log in muli.")
            val assessment = if (!PracticeLessons.refresh(context, lessonId) || Network.isOnline(context))
                AssessmentSession.open(context, lessonId) else null
            val stamp = ProgressSession.stamp(owner, emptyMap())
            fun ownsSession() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
                ProgressSession.stamp(owner, emptyMap()) == stamp
            check(ownsSession()) { "The activity account or session changed" }
            val key = "$owner:${stamp["classId"]}:${stamp["progressSession"]}:$lessonId"
            if (assessment != null && !assessment.practice) {
                ActivityAttemptSaves.open(context, key, ::ownsSession).drain { command ->
                    assessment.request(command.text("operation"), "activity", command)
                }
            }
            val prepared = assessment?.request("prepare-activity", "activity")
            if (prepared?.flag("finished") == true) throw PracticeAlreadyFinished()
            val content = if (prepared != null) {
                val activity = prepared.getAsJsonObject("activity")
                    ?: throw AssessmentFailure(0, "Hindi pa handa ang mga sagot ng pagsasanay.")
                PracticeActivityData(id = lessonId, title = activity.text("title"),
                    instruction = activity.text("instruction"), explanation = activity.text("explanation"),
                    pages = activity.getAsJsonArray("pages").map { item ->
                        val page = item.asJsonObject
                        val words = page.getAsJsonArray("words").map { it.asString }
                        val indices = page.getAsJsonArray("correctIndices")
                            ?: throw AssessmentFailure(0, "Hindi pa handa ang mga sagot ng pagsasanay.")
                        val correct = indices.map { it.asInt }
                        check(correct.all { it in words.indices } && correct.distinct().size == correct.size)
                        ActivityPage(words = words, correctIndices = correct, explanation = page.text("explanation"),
                            pickCount = correct.size, answerKeyLoaded = true)
                    })
            } else ActivityRepository(context).getActivity(lessonId)
                ?: error("No activity content is available")
            check(content.pages.isNotEmpty()) { "No activity pages are available" }
            // An absent key is different from a legitimate page with zero correct selections.
            if (content.pages.any { !it.answerKeyLoaded && it.correctIndices.isEmpty() })
                throw AssessmentFailure(0, "Kumonekta upang ihanda ang mga sagot ng pagsasanay.")
            val saved = prepared?.getAsJsonObject("resume")
            val done = saved?.number("done")?.coerceAtLeast(0) ?: 0
            val completion = if (done >= content.pages.size)
                assessment?.takeUnless { it.practice }?.finish("activity", fields(
                    "attemptId" to prepared?.text("attemptId").orEmpty(), "contentVersion" to prepared?.text("contentVersion").orEmpty())) else null
            return PreparedPractice(lessonId, owner, stamp, assessment, content,
                done.coerceAtMost(content.pages.lastIndex), saved?.number("score") ?: 0,
                saved?.number("retries") ?: 0, (saved?.number("lives", 3) ?: 3).coerceIn(1, 3),
                completion, prepared?.text("attemptId").orEmpty(), prepared?.text("contentVersion").orEmpty(), key)
                .also { check(it.isCurrent()) { "The activity account or session changed" } }
        }

        fun store(activity: PreparedPractice): String = UUID.randomUUID().toString().also { pending = it to activity }
        fun take(token: String?, lessonId: String): PreparedPractice? {
            val entry = pending ?: return null
            if (entry.first != token) return null
            pending = null
            return entry.second.takeIf { it.lessonId == lessonId && it.isCurrent() }
        }
    }
}

internal class PracticeAlreadyFinished : Exception()
