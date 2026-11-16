package ph.basaya.app.ui.assistant

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Retains the draft and in-flight request across rotation, exclusively in memory. */
class AssistantViewModel : ViewModel() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val uid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    private val mutableState = MutableStateFlow(AssistantState(messages = AssistantSession.transcript.read(uid)))
    val state = mutableState.asStateFlow()

    fun draft(value: String) { mutableState.update { it.copy(draft = value.take(500)) } }
    fun help(open: Boolean) { mutableState.update { it.copy(helpOpen = open) } }
    fun search(value: String) { mutableState.update { it.copy(helpQuery = value) } }
    private fun remember() { AssistantSession.transcript.save(uid, mutableState.value.messages) }

    fun refresh() {
        if (mutableState.value.busy || mutableState.value.checking || uid.isBlank()) return
        mutableState.update { it.copy(checking = true) }
        scope.launch {
            try {
                val result = AssistantClient.request(uid)
                mutableState.update { it.copy(usage = result.usage, available = result.available, notice = "") }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                mutableState.update { it.copy(available = false,
                    notice = (e as? AssistantFailure)?.message ?: "Hindi makakonekta. Buksan ang Mga gabay o suriin muli ang koneksyon.") }
            } finally { mutableState.update { it.copy(checking = false, ready = true) } }
        }
    }

    fun send(online: Boolean, animate: Boolean = true) {
        val before = mutableState.value
        if (!before.canAsk(System.currentTimeMillis(), online)) return
        val question = before.draft.trim()
        mutableState.update { it.copy(busy = true, draft = "", notice = "",
            messages = (it.messages + AssistantMessage("user", question)).takeLast(20)) }
        remember()
        scope.launch {
            try {
                val result = AssistantClient.request(uid, question)
                val answer = AssistantMessage("assistant", result.answer)
                mutableState.update { it.copy(usage = result.usage, available = true,
                    messages = (it.messages + answer).takeLast(20),
                    revealingId = if (animate) answer.id else null, visibleAnswer = "") }
                // Store the complete answer before revealing. Returning never replays an old reply.
                remember()
                if (animate) {
                    val sentences = assistantSentences(result.answer)
                    var visible = ""
                    for ((index, sentence) in sentences.withIndex()) {
                        visible += sentence
                        mutableState.update { it.copy(visibleAnswer = visible) }
                        delay(if (index < sentences.lastIndex) 500 else 300)
                    }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val failure = e as? AssistantFailure
                val retry = failure?.retryAt?.takeIf { it > 0 } ?: (System.currentTimeMillis() + 10_000)
                val message = failure?.message ?: "Hindi makuha ang sagot. Suriin ang koneksyon at subukan muli."
                mutableState.update { it.copy(draft = question, blockUntil = retry,
                    notice = if (failure?.code == "not_configured") message else "",
                    available = if (failure?.code in listOf("auth", "student_only", "not_configured")) false else it.available,
                    usage = if (failure?.code == "student_limit") it.usage?.copy(remaining = 0, resetAt = retry) else it.usage,
                    messages = (it.messages + AssistantMessage("error", message)).takeLast(20)) }
                remember()
            } finally { mutableState.update { it.copy(busy = false, revealingId = null, visibleAnswer = "") } }
            // Reconcile attempts after an unknown/failed outcome; status never asks the AI again.
            if (mutableState.value.messages.lastOrNull()?.role == "error") {
                val notice = mutableState.value.notice
                mutableState.update { it.copy(checking = true) }
                try {
                    val result = AssistantClient.request(uid)
                    mutableState.update { it.copy(usage = result.usage, available = result.available, notice = notice) }
                } catch (e: CancellationException) { throw e }
                catch (_: Exception) { /* The original message and conservative retry deadline remain visible. */ }
                finally { mutableState.update { it.copy(checking = false) } }
            }
        }
    }

    override fun onCleared() { scope.cancel() }
}
