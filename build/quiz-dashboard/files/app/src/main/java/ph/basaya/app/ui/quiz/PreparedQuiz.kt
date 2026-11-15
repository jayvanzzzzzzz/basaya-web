package ph.basaya.app.ui.quiz

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.model.Quiz
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.data.repository.QuizRepository
import ph.basaya.app.utils.Network
import java.util.UUID

/** Session verification and resume loading finish on the dashboard before questions appear. */
internal data class PreparedQuiz(
    val lessonId: String,
    val owner: String,
    val sessionStamp: Map<String, Any>,
    val assessment: AssessmentSession?,
    val quiz: Quiz,
    val attemptId: String,
    val answered: Set<Int>,
    val missed: List<String>,
    val score: Int
) {
    fun isCurrent() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
        ProgressSession.stamp(owner, emptyMap()) == sessionStamp

    companion object {
        private var pending: Pair<String, PreparedQuiz>? = null

        suspend fun prepare(context: Context, lessonId: String): PreparedQuiz {
            val owner = FirebaseAuth.getInstance().currentUser?.uid
                ?: throw AssessmentFailure(401, "Mag-log in muli.")
            val assessment = if (!PracticeLessons.refresh(context, lessonId) || Network.isOnline(context))
                AssessmentSession.open(context.applicationContext, lessonId) else null
            val stamp = ProgressSession.stamp(owner, emptyMap())
            val quiz = QuizRepository(context).getQuiz(lessonId)
                ?.takeIf { it.questions.isNotEmpty() } ?: error("No quiz content is available")
            if (assessment == null && quiz.questions.any { it.requiresServerValidation })
                throw AssessmentFailure(0, "Kumonekta upang masuri ang mga sagot sa pagsasanay.")
            val graded = assessment?.takeUnless { it.practice }
            if (graded?.progress()?.flag("quizFinished") == true) throw QuizAlreadyFinished()
            val begin = graded?.request("begin", "quiz")
            if (begin?.flag("finished") == true) throw QuizAlreadyFinished()
            val resume = begin?.getAsJsonObject("resume")
            val answered = resume?.getAsJsonArray("answered")?.map { it.asInt }.orEmpty()
                .filter { it in quiz.questions.indices }.toSet()
            val missed = resume?.getAsJsonArray("missed")?.map { it.asString }.orEmpty()
            return PreparedQuiz(lessonId, owner, stamp, assessment, quiz,
                begin?.text("attemptId").orEmpty(), answered, missed,
                (resume?.number("score") ?: 0).coerceIn(0, answered.size))
                .also { check(it.isCurrent()) { "The quiz account or session changed" } }
        }

        fun store(quiz: PreparedQuiz): String = UUID.randomUUID().toString().also { pending = it to quiz }

        fun take(token: String?, lessonId: String): PreparedQuiz? {
            val entry = pending ?: return null
            if (entry.first != token) return null
            pending = null
            return entry.second.takeIf { it.lessonId == lessonId && it.isCurrent() }
        }
    }
}

internal class QuizAlreadyFinished : Exception()
