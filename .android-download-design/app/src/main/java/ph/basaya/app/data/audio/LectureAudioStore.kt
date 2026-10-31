package ph.basaya.app.data.audio

import android.content.Context
import ph.basaya.app.data.model.LecturePage
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Offline copies of lecture sentence audio hosted on Cloudflare R2.
 * Files live at filesDir/lecture_audio/{lessonId}/p{page}_s{sentence}.mp3 and exist
 * only while the lesson is downloaded.
 */
object LectureAudioStore {

    private const val ROOT_DIR = "lecture_audio"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    fun localFile(context: Context, lessonId: String, pageNumber: Int, sentenceIndex: Int): File =
        File(lessonDir(context, lessonId), fileName(pageNumber, sentenceIndex))

    private fun fileName(pageNumber: Int, sentenceIndex: Int) = "p${pageNumber}_s${sentenceIndex}.mp3"

    /**
     * Downloads every sentence that has a cloud URL, replacing the lesson's saved audio.
     * Throws if any file fails, and then the audio saved before stays as it was.
     * [onFile] is called on the IO thread after each file is saved.
     */
    suspend fun download(
        context: Context,
        lessonId: String,
        pages: List<LecturePage>,
        onFile: (done: Int, total: Int) -> Unit = { _, _ -> }
    ) = withContext(Dispatchers.IO) {
        val total = pages.sumOf { page -> page.audioUrls.orEmpty().count { it.isNotBlank() } }
        var done = 0
        replaceDir(lessonDir(context, lessonId)) { staging ->
            pages.forEach { page ->
                page.audioUrls.orEmpty().forEachIndexed { index, url ->
                    if (url.isNotBlank()) {
                        downloadFile(url, File(staging, fileName(page.pageNumber, index)))
                        onFile(++done, total)
                    }
                }
            }
        }
    }

    /** Fills a staging folder, then swaps it in for `dir` (dropping audio from an older version). On failure the staging folder is removed and `dir` is left untouched. */
    internal suspend fun replaceDir(dir: File, fill: suspend (staging: File) -> Unit) {
        val staging = File(dir.parentFile, "${dir.name}.new")
        staging.deleteRecursively()
        staging.mkdirs()
        try {
            fill(staging)
            currentCoroutineContext().ensureActive()
        } catch (e: Exception) {
            staging.deleteRecursively()
            throw e
        }
        dir.deleteRecursively()
        if (!staging.renameTo(dir)) {
            staging.deleteRecursively()
            throw IOException("Could not save the audio for ${dir.name}")
        }
    }

    fun delete(context: Context, lessonId: String) {
        lessonDir(context, lessonId).deleteRecursively()
    }

    private fun lessonDir(context: Context, lessonId: String) =
        File(File(context.filesDir, ROOT_DIR), lessonId)

    internal suspend fun downloadFile(url: String, target: File) = coroutineScope {
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
        } catch (failure: Exception) {
            // Socket closure is expected on cancellation, not a download failure.
            currentCoroutineContext().ensureActive()
            throw failure
        } finally {
            cancellationWatcher.cancel()
            call.cancel()
        }
    }
}
