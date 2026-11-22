package ph.basaya.app.data.membership

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot

/** Mirrors the web/API deadline policy; elapsed paused deadlines remain exempt. */
object EnrollmentPolicy {
    private fun ms(value: Any?): Long? = when(value) { is Timestamp -> value.toDate().time;is Number -> value.toLong();else -> null }
    private fun periods(value: Any?): List<Map<*, *>> = (value as? List<*>)?.mapNotNull { it as? Map<*, *> } ?: emptyList()
    private fun inactive(profile: DocumentSnapshot): List<Map<*, *>> {
        val rows=periods(profile.get("inactivePeriods"))
        return if(profile.getBoolean("disabled")==true && rows.none { it["end"]==null }) rows+mapOf("start" to (ms(profile.get("deactivatedAt")) ?: 0L),"end" to null) else rows
    }
    fun due(link: DocumentSnapshot,roster: DocumentSnapshot): Long? {
        val base=ms(link.get("dueAt")) ?: return null
        val key=if(link.getString("mode")=="practice")link.id else link.getString("lessonId") ?: link.id
        val override=(roster.get("deadlineOverrides") as? Map<*, *>)?.get(key) as? Map<*, *>
        return maxOf(base,ms(override?.get("dueAt")) ?: base)
    }
    fun exempt(link: DocumentSnapshot,roster: DocumentSnapshot,profile: DocumentSnapshot,classroom: DocumentSnapshot): Boolean {
        val key=if(link.getString("mode")=="practice")link.id else link.getString("lessonId") ?: link.id
        val override=(roster.get("deadlineOverrides") as? Map<*, *>)?.get(key) as? Map<*, *> ?: emptyMap<Any,Any>()
        val base=ms(link.get("dueAt"));val individual=ms(override["dueAt"])
        val assigned=ms(override["firstAssignedAt"]) ?: Long.MAX_VALUE
        val changed=ms(link.get("scheduleChangedAt")) ?: 0L
        val classDates=(listOf(base)+(link.get("deadlineHistory") as? List<*> ?: emptyList<Any>()).map(::ms)).filterNotNull().filter { individual==null || individual<=it || assigned>it }
        val personal=individual?.takeIf { base==null || it>=base || changed>it }
        val dates=(listOf(due(link,roster),personal)+classDates+(override["deadlineHistory"] as? List<*> ?: emptyList<Any>()).map(::ms)).filterNotNull()
        val paused=inactive(profile)+periods(roster.get("droppedPeriods"))+periods(classroom.get("archivePeriods"))
        return dates.any { date -> paused.any { period -> date >= (ms(period["start"]) ?: Long.MAX_VALUE) && (period["end"]==null || date < (ms(period["end"]) ?: 0L)) } }
    }
    fun monitoringNow(profile: DocumentSnapshot,roster: DocumentSnapshot,classroom: DocumentSnapshot): Long {
        val paused=inactive(profile)+periods(roster.get("droppedPeriods"))+periods(classroom.get("archivePeriods"))
        return (paused.filter { it["end"]==null }.mapNotNull { ms(it["start"]) }.filter { it>0L }+System.currentTimeMillis()).min()
    }
}
