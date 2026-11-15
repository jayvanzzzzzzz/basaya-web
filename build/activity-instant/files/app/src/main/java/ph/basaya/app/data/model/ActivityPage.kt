package ph.basaya.app.data.model

data class ActivityPage(
    val words: List<String> = emptyList(),
    val correctIndices: List<Int> = emptyList(),
    // Per-page explanation written in basaya-web. Nullable because pages cached in Room before this field existed deserialize it as null.
    val explanation: String? = null,
    val pickCount: Int? = null,
    val answerKeyLoaded: Boolean = false
)
