package ph.basaya.app.data.assessment

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.UUID

class AssessmentFailure(val status: Int, message: String) : IOException(message) {
    val retryable: Boolean get() = status == 0 || status == 408 || status == 429 || status >= 500
}

interface SubmissionStorage {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}

/** One durable command per part. Its ID and answer survive connection loss and process death. */
class SubmissionDispatcher(
    private val storage: SubmissionStorage,
    private val ownsSession: () -> Boolean,
    private val send: suspend (JsonObject) -> JsonObject
) {
    companion object { private val mutex = Mutex() }

    private fun owner() {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase. Mag-log in muli at buksan ang aralin.")
    }

    private suspend fun transmit(key: String, command: JsonObject): JsonObject {
        owner()
        try {
            val result = send(command)
            owner()
            storage.remove(key)
            return result
        } catch (e: AssessmentFailure) {
            if (!e.retryable && e.status != 401) {
                // Retain rejected work for recovery; it must never be replayed automatically.
                storage.write("rejected:$key", command.deepCopy().apply {
                    addProperty("rejection", e.message)
                    addProperty("status", e.status)
                }.toString())
                storage.remove(key)
            }
            throw e
        }
    }

    suspend fun replay(key: String): JsonObject? = mutex.withLock {
        owner()
        storage.read(key)?.let { transmit(key, JsonParser.parseString(it).asJsonObject) }
    }

    suspend fun submit(key: String, request: JsonObject): JsonObject = mutex.withLock {
        owner()
        val existing = storage.read(key)?.let { JsonParser.parseString(it).asJsonObject }
        val command = if (existing != null) {
            fun answer(value: JsonObject) = value.deepCopy().apply { remove("eventId") }
            if ((request.has("eventId") && existing.get("eventId") != request.get("eventId")) || answer(existing) != answer(request)) throw AssessmentFailure(409,
                "May sagot pang naghihintay. Buksan muli ang aralin para maipasa ito.")
            existing
        } else request.deepCopy().apply {
            if (!has("eventId") && get("operation")?.asString in listOf("answer", "speech")) addProperty("eventId", UUID.randomUUID().toString())
            storage.write(key, toString())
        }
        transmit(key, command)
    }
}
