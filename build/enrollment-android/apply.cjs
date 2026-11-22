const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='C:/Projects/BaSaya',out=path.join(__dirname,'staged'),base='app/src/main/java/ph/basaya/app/';
const manifest=[];
function rep(s,a,b){if(!s.includes(a))throw Error('Missing '+a.slice(0,110));return s.replace(a,b)}
function stage(file,fn){const p=path.join(root,file),original=fs.existsSync(p)?fs.readFileSync(p):null;const s=original?.toString('utf8').replace(/\r\n/g,'\n')||'';const n=fn(s);if(s===n)throw Error('Unchanged '+file);const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,n);manifest.push({file,hash:original?crypto.createHash('sha256').update(original).digest('hex'):null});}
if(process.argv.includes('--apply')){
  for(const item of JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'))){const p=path.join(root,item.file);const current=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;if(current!==item.hash)throw Error('Source changed since preparation: '+item.file);}
  for(const item of JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'))){const p=path.join(root,item.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(out,item.file),p);}
  console.log('Applied prepared Android enrollment changes.');process.exit();
}
for(const name of ['EnrollmentAccess','EnrollmentPolicy'])stage(base+'data/membership/'+name+'.kt',()=>fs.readFileSync(path.join(__dirname,name+'.kt'),'utf8'));
stage(base+'BaSayaApp.kt',s=>rep(s,'ProgressSession.initialize(this)','ProgressSession.initialize(this)\n        ph.basaya.app.data.membership.EnrollmentAccess.initialize(this)'));
stage(base+'data/progress/ProgressSession.kt',s=>{
s=rep(s,'fun bind(uid: String, profile: DocumentSnapshot) {',`fun isDropped(uid: String) = prefs.getBoolean(uid + ":dropped", false)
    fun isArchived(uid: String) = prefs.getBoolean(uid + ":archived", false)
    fun bindClass(uid: String, classroom: DocumentSnapshot) {
        prefs.edit().putString(uid + ":classVersion", classroom.getString("classVersion").orEmpty())
            .putBoolean(uid + ":archived", classroom.getBoolean("membershipClosed") == true).apply()
    }
    fun bind(uid: String, profile: DocumentSnapshot) {`);
s=rep(s,'prefs.edit().putString(uid + ":class", profile.getString("classId").orEmpty())',`if (prefs.getString(uid + ":class", "") != profile.getString("classId").orEmpty()) prefs.edit().remove(uid + ":classVersion").remove(uid + ":archived").apply()
        prefs.edit().putString(uid + ":enrollmentVersion", profile.getString("enrollmentVersion").orEmpty())
            .putBoolean(uid + ":dropped", profile.getString("enrollmentStatus") == "dropped")
            .putString(uid + ":class", profile.getString("classId").orEmpty())`);
s=rep(s,'"progressSession" to prefs.getString(uid + ":session", "").orEmpty()','"progressSession" to prefs.getString(uid + ":session", "").orEmpty(),\n        "enrollmentVersion" to prefs.getString(uid + ":enrollmentVersion", "").orEmpty(),\n        "classVersion" to prefs.getString(uid + ":classVersion", "").orEmpty()');return s});
stage(base+'data/assessment/AssessmentSession.kt',s=>{
s=rep(s,'private val classId: String, private val session: String, val practice: Boolean','private val classId: String, private val session: String, val practice: Boolean,\n    private val enrollmentVersion: String, private val classVersion: String');
s=rep(s,'PracticeLessons.refresh(context, lessonId))','PracticeLessons.refresh(context, lessonId), stamp["enrollmentVersion"].toString(), stamp["classVersion"].toString())');
s=rep(s,'            val practice = PracticeLessons.refresh(context, lessonId)',`            val classroom = FirebaseFirestore.getInstance().collection("classes").document(profile.getString("classId").orEmpty()).get(Source.SERVER).await()
            ProgressSession.bindClass(uid, classroom)
            if (profile.getString("enrollmentStatus") == "dropped" || classroom.getBoolean("membershipClosed") == true) throw AssessmentFailure(403, "Nakahinto ang iyong paglahok sa klase. Makipag-ugnayan sa guro.")
            val practice = PracticeLessons.refresh(context, lessonId)`);
s=rep(s,'profile.getString("progressSession").orEmpty(), practice).also','profile.getString("progressSession").orEmpty(), practice, profile.getString("enrollmentVersion").orEmpty(), classroom.getString("classVersion").orEmpty()).also');
s=rep(s,'ProgressSession.stamp(uid, emptyMap())["progressSession"] == session','ProgressSession.stamp(uid, emptyMap())["progressSession"] == session &&\n        ProgressSession.stamp(uid, emptyMap())["enrollmentVersion"] == enrollmentVersion &&\n        ProgressSession.stamp(uid, emptyMap())["classVersion"] == classVersion &&\n        !ProgressSession.isDropped(uid) && !ProgressSession.isArchived(uid)');
s=rep(s,'"lessonId" to PracticeLessons.contentId(lessonId))','"lessonId" to PracticeLessons.contentId(lessonId), "enrollmentVersion" to enrollmentVersion, "classVersion" to classVersion)');return s});
stage(base+'data/assessment/OfflineLessonJournal.kt',s=>s.replaceAll('listOf("classId", "progressSession", "lessonId",','listOf("classId", "progressSession", "enrollmentVersion", "classVersion", "lessonId",'));
stage(base+'data/assessment/OfflineLessons.kt',s=>rep(s,'return "$uid:${stamp["classId"]}:${stamp["progressSession"]}:$lessonId"','return "$uid:${stamp["classId"]}:${stamp["progressSession"]}:${stamp["enrollmentVersion"]}:${stamp["classVersion"]}:$lessonId"'));
stage(base+'ui/pronunciation/ReadingSession.kt',s=>{
s=s.replaceAll('$uid:${scope["classId"]}:${scope["progressSession"]}:$lessonId','$uid:${scope["classId"]}:${scope["progressSession"]}:${scope["enrollmentVersion"]}:${scope["classVersion"]}:$lessonId');
s=rep(s,'private val identity = "$uid:$classId:$progressSession:$lessonId"','private val identity = "$uid:$classId:$progressSession:${scope["enrollmentVersion"]}:${scope["classVersion"]}:$lessonId"');
s=rep(s,'ProgressSession.stamp(uid, emptyMap())["progressSession"] == progressSession','ProgressSession.stamp(uid, emptyMap())["progressSession"] == progressSession &&\n        ProgressSession.stamp(uid, emptyMap())["enrollmentVersion"] == scope["enrollmentVersion"] &&\n        ProgressSession.stamp(uid, emptyMap())["classVersion"] == scope["classVersion"] &&\n        !ProgressSession.isDropped(uid) && !ProgressSession.isArchived(uid)');
s=rep(s,'"lessonId" to PracticeLessons.contentId(lessonId))','"lessonId" to PracticeLessons.contentId(lessonId), "enrollmentVersion" to scope["enrollmentVersion"], "classVersion" to scope["classVersion"])');return s});
stage(base+'ui/fragment/HomeFragment.kt',s=>{
s=rep(s,'private var membershipSignature:', 'private var stopEnrollmentObserver: (() -> Unit)? = null\n    private var membershipSignature:');
s=rep(s,'                if (classId.isNullOrBlank()) {',`                tvEmptyLessons.setOnClickListener(null)
                if (ph.basaya.app.data.membership.EnrollmentAccess.blocked) {
                    allLessons=emptyList();shownLessons=emptyList();adapter.updateList(emptyList(), "")
                    loadingContainer.visibility=View.GONE;recyclerView.visibility=View.GONE;lessonTabs.visibility=View.GONE
                    dotsAnimatorSet?.cancel();tvClassName.text=className.orEmpty();tvClassName.visibility=View.VISIBLE
                    tvEmptyLessons.text=ph.basaya.app.data.membership.EnrollmentAccess.message + "\\n\\nMakipag-ugnayan sa guro"
                    tvEmptyLessons.setOnClickListener { requireActivity().findViewById<View>(R.id.navChat)?.performClick() }
                    setEmptyVisible(true);return@addOnSuccessListener
                }
                if (classId.isNullOrBlank()) {`);
s=rep(s,'        val uid = authHelper.getCurrentUser()?.uid ?: return\n        membershipListener =','        val uid = authHelper.getCurrentUser()?.uid ?: return\n        stopEnrollmentObserver = ph.basaya.app.data.membership.EnrollmentAccess.observe { if(isAdded && view != null) checkClassMembershipAndLoad() }\n        membershipListener =');
s=rep(s,'val signature = listOf(doc.getString("progressSession"),','val signature = listOf(doc.getString("enrollmentStatus"), doc.getString("enrollmentVersion"), doc.getString("progressSession"),');
s=rep(s,'        membershipListener?.remove()','        stopEnrollmentObserver?.invoke();stopEnrollmentObserver=null\n        membershipListener?.remove()');return s});
stage(base+'data/repository/LessonRepository.kt',s=>{
s=rep(s,'        syncNotifications(classId)',`        val classroom=firestore.collection("classes").document(classId).get().await()
        val roster=firestore.collection("classes").document(classId).collection("students").document(userId).get().await()
        ProgressSession.bindClass(userId,classroom)
        if(userDoc.getString("enrollmentStatus")=="dropped" || classroom.getBoolean("membershipClosed")==true)return
        syncNotifications(classId)`);
s=rep(s,'dueAt = link.getTimestamp("dueAt")?.toDate()?.time,','dueAt = ph.basaya.app.data.membership.EnrollmentPolicy.due(link,roster),');return s});
stage(base+'data/notifications/NotificationScheduler.kt',s=>rep(s,'if (uid == null) {','if (uid == null || ph.basaya.app.data.progress.ProgressSession.isDropped(uid) || ph.basaya.app.data.progress.ProgressSession.isArchived(uid)) {'));
stage(base+'data/progress/SkillProgressRepository.kt',s=>{
s=rep(s,'            val closed = lessons.filter { it.dueAt != null && it.dueAt < now }',`            var monitorNow=now
            var eligible=lessons
            val uid=com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
            if(uid!=null) {
                try {
                    val profile=firestore.collection("users").document(uid).get().await()
                    val cid=profile.getString("classId").orEmpty()
                    if(cid.isNotBlank()) {
                        val classroom=firestore.collection("classes").document(cid).get().await()
                        val roster=firestore.collection("classes").document(cid).collection("students").document(uid).get().await()
                        val links=firestore.collection("classes").document(cid).collection("classLessons").get().await().documents
                        monitorNow=minOf(now,ph.basaya.app.data.membership.EnrollmentPolicy.monitoringNow(profile,roster,classroom))
                        eligible=lessons.mapNotNull { lesson ->
                            val link=links.firstOrNull { it.getString("mode")!="practice" && (it.getString("lessonId") ?: it.id)==lesson.lessonId }
                            if(link==null || ph.basaya.app.data.membership.EnrollmentPolicy.exempt(link,roster,profile,classroom))null
                            else lesson.copy(dueAt=ph.basaya.app.data.membership.EnrollmentPolicy.due(link,roster))
                        }
                    }
                } catch(e: kotlinx.coroutines.CancellationException) { throw e }
                catch(e: Exception) { return resultsFrom(docs) }
            }
            val closed = eligible.filter { it.dueAt != null && it.dueAt < monitorNow }`);
s=rep(s,'withItems, now)','withItems, monitorNow)');return s});
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Prepared '+manifest.length+' Android files in '+out);
