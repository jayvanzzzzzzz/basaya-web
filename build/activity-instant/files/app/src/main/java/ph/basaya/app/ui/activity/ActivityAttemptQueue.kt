package ph.basaya.app.ui.activity

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ph.basaya.app.data.assessment.*
import java.util.UUID

/** Every check is durable and keeps its ID across retries, including identical wrong guesses. */
internal class ActivityAttemptQueue(
    private val storage: SubmissionStorage,
    private val key: String,
    private val ownsSession: () -> Boolean
) {
    companion object { private val sending = Mutex() }
    private fun owner() {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
    }
    private fun read(): JsonArray = storage.read(key)?.let { JsonParser.parseString(it).asJsonArray } ?: JsonArray()

    fun enqueue(request: JsonObject, expected: JsonObject = JsonObject()) {
        owner()
        val command = request.deepCopy()
        if (command.text("operation") == "answer") command.addProperty("eventId", UUID.randomUUID().toString())
        val queue = read()
        queue.add(fields("request" to command, "expected" to expected))
        storage.write(key, queue.toString())
    }

    suspend fun drain(send: suspend (JsonObject) -> JsonObject): JsonObject? = sending.withLock {
        var last: JsonObject? = null
        while (true) {
            owner()
            val entry = read().firstOrNull()?.asJsonObject ?: break
            try {
                val result = send(entry.getAsJsonObject("request").deepCopy())
                owner()
                // Another device may have advanced the same activity. Stop before sending more.
                val expected = entry.getAsJsonObject("expected")
                if (expected.entrySet().any { (name, value) -> result.get(name) != value })
                    throw AssessmentFailure(409, "Nagbago ang progreso. Buksan muli ang pagsasanay.")
                last = result
            } catch (e: AssessmentFailure) {
                if (!e.retryable && e.status != 401) {
                    storage.write("rejected:$key", read().toString())
                    storage.remove(key)
                }
                throw e
            }
            val remaining = read()
            remaining.remove(0)
            if (remaining.size() == 0) storage.remove(key) else storage.write(key, remaining.toString())
        }
        last
    }
}
