package ph.basaya.app.ui.game

import android.content.Context
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.entity.CrosswordProgress
import ph.basaya.app.data.model.CrosswordGameLevel
import com.google.gson.JsonObject

internal object GameWordSaves {
    suspend fun send(
        context: Context, key: String, levels: List<CrosswordGameLevel>,
        assessment: AssessmentSession?, command: JsonObject, ownsSession: () -> Boolean
    ): JsonObject {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
        val completed = command.text("operation") == "finish"
        val payload = command.deepCopy().apply { if (!completed) remove("words") }
        val result = assessment?.request(command.text("operation"), "game", payload)
            ?: fields("finished" to completed, "score" to 1)
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
        if (completed && !result.has("finished"))
            throw AssessmentFailure(0, "Hindi pa nakumpirma ang antas.")
        val level = command.number("level")
        val next = levels.firstOrNull { it.level > level }?.level ?: (level + 1)
        AppDatabase.getDatabase(context).crosswordProgressDao().saveProgress(CrosswordProgress(
            lessonId = key,
            currentLevel = if (completed && assessment == null && level == levels.lastOrNull()?.level)
                levels.first().level else if (completed) next else level,
            completedLevel = if (completed) result.number("score", 1) else 0,
            foundWords = if (completed) "" else command.getAsJsonArray("words").joinToString(",") { it.asString }
        ))
        return result
    }

    fun open(context: Context, key: String, ownsSession: () -> Boolean): GameWordOutbox {
        val preferences = context.applicationContext.getSharedPreferences("crossword_word_outbox_v1", Context.MODE_PRIVATE)
        return GameWordOutbox(object : SubmissionStorage {
            override fun read(key: String) = preferences.getString(key, null)
            override fun write(key: String, value: String) {
                if (!preferences.edit().putString(key, value).commit())
                    throw AssessmentFailure(0, "Hindi ma-save sa telepono. Magbakante ng storage at subukan muli.")
            }
            override fun remove(key: String) {
                if (!preferences.edit().remove(key).commit())
                    throw AssessmentFailure(0, "Hindi makumpirma ang lokal na tala. Subukan muli.")
            }
        }, key, ownsSession)
    }
}
