const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const stage = path.resolve(__dirname, '../audit/android-class-progress');
const base = 'app/src/main/java/ph/basaya/app/';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifestPath = path.join(stage, 'manifest.json');
if (process.argv.includes('--refresh')) {
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).map(entry => ({
    file: entry.file,
    before: hash(fs.existsSync(path.join(root, entry.file)) ? fs.readFileSync(path.join(root, entry.file)) : ''),
    after: hash(fs.readFileSync(path.join(stage, entry.file))),
  })).filter(entry => entry.before !== entry.after);
  fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
  console.log(`Prepared ${entries.length} follow-up Android files.`);
  process.exit();
}
if (process.argv.includes('--apply')) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest) {
    const target = path.resolve(root, entry.file);
    if (!target.startsWith(path.resolve(root) + path.sep) || !/^(app\/src\/main\/java\/ph\/basaya\/app\/|app\/src\/main\/res\/values\/strings_profile\.xml$)/.test(entry.file)) throw Error('Invalid target');
    if (hash(fs.existsSync(target) ? fs.readFileSync(target) : '') !== entry.before) throw Error('File changed since staging: ' + entry.file);
    if (hash(fs.readFileSync(path.join(stage, entry.file))) !== entry.after) throw Error('Staged file changed');
  }
  for (const entry of manifest) {
    const target = path.resolve(root, entry.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(stage, entry.file), target);
  }
  console.log(`Applied ${manifest.length} reviewed Android class-progress files.`);
  process.exit();
}
const manifest = [];
function edit(file, change) {
  const target = path.join(root, file);
  const before = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.from('');
  const after = change(before.toString('utf8').replace(/\r\n/g, '\n'));
  if (after === before.toString('utf8')) return;
  const staged = path.join(stage, file);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, after);
  manifest.push({ file, before: hash(before), after: hash(Buffer.from(after)) });
}
function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw Error('Expected unique anchor: ' + before.slice(0, 100));
  return source.replace(before, after);
}
function addImport(source) {
  return source.replace(/^(package [^\n]+\n)/, '$1\nimport ph.basaya.app.data.progress.ProgressSession\n');
}
// Stamp every mutation at enqueue time. Firestore persists the stamp with offline
// writes; a fresh assessment or another class uses a different server-owned token.
edit(base + 'data/progress/ProgressSession.kt', () => `package ph.basaya.app.data.progress

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot

object ProgressSession {
    private lateinit var prefs: SharedPreferences

    fun initialize(context: Context) {
        prefs = context.applicationContext.getSharedPreferences("class_progress_session", Context.MODE_PRIVATE)
    }

    fun bind(uid: String, profile: DocumentSnapshot) {
        if (!profile.exists()) return
        prefs.edit().putString(uid + ":class", profile.getString("classId").orEmpty())
            .putString(uid + ":session", profile.getString("progressSession").orEmpty()).apply()
    }

    fun stamp(uid: String, fields: Map<String, Any>): Map<String, Any> = fields + mapOf(
        "classId" to prefs.getString(uid + ":class", "").orEmpty(),
        "progressSession" to prefs.getString(uid + ":session", "").orEmpty()
    )

    /** Local work belongs to a student and assessment record, never just a lesson. */
    fun gameKey(lessonId: String): String {
        val uid = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
        val session = prefs.getString(uid + ":session", "").orEmpty().ifBlank { "legacy" }
        return "$uid:$session:$lessonId"
    }
}
`);
edit(base + 'BaSayaApp.kt', s => once(addImport(s), '        ThemeMode.applySaved(this)', '        ProgressSession.initialize(this)\n        ThemeMode.applySaved(this)'));
edit(base + 'data/repository/LessonRepository.kt', s => {
  s = addImport(s);
  s = once(s, '        val classId = userDoc.getString("classId")', '        ProgressSession.bind(userId, userDoc)\n        val classId = userDoc.getString("classId")');
  return once(s, 'deleteAdvancedProgress(resetGames)', 'deleteAdvancedProgress(resetGames.map { ProgressSession.gameKey(it) })');
});
edit(base + 'ui/fragment/HomeFragment.kt', s => {
  s = addImport(s);
  s = once(s, '                val className = doc.getString("className")', '                ProgressSession.bind(uid, doc)\n                val className = doc.getString("className")');
  return once(s, 'val signature = listOf(doc.getString("classId"),', 'val signature = listOf(doc.getString("progressSession"), doc.getString("classId"),');
});
for (const [file, uid, anchor] of [
  ['data/repository/LectureRepository.kt', 'userId', '.set(mapOf("lectureFinished" to true), SetOptions.merge())'],
  ['data/progress/LessonResume.kt', 'uid', '.set(mapOf("resume" to mapOf(part to FieldValue.delete())), SetOptions.merge())'],
]) edit(base + file, s => {
  if (!file.includes('data/progress/')) s = addImport(s);
  const match = anchor.match(/\.set\((mapOf\(.+\)), SetOptions.merge\(\)\)/);
  s = once(s, anchor, '.set(ProgressSession.stamp(' + uid + ', ' + match[1] + '), SetOptions.merge())');
  if (file.includes('LessonResume')) {
    s = once(s, 'mapOf("resume" to mapOf(part to state + ("updatedAt" to FieldValue.serverTimestamp()))),', 'ProgressSession.stamp(uid, mapOf("resume" to mapOf(part to state + ("updatedAt" to FieldValue.serverTimestamp())))),');
    s = once(s, 'private fun progressKey(uid: String, lessonId: String) = "$uid:$lessonId"', 'private fun progressKey(uid: String, lessonId: String) = "$uid:" + ProgressSession.gameKey(lessonId)');
  }
  return s;
});
edit(base + 'data/progress/SkillProgressRepository.kt', s => {
  s = once(s, '.set(mapOf("skills" to mapOf(skill.key to record)), SetOptions.merge())', '.set(ProgressSession.stamp(uid, mapOf("skills" to mapOf(skill.key to record))), SetOptions.merge())');
  return once(s, '.set(mapOf("skills" to mapOf(Skill.TALASALITAAN.key to record)), SetOptions.merge())', '.set(ProgressSession.stamp(uid, mapOf("skills" to mapOf(Skill.TALASALITAAN.key to record))), SetOptions.merge())');
});
for (const [file, property] of [['QuizRepository.kt', 'quiz'], ['PronunciationRepository.kt', 'pronunciation'], ['ActivityRepository.kt', 'activity']]) {
  edit(base + 'data/repository/' + file, s => {
    s = addImport(s);
    // Limit this rewrite to the result function; content download code stays intact.
    const start = s.indexOf('    fun ' + (property === 'quiz' ? 'saveQuizResult' : 'markActivityFinished') + '(');
    if (start < 0) throw Error('Result writer missing: ' + file);
    let tail = s.slice(start);
    tail = once(tail, '                mapOf(\n', '                ProgressSession.stamp(userId, mapOf(\n');
    tail = once(tail, 'FieldValue.serverTimestamp()\n                )', 'FieldValue.serverTimestamp()\n                ))');
    // Merge works for both new records and restored records.
    if (property !== 'activity') {
      tail = once(tail, '            .update(\n', '            .set(\n');
      tail = once(tail, '                ))\n            )', '                )), com.google.firebase.firestore.SetOptions.merge()\n            )');
    }
    return s.slice(0, start) + tail;
  });
}
for (const file of ['data/repository/CrosswordRepository.kt', 'ui/game/CrosswordActivity.kt', 'ui/game/CrosswordCompleteScreen.kt']) {
  edit(base + file, s => {
    s = addImport(s).replaceAll('.getProgress(lessonId)', '.getProgress(ProgressSession.gameKey(lessonId))');
    s = s.replace(/(CrosswordProgress\(\s*lessonId = )lessonId/g, '$1ProgressSession.gameKey(lessonId)');
    if (file.includes('CrosswordActivity')) {
      s = once(s, '                                "gameScore" to currentLevelNumber,', '                                "classId" to ProgressSession.stamp(uid, emptyMap())["classId"],\n                                "progressSession" to ProgressSession.stamp(uid, emptyMap())["progressSession"],\n                                "gameScore" to currentLevelNumber,');
      s = once(s, '                        "level" to (progress?.currentLevel ?: 1)', '                        "level" to (progress?.currentLevel ?: 1),\n                        "foundWords" to foundList.toList()');
    }
    if (file.includes('CrosswordRepository')) {
      s = once(s, '                        completedLevel = completedLevel,\n                        foundWords = ""', '                        completedLevel = completedLevel,\n                        foundWords = ((doc.get("resume.game.foundWords") as? List<*>)?.filterIsInstance<String>().orEmpty()).joinToString(",")');
    }
    return s;
  });
}
edit(base + 'data/cache/CompletionStateCache.kt', s => {
  s = addImport(s);
  s = once(s, '    fun save(lessonId: String, state: State) {', '    fun save(lessonId: String, state: State) {\n        val scopedLesson = ProgressSession.gameKey(lessonId)');
  s = once(s, '    fun get(lessonId: String): State? {', '    fun get(lessonId: String): State? {\n        val scopedLesson = ProgressSession.gameKey(lessonId)');
  return s.replaceAll('${lessonId}', '${scopedLesson}');
});
edit('app/src/main/res/values/strings_profile.xml', s => once(s, 'Kapag pumayag ang iyong guro, aalis ka sa %1$s at mabubura ang iyong progreso sa klaseng ito.', 'Kapag pumayag ang iyong guro, aalis ka sa %1$s. Itatabi ang iyong progreso. Maaari itong ibalik kapag inaprubahan ng guro ang muli mong pagsali sa parehong klase.'));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Staged ${manifest.length} Android class-progress files. Review audit/android-class-progress/ before --apply.`);
