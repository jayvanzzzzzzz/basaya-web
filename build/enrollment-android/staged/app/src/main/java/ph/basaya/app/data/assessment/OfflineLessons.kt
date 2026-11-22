package ph.basaya.app.data.assessment

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ph.basaya.app.data.database.AppDatabase
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.utils.Network as Connectivity

/** Download metadata and work are scoped to the account, class, progress session, and lesson. */
internal object OfflineLessons {
    private const val PREFS = "offline_lesson_work_v1"
    private const val JOB_ID = 4107
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncing = Mutex()

    private fun identity(uid: String, lessonId: String): String {
        val stamp = ProgressSession.stamp(uid, emptyMap())
        return "$uid:${stamp["classId"]}:${stamp["progressSession"]}${ProgressSession.participationKey(uid)}:$lessonId"
    }

    fun journal(context: Context, lessonId: String, uid: String): OfflineLessonJournal {
        val captured = identity(uid, lessonId)
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return OfflineLessonJournal(object : SubmissionStorage {
            override fun read(key: String) = prefs.getString(key, null)
            override fun write(key: String, value: String) {
                if (!prefs.edit().putString(key, value).commit()) throw AssessmentFailure(0, "Hindi ma-save ang progreso sa telepono.")
            }
            override fun remove(key: String) {
                if (!prefs.edit().remove(key).commit()) throw AssessmentFailure(0, "Hindi ma-save ang progreso sa telepono.")
            }
        }, captured) { FirebaseAuth.getInstance().currentUser?.uid == uid && identity(uid, lessonId) == captured }
    }

    fun progress(context: Context, lessonId: String): JsonObject? {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return null
        val journal = journal(context, lessonId, uid)
        return if (journal.exists()) journal.snapshot() else null
    }

    fun pending(context: Context, lessonId: String): Boolean {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return false
        val journal = journal(context, lessonId, uid)
        return journal.exists() && journal.pending()
    }

    fun issue(context: Context, lessonId: String): Boolean {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return false
        val journal = journal(context, lessonId, uid)
        return journal.exists() && journal.blocked().isNotEmpty()
    }

    /** Establish the activity key and game attempt while online; quiz can start after an offline lecture. */
    suspend fun prepareDownload(context: Context, lessonId: String) {
        val session = AssessmentSession.open(context, lessonId)
        val journal = journal(context, lessonId, session.uid)
        if (journal.exists() && journal.pending()) return
        val db = AppDatabase.getDatabase(context)
        val lesson = db.lessonDao().getLesson(lessonId) ?: error("Lesson is no longer assigned")
        val content = session.request("content")
        val progress = session.progress()
        val activity = if (!lesson.activitySkipped) session.request("prepare-activity", "activity") else JsonObject()
        val begins = JsonObject()
        if (!session.practice && !lesson.gameSkipped && !progress.flag("gameFinished")) begins.add("game", session.request("begin", "game"))
        if (!session.practice && progress.flag("lectureFinished") && !progress.flag("quizFinished")) begins.add("quiz", session.request("begin", "quiz"))
        val latest = session.progress()
        if (session.practice) latest.addProperty("lectureFinished", true)
        activity.getAsJsonObject("resume")?.let { latest.obj("resume").add("activity", it.deepCopy()) }
        begins.entrySet().forEach { (part, value) -> value.asJsonObject.getAsJsonObject("resume")?.let { latest.obj("resume").add(part, it.deepCopy()) } }
        val levels = db.crosswordLevelDao().getLevelsForLesson(lessonId).map {
            mapOf("level" to it.level, "words" to it.words.split(","))
        }
        journal.seed(fields("lessonId" to lessonId, "uid" to session.uid, "content" to content,
            "activity" to activity, "begins" to begins, "progress" to latest, "levels" to levels))
    }

    fun initialize(context: Context) {
        val app = context.applicationContext
        val manager = app.getSystemService(ConnectivityManager::class.java)
        manager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) trigger(app)
            }
        })
        FirebaseAuth.getInstance().addAuthStateListener { if (it.currentUser != null) trigger(app) }
    }

    fun trigger(context: Context) {
        scope.launch {
            try { if (sync(context.applicationContext)) schedule(context.applicationContext) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { Log.w("OfflineLessons", "Offline work remains saved", e) }
        }
    }

    fun schedule(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        if (scheduler.getPendingJob(JOB_ID) != null) return
        scheduler.schedule(
            JobInfo.Builder(JOB_ID, ComponentName(context, OfflineLessonSyncService::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
    }

    /** Returns true while a recoverable submission still needs network access. */
    suspend fun sync(context: Context): Boolean = syncing.withLock {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return@withLock false
        if (!Connectivity.isOnline(context)) return@withLock true
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lessonIds = prefs.all.values.mapNotNull { raw ->
            runCatching { Gson().fromJson(raw as String, JsonObject::class.java) }.getOrNull()
                ?.takeIf { it.text("uid") == uid }?.text("lessonId")
        }.distinct()
        var retry = false
        for (id in lessonIds) {
            if (FirebaseAuth.getInstance().currentUser?.uid != uid) break
            val journal = journal(context, id, uid)
            if (!journal.exists() || !journal.pending() || journal.blocked().isNotEmpty()) continue
            try {
                val session = AssessmentSession.open(context, id)
                session.syncOfflineWork()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (e !is AssessmentFailure || e.retryable || e.status == 401) retry = true
                Log.w("OfflineLessons", "Could not sync $id; work retained", e)
            }
        }
        retry
    }
}
