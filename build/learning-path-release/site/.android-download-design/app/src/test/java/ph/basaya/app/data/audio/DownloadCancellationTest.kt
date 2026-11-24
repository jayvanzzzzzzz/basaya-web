package ph.basaya.app.data.audio

import java.io.Closeable
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test

class DownloadCancellationTest {
    @Test fun cancelStalledAudioRemovesPartialLessonAndKeepsCompletedFiles() = runBlocking {
        val root = Files.createTempDirectory("basaya-cancel-test").toFile()
        try {
            val completed = File(root, "completed.mp3").apply { writeText("kept") }
            val lesson = File(root, "lesson")
            AudioServer(stalled = true).use { server ->
                val transfer = launch(Dispatchers.IO) {
                    LectureAudioStore.replaceDir(lesson) { staging ->
                        LectureAudioStore.downloadFile(server.url, File(staging, "audio.mp3"))
                    }
                }
                assertTrue("Audio transfer did not start", server.started.await(3, TimeUnit.SECONDS))
                delay(100)
                transfer.cancel()
                withTimeout(3000) { transfer.join() }
                assertTrue(transfer.isCancelled)
                assertFalse("Cancelled lesson must not be committed", lesson.exists())
                assertFalse("Partial staging files must be cleaned", File(root, "lesson.new").exists())
                assertEquals("kept", completed.readText())
            }
        } finally { root.deleteRecursively() }
    }

    @Test fun completedAudioCommitsNormally() = runBlocking {
        val root = Files.createTempDirectory("basaya-complete-test").toFile()
        try {
            val lesson = File(root, "lesson")
            AudioServer(stalled = false).use { server ->
                LectureAudioStore.replaceDir(lesson) { staging ->
                    LectureAudioStore.downloadFile(server.url, File(staging, "audio.mp3"))
                }
                assertEquals("aralin", File(lesson, "audio.mp3").readText())
                assertFalse(File(root, "lesson.new").exists())
            }
        } finally { root.deleteRecursively() }
    }

    private class AudioServer(stalled: Boolean) : Closeable {
        private val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        val url = "http://127.0.0.1:" + server.localPort + "/audio.mp3"
        val started = CountDownLatch(1)
        private val release = CountDownLatch(1)
        private val worker = thread(isDaemon = true, name = "basaya-test-audio") {
            try {
                server.accept().use { socket ->
                    socket.soTimeout = 3000
                    val input = socket.getInputStream().bufferedReader()
                    while (!input.readLine().isNullOrEmpty()) { }
                    val body = if (stalled) ByteArray(1024) else "aralin".toByteArray()
                    val size = if (stalled) 1024 * 1024 else body.size
                    val output = socket.getOutputStream()
                    output.write(("HTTP/1.1 200 OK\r\nContent-Length: " + size + "\r\nConnection: close\r\n\r\n").toByteArray())
                    output.write(body)
                    output.flush()
                    started.countDown()
                    if (stalled) release.await(8, TimeUnit.SECONDS)
                }
            } catch (_: java.io.IOException) { }
        }
        override fun close() {
            release.countDown()
            server.close()
            worker.join(1000)
        }
    }
}
