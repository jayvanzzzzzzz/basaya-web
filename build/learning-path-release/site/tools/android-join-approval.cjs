const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const stage = path.resolve(__dirname, '../audit/android-join-approval');
const files = [
  'app/build.gradle.kts',
  'app/src/main/java/ph/basaya/app/data/membership/ClassMembership.kt',
  'app/src/main/java/ph/basaya/app/ui/JoinClassActivity.kt',
  'app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt',
  'app/src/main/java/ph/basaya/app/ui/fragment/ProfileFragment.kt',
  'app/src/main/res/values/strings_join.xml',
];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
if (process.argv.includes('--refresh')) {
  const manifest = files.map(file => {
    const dest = path.join(root, file);
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    const after = fs.readFileSync(path.join(stage, file), 'utf8');
    return { file, before: hash(before), after: hash(after) };
  }).filter(entry => entry.before !== entry.after);
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Prepared ' + manifest.length + ' updated Android approval files.');
  process.exit(0);
}
if (process.argv.includes('--apply')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'manifest.json'), 'utf8'));
  for (const entry of manifest) {
    if (!files.includes(entry.file)) throw new Error('Unexpected target');
    const dest = path.resolve(root, entry.file);
    if (!dest.startsWith(path.resolve(root) + path.sep)) throw new Error('Target outside Android project');
    const previous = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    if (hash(previous) !== entry.before) throw new Error('Android file changed since preparation: ' + entry.file);
    if (hash(fs.readFileSync(path.join(stage, entry.file), 'utf8')) !== entry.after) throw new Error('Staged content changed');
  }
  for (const entry of manifest) {
    const dest = path.join(root, entry.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(stage, entry.file), dest);
  }
  console.log('Applied approval flow to ' + manifest.length + ' Android files.');
  process.exit(0);
}
const manifest = [];
function write(file, change) {
  const dest = path.join(root, file);
  const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  const after = change(before.replace(/\r\n/g, '\n'));
  const staged = path.join(stage, file);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, after);
  manifest.push({ file, before: hash(before), after: hash(after) });
}
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Expected unique anchor: ' + before.slice(0, 100));
  return source.replace(before, after);
}
write(files[0], source => once(source,
  '        buildConfigField("String", "STT_APP_KEY",',
  '        buildConfigField("String", "MEMBERSHIP_API_URL", "\\\"https://basaya-notify-api.vercel.app\\\"")\n        buildConfigField("String", "STT_APP_KEY",'));
