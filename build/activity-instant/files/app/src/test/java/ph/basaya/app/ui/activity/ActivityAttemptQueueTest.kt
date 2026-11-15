package ph.basaya.app.ui.activity

import com.google.gson.JsonObject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import ph.basaya.app.data.assessment.*
import java.io.IOException

class ActivityAttemptQueueTest {
    private class Storage : SubmissionStorage {
        val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String) { values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }
    private fun answer() = fields("operation" to "answer", "index" to 0, "selected" to listOf(0))

    @Test fun aLostReplyRetainsTheSameIdAfterRestart() = runBlocking {
        val storage = Storage()
        val queue = ActivityAttemptQueue(storage, "scope", { true })
        queue.enqueue(answer())
        var firstId = ""
        try { queue.drain { firstId = it.text("eventId"); throw IOException("lost reply") }; fail() }
        catch (_: IOException) { }
        ActivityAttemptQueue(storage, "scope", { true }).drain {
            assertEquals(firstId, it.text("eventId")); JsonObject()
        }
        assertTrue(storage.values.isEmpty())
    }

    @Test fun repeatedIdenticalWrongGuessesAreDistinctAttempts() = runBlocking {
        val storage = Storage()
        val queue = ActivityAttemptQueue(storage, "scope", { true })
        queue.enqueue(answer()); queue.enqueue(answer()); queue.enqueue(answer())
        val ids = mutableSetOf<String>()
        queue.drain { ids += it.text("eventId"); JsonObject() }
        assertEquals(3, ids.size)
    }

    @Test fun rapidAttemptsAndFinishStayInOrderWhileTheFirstRequestWaits() = runBlocking {
        val storage = Storage()
        val queue = ActivityAttemptQueue(storage, "scope", { true })
        queue.enqueue(answer())
        val entered = CompletableDeferred<Unit>(); val release = CompletableDeferred<Unit>()
        val operations = mutableListOf<String>()
        val sending = async {
            queue.drain {
                operations += it.text("operation")
                if (operations.size == 1) { entered.complete(Unit); release.await() }
                JsonObject()
            }
        }
        entered.await()
        queue.enqueue(answer()); queue.enqueue(fields("operation" to "finish"))
        assertFalse(sending.isCompleted)
        release.complete(Unit); sending.await()
        assertEquals(listOf("answer", "answer", "finish"), operations)
    }

    @Test fun serverStateMismatchArchivesAndStopsLaterAttempts() = runBlocking {
        val storage = Storage()
        val queue = ActivityAttemptQueue(storage, "scope", { true })
        queue.enqueue(answer(), fields("lives" to 2))
        queue.enqueue(answer())
        var sends = 0
        try { queue.drain { sends++; fields("lives" to 1) }; fail() }
        catch (e: AssessmentFailure) { assertEquals(409, e.status) }
        assertEquals(1, sends)
        assertNull(storage.read("scope")); assertNotNull(storage.read("rejected:scope"))
    }

    @Test fun changingAccountPreventsSendingAndRetainsTheQueue() = runBlocking {
        val storage = Storage(); var owns = true
        val queue = ActivityAttemptQueue(storage, "scope", { owns })
        queue.enqueue(answer()); owns = false
        try { queue.drain { fail("Must not send"); JsonObject() }; fail() }
        catch (e: AssessmentFailure) { assertEquals(401, e.status) }
        assertNotNull(storage.read("scope"))
    }
}
