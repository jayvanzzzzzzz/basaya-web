package ph.basaya.app.data.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import ph.basaya.app.data.notifications.LessonInbox.Kind
import ph.basaya.app.data.schedule.TrustedClock
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Shows the notifications that are due and sets one alarm for the next one.
 *
 * The alarm is timed with [TrustedClock] (time since boot), so moving the phone's date
 * forward doesn't fire it early. When it fires, [NotificationAlarmReceiver] re-checks the
 * real time online first. Offline after a restart (no trusted time), deadline reminders
 * fall back to the phone's clock, but "new lesson" items wait until the phone is online,
 * so a lesson is never announced before it opens.
 */
object NotificationScheduler {

    private const val PREFS = "notification_scheduler"
    /** Older items are listed but not popped up (e.g. the first login on a new phone). */
    private const val STALE_MS = 24 * 60 * 60 * 1000L

    // The alarm, a push and a lesson sync can run at the same time; one at a time avoids duplicates.
    private val mutex = Mutex()

    /** Call after lessons sync, when a push arrives, and when the alarm fires. [forcePostKey]: an item that just arrived by push is shown even if it is old. */
    suspend fun run(context: Context, forcePostKey: String? = null) = mutex.withLock {
        runLocked(context, forcePostKey)
    }

    private suspend fun runLocked(context: Context, forcePostKey: String?) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null || ph.basaya.app.data.progress.ProgressSession.isDropped(uid) || ph.basaya.app.data.progress.ProgressSession.isArchived(uid)) {
            cancelAlarm(context)
            return
        }

        val events = LessonInbox.allEvents(context, uid)
        val delivered = deliveredKeys(context, uid)
        val trusted = TrustedClock.now(context)
        val latest = TrustedClock.latestKnown(context)

        fun nowFor(kind: Kind): Long? = trusted
            ?: if (kind == Kind.NEW_LESSON) latest
            else maxOf(System.currentTimeMillis(), latest ?: 0L)

        val due = events.filter { item ->
            item.key !in delivered && nowFor(item.kind)?.let { item.time <= it } == true
        }

        // Several reminders of one lesson may be due at once (e.g. after being offline): only the newest one pops up.
        val newestPerLesson = due.filter { it.kind != Kind.NEW_LESSON }
            .groupBy { it.lessonIds.first() }
            .mapValues { (_, items) -> items.maxBy { it.time }.key }

        due.forEach { item ->
            val fresh = nowFor(item.kind)!! - item.time <= STALE_MS || item.key == forcePostKey
            val newest = item.kind == Kind.NEW_LESSON ||
                newestPerLesson[item.lessonIds.first()] == item.key
            if (fresh && newest) ClassNotifications.show(context, item)
        }

        val keys = events.map { it.key }.toSet()
        saveDeliveredKeys(context, uid, (delivered + due.map { it.key }).filter { it in keys }.toSet())
        if (due.isNotEmpty()) LessonInbox.notifyChanged()

        // Without trusted time, "new lesson" items wait for the next online sync.
        val dueKeys = due.map { it.key }.toSet()
        val next = events
            .filter { it.key !in delivered && it.key !in dueKeys }
            .filter { trusted != null || it.kind != Kind.NEW_LESSON }
            .minByOrNull { it.time }

        if (next == null) cancelAlarm(context) else scheduleAlarm(context, next.time, trusted)
    }

    private fun scheduleAlarm(context: Context, time: Long, trustedNow: Long?) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = alarmIntent(context)
        if (trustedNow != null) {
            // Time since boot: unaffected by changes to the phone's date and time.
            val delay = (time - trustedNow).coerceAtLeast(1_000L)
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + delay, intent
            )
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, intent)
        }
    }

    private fun cancelAlarm(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, NotificationAlarmReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun deliveredKeys(context: Context, uid: String): Set<String> =
        prefs(context).getStringSet("delivered_$uid", emptySet()).orEmpty().toSet()

    private fun saveDeliveredKeys(context: Context, uid: String, keys: Set<String>) {
        prefs(context).edit().putStringSet("delivered_$uid", keys).apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
