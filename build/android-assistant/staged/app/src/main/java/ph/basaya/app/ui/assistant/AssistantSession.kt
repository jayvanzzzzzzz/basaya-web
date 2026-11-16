package ph.basaya.app.ui.assistant

import com.google.firebase.auth.FirebaseAuth

/** Same lifetime as the web module: memory only, never disk or saved-instance state. */
internal object AssistantSession {
    val transcript = AssistantTranscript()
    init {
        FirebaseAuth.getInstance().addAuthStateListener { transcript.clearUnless(it.currentUser?.uid) }
    }
}
