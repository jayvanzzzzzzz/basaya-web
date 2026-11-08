package ph.basaya.app.ui.pronunciation

import android.content.Context
import android.util.Base64
import android.util.AtomicFile
import com.google.firebase.auth.FirebaseAuth
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import ph.basaya.app.BuildConfig
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit

/** A device draft and ordered outbox. Server revisions prevent cross-device overwrites. */
class ReadingSession(private val context: Context, private val lessonId: String) {
    companion object {
        fun hasDraft(context: Context, lessonId: String): Boolean {
            val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return false
            val scope = ProgressSession.stamp(uid, emptyMap())
            val identity = "$uid:${scope["classId"]}:${scope["progressSession"]}:$lessonId"
            val hash = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
            return File(context.filesDir, "reading_drafts/$hash/draft.json").exists()
        }
    }
    private val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Mag-log in muli.")
    private val scope = ProgressSession.stamp(uid, emptyMap())
    private val classId = scope["classId"].toString()
    private val progressSession = scope["progressSession"].toString()
    private val identity = "$uid:$classId:$progressSession:$lessonId"
    private val hash = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
    private val directory = File(context.filesDir, "reading_drafts/$hash").apply { mkdirs() }
    private val file = AtomicFile(File(directory, "draft.json"))
    private val http = OkHttpClient.Builder().callTimeout(40, TimeUnit.SECONDS).build()
    private val lock = Mutex()
    private var draft = JsonObject()
    val state: JsonObject get() = draft.getAsJsonObject("state")
    val pending: Boolean get() = draft.getAsJsonArray("queue").size() > 0

    private fun owns() = FirebaseAuth.getInstance().currentUser?.uid == uid &&
        ProgressSession.stamp(uid, emptyMap())["classId"] == classId &&
        ProgressSession.stamp(uid, emptyMap())["progressSession"] == progressSession

    suspend fun open() {
        if (file.baseFile.exists()) draft = withContext(Dispatchers.IO) { JsonParser.parseString(file.openRead().bufferedReader().use { it.readText() }).asJsonObject }
        if (draft.has("state") && draft.getAsJsonArray("queue").any { it.asJsonObject.text("operation") == "word" }) {
            val accepted = send("begin")
            withContext(Dispatchers.IO) { File(directory, "backup-${System.currentTimeMillis()}.json").writeText(draft.toString()) }
            draft.add("state", accepted); draft.add("queue", JsonArray()); save()
        }
        if (!draft.has("state")) {
            val state = send("begin")
            draft = fields("state" to state, "queue" to emptyList<Any>(), "clips" to emptyMap<String, String>())
            save()
        } else if (!pending) {
            runCatching { draft.add("state", send("begin")); save() }
        }
    }

    private fun save() {
        check(owns()) { "Nagbago ang account o klase. Buksan muli ang aralin." }
        var output: java.io.FileOutputStream? = null
        try { output = file.startWrite(); output.write(draft.toString().toByteArray()); file.finishWrite(output) }
        catch (error: Exception) { if (output != null) file.failWrite(output); throw error }
    }

    suspend fun act(operation: String, wav: ByteArray? = null) {
        require(operation != "word") { "Kailangang masuri muna ang pagbigkas ng salita." }
        val before = draft.deepCopy()
        val eventId = UUID.randomUUID().toString()
        val current = state
        val page = current.number("page")
        val item = fields("operation" to operation, "revision" to current.number("revision"), "page" to page, "word" to current.number("word"), "eventId" to eventId)
        if (wav != null) {
            withContext(Dispatchers.IO) {
                val audioFile = AtomicFile(File(directory, "$eventId.wav"))
                val output = audioFile.startWrite()
                try { output.write(wav); audioFile.finishWrite(output) }
                catch (error: Exception) { audioFile.failWrite(output); throw error }
            }
            item.addProperty("file", "$eventId.wav")
            draft.getAsJsonObject("clips").addProperty(page.toString(), eventId)
        }
        draft.getAsJsonArray("queue").add(item)
        when (operation) {
            "listen" -> current.addProperty("stage", "record")
            "upload" -> {
                current.addProperty("stage", "preview")
                current.getAsJsonArray("clips").set(page, fields("eventId" to eventId))
            }
            "next" -> {
                current.addProperty("page", page + 1); current.addProperty("word", 0)
                current.addProperty("stage", if (current.getAsJsonArray("pages")[page + 1].asJsonObject.getAsJsonArray("words").size() > 0) "words" else "sentence")
            }
        }
        current.addProperty("revision", current.number("revision") + 1)
        try { save() } catch (error: Exception) { draft = before; throw error }
    }

