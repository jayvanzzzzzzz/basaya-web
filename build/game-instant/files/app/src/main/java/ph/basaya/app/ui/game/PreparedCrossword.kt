package ph.basaya.app.ui.game

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.model.CrosswordGameLevel
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.data.repository.CrosswordRepository
import java.util.UUID

/** A single-use handoff: the game screen never waits for storage or the network on entry. */
internal data class PreparedCrossword(
    val lessonId: String,
    val owner: String,
    val progressKey: String,
    val assessment: AssessmentSession?,
    val levels: List<CrosswordGameLevel>,
    val level: CrosswordGameLevel,
    val foundWords: List<String>,
    val attemptId: String
) {
    fun isCurrent(): Boolean = FirebaseAuth.getInstance().currentUser?.uid == owner &&
        ProgressSession.gameKey(lessonId, owner) == progressKey

    companion object {
        private var pending: Pair<String, PreparedCrossword>? = null

        suspend fun prepare(context: Context, lessonId: String): PreparedCrossword {
            val owner = FirebaseAuth.getInstance().currentUser?.uid
                ?: throw AssessmentFailure(401, "Mag-log in muli.")
            val assessment = if (PracticeLessons.refresh(context, lessonId)) null
                else AssessmentSession.open(context.applicationContext, lessonId)
            val key = ProgressSession.gameKey(lessonId, owner)
            val repository = CrosswordRepository(context)
            val levels = repository.getLevels(lessonId)
            check(levels.isNotEmpty()) { "No crossword levels are available" }
            fun ownsSession() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
                ProgressSession.gameKey(lessonId, owner) == key
            // Recover every locally revealed word before selecting the authoritative next level.
            GameWordSaves.open(context, key, ::ownsSession).drain { command ->
                GameWordSaves.send(context, key, levels, assessment, command, ::ownsSession)
            }
            val progress = AppDatabase.getDatabase(context).crosswordProgressDao().getProgress(key)
            val begin = assessment?.request("begin", "game")
            if (begin?.flag("finished") == true) throw GameAlreadyFinished()
            val number = (begin?.number("level") ?: progress?.currentLevel ?: 1)
                .coerceAtMost(levels.maxOf { it.level })
            val level = levels.firstOrNull { it.level == number }
                ?: error("No matching crossword level")
            check(level.words.isNotEmpty() && level.words.none { it.isBlank() }) { "Invalid crossword words" }
            val savedWords = if (begin != null) {
                begin.getAsJsonObject("resume")?.getAsJsonArray("foundWords")?.map { it.asString }.orEmpty()
            } else progress?.foundWords.orEmpty().split(",")
            return PreparedCrossword(lessonId, owner, key, assessment, levels, level,
                savedWords.mapNotNull { saved -> level.words.firstOrNull { it.trim().equals(saved.trim(), true) } }
                    .map { it.trim() }.distinct(), begin?.text("attemptId").orEmpty())
                .also { check(it.isCurrent()) { "The game account or session changed" } }
        }

        fun store(game: PreparedCrossword): String = UUID.randomUUID().toString().also {
            pending = it to game
        }

        fun take(token: String?, lessonId: String): PreparedCrossword? {
            val entry = pending ?: return null
            if (entry.first != token) return null
            pending = null
            return entry.second.takeIf { it.lessonId == lessonId && it.isCurrent() }
        }
    }
}

internal class GameAlreadyFinished : Exception()
