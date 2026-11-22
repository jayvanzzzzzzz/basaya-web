package ph.basaya.app.data.progress

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot

object ProgressSession {
    private lateinit var prefs: SharedPreferences

    fun initialize(context: Context) {
        prefs = context.applicationContext.getSharedPreferences("class_progress_session", Context.MODE_PRIVATE)
    }

    fun isDropped(uid: String) = prefs.getBoolean(uid + ":dropped", false)
    fun isArchived(uid: String) = prefs.getBoolean(uid + ":archived", false)
    fun bindClass(uid: String, classroom: DocumentSnapshot) {
        prefs.edit().putString(uid + ":classVersion", classroom.getString("classVersion").orEmpty())
            .putBoolean(uid + ":archived", classroom.getBoolean("membershipClosed") == true).apply()
    }
    fun bind(uid: String, profile: DocumentSnapshot) {
        if (!profile.exists()) return
        if (prefs.getString(uid + ":class", "") != profile.getString("classId").orEmpty()) prefs.edit().remove(uid + ":classVersion").remove(uid + ":archived").apply()
        prefs.edit().putString(uid + ":enrollmentVersion", profile.getString("enrollmentVersion").orEmpty())
            .putBoolean(uid + ":dropped", profile.getString("enrollmentStatus") == "dropped")
            .putString(uid + ":class", profile.getString("classId").orEmpty())
            .putString(uid + ":session", profile.getString("progressSession").orEmpty()).apply()
    }

    fun participationKey(uid: String): String {
        val a=prefs.getString(uid + ":enrollmentVersion", "").orEmpty()
        val b=prefs.getString(uid + ":classVersion", "").orEmpty()
        return if(a.isBlank() && b.isBlank()) "" else ":$a:$b"
    }
    fun stamp(uid: String, fields: Map<String, Any>): Map<String, Any> = fields + mapOf(
        "classId" to prefs.getString(uid + ":class", "").orEmpty(),
        "progressSession" to prefs.getString(uid + ":session", "").orEmpty(),
        "enrollmentVersion" to prefs.getString(uid + ":enrollmentVersion", "").orEmpty(),
        "classVersion" to prefs.getString(uid + ":classVersion", "").orEmpty()
    )

    /** Local work belongs to a student and assessment record, never just a lesson. */
    fun gameKey(lessonId: String): String {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return "signed-out:legacy:$lessonId"
        return gameKey(lessonId, uid)
    }

    fun gameKey(lessonId: String, uid: String): String {
        require(uid.isNotBlank()) { "Crossword progress requires a signed-in student" }
        val session = prefs.getString(uid + ":session", "").orEmpty().ifBlank { "legacy" }
        return "$uid:$session:$lessonId"
    }
}
