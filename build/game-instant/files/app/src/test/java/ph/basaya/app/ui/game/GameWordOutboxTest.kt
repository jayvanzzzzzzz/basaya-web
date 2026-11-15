package ph.basaya.app.ui.game

import com.google.gson.JsonObject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import ph.basaya.app.data.assessment.*
import java.io.IOException

class GameWordOutboxTest {
    private class Storage : SubmissionStorage {
        val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String) { values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }
    private fun word(value: String) = fields("operation" to "answer", "word" to value)

    @Test fun rapidWordsRemainAvailableWhileTheFirstSaveIsWaiting() = runBlocking {
        val storage = Storage()
        val queue = GameWordOutbox(storage, "student:session:lesson", { true })
        queue.enqueue(word("BASA"))
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val received = mutableListOf<String>()
        val saving = async {
            queue.drain {
                received += it.text("word")
                if (received.size == 1) { entered.complete(Unit); release.await() }
                JsonObject()
            }
        }
        entered.await()
        queue.enqueue(word("SAYA"))
        assertFalse(saving.isCompleted)
        release.complete(Unit)
        saving.await()
        assertEquals(listOf("BASA", "SAYA"), received)
        assertTrue(storage.values.isEmpty())
    }

    @Test fun restartReplaysEveryPendingWordAndFinishInOrder() = runBlocking {
        val storage = Storage()
        val queue = GameWordOutbox(storage, "scope", { true })
        queue.enqueue(word("BASA"))
        queue.enqueue(word("SAYA"))
        queue.enqueue(fields("operation" to "finish", "words" to listOf("BASA", "SAYA")))
        try { queue.drain { throw IOException("offline") }; fail() } catch (_: IOException) { }
        val received = mutableListOf<String>()
        GameWordOutbox(storage, "scope", { true }).drain {
            received += it.text("operation") + ":" + it.text("word")
            fields("finished" to true)
        }
        assertEquals(listOf("answer:BASA", "answer:SAYA", "finish:"), received)
        assertTrue(storage.values.isEmpty())
    }

    @Test fun rejectedWorkIsArchivedAndLaterWordsAreNotSent() = runBlocking {
        val storage = Storage()
        val queue = GameWordOutbox(storage, "scope", { true })
        queue.enqueue(word("BASA")); queue.enqueue(word("SAYA"))
        var sent = 0
        try { queue.drain { sent++; throw AssessmentFailure(403, "closed") }; fail() }
        catch (_: AssessmentFailure) { }
        assertEquals(1, sent)
        assertNull(storage.read("scope"))
        assertNotNull(storage.read("rejected:scope"))
    }

    @Test fun accountChangeKeepsPendingWorkWithoutSendingIt() = runBlocking {
        val storage = Storage()
        var owns = true
        val queue = GameWordOutbox(storage, "scope", { owns })
        queue.enqueue(word("BASA"))
        owns = false
        try { queue.drain { fail("Must not send another student's work"); JsonObject() }; fail() }
        catch (e: AssessmentFailure) { assertEquals(401, e.status) }
        assertNotNull(storage.read("scope"))
    }
}
