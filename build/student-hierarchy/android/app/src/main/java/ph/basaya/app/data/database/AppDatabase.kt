package ph.basaya.app.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import ph.basaya.app.data.dao.ActivityDao
import ph.basaya.app.data.dao.ClassNotificationDao
import ph.basaya.app.data.dao.CrosswordLevelDao
import ph.basaya.app.data.dao.CrosswordProgressDao
import ph.basaya.app.data.dao.LectureDao
import ph.basaya.app.data.dao.LessonDao
import ph.basaya.app.data.dao.PronunciationDao
import ph.basaya.app.data.dao.QuizDao
import ph.basaya.app.data.dao.TeacherDictionaryDao
import ph.basaya.app.data.entity.ActivityEntity
import ph.basaya.app.data.entity.ClassNotificationEntity
import ph.basaya.app.data.entity.CrosswordProgress
import ph.basaya.app.data.entity.LectureEntity
import ph.basaya.app.data.entity.LessonEntity
import ph.basaya.app.data.entity.CrosswordLevelEntity
import ph.basaya.app.data.entity.PronunciationEntity
import ph.basaya.app.data.entity.QuizEntity
import ph.basaya.app.data.entity.TeacherDictionaryEntity

@Database(
    entities = [
        CrosswordProgress::class,
        LessonEntity::class,
        CrosswordLevelEntity::class,
        LectureEntity::class,
        ActivityEntity::class,
        QuizEntity::class,
        PronunciationEntity::class,
        ClassNotificationEntity::class,
        TeacherDictionaryEntity::class
    ],
    version = 19
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun crosswordProgressDao(): CrosswordProgressDao
    abstract fun lessonDao(): LessonDao
    abstract fun crosswordLevelDao(): CrosswordLevelDao
    abstract fun lectureDao(): LectureDao
    abstract fun activityDao(): ActivityDao
    abstract fun quizDao(): QuizDao
    abstract fun pronunciationDao(): PronunciationDao
    abstract fun classNotificationDao(): ClassNotificationDao
    abstract fun teacherDictionaryDao(): TeacherDictionaryDao

    companion object {
        /** v11: lessons.gameSkipped. Keeps downloaded lessons instead of wiping the database. */
        private val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN gameSkipped INTEGER NOT NULL DEFAULT 0")
            }
        }

        /** v12: lessons.openAt / lessons.dueAt (teacher's schedule). */
        private val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN openAt INTEGER")
                db.execSQL("ALTER TABLE lessons ADD COLUMN dueAt INTEGER")
            }
        }

        /** v13: lessons.assignedAt and the class_notifications table (notification list). */
        private val MIGRATION_12_13 = object : Migration(12, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN assignedAt INTEGER")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS class_notifications (" +
                        "id TEXT NOT NULL, classId TEXT NOT NULL, title TEXT NOT NULL, " +
                        "body TEXT NOT NULL, lessonIds TEXT NOT NULL, visibleAt INTEGER NOT NULL, " +
                        "PRIMARY KEY(id))"
                )
            }
        }

        /** v14: lessons.activitySkipped. */
        private val MIGRATION_13_14 = object : Migration(13, 14) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN activitySkipped INTEGER NOT NULL DEFAULT 0")
            }
        }

        /** v15: lessons.practice (teacher added the lesson as Practice). */
        private val MIGRATION_14_15 = object : Migration(14, 15) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN practice INTEGER NOT NULL DEFAULT 0")
            }
        }

        /** v16: lessons.started (a part left halfway makes the lesson Nasa progreso). */
        private val MIGRATION_15_16 = object : Migration(15, 16) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN started INTEGER NOT NULL DEFAULT 0")
            }
        }

        /** v17: cached teacher/admin dictionary entries for offline lookup. */
        private val MIGRATION_16_17 = object : Migration(16, 17) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS teacher_dictionary (" +
                        "`key` TEXT NOT NULL, word TEXT NOT NULL, accent TEXT NOT NULL, " +
                        "sensesJson TEXT NOT NULL, synonymsJson TEXT NOT NULL, hidden INTEGER NOT NULL, " +
                        "fixedSyllables TEXT NOT NULL, PRIMARY KEY(`key`))"
                )
            }
        }

        /** v18: retain dictionary creator/editor attribution offline. */
        private val MIGRATION_17_18 = object : Migration(17, 18) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE teacher_dictionary ADD COLUMN attribution TEXT NOT NULL DEFAULT ''")
            }
        }

        private val MIGRATION_18_19 = object : Migration(18, 19) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE lessons ADD COLUMN navigationMetadata TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE lessons ADD COLUMN pronunciationFinished INTEGER NOT NULL DEFAULT 0")
            }
        }

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "game_database"
                )
                    .addMigrations(
                        MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13,
                        MIGRATION_13_14, MIGRATION_14_15, MIGRATION_15_16,
                        MIGRATION_16_17, MIGRATION_17_18, MIGRATION_18_19
                    )
                    .fallbackToDestructiveMigration()
                    .build()

                INSTANCE = instance
                instance
            }
        }
    }
}
