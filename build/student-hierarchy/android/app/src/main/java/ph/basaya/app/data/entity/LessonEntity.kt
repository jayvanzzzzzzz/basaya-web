package ph.basaya.app.data.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "lessons")
data class LessonEntity(
    @PrimaryKey
    val id: String,
    val userId: String,
    val classId: String,
    val title: String,
    val description: String,
    val difficulty: String,
    val order: Int,
    val unlocked: Boolean,
    val lectureFinished: Boolean = false,
    val gameFinished: Boolean = false,
    val activityFinished: Boolean = false,
    val quizFinished: Boolean = false,
    val isDownloaded: Boolean,
    // Teacher chose "Skip game for this lesson" in basaya-web (lessons/{id}/game/status).
    @ColumnInfo(defaultValue = "0")
    val gameSkipped: Boolean = false,
    // Teacher chose "Skip Gawain for this lesson" in basaya-web (lessons/{id}/activity/status).
    @ColumnInfo(defaultValue = "0")
    val activitySkipped: Boolean = false,
    // Teacher's optional schedule (classes/{classId}/classLessons/{lessonId}), epoch millis.
    val openAt: Long? = null,
    val dueAt: Long? = null,
    // When the teacher added the lesson to the class (link createdAt), epoch millis.
    val assignedAt: Long? = null,
    // Teacher added it as Practice (link mode "practice"): nothing is saved (PracticeLessons).
    @ColumnInfo(defaultValue = "0")
    val practice: Boolean = false,
    // Something was done before any part is finished (LessonResume.started): Nasa progreso.
    @ColumnInfo(defaultValue = "0")
    val started: Boolean = false,
    @ColumnInfo(defaultValue = "''")
    val navigationMetadata: String = "",
    @ColumnInfo(defaultValue = "0")
    val pronunciationFinished: Boolean = false
)