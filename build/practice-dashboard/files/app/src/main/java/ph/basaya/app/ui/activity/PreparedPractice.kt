package ph.basaya.app.ui.activity

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.gson.JsonObject
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.model.PracticeActivityData
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.data.repository.ActivityRepository
import ph.basaya.app.utils.Network
import java.util.UUID

/** Single-use, account-bound preparation performed while the dashboard card is loading. */
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
    val completion: JsonObject?
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
            val content = ActivityRepository(context).getActivity(lessonId)
                ?.takeIf { it.pages.isNotEmpty() }
                ?: error("No activity content is available")
            if (assessment == null && content.pages.any { it.pickCount != null })
                throw AssessmentFailure(0, "Kumonekta upang masuri ang mga sagot sa pagsasanay.")
            val confirmed = assessment?.progress()
            if (confirmed?.flag("activityFinished") == true) throw PracticeAlreadyFinished()
            val saved = confirmed?.getAsJsonObject("resume")?.getAsJsonObject("activity")
            val done = saved?.number("done")?.coerceAtLeast(0) ?: 0
            val completion = if (done >= content.pages.size)
                assessment?.takeUnless { it.practice }?.finish("activity") else null
            return PreparedPractice(lessonId, owner, stamp, assessment, content,
                done.coerceAtMost(content.pages.lastIndex), saved?.number("score") ?: 0,
                saved?.number("retries") ?: 0,
                (saved?.number("lives", if (saved.flag("tried")) 2 else 3) ?: 3).coerceIn(1, 3),
                completion).also { check(it.isCurrent()) { "The activity account or session changed" } }
        }

        fun store(activity: PreparedPractice): String = UUID.randomUUID().toString().also {
            pending = it to activity
        }

        fun take(token: String?, lessonId: String): PreparedPractice? {
            val entry = pending ?: return null
            if (entry.first != token) return null
            pending = null
            return entry.second.takeIf { it.lessonId == lessonId && it.isCurrent() }
        }
    }
}

internal class PracticeAlreadyFinished : Exception()
