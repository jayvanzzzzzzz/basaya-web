const fs=require('fs');const root='C:/Projects/BaSaya/',base='app/src/main/java/ph/basaya/app/',path=require('path'),crypto=require('crypto'),out=path.join(__dirname,'staged'),manifest=[];
function stage(file,fn){let original=fs.readFileSync(root+file),s=original.toString('utf8').replace(/\r\n/g,'\n'),n=fn(s);if(n===s)throw Error(file);let target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,n);manifest.push({file,hash:crypto.createHash('sha256').update(original).digest('hex')});}
stage(base+'data/membership/EnrollmentAccess.kt',s=>s.replace('private var currentClass: String? = null','private var currentClass: String? = null\n    private var lastSignature: List<String?>? = null\n    private var classSignature: List<String?>? = null').replace('currentClass=null','currentClass=null;lastSignature=null;classSignature=null').replace('                    ProgressSession.bind(uid,doc)',`                    val signature=listOf(doc.getString("classId"),doc.getString("enrollmentStatus"),doc.getString("enrollmentVersion"),doc.getString("progressSession"))
                    if(signature==lastSignature)return@addSnapshotListener
                    lastSignature=signature
                    ProgressSession.bind(uid,doc)`).replace('                            ProgressSession.bindClass(uid,classroom)',`                            val next=listOf(classroom.getString("classVersion"),classroom.getBoolean("membershipClosed").toString())
                            if(classSignature==next)return@addSnapshotListener
                            classSignature=next
                            ProgressSession.bindClass(uid,classroom)`));
stage(base+'data/assessment/AssessmentSession.kt',s=>s.replace('private fun key(part: String) = "$uid:$classId:$session:$lessonId:$part"',`private val versionKey=if(enrollmentVersion.isBlank() && classVersion.isBlank()) "" else ":$enrollmentVersion:$classVersion"
    private fun key(part: String) = "$uid:$classId:$session$versionKey:$lessonId:$part"`));
stage(base+'data/progress/ProgressSession.kt',s=>s.replace('    fun stamp(uid:',`    fun participationKey(uid: String): String {
        val a=prefs.getString(uid + ":enrollmentVersion", "").orEmpty()
        val b=prefs.getString(uid + ":classVersion", "").orEmpty()
        return if(a.isBlank() && b.isBlank()) "" else ":$a:$b"
    }
    fun stamp(uid:`));
stage(base+'data/assessment/OfflineLessons.kt',s=>s.replace(':${stamp["enrollmentVersion"]}:${stamp["classVersion"]}:$lessonId','${ProgressSession.participationKey(uid)}:$lessonId'));
stage(base+'ui/pronunciation/ReadingSession.kt',s=>s.replaceAll(':${scope["enrollmentVersion"]}:${scope["classVersion"]}:$lessonId','${ProgressSession.participationKey(uid)}:$lessonId'));
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Prepared native edge fixes.');
