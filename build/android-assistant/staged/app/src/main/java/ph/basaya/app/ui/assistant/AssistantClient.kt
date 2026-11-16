package ph.basaya.app.ui.assistant

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import ph.basaya.app.BuildConfig
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AssistantFailure(val code: String, message: String, val retryAt: Long = 0) : IOException(message)
data class AssistantResult(val usage: AssistantUsage, val available: Boolean, val answer: String)

/** Only Firebase ID tokens go to our existing backend. No provider key or transcript in the app. */
object AssistantClient {
    private val client = OkHttpClient.Builder().callTimeout(35, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false).build()

    suspend fun request(uid: String, question: String? = null): AssistantResult {
        val user = FirebaseAuth.getInstance().currentUser?.takeIf { it.uid == uid }
            ?: throw AssistantFailure("auth", "Mag-sign in muli para magtanong.")
        val token = user.getIdToken(false).await().token
            ?: throw AssistantFailure("auth", "Mag-sign in muli para magtanong.")
        val payload = JSONObject().apply {
            if (question == null) put("action", "status") else put("question", question)
        }
        val request = Request.Builder()
            .url(BuildConfig.MEMBERSHIP_API_URL.trimEnd('/') + "/api/assistant")
            .header("Authorization", "Bearer $token")
            .post(payload.toString().toRequestBody("application/json".toMediaType())).build()
        val call = client.newCall(request)
        val response = suspendCancellableCoroutine<Response> { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }
                override fun onResponse(call: Call, response: Response) {
                    continuation.resume(response) { _, value, _ -> value.close() }
                }
            })
        }
        return response.use {
            val raw = withContext(Dispatchers.IO) { it.body?.string().orEmpty() }
            val json = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (FirebaseAuth.getInstance().currentUser?.uid != uid)
                throw AssistantFailure("auth", "Nagbago ang account. Buksan muli ang Assistant.")
            if (!it.isSuccessful) {
                if (it.code == 401) throw AssistantFailure("auth", "Mag-sign in muli para magtanong.")
                throw AssistantFailure(json.optString("code"),
                    json.optString("error").ifBlank { "Hindi makasagot ngayon. Subukan muli o buksan ang Mga gabay." },
                    json.optLong("retryAt"))
            }
            val unlimited = json.optBoolean("unlimited")
            val remaining = if (json.isNull("remaining")) null else json.getInt("remaining").coerceAtLeast(0)
            if ((!unlimited && remaining == null) || !json.has("resetAt") ||
                (question == null && !json.has("available")) ||
                (question != null && json.optString("answer").isBlank()))
                throw IOException("Hindi makumpirma ang sagot. Subukan muli mamaya.")
            AssistantResult(AssistantUsage(remaining, unlimited, json.optLong("nextAllowedAt"), json.getLong("resetAt")),
                if (question == null) json.getBoolean("available") else true, json.optString("answer"))
        }
    }
}