write(files[1], () => `package ph.basaya.app.data.membership

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
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

/** Sends an authenticated request; enrollment is exclusively a teacher approval. */
object ClassMembership {
    private val client = OkHttpClient.Builder().callTimeout(25, TimeUnit.SECONDS).build()
    suspend fun requestJoin(code: String): String {
        val user = FirebaseAuth.getInstance().currentUser ?: throw IOException("Mag-log in muli.")
        val token = user.getIdToken(false).await().token ?: throw IOException("Mag-log in muli.")
        val request = Request.Builder()
            .url(BuildConfig.MEMBERSHIP_API_URL.trimEnd('/') + "/api/join-class")
            .header("Authorization", "Bearer " + token)
            .post(JSONObject().put("code", code).toString().toRequestBody("application/json".toMediaType()))
            .build()
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
            val body = withContext(Dispatchers.IO) { it.body?.string().orEmpty() }
            val json = runCatching { JSONObject(body) }.getOrElse { JSONObject() }
            if (!it.isSuccessful) throw IOException(json.optString("error").ifBlank { "Hindi maipadala ang kahilingan. Subukan muli." })
            if (json.optString("status") != "pending") throw IOException("Hindi makumpirma ang kahilingan. Tingnan muli ang katayuan.")
            json.optString("className", "Iyong klase")
        }
    }
}
`);
write(files[2], source => {
  source = source.replace('import ph.basaya.app.data.chat.ClassChat', 'import ph.basaya.app.data.membership.ClassMembership\nimport androidx.lifecycle.lifecycleScope\nimport kotlinx.coroutines.CancellationException\nimport kotlinx.coroutines.launch\nimport com.google.firebase.firestore.ListenerRegistration\nimport com.google.firebase.firestore.DocumentSnapshot\nimport com.google.firebase.firestore.Source');
  source = source.replace('import com.google.firebase.firestore.FieldValue\n', '');
  source = once(source, '    private lateinit var tilClassCode: TextInputLayout', '    private lateinit var tilClassCode: TextInputLayout\n    private var profileListener: ListenerRegistration? = null\n    private var pending = false\n    private var submitting = false');
  source = once(source, '        val submit = {\n            val code', '        btnJoin.setText(R.string.jc_request_send)\n        findViewById<TextView>(R.id.tvInstruction).setText(R.string.jc_request_instruction)\n\n        val submit = submit@{\n            if (submitting) return@submit\n            if (pending) { refreshStatus(); return@submit }\n            val code');
  const start = source.indexOf('    private fun joinClass(code: String) {');
  const end = source.indexOf('    /** Wrong or empty code:', start);
  if (start < 0 || end < 0) throw new Error('Missing join function');
  source = source.slice(0, start) + `    override fun onStart() {
        super.onStart()
        val uid = authHelper.getCurrentUser()?.uid ?: return
        profileListener = db.collection("users").document(uid).addSnapshotListener { profile, error ->
            if (profile != null && error == null && !isFinishing) showMembership(profile)
        }
    }

    override fun onStop() {
        profileListener?.remove()
        profileListener = null
        super.onStop()
    }

    private fun showMembership(profile: DocumentSnapshot) {
        if (!profile.getString("classId").isNullOrBlank()) {
            setResult(RESULT_OK)
            Toast.makeText(this, R.string.jc_request_approved, Toast.LENGTH_LONG).show()
            finish()
            return
        }
        pending = profile.getString("joinRequest.status") == "pending"
        val className = profile.getString("joinRequest.className").orEmpty()
        findViewById<View>(R.id.codeCard).visibility = if (pending) View.GONE else View.VISIBLE
        findViewById<TextView>(R.id.tvInstruction).text = when {
            pending -> getString(R.string.jc_request_pending, className)
            profile.getString("joinRequest.status") == "declined" -> getString(R.string.jc_request_declined, className)
            else -> getString(R.string.jc_request_instruction)
        }
        if (!submitting) btnJoin.setText(if (pending) R.string.jc_request_check else R.string.jc_request_send)
    }

    private fun refreshStatus() {
        val uid = authHelper.getCurrentUser()?.uid ?: return
        setJoining(true)
        db.collection("users").document(uid).get(Source.SERVER)
            .addOnSuccessListener { if (!isFinishing) { setJoining(false); showMembership(it) } }
            .addOnFailureListener { if (!isFinishing) { setJoining(false); Toast.makeText(this, R.string.jc_connection, Toast.LENGTH_SHORT).show() } }
    }

    private fun joinClass(code: String) {
        if (authHelper.getCurrentUser() == null) {
            Toast.makeText(this, R.string.jc_need_login, Toast.LENGTH_SHORT).show()
            return
        }
        setJoining(true)
        lifecycleScope.launch {
            try {
                val className = ClassMembership.requestJoin(code)
                pending = true
                findViewById<View>(R.id.codeCard).visibility = View.GONE
                findViewById<TextView>(R.id.tvInstruction).text = getString(R.string.jc_request_pending, className)
                buddy.setMood(PronunciationBookView.Mood.HAPPY)
                setResult(RESULT_OK)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                showCodeError(error.message ?: getString(R.string.jc_connection))
            } finally {
                setJoining(false)
            }
        }
    }

` + source.slice(end);
  const celebration = source.indexOf('    /** Joined: buddy jumps,');
  const loading = source.indexOf('    private fun setJoining(', celebration);
  if (celebration < 0 || loading < 0) throw new Error('Missing celebration');
  source = source.slice(0, celebration) + source.slice(loading);
  source = once(source, '        btnJoin.isEnabled = !isJoining\n        btnJoin.text = if (isJoining) getString(R.string.jc_joining) else getString(R.string.join)', '        submitting = isJoining\n        btnJoin.isEnabled = !isJoining\n        btnJoin.setText(if (isJoining) R.string.jc_request_sending else if (pending) R.string.jc_request_check else R.string.jc_request_send)');
  return source.replace('import ph.basaya.app.ui.game.ConfettiView\n', '');
});
write(files[3], source => {
  source = once(source, '    private var currentClassId: String? = null', '    private var currentClassId: String? = null\n    private var joinStatus = ""\n    private var requestedClass = ""\n    private var membershipListener: com.google.firebase.firestore.ListenerRegistration? = null\n    private var membershipSignature: List<String?>? = null');
  source = once(source, '                getString(R.string.empty_not_in_class)', '                when (joinStatus) {\n                    "pending" -> getString(R.string.jc_request_pending, requestedClass)\n                    "declined" -> getString(R.string.jc_request_declined, requestedClass)\n                    else -> getString(R.string.empty_not_in_class)\n                }');
  source = once(source, '                val className = doc.getString("className")', '                val className = doc.getString("className")\n                joinStatus = doc.getString("joinRequest.status").orEmpty()\n                requestedClass = doc.getString("joinRequest.className").orEmpty()');
  source = once(source, '                if (classId.isNullOrBlank()) {\n                    tvClassName.text = ""', '                if (classId.isNullOrBlank()) {\n                    allLessons = emptyList()\n                    shownLessons = emptyList()\n                    adapter.updateList(emptyList(), "")\n                    tvClassName.text = ""');
  source = once(source, '                if (classId != currentClassId) checkClassMembershipAndLoad()', '                if (classId != currentClassId || doc.getString("joinRequest.status").orEmpty() != joinStatus) checkClassMembershipAndLoad()');
  source = once(source, '    private fun showJoinClassSheet() {\n        if (!isAdded) return', '    private fun showJoinClassSheet() {\n        if (!isAdded) return\n        if (joinStatus == "pending") {\n            joinClassLauncher.launch(Intent(requireContext(), JoinClassActivity::class.java))\n            return\n        }');
  source = once(source, '    override fun onDestroyView() {', `    override fun onStart() {
        super.onStart()
        val uid = authHelper.getCurrentUser()?.uid ?: return
        membershipListener = firestore.collection("users").document(uid).addSnapshotListener { doc, _ ->
            if (!isAdded || view == null || doc == null) return@addSnapshotListener
            val signature = listOf(doc.getString("classId"), doc.getString("className"), doc.getString("joinRequest.status"), doc.getString("joinRequest.requestId"))
            if (membershipSignature != null && membershipSignature != signature) checkClassMembershipAndLoad()
            membershipSignature = signature
        }
    }

    override fun onStop() {
        membershipListener?.remove()
        membershipListener = null
        super.onStop()
    }

    override fun onDestroyView() {`);
  return source;
});
write(files[4], source => {
  source = once(source, '    private var profile = Profile()', '    private var profile = Profile()\n    private var joinStatus = ""\n    private var requestedClass = ""\n    private var membershipListener: com.google.firebase.firestore.ListenerRegistration? = null\n    private var membershipSignature: List<String?>? = null');
  source = once(source, '        btnLeaveStatusAction.setOnClickListener {\n            if (leaveState', '        btnLeaveStatusAction.setOnClickListener {\n            if (profile.classId.isBlank() && joinStatus.isNotBlank()) {\n                joinClassLauncher.launch(Intent(requireContext(), JoinClassActivity::class.java))\n                return@setOnClickListener\n            }\n            if (leaveState');
  source = once(source, '                profile = Profile(', '                joinStatus = doc.getString("joinRequest.status").orEmpty()\n                requestedClass = doc.getString("joinRequest.className").orEmpty()\n                profile = Profile(');
  source = once(source, '        if (!hasClass) pfClassName.text = getString(R.string.pf_class_none)', '        if (!hasClass) pfClassName.text = requestedClass.ifBlank { getString(R.string.pf_class_none) }\n        if (!hasClass && joinStatus in listOf("pending", "declined")) {\n            pfLeaveStatus.setBackgroundResource(if (joinStatus == "pending") R.drawable.pf_status_pending else R.drawable.pf_status_declined)\n            pfLeaveStatusTitle.setText(if (joinStatus == "pending") R.string.jc_request_pending_title else R.string.jc_request_declined_title)\n            pfLeaveStatusText.text = getString(if (joinStatus == "pending") R.string.jc_request_pending else R.string.jc_request_declined, requestedClass)\n            btnLeaveStatusAction.setText(if (joinStatus == "pending") R.string.jc_request_check else R.string.jc_request_send)\n            pfLeaveStatus.visibility = View.VISIBLE\n            pfLeaveDivider.visibility = View.GONE\n            rowLeaveClass.visibility = View.GONE\n            rowJoinClass.visibility = View.GONE\n            return\n        }');
  source = once(source, '    // My class / leaving', `    override fun onStart() {
        super.onStart()
        val uid = AuthHelper().getCurrentUser()?.uid ?: return
        membershipListener = firestore.collection("users").document(uid).addSnapshotListener { doc, _ ->
            if (!isAdded || view == null || doc == null) return@addSnapshotListener
            val signature = listOf(doc.getString("classId"), doc.getString("joinRequest.status"), doc.getString("joinRequest.requestId"))
            if (membershipSignature != null && membershipSignature != signature) loadProfile()
            membershipSignature = signature
        }
    }

    override fun onStop() {
        membershipListener?.remove()
        membershipListener = null
        super.onStop()
    }

    // My class / leaving`);
  return source;
});
write(files[5], source => once(source, '</resources>', `    <string name="jc_request_instruction">Ilagay ang class code. Kailangan munang aprubahan ng guro ang iyong kahilingan.</string>
    <string name="jc_request_send">Ipadala ang kahilingan</string>
    <string name="jc_request_sending">Ipinapadala…</string>
    <string name="jc_request_check">Tingnan ang katayuan</string>
    <string name="jc_request_pending_title">Hinihintay ang pag-apruba ng guro</string>
    <string name="jc_request_declined_title">Hindi inaprubahan ang kahilingan</string>
    <string name="jc_request_pending">Naipadala ang kahilingan sa %1$s. Mabubuksan ang mga aralin at class chat kapag inaprubahan ka ng guro.</string>
    <string name="jc_request_declined">Hindi inaprubahan ang iyong kahilingan sa %1$s. Kausapin ang guro o magpadala ng bagong kahilingan gamit ang tamang class code.</string>
    <string name="jc_request_approved">Inaprubahan ka na! Maaari mo nang buksan ang iyong klase.</string>
</resources>`));
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared ' + manifest.length + ' Android approval files in ' + stage);
