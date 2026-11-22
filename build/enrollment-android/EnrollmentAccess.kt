package ph.basaya.app.data.membership

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.os.Bundle
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.ui.MainActivity
import java.lang.ref.WeakReference

/** A dropped enrollment is distinct from account deactivation and leaving. */
object EnrollmentAccess : Application.ActivityLifecycleCallbacks {
    private lateinit var app: Application
    private var profileListener: ListenerRegistration? = null
    private var classListener: ListenerRegistration? = null
    private var currentClass: String? = null
    private var foreground = WeakReference<Activity>(null)
    private val observers = mutableSetOf<() -> Unit>()
    var dropped = false; private set
    var archived = false; private set
    val blocked get() = dropped || archived
    val message get() = if (dropped)
        "Dropped ang iyong enrollment. Napanatili ang iyong na-save na progreso. Makipag-ugnayan sa iyong guro upang humiling na ma-enroll muli."
        else "Naka-archive ang klase. Napanatili ang iyong progreso. Magpapatuloy ang mga aralin kapag ibinalik ng guro ang klase."

    fun initialize(application: Application) {
        app=application
        app.registerActivityLifecycleCallbacks(this)
        FirebaseAuth.getInstance().addAuthStateListener { auth ->
            profileListener?.remove(); classListener?.remove();currentClass=null
            dropped=false;archived=false
            val uid=auth.currentUser?.uid
            if(uid!=null) {
                dropped=ProgressSession.isDropped(uid);archived=ProgressSession.isArchived(uid)
                profileListener=FirebaseFirestore.getInstance().collection("users").document(uid).addSnapshotListener { doc, _ ->
                    if(doc==null || !doc.exists() || auth.currentUser?.uid!=uid)return@addSnapshotListener
                    ProgressSession.bind(uid,doc)
                    dropped=doc.getString("enrollmentStatus")=="dropped"
                    val classId=doc.getString("classId").orEmpty()
                    if(currentClass!=classId) {
                        currentClass=classId;classListener?.remove();archived=false
                        if(classId.isNotBlank())classListener=FirebaseFirestore.getInstance().collection("classes").document(classId).addSnapshotListener { classroom, _ ->
                            if(classroom==null || currentClass!=classId)return@addSnapshotListener
                            ProgressSession.bindClass(uid,classroom)
                            archived=classroom.getBoolean("membershipClosed")==true
                            changed()
                        }
                    }
                    changed()
                }
            }
            changed()
        }
    }
    fun observe(callback: () -> Unit): () -> Unit { observers.add(callback);return {observers.remove(callback);Unit} }
    private fun changed() { observers.toList().forEach { it() };foreground.get()?.let(::enforce) }
    private fun enforce(activity: Activity) {
        if(!blocked || activity.isFinishing)return
        if(activity.javaClass.simpleName in setOf("DashboardActivity","LectureActivity","CrosswordActivity","PracticeActivity","QuizActivity","PronunciationActivity","ReadingActivity")) {
            activity.startActivity(Intent(activity,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            activity.finish()
        }
    }
    override fun onActivityResumed(activity: Activity) {foreground=WeakReference(activity);enforce(activity)}
    override fun onActivityPaused(activity: Activity) {if(foreground.get()===activity)foreground.clear()}
    override fun onActivityCreated(activity: Activity,state: Bundle?) {}
    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity,state: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
}
