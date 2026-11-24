const fs=require('fs'),path=require('path');
const base='build/student-hierarchy/android/app/src/main/java/ph/basaya/app/';
function edit(file,fn){const p=path.join(base,file);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('ui/fragment/HomeFragment.kt',s=>s.replace('addCallback(viewLifecycleOwner,','addCallback(this,').replace('        filterSheet?.dismiss()','        hierarchyBackCallback?.remove()\n        filterSheet?.dismiss()'));
edit('data/repository/LessonRepository.kt',s=>s.replace('        val lessons = shownLinks.map { link ->', `        val optionalSkipped = coroutineScope {
            lessonDocs.keys.map { id -> async {
                id to listOf("quiz", "pronunciation").associateWith { part ->
                    try { firestore.collection("lessons").document(id).collection(part).document("status").get().await().getString("completion") == "skipped" }
                    catch (e: Exception) { existingLessons.firstOrNull { PracticeLessons.contentId(it.id) == id }?.let { ph.basaya.app.data.schedule.StudentHierarchy.meta(it).optBoolean(part + "Skipped") } ?: false }
                }
            } }.awaitAll().toMap()
        }
        val lessons = shownLinks.map { link ->`).replace('navigationMetadata = link.navigation,', `navigationMetadata = org.json.JSONObject(link.navigation).apply {
                    optionalSkipped[link.lessonId]?.forEach { (part, skipped) -> put(part + "Skipped", skipped) }
                }.toString(),`));
edit('data/schedule/StudentHierarchy.kt',s=>s.replace('&& lesson.pronunciationFinished && lesson.quizFinished','&& (lesson.pronunciationFinished || meta(lesson).optBoolean("pronunciationSkipped")) && (lesson.quizFinished || meta(lesson).optBoolean("quizSkipped"))'));
// A light lock veil covers each locked card, using the existing theme color.
edit('adapter/StudentGroupAdapter.kt',s=>s.replace('if(group.locked) frame.addView',`if(group.locked) frame.addView(View(c).apply { setBackgroundColor(ContextCompat.getColor(c,R.color.home_ink)); alpha=0.035f; importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO },FrameLayout.LayoutParams(-1,-1))
        if(group.locked) frame.addView`));
