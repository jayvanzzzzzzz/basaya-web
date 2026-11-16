package ph.basaya.app.ui.assistant

/** Quotas and deadlines come from the same server as the web assistant. */
data class AssistantUsage(
    val remaining: Int?, val unlimited: Boolean,
    val nextAllowedAt: Long, val resetAt: Long
) {
    fun exhausted(now: Long) = !unlimited && remaining == 0 && now < resetAt
    fun needsRefresh(now: Long) = resetAt > 0 && now >= resetAt
}

data class AssistantMessage(val role: String, val text: String)

data class AssistantState(
    val messages: List<AssistantMessage> = emptyList(),
    val draft: String = "",
    val busy: Boolean = false,
    val checking: Boolean = false,
    val available: Boolean = false,
    val usage: AssistantUsage? = null,
    val blockUntil: Long = 0,
    val notice: String = ""
) {
    fun waitSeconds(now: Long): Long =
        ((maxOf(usage?.nextAllowedAt ?: 0, blockUntil) - now).coerceAtLeast(0) + 999) / 1000

    fun canAsk(now: Long, online: Boolean) = online && available && !busy && !checking &&
        usage != null && !usage.needsRefresh(now) && !usage.exhausted(now) &&
        waitSeconds(now) == 0L && draft.trim().length in 1..500
}
