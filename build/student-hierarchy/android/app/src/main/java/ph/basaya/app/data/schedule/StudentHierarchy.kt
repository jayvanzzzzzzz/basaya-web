package ph.basaya.app.data.schedule

import org.json.JSONObject
import ph.basaya.app.data.entity.LessonEntity

/** Class order is independent of list filtering and downloads. */
object StudentHierarchy {
    fun meta(lesson: LessonEntity): JSONObject = runCatching { JSONObject(lesson.navigationMetadata) }.getOrDefault(JSONObject())
    fun path(lesson: LessonEntity) = meta(lesson).optString("learningPathAssignmentId")
    fun module(lesson: LessonEntity) = meta(lesson).optString("moduleId").ifBlank { "__lessons" }
    fun complete(lesson: LessonEntity) = lesson.lectureFinished && (lesson.gameFinished || lesson.gameSkipped) &&
        (lesson.activityFinished || lesson.activitySkipped) && (lesson.pronunciationFinished || meta(lesson).optBoolean("pronunciationSkipped")) && (lesson.quizFinished || meta(lesson).optBoolean("quizSkipped"))
    fun ordered(lessons: List<LessonEntity>) = lessons.sortedWith(compareBy<LessonEntity> { meta(it).optInt("learningPathOrder", it.order) }
        .thenBy { meta(it).optInt("learningPathModuleOrder", it.order) }.thenBy { it.order }.thenBy { it.id })
    fun blocker(lesson: LessonEntity, lessons: List<LessonEntity>): String? {
        if (path(lesson).isBlank()) return null
        val paths = ordered(lessons).groupBy { path(it) }.filterKeys { it.isNotBlank() }.values.toList()
        val pathIndex = paths.indexOfFirst { group -> group.any { it.id == lesson.id } }
        if (pathIndex < 0) return null
        fun unfinished(item: LessonEntity) = !item.practice && !meta(item).optBoolean("exempt") && !complete(item)
        paths.take(pathIndex).firstOrNull { it.any(::unfinished) }?.let { return meta(it.first()).optString("learningPathTitle", "Lesson path") }
        val modules = paths[pathIndex].groupBy { module(it) }.values.toList()
        val moduleIndex = modules.indexOfFirst { group -> group.any { it.id == lesson.id } }
        modules.take(moduleIndex).firstOrNull { it.any(::unfinished) }?.let { return meta(it.first()).optString("moduleTitle", "Module") }
        return modules[moduleIndex].takeWhile { it.id != lesson.id }.firstOrNull(::unfinished)?.title
    }
}
