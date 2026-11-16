package ph.basaya.app.ui.assistant

/** Quotas and deadlines come from the same server as the web assistant. */
data class AssistantUsage(
    val remaining: Int?, val unlimited: Boolean,
    val nextAllowedAt: Long, val resetAt: Long
) {
    fun exhausted(now: Long) = !unlimited && remaining == 0 && now < resetAt
    fun needsRefresh(now: Long) = resetAt > 0 && now >= resetAt
}

private val assistantMessageIds = java.util.concurrent.atomic.AtomicLong()
data class AssistantMessage(val role: String, val text: String, val id: Long = assistantMessageIds.incrementAndGet())

/** Process-memory transcript, cleared when the authenticated account changes. */
class AssistantTranscript {
    private var owner: String? = null
    private var messages = emptyList<AssistantMessage>()
    fun read(uid: String): List<AssistantMessage> {
        if (owner != uid) { owner = uid; messages = emptyList() }
        return messages
    }
    fun save(uid: String, value: List<AssistantMessage>) {
        if (uid == owner) messages = value.takeLast(20)
    }
    fun clearUnless(uid: String?) { if (owner != uid) { owner = uid; messages = emptyList() } }
}

fun assistantSentences(text: String): List<String> {
    val iterator = java.text.BreakIterator.getSentenceInstance(java.util.Locale.forLanguageTag("fil"))
    iterator.setText(text)
    val result = mutableListOf<String>()
    var start = iterator.first()
    var end = iterator.next()
    while (end != java.text.BreakIterator.DONE) {
        result.add(text.substring(start, end)); start = end; end = iterator.next()
    }
    return result.ifEmpty { listOf(text) }
}

data class AssistantState(
    val messages: List<AssistantMessage> = emptyList(),
    val draft: String = "",
    val busy: Boolean = false,
    val checking: Boolean = false,
    val available: Boolean = false,
    val usage: AssistantUsage? = null,
    val blockUntil: Long = 0,
    val notice: String = "",
    val ready: Boolean = false,
    val revealingId: Long? = null,
    val visibleAnswer: String = "",
    val helpOpen: Boolean = false,
    val helpQuery: String = ""
) {
    fun waitSeconds(now: Long): Long =
        ((maxOf(usage?.nextAllowedAt ?: 0, blockUntil) - now).coerceAtLeast(0) + 999) / 1000

    fun canAsk(now: Long, online: Boolean) = online && ready && available && !busy && !checking &&
        usage != null && !usage.needsRefresh(now) && !usage.exhausted(now) &&
        waitSeconds(now) == 0L && draft.trim().length in 1..500
}
