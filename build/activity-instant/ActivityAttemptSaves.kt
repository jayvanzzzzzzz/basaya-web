package ph.basaya.app.ui.activity

import android.content.Context
import ph.basaya.app.data.assessment.*

internal object ActivityAttemptSaves {
    fun open(context: Context, key: String, ownsSession: () -> Boolean): ActivityAttemptQueue {
        val prefs = context.applicationContext.getSharedPreferences("activity_attempt_outbox_v1", Context.MODE_PRIVATE)
        return ActivityAttemptQueue(object : SubmissionStorage {
            override fun read(key: String) = prefs.getString(key, null)
            override fun write(key: String, value: String) {
                if (!prefs.edit().putString(key, value).commit())
                    throw AssessmentFailure(0, "Hindi ma-save ang sagot sa telepono.")
            }
            override fun remove(key: String) {
                if (!prefs.edit().remove(key).commit())
                    throw AssessmentFailure(0, "Hindi makumpirma ang lokal na tala.")
            }
        }, key, ownsSession)
    }
}
