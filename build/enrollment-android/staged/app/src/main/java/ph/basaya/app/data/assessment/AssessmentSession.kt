package ph.basaya.app.data.assessment

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import ph.basaya.app.BuildConfig
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.utils.Network
import java.util.UUID
import java.util.concurrent.TimeUnit

fun JsonObject.number(name: String, fallback: Int = 0) = get(name)?.takeUnless { it.isJsonNull }?.asInt ?: fallback
fun JsonObject.flag(name: String) = get(name)?.takeUnless { it.isJsonNull }?.asBoolean == true
fun JsonObject.text(name: String) = get(name)?.takeUnless { it.isJsonNull }?.asString.orEmpty()
fun fields(vararg values: Pair<String, Any?>): JsonObject = Gson().toJsonTree(mapOf(*values)).asJsonObject

class AssessmentSession private constructor(
    private val context: Context, val lessonId: String, val uid: String,
    private val classId: String, private val session: String, val practice: Boolean,
    private val enrollmentVersion: String, private val classVersion: String
) {
    companion object {
        private val http = OkHttpClient.Builder().callTimeout(25, TimeUnit.SECONDS).build()
        suspend fun open(context: Context, lessonId: String): AssessmentSession {
            val uid = FirebaseAuth.getInstance().currentUser?.uid ?: throw AssessmentFailure(401, "Mag-log in muli.")
            suspend fun savedSession(): AssessmentSession {
                val stamp = ProgressSession.stamp(uid, emptyMap())
                val journal = OfflineLessons.journal(context, lessonId, uid)
                if (!journal.exists()) throw AssessmentFailure(412, "I-download muli ang aralin habang may internet upang ma-save ang offline na progreso.")
                return AssessmentSession(context.applicationContext, lessonId, uid,
                    stamp["classId"].toString(), stamp["progressSession"].toString(), PracticeLessons.refresh(context, lessonId), stamp["enrollmentVersion"].toString(), stamp["classVersion"].toString())
            }
            if (!Network.isOnline(context)) return savedSession()
            val profile = try {
                FirebaseFirestore.getInstance().collection("users").document(uid).get(Source.SERVER).await()
            } catch (e: com.google.firebase.firestore.FirebaseFirestoreException) {
                if (e.code in listOf(com.google.firebase.firestore.FirebaseFirestoreException.Code.UNAVAILABLE,
                        com.google.firebase.firestore.FirebaseFirestoreException.Code.DEADLINE_EXCEEDED) &&
                    OfflineLessons.journal(context, lessonId, uid).exists()) return savedSession()
                throw e
            }
            if (FirebaseAuth.getInstance().currentUser?.uid != uid) throw AssessmentFailure(401, "Nagbago ang account.")
            ProgressSession.bind(uid, profile)
            val classroom = FirebaseFirestore.getInstance().collection("classes").document(profile.getString("classId").orEmpty()).get(Source.SERVER).await()
            ProgressSession.bindClass(uid, classroom)
            if (profile.getString("enrollmentStatus") == "dropped" || classroom.getBoolean("membershipClosed") == true) throw AssessmentFailure(403, "Nakahinto ang iyong paglahok sa klase. Makipag-ugnayan sa guro.")
            val practice = PracticeLessons.refresh(context, lessonId)
            return AssessmentSession(context, lessonId, uid, profile.getString("classId").orEmpty(),
                profile.getString("progressSession").orEmpty(), practice, profile.getString("enrollmentVersion").orEmpty(), classroom.getString("classVersion").orEmpty()).also { result ->
                if (!practice) for (part in listOf("lecture", "quiz", "activity", "game", "pronunciation")) result.dispatcher.replay(result.key(part))
            }
        }
    }

    private val preferences = context.applicationContext.getSharedPreferences("assessment_submissions_v1", Context.MODE_PRIVATE)
    private val offline by lazy { OfflineLessons.journal(context, lessonId, uid) }
    val pendingOfflineWork: Boolean get() = offline.exists() && offline.pending()
    private val versionKey=if(enrollmentVersion.isBlank() && classVersion.isBlank()) "" else ":$enrollmentVersion:$classVersion"
    private fun key(part: String) = "$uid:$classId:$session$versionKey:$lessonId:$part"
    private fun ownsSession() = FirebaseAuth.getInstance().currentUser?.uid == uid &&
        ProgressSession.stamp(uid, emptyMap())["classId"] == classId &&
        ProgressSession.stamp(uid, emptyMap())["progressSession"] == session &&
        ProgressSession.stamp(uid, emptyMap())["enrollmentVersion"] == enrollmentVersion &&
        ProgressSession.stamp(uid, emptyMap())["classVersion"] == classVersion &&
        !ProgressSession.isDropped(uid) && !ProgressSession.isArchived(uid)
    private val dispatcher = SubmissionDispatcher(object : SubmissionStorage {
        override fun read(key: String) = preferences.getString(key, null)
        override fun write(key: String, value: String) {
            if (!preferences.edit().putString(key, value).commit()) throw AssessmentFailure(0, "Hindi ma-save sa telepono. Magbakante ng storage at subukan muli.")
        }
        override fun remove(key: String) {
            if (!preferences.edit().remove(key).commit()) throw AssessmentFailure(0, "Hindi makumpirma ang lokal na tala. Subukan muli.")
        }
    }, ::ownsSession, ::send)

    private suspend fun send(body: JsonObject): JsonObject {
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
        val user = FirebaseAuth.getInstance().currentUser ?: throw AssessmentFailure(401, "Mag-log in muli.")
        val token = try { user.getIdToken(false).await().token }
        catch (e: com.google.firebase.FirebaseNetworkException) { throw AssessmentFailure(0, "Naka-save ang progreso. Hinihintay ang internet.") }
        catch (e: com.google.firebase.auth.FirebaseAuthException) { throw AssessmentFailure(401, "Mag-log in muli.") }
            ?: throw AssessmentFailure(401, "Mag-log in muli.")
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
        return withContext(Dispatchers.IO) {
            val request = Request.Builder().url(BuildConfig.MEMBERSHIP_API_URL.trimEnd('/') + "/api/assessment")
                .header("Authorization", "Bearer $token")
                .post(body.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(request).execute().use { response ->
                val json = runCatching { JsonParser.parseString(response.body?.string().orEmpty()).asJsonObject }.getOrNull()
                if (!response.isSuccessful) throw AssessmentFailure(response.code, json?.text("error").orEmpty()
                    .ifBlank { "Hindi makumpirma ang sagot. Subukan muli." })
                val accepted = json ?: throw AssessmentFailure(0, "Hindi makumpirma ang tugon ng server. Subukan muli.")
                if (body.text("operation") == "finish" && (!accepted.has("finished") ||
                    (body.text("part") != "lecture" && (!accepted.has("score") || !accepted.has("total")))))
                    throw AssessmentFailure(0, "Hindi pa nakumpirma ang resulta ng server. Subukan muli.")
                accepted
            }
        }
    }

    suspend fun request(operation: String, part: String = "", extra: JsonObject = JsonObject()): JsonObject {
        val body = fields("operation" to operation, "classId" to classId, "progressSession" to session,
            "lessonId" to PracticeLessons.contentId(lessonId), "enrollmentVersion" to enrollmentVersion, "classVersion" to classVersion)
        if (part.isNotEmpty()) body.addProperty("part", part)
        if (practice) {
            body.addProperty("practice", true)
            body.addProperty("entryId", lessonId)
        }
        extra.entrySet().forEach { body.add(it.key, it.value) }
        if (offline.exists() && (!practice || !Network.isOnline(context)) && (operation in listOf("content", "prepare-activity", "begin") ||
                part in listOf("lecture", "quiz", "activity", "game"))) {
            if (operation == "answer" && !body.has("eventId")) body.addProperty("eventId", UUID.randomUUID().toString())
            val result = offline.exchange(body, Network.isOnline(context), ::send)
            if (offline.pending()) OfflineLessons.schedule(context)
            return result
        }
        return if (!practice && operation in listOf("answer", "speech", "resume", "finish")) dispatcher.submit(key(part), body) else send(body)
    }

    suspend fun progress(): JsonObject {
        if (practice) return JsonObject()
        if (offline.exists()) {
            if (!Network.isOnline(context)) return offline.snapshot()
            try { syncOfflineWork(); return offline.snapshot() }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: java.io.IOException) { if (e is AssessmentFailure && !e.retryable) throw e; return offline.snapshot() }
            catch (e: com.google.firebase.firestore.FirebaseFirestoreException) {
                if (e.code in listOf(com.google.firebase.firestore.FirebaseFirestoreException.Code.UNAVAILABLE,
                        com.google.firebase.firestore.FirebaseFirestoreException.Code.DEADLINE_EXCEEDED)) return offline.snapshot()
                throw e
            }
        }
        return remoteProgress()
    }

    internal suspend fun syncOfflineWork() {
        if (!offline.exists()) return
        offline.replay(::send)
        if (!practice) offline.recordProgress(remoteProgress())
    }

    private suspend fun remoteProgress(): JsonObject {
        val doc = FirebaseFirestore.getInstance().collection("users").document(uid)
            .collection("assignedLessons").document(PracticeLessons.contentId(lessonId)).get(Source.SERVER).await()
        if (!ownsSession()) throw AssessmentFailure(401, "Nagbago ang account o klase.")
        if (doc.metadata.hasPendingWrites()) throw AssessmentFailure(0, "Hinihintay ang kumpirmadong progreso ng server.")
        return Gson().toJsonTree(doc.data ?: emptyMap<String, Any>()).asJsonObject.apply {
            val resume = getAsJsonObject("resume")
            val state = getAsJsonObject("assessmentState")
            for (part in listOf("lecture", "quiz", "activity", "game", "pronunciation"))
                if (state?.has(part) != true) resume?.remove(part)
        }
    }

    suspend fun finish(part: String, extra: JsonObject = JsonObject()): JsonObject {
        val result = request("finish", part, extra)
        if (!result.flag("finished") && part != "game") throw AssessmentFailure(0, "Hindi pa nakumpirma ang pagkumpleto. Subukan muli.")
        return result
    }
}
