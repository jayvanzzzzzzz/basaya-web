package ph.basaya.app.ui.game

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ph.basaya.app.data.assessment.AssessmentFailure
import ph.basaya.app.data.assessment.SubmissionStorage

/** Durable FIFO for rapid local word reveals. Only accepted commands leave the queue. */
internal class GameWordOutbox(
    private val storage: SubmissionStorage,
    private val key: String,
    private val ownsSession: () -> Boolean
) {
    companion object { private val sending = Mutex() }

    private fun owner() {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
    }

    private fun read(): JsonArray = storage.read(key)?.let {
        JsonParser.parseString(it).asJsonArray
    } ?: JsonArray()

    fun enqueue(command: JsonObject) {
        owner()
        val queue = read()
        queue.add(command.deepCopy())
        storage.write(key, queue.toString())
    }

    suspend fun drain(send: suspend (JsonObject) -> JsonObject): JsonObject? = sending.withLock {
        var last: JsonObject? = null
        while (true) {
            owner()
            val command = read().firstOrNull()?.asJsonObject ?: break
            try {
                last = send(command.deepCopy())
                owner()
            } catch (e: AssessmentFailure) {
                if (!e.retryable && e.status != 401) {
                    // Preserve rejected work, but never automatically submit later words from it.
                    storage.write("rejected:$key", read().toString())
                    storage.remove(key)
                }
                throw e
            }
            // Read again: more words may have been enqueued during the network request.
            val remaining = read()
            remaining.remove(0)
            if (remaining.size() == 0) storage.remove(key)
            else storage.write(key, remaining.toString())
        }
        last
    }
}
