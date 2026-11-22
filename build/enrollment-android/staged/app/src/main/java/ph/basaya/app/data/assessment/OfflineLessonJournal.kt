package ph.basaya.app.data.assessment

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.UUID

/** A downloaded lesson's device state and ordered submissions, committed together before UI advances. */
internal class OfflineLessonJournal(
    private val storage: SubmissionStorage,
    private val key: String,
    private val ownsSession: () -> Boolean
) {
    companion object { private val lock = Mutex() }

    private fun owner() {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
    }
    private fun read() = storage.read(key)?.let { JsonParser.parseString(it).asJsonObject }
        ?: throw AssessmentFailure(0, "I-download muli ang aralin habang may internet.")
    private fun save(state: JsonObject) { owner(); storage.write(key, state.toString()) }
    fun exists() = storage.read(key) != null
    fun snapshot(): JsonObject { owner(); return read().getAsJsonObject("progress").deepCopy() }
    fun pending() = read().getAsJsonArray("queue").size() > 0
    fun blocked() = read().text("blocked")

    suspend fun seed(value: JsonObject) = lock.withLock {
        owner()
        if (exists() && pending()) return@withLock
        save(value.deepCopy().apply {
            add("queue", JsonArray()); add("receipts", JsonArray()); add("attempts", JsonObject())
        })
    }

    suspend fun recordProgress(progress: JsonObject) = lock.withLock {
        val state = read()
        if (state.getAsJsonArray("queue").size() == 0) {
            state.add("progress", progress.deepCopy()); save(state)
        }
    }

    suspend fun exchange(body: JsonObject, online: Boolean, send: suspend (JsonObject) -> JsonObject): JsonObject = lock.withLock {
        owner()
        var state = read()
        if (state.text("blocked").isNotEmpty()) throw AssessmentFailure(409, state.text("blocked"))
        val mutation = body.text("operation") in listOf("answer", "resume", "finish", "abandon") &&
            body.text("part") in listOf("lecture", "quiz", "activity", "game")
        if (mutation) {
            if (body.text("eventId").isNotEmpty() && state.getAsJsonArray("receipts").any {
                    val previous = it.asJsonObject.getAsJsonObject("body")
                    previous.text("eventId") == body.text("eventId") && previous != body
                }) throw AssessmentFailure(409, "May ibang sagot na nakatala para sa pagpapasang ito.")
            val receipt = state.getAsJsonArray("receipts").firstOrNull { it.asJsonObject.getAsJsonObject("body") == body }?.asJsonObject
            if (receipt == null) {
                val local = applyLocal(state, body)
                state.getAsJsonArray("queue").add(body.deepCopy())
                state.getAsJsonArray("receipts").add(fields("body" to body, "reply" to local))
                save(state)
            }
            if (online) {
                try { replayLocked(send) }
                catch (e: CancellationException) { throw e }
                catch (e: IOException) { if (e is AssessmentFailure && !e.retryable) throw e }
            }
            state = read()
            return@withLock state.getAsJsonArray("receipts").first { it.asJsonObject.getAsJsonObject("body") == body }
                .asJsonObject.getAsJsonObject("reply").deepCopy()
        }
        if (online) {
            try {
                replayLocked(send)
                val result = send(body)
                state = read()
                recordReply(state, body, result)
                save(state)
                return@withLock result
            } catch (e: CancellationException) { throw e }
            catch (e: IOException) { if (e is AssessmentFailure && !e.retryable) throw e }
        }
        state = read()
        when (body.text("operation")) {
            "content" -> state.getAsJsonObject("content").deepCopy()
            "prepare-activity" -> state.getAsJsonObject("activity").deepCopy().apply {
                add("resume", resume(state, "activity").deepCopy())
                addProperty("finished", state.getAsJsonObject("progress").flag("activityFinished"))
            }
            "begin" -> begin(state, body.text("part"), body.flag("practice")).also { save(state) }
            else -> throw AssessmentFailure(0, "Kailangan ng internet para sa gawaing ito.")
        }
    }

    suspend fun replay(send: suspend (JsonObject) -> JsonObject) = lock.withLock { replayLocked(send) }

    private suspend fun replayLocked(send: suspend (JsonObject) -> JsonObject) {
        var state = read()
        if (state.text("blocked").isNotEmpty()) throw AssessmentFailure(409, state.text("blocked"))
        while (state.getAsJsonArray("queue").size() > 0) {
            owner()
            val original = state.getAsJsonArray("queue")[0].asJsonObject
            val command = original.deepCopy()
            try {
                val localId = command.text("attemptId")
                if (!command.flag("practice") && localId.startsWith("offline_")) {
                    val mappings = state.getAsJsonObject("attempts")
                    if (!mappings.has(localId)) {
                        // A quiz first opened offline starts its server attempt only after prior lecture pages sync.
                        val current = send(command.deepCopy().apply {
                            entrySet().map { it.key }.filter { it !in listOf("classId", "progressSession", "enrollmentVersion", "classVersion", "lessonId", "part", "practice", "entryId") }.forEach(::remove)
                            addProperty("operation", "content"); remove("part")
                        })
                        if (current.get("quiz") != state.getAsJsonObject("content").get("quiz"))
                            throw AssessmentFailure(409, "Nagbago ang pagsusulit. Naka-save ang offline na sagot; kausapin ang guro.")
                        val started = send(command.deepCopy().apply {
                            entrySet().map { it.key }.filter { it !in listOf("classId", "progressSession", "enrollmentVersion", "classVersion", "lessonId", "part", "practice", "entryId") }.forEach(::remove)
                            addProperty("operation", "begin")
                        })
                        if (started.text("attemptId").isBlank()) throw AssessmentFailure(409, "Nagbago ang pagtatangka sa pagsusulit.")
                        mappings.addProperty(localId, started.text("attemptId"))
                        save(state)
                    }
                    command.addProperty("attemptId", mappings.text(localId))
                }
                val accepted = if (command.flag("practice") && command.text("operation") != "answer")
                    fields("finished" to true) else send(command)
                owner()
                val receipt = state.getAsJsonArray("receipts").first { it.asJsonObject.getAsJsonObject("body") == original }.asJsonObject
                receipt.add("reply", accepted.deepCopy())
                if (command.text("operation") == "finish" && !command.flag("practice")) {
                    val part = command.text("part")
                    val progress = state.getAsJsonObject("progress")
                    if (accepted.flag("finished")) progress.addProperty("${part}Finished", true)
                    accepted.get("score")?.takeUnless { it.isJsonNull }?.let { score ->
                        progress.addProperty("${part}Score", if (part == "game") maxOf(progress.number("gameScore"), score.asInt) else score.asInt)
                    }
                    accepted.get("total")?.takeUnless { it.isJsonNull }?.let { progress.add("${part}Total", it.deepCopy()) }
                }
                state.getAsJsonArray("queue").remove(0)
                save(state)
            } catch (e: AssessmentFailure) {
                if (!e.retryable && e.status != 401) {
                    state.addProperty("blocked", e.message.orEmpty()); save(state)
                }
                throw e
            }
            state = read()
        }
    }

    private fun resume(state: JsonObject, part: String): JsonObject {
        val progress = state.getAsJsonObject("progress")
        val resumes = progress.getAsJsonObject("resume") ?: JsonObject().also { progress.add("resume", it) }
        return resumes.getAsJsonObject(part) ?: JsonObject().also { resumes.add(part, it) }
    }

    private fun begin(state: JsonObject, part: String, practice: Boolean): JsonObject {
        if (practice && state.getAsJsonObject("progress").flag("${part}Finished")) {
            state.getAsJsonObject("progress").obj("resume").add(part, JsonObject())
            state.getAsJsonObject("progress").addProperty("${part}Finished", false)
            state.getAsJsonObject("begins").remove(part)
        }
        if (part == "quiz" && !state.getAsJsonObject("progress").flag("lectureFinished"))
            throw AssessmentFailure(403, "Tapusin muna ang lektura bago ang pagsusulit.")
        val begins = state.getAsJsonObject("begins")
        val result = begins.getAsJsonObject(part) ?: fields("attemptId" to "offline_${UUID.randomUUID()}").also { begins.add(part, it) }
        result.add("resume", resume(state, part).deepCopy())
        result.addProperty("finished", state.getAsJsonObject("progress").flag("${part}Finished"))
        if (part == "game") {
            val done = state.getAsJsonObject("progress").number("gameScore")
            val levels = state.getAsJsonArray("levels")
            result.addProperty("level", levels.getOrNull(done)?.asJsonObject?.number("level"))
            result.addProperty("completedLevels", done); result.addProperty("totalLevels", levels.size())
        }
        return result.deepCopy()
    }

    private fun applyLocal(state: JsonObject, body: JsonObject): JsonObject {
        val part = body.text("part"); val operation = body.text("operation")
        val progress = state.getAsJsonObject("progress"); val saved = resume(state, part)
        val counts = state.getAsJsonObject("content").getAsJsonObject("counts")
        val total = counts.number(part)
        fun requireValid(valid: Boolean) { if (!valid) throw AssessmentFailure(409, "Nagbago ang progreso. Buksan muli ang aralin.") }
        var result = JsonObject()
        when (part) {
            "lecture" -> {
                if (operation == "resume") {
                    requireValid(body.number("done") in saved.number("done")..minOf(saved.number("done") + 1, total))
                    saved.addProperty("done", body.number("done")); saved.addProperty("total", total)
                }
                if (operation == "finish") requireValid(saved.number("done") >= total)
            }
            "quiz" -> {
                if (operation == "abandon") {
                    saved.entrySet().map { it.key }.forEach(saved::remove)
                    state.getAsJsonObject("begins").remove("quiz")
                    return fields("abandoned" to true, "pendingSync" to true)
                }
                requireValid(progress.flag("lectureFinished"))
                val answered = saved.getAsJsonArray("answered") ?: JsonArray().also { saved.add("answered", it) }
                if (operation == "answer") {
                    val index = body.number("index", -1)
                    val question = state.getAsJsonObject("content").getAsJsonObject("quiz").getAsJsonArray("questions").getOrNull(index)?.asJsonObject
                    val choices = body.getAsJsonArray("selected")?.map { it.asInt }.orEmpty()
                    requireValid(question != null && choices.isNotEmpty() && choices.distinct().size == choices.size &&
                        choices.all { it in 0 until question!!.getAsJsonArray("choices").size() } && answered.none { it.asInt == index })
                    answered.add(index)
                }
                saved.addProperty("done", answered.size()); saved.addProperty("total", total)
                if (operation == "finish") requireValid(answered.size() == total)
            }
            "activity" -> {
                if (operation == "answer") {
                    requireValid(body.number("index", -1) == saved.number("done"))
                    val page = state.getAsJsonObject("activity").getAsJsonObject("activity").getAsJsonArray("pages")[saved.number("done")].asJsonObject
                    val correct = page.getAsJsonArray("correctIndices").map { it.asInt }.toSet()
                    val selected = body.getAsJsonArray("selected").map { it.asInt }.toSet()
                    val right = correct.isEmpty() || correct == selected
                    val lives = if (right) saved.number("lives", 3) else saved.number("lives", 3) - 1
                    if (right) saved.addProperty("score", saved.number("score") + 1)
                    else saved.addProperty("retries", saved.number("retries") + 1)
                    val over = right || lives == 0
                    if (over) saved.addProperty("done", saved.number("done") + 1)
                    saved.addProperty("lives", if (over) 3 else lives)
                    result = fields("right" to right, "over" to over)
                }
                saved.addProperty("total", total)
                if (operation == "finish") requireValid(saved.number("done") == total)
            }
            "game" -> {
                val levels = state.getAsJsonArray("levels")
                val completed = progress.number("gameScore")
                val level = levels.getOrNull(completed)?.asJsonObject
                requireValid(level != null && body.number("level") == level!!.number("level"))
                val targets = level!!.getAsJsonArray("words").map { it.asString.trim().uppercase(java.util.Locale.ROOT) }.toSet()
                val found = saved.getAsJsonArray("foundWords")?.map { it.asString.trim().uppercase(java.util.Locale.ROOT) }?.toMutableSet() ?: mutableSetOf()
                if (operation == "answer") found.add(body.text("word").trim().uppercase(java.util.Locale.ROOT))
                if (operation == "finish") found.addAll(body.getAsJsonArray("words").map { it.asString.trim().uppercase(java.util.Locale.ROOT) })
                requireValid(targets.containsAll(found))
                if (operation == "finish") {
                    requireValid(found == targets)
                    progress.addProperty("gameScore", completed + 1); progress.addProperty("gameTotal", levels.size())
                    saved.addProperty("done", 0); saved.add("foundWords", JsonArray())
                    saved.addProperty("level", levels.getOrNull(completed + 1)?.asJsonObject?.number("level"))
                    result = fields("score" to completed + 1, "total" to levels.size(), "finished" to (completed + 1 == levels.size()))
                } else {
                    saved.add("foundWords", com.google.gson.Gson().toJsonTree(found)); saved.addProperty("done", found.size)
                    saved.addProperty("total", targets.size); saved.addProperty("level", body.number("level"))
                }
            }
        }
        if (operation == "finish") {
            val finished = part != "game" || result.flag("finished")
            progress.addProperty("${part}Finished", finished)
            result.addProperty("finished", finished)
            if (part == "activity") {
                progress.addProperty("activityScore", saved.number("score")); progress.addProperty("activityTotal", total)
            }
        }
        saved.entrySet().forEach { (name, value) -> if (!result.has(name)) result.add(name, value.deepCopy()) }
        result.addProperty("pendingSync", true)
        return result
    }

    private fun recordReply(state: JsonObject, body: JsonObject, reply: JsonObject) {
        when (body.text("operation")) {
            "content" -> state.add("content", reply.deepCopy())
            "prepare-activity" -> {
                state.add("activity", reply.deepCopy())
                reply.getAsJsonObject("resume")?.let { state.getAsJsonObject("progress").obj("resume").add("activity", it.deepCopy()) }
            }
            "begin" -> {
                state.getAsJsonObject("begins").add(body.text("part"), reply.deepCopy())
                reply.getAsJsonObject("resume")?.let { state.getAsJsonObject("progress").obj("resume").add(body.text("part"), it.deepCopy()) }
            }
        }
    }
}

internal fun JsonObject.obj(name: String): JsonObject = getAsJsonObject(name) ?: JsonObject().also { add(name, it) }
private fun JsonArray.getOrNull(index: Int) = if (index in 0 until size()) get(index) else null
