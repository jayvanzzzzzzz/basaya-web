package ph.basaya.app.data.assessment

import com.google.gson.JsonObject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class SubmissionDispatcherTest {
    private class Storage : SubmissionStorage {
        val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String) { values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }
    private fun answer(index: Int = 0) = JsonObject().apply {
        addProperty("operation", "answer"); addProperty("index", index)
    }
    @Test fun acceptanceIsNotReportedUntilServerResponds() = runBlocking {
        val store = Storage()
        val sent = CompletableDeferred<Unit>()
        val accepted = CompletableDeferred<JsonObject>()
        val dispatcher = SubmissionDispatcher(store, { true }) { sent.complete(Unit); accepted.await() }
        val pending = async { dispatcher.submit("alice:class:session:lesson:quiz", answer()) }
        sent.await()
        assertFalse(pending.isCompleted)
        assertEquals(1, store.values.size)
        accepted.complete(JsonObject().apply { addProperty("finished", true) })
        assertTrue(pending.await().get("finished").asBoolean)
        assertTrue(store.values.isEmpty())
    }
    @Test fun lostResponseAndProcessRestartKeepTheOriginalEventId() = runBlocking {
        val store = Storage()
        var firstId = ""
        val first = SubmissionDispatcher(store, { true }) {
            firstId = it.get("eventId").asString
            throw IOException("Connection dropped")
        }
        try { first.submit("scope", answer()); fail() } catch (_: IOException) { }
        assertNotNull(store.read("scope"))
        val restarted = SubmissionDispatcher(store, { true }) {
            assertEquals(firstId, it.get("eventId").asString)
            JsonObject()
        }
        restarted.replay("scope")
        assertNull(store.read("scope"))
    }
    @Test fun deadlineRejectionIsRetainedButNeverRetriedAutomatically() = runBlocking {
        val store = Storage()
        var calls = 0
        val dispatcher = SubmissionDispatcher(store, { true }) {
            calls++; throw AssessmentFailure(403, "This lesson is not open.")
        }
        try { dispatcher.submit("scope", answer()); fail() } catch (e: AssessmentFailure) { assertFalse(e.retryable) }
        assertNull(store.read("scope"))
        assertNotNull(store.read("rejected:scope"))
        assertNull(dispatcher.replay("scope"))
        assertEquals(1, calls)
    }
    @Test fun anotherAccountCannotReplayOrAcknowledgePendingWork() = runBlocking {
        val store = Storage()
        var owner = true
        var calls = 0
        val dispatcher = SubmissionDispatcher(store, { owner }) {
            calls++; owner = false; JsonObject()
        }
        try { dispatcher.submit("alice:scope", answer()); fail() } catch (e: AssessmentFailure) { assertEquals(401, e.status) }
        assertNotNull(store.read("alice:scope"))
        try { dispatcher.replay("alice:scope"); fail() } catch (_: AssessmentFailure) { }
        assertEquals(1, calls)
    }
    @Test fun retriesCannotReplaceAnUnacceptedAnswer() = runBlocking {
        val store = Storage()
        val dispatcher = SubmissionDispatcher(store, { true }) { throw AssessmentFailure(503, "Unavailable") }
        try { dispatcher.submit("scope", answer()); fail() } catch (_: AssessmentFailure) { }
        val original = store.read("scope")
        try { dispatcher.submit("scope", answer(1)); fail() } catch (e: AssessmentFailure) { assertEquals(409, e.status) }
        assertEquals(original, store.read("scope"))
    }
    @Test fun rejectionPolicyDistinguishesTemporaryFailures() {
        for (status in listOf(0, 408, 429, 500, 503)) assertTrue(AssessmentFailure(status, "test").retryable)
        for (status in listOf(400, 401, 403, 409)) assertFalse(AssessmentFailure(status, "test").retryable)
    }
    @Test fun durableActivityAttemptIdsArePreserved() = runBlocking {
        val store = Storage()
        val command = answer().apply { addProperty("eventId", "persisted-activity-attempt") }
        val dispatcher = SubmissionDispatcher(store, { true }) {
            assertEquals("persisted-activity-attempt", it.get("eventId").asString)
            JsonObject()
        }
        dispatcher.submit("activity", command)
        assertTrue(store.values.isEmpty())
    }
}
