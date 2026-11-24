const fs = require('fs');
const path = require('path');
const root = path.resolve('C:/Projects/BaSaya');
const target = path.resolve(root, 'app/src/main/java/ph/basaya/app/data/dictionary/DictionaryAudio.kt');
if (!target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Invalid Android target');
let source = fs.readFileSync(target, 'utf8');
if (!source.includes('private suspend fun lessonAudio(')) {
  source = source.replace('import android.content.Context', 'import android.content.Context\nimport ph.basaya.app.BuildConfig');
  source = source.replace('    private val cacheDir = File(context.cacheDir, "dictionary-audio")', '    private val cacheDir = File(context.cacheDir, "dictionary-audio")\n    private val sharedAudio = context.applicationContext.getSharedPreferences("dictionary_shared_audio", Context.MODE_PRIVATE)');
  source = source.replace('        val file = cachedFile(entry).takeIf { it.exists() }', `        val sharedUrl = lessonAudio(entry)
        val sharedFile = sharedUrl?.let { url -> sharedFile(url).takeIf { it.exists() } ?: download(url, sharedFile(url)) }
        val file = sharedFile ?: cachedFile(entry).takeIf { it.exists() }`);
  source = source.replace('    suspend fun preload(entry: Dictionary.Entry) {\n        val file = cachedFile(entry)', `    suspend fun preload(entry: Dictionary.Entry) {
        lessonAudio(entry)?.let { url ->
            val file = sharedFile(url)
            if (!file.exists()) download(url, file)
            return
        }
        val file = cachedFile(entry)`);
  const helper = `
    /** A changed lesson URL has a different cache file, so replacement audio wins. */
    private fun sharedFile(url: String): File {
        val hash = MessageDigest.getInstance("SHA-256").digest(url.toByteArray(Charsets.UTF_8)).take(16).joinToString("") { "%02x".format(it) }
        return File(cacheDir, "lesson-$hash.mp3")
    }

    private suspend fun lessonAudio(entry: Dictionary.Entry): String? {
        val preferenceKey = entry.key + ":" + entry.shown
        val cached = sharedAudio.getString(preferenceKey, null)
        val token = runCatching { FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token }.getOrNull() ?: return cached
        return withContext(Dispatchers.IO) {
            try {
                val connection = URL(BuildConfig.MEMBERSHIP_API_URL.trimEnd('/') + "/api/assessment").openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 8000; connection.readTimeout = 8000
                    connection.doOutput = true
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(JSONObject().put("operation", "dictionary-audio-resolve").put("key", entry.key).toString().toByteArray(Charsets.UTF_8)) }
                    if (connection.responseCode != 200) return@withContext cached
                    val result = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    val url = result.optString("audioUrl").takeIf { it.startsWith("$WORKER_URL/audio/lessons/") }
                    if (url != null) sharedAudio.edit().putString(preferenceKey, url).apply() else sharedAudio.edit().remove(preferenceKey).apply()
                    url
                } finally { connection.disconnect() }
            } catch (_: Exception) { cached }
        }
    }

`;
  source = source.replace('    /** Where the Worker saves', helper + '    /** Where the Worker saves');
  fs.writeFileSync(target, source);
}
console.log('Android dictionary now checks the saved Get Ready audio and caches each replacement separately.');
