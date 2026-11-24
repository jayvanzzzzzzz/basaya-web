package ph.basaya.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import ph.basaya.app.data.entity.LessonEntity

@Dao
interface LessonDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(lessons: List<LessonEntity>)

    /** Read device-owned download flags at commit time, after any in-flight download/removal. */
    @Transaction
    suspend fun replaceLessonsForUser(userId: String, lessons: List<LessonEntity>) {
        require(lessons.all { it.userId == userId })
        val current = getLessonsForUser(userId).associateBy { it.id }
        val refreshed = lessons.map { lesson ->
            val saved = current[lesson.id]?.takeIf { it.classId == lesson.classId }
            lesson.copy(isDownloaded = saved?.isDownloaded == true)
        }
        deleteLessonsForUser(userId)
        insertAll(refreshed)
    }

    /** A class/account change during a download must not mark a different assignment ready. */
    @Transaction
    suspend fun completeDownload(lessonId: String, userId: String, classId: String): Boolean {
        val lesson = getLesson(lessonId) ?: return false
        if (lesson.userId != userId || lesson.classId != classId) return false
        return updateDownloaded(lessonId, true) == 1
    }

    @Query("SELECT * FROM lessons ORDER BY `order` ASC")
    suspend fun getAllLessons(): List<LessonEntity>

    @Query("SELECT * FROM lessons WHERE userId = :userId ORDER BY `order` ASC")
    suspend fun getLessonsForUser(userId: String): List<LessonEntity>

    @Query("DELETE FROM lessons WHERE userId = :userId")
    suspend fun deleteLessonsForUser(userId: String)

    @Query("UPDATE lessons SET isDownloaded = :isDownloaded WHERE id = :lessonId")
    suspend fun updateDownloaded(lessonId: String, isDownloaded: Boolean): Int

    @Query(
        """UPDATE lessons SET lectureFinished = :lectureFinished, gameFinished = :gameFinished,
           activityFinished = :activityFinished, quizFinished = :quizFinished, started = :started
           WHERE id = :lessonId AND userId = :userId"""
    )
    suspend fun updateProgress(
        userId: String,
        lessonId: String,
        lectureFinished: Boolean,
        gameFinished: Boolean,
        activityFinished: Boolean,
        quizFinished: Boolean,
        started: Boolean
    )

    @Query("UPDATE lessons SET pronunciationFinished = :finished WHERE id = :lessonId AND userId = :userId")
    suspend fun updatePronunciation(userId: String, lessonId: String, finished: Boolean)

    @Query("SELECT * FROM lessons WHERE id = :lessonId LIMIT 1")
    suspend fun getLesson(lessonId: String): LessonEntity?

    @Query(""" SELECT isDownloaded FROM lessons WHERE id = :lessonId LIMIT 1 """)
    suspend fun isLessonDownloaded(lessonId: String): Boolean?

    @Query("UPDATE lessons SET isDownloaded = 0 WHERE id = :lessonId")
    suspend fun markLessonRemoved(lessonId: String)
}