    suspend fun sync() = lock.withLock {
        while (pending) {
            val queue = draft.getAsJsonArray("queue")
            val item = queue[0].asJsonObject
            val extra = item.deepCopy(); extra.remove("operation"); extra.remove("file")
            if (item.text("operation") == "upload") extra.addProperty("audio", withContext(Dispatchers.IO) { Base64.encodeToString(File(directory, item.text("file")).readBytes(), Base64.NO_WRAP) })
            val accepted = send(item.text("operation"), extra)
            queue.remove(0)
            if (!pending) draft.add("state", accepted)
            save()
        }
    }

    suspend fun submit() {
        sync()
        draft.add("state", send("submit", fields("revision" to state.number("revision"), "page" to state.number("page"), "eventId" to UUID.randomUUID().toString())))
        save()
    }

    suspend fun checkWord(wav: ByteArray): JsonObject {
        sync()
        check(state.text("stage") == "words") { "Na-update ang iyong progreso. Sundin ang kasalukuyang pahina." }
        // The older API consumes attempts without recognizing speech. Probe it
        // before sending audio, including when a draft has cached a newer API.
        val ready=send("begin")
        requireWordVerification(ready)
        if(ready.number("revision") != state.number("revision") || ready.number("page") != state.number("page") || ready.number("word") != state.number("word") || ready.text("stage") != state.text("stage")) {
            refresh()
            throw IllegalStateException("Na-update ang iyong progreso. Pakinggan at bigkasin ang kasalukuyang salita.")
        }
        val extra = fields("revision" to state.number("revision"), "page" to state.number("page"), "word" to state.number("word"),
            "eventId" to UUID.randomUUID().toString(), "audio" to Base64.encodeToString(wav, Base64.NO_WRAP))
        val accepted = try { send("word", extra) }
        catch (error: AssessmentFailure) {
            if (error.status == 409) {
                refresh()
                throw IllegalStateException("Na-update ang iyong progreso. Pakinggan at bigkasin ang kasalukuyang salita.")
            }
            throw error
        }
        requireWordVerification(accepted)
        check(accepted.get("wordAccepted")?.let { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean } == true) { "Hindi makumpirma ang pagbigkas. Subukan muli." }
        if (accepted.flag("wordAccepted")) { draft.add("state", accepted); save() }
        return accepted
    }

    private fun requireWordVerification(response:JsonObject) {
        check(response.get("wordVerification")?.let { it.isJsonPrimitive && it.asJsonPrimitive.isNumber && it.asInt == 1 } == true) { "Hindi pa handa ang pagsuri ng pagbigkas. Subukan muli mamaya." }
    }

    suspend fun refresh() = lock.withLock {
        val accepted = send("begin")
        if(state.text("stage") == "words") requireWordVerification(accepted)
        withContext(Dispatchers.IO) { File(directory, "backup-${System.currentTimeMillis()}.json").writeText(draft.toString()) }
        draft.add("state", accepted); draft.add("queue", JsonArray()); save()
    }

    fun localClip(): File? {
        val page = state.number("page")
        val id = draft.getAsJsonObject("clips").get(page.toString())?.asString ?: return null
        val expected = state.getAsJsonArray("clips")[page].takeUnless { it.isJsonNull }?.asJsonObject?.text("eventId")
        return File(directory, "$id.wav").takeIf { it.exists() && id == expected }
    }
    suspend fun remoteClip() = send("play-own", fields("page" to state.number("page"))).text("recordingUrl")

    private suspend fun send(operation: String, extra: JsonObject = JsonObject()): JsonObject {
        check(owns()) { "Nagbago ang account o klase." }
        val user = FirebaseAuth.getInstance().currentUser ?: error("Mag-log in muli.")
        val token = user.getIdToken(false).await().token ?: error("Mag-log in muli.")
        val body = fields("operation" to "fluency-$operation", "classId" to classId, "progressSession" to progressSession, "lessonId" to PracticeLessons.contentId(lessonId))
        if (PracticeLessons.isPractice(lessonId)) { body.addProperty("practice", true); body.addProperty("entryId", lessonId) }
        extra.entrySet().forEach { body.add(it.key, it.value) }
        return withContext(Dispatchers.IO) {
            check(owns()) { "Nagbago ang account o klase." }
            val request = Request.Builder().url(BuildConfig.MEMBERSHIP_API_URL.trimEnd('/') + "/api/assessment")
                .header("Authorization", "Bearer $token").post(body.toString().toRequestBody("application/json".toMediaType())).build()
            http.newCall(request).execute().use { response ->
                val json = runCatching { JsonParser.parseString(response.body?.string().orEmpty()).asJsonObject }.getOrNull()
                if (!response.isSuccessful) throw AssessmentFailure(response.code, json?.text("error").orEmpty().ifBlank { "Hindi ma-upload. Naka-save ang draft sa device." })
                json ?: error("Hindi makumpirma ang tugon. Subukan muli.")
            }
        }
    }
}
