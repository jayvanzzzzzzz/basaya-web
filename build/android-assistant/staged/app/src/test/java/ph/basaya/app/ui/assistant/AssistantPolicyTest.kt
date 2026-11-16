package ph.basaya.app.ui.assistant

import org.junit.Assert.*
import org.junit.Test

class AssistantPolicyTest {
    private val now = 100_000L
    private val ready = AssistantState(draft = "Paano sumali?", available = true,
        usage = AssistantUsage(2, false, 0, 200_000))

    @Test fun requiresAuthenticatedStatusAndConnectivity() {
        assertTrue(ready.canAsk(now, true))
        assertFalse(ready.canAsk(now, false))
        assertFalse(ready.copy(usage = null).canAsk(now, true))
        assertFalse(ready.copy(available = false).canAsk(now, true))
        assertFalse(ready.copy(busy = true).canAsk(now, true))
        assertFalse(ready.copy(checking = true).canAsk(now, true))
    }
    @Test fun respectsServerQuotaAndRequiresRefreshAtReset() {
        val exhausted = ready.copy(usage = ready.usage!!.copy(remaining = 0))
        assertFalse(exhausted.canAsk(now, true))
        assertFalse(exhausted.canAsk(200_000, true))
        assertTrue(exhausted.usage!!.needsRefresh(200_000))
        assertTrue(ready.copy(usage = ready.usage!!.copy(remaining = null, unlimited = true)).canAsk(now, true))
    }
    @Test fun usesLaterOfCooldownAndProviderRetry() {
        val blocked = ready.copy(usage = ready.usage!!.copy(nextAllowedAt = now + 1000), blockUntil = now + 2501)
        assertEquals(3L, blocked.waitSeconds(now))
        assertFalse(blocked.canAsk(now + 2500, true))
        assertTrue(blocked.canAsk(now + 2501, true))
    }
    @Test fun rejectsBlankAndOversizedQuestions() {
        assertFalse(ready.copy(draft = " \n ").canAsk(now, true))
        assertFalse(ready.copy(draft = "a".repeat(501)).canAsk(now, true))
        assertTrue(ready.copy(draft = "a".repeat(500)).canAsk(now, true))
    }
}
