const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const manifest = [];
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
function stage(file, change) {
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  const result = change(original.replace(/\r\n/g, '\n'));
  fs.writeFileSync(path.join(preview, file), result);
  manifest.push({ file, originalHash: sha(original), resultHash: sha(result) });
}
stage('app/build.gradle.kts', (text) => {
  const anchor = 'dependencies {';
  if (!text.includes(anchor) || text.includes('com.squareup.okhttp3:okhttp')) throw new Error('Unexpected dependencies');
  return text.replace(anchor, anchor + '\n    // Active audio downloads must be cancellable even during a blocked read.\n    implementation("com.squareup.okhttp3:okhttp:4.12.0")');
});
stage('app/src/main/java/ph/basaya/app/data/audio/LectureAudioStore.kt', (text) => {
  text = text.replace('import java.net.HttpURLConnection\nimport java.net.URL', 'import java.util.concurrent.TimeUnit\nimport okhttp3.OkHttpClient\nimport okhttp3.Request');
  text = text.replace('    private const val TIMEOUT_MS = 15_000', `    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()`);
  const start = text.indexOf('    internal suspend fun downloadFile(');
  if (start < 0) throw new Error('Missing audio download');
  return text.slice(0, start) + `    internal suspend fun downloadFile(url: String, target: File) = coroutineScope {
        val call = client.newCall(Request.Builder().url(url).build())
        // Call.cancel closes the underlying socket without waiting for the read lock.
        val cancellationWatcher = launch(Dispatchers.IO, start = CoroutineStart.UNDISPATCHED) {
            try { awaitCancellation() } finally { call.cancel() }
        }
        try {
            currentCoroutineContext().ensureActive()
            call.execute().use { response ->
                if (response.code != 200) throw IOException("HTTP " + response.code + " for " + url)
                val body = response.body ?: throw IOException("Missing audio body")
                val temp = File(target.parentFile, target.name + ".part")
                body.byteStream().use { input ->
                    temp.outputStream().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val count = input.read(buffer)
                            if (count < 0) break
                            currentCoroutineContext().ensureActive()
                            output.write(buffer, 0, count)
                        }
                    }
                }
                currentCoroutineContext().ensureActive()
                if (!temp.renameTo(target)) {
                    temp.delete()
                    throw IOException("Could not save " + target.name)
                }
            }
        } finally {
            cancellationWatcher.cancel()
            call.cancel()
        }
    }
}
`;
});
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared cancellable audio HTTP client and pinned dependency.');
