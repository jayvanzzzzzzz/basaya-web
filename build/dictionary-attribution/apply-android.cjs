const fs = require('node:fs');
if (process.argv.includes('--finish')) { require('./finish-android.cjs'); return; }
const path = require('node:path');
const root = 'C:/Projects/BaSaya';
function edit(file, before, after) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  if (!source.includes(before)) throw new Error(`Expected source missing: ${file}`);
  fs.writeFileSync(target, source.replace(before, after));
}
const base = 'app/src/main/java/ph/basaya/app/';
fs.writeFileSync(path.join(root, base, 'data/dictionary/DictionaryAttribution.kt'), `package ph.basaya.app.data.dictionary

/** Shared wording with the web dictionary; no attribution badge on imported words. */
object DictionaryAttribution {
    fun lastName(name: String): String {
        val clean = name.trim().replace(Regex("\\\\s+"), " ")
        if (',' in clean) return clean.substringBefore(',').trim()
        val parts = clean.replace(Regex("^Teacher\\\\s+", RegexOption.IGNORE_CASE), "").split(" ").toMutableList()
        if (parts.size > 2 && parts.last().lowercase().trimEnd('.') in setOf("jr", "sr", "ii", "iii", "iv")) parts.removeAt(parts.lastIndex)
        val particles = setOf("de", "del", "dela", "delos", "la", "las", "los", "san", "santa", "sta", "sto", "santo", "di", "da", "dos", "van", "von")
        var start = parts.lastIndex
        while (start > 1 && parts[start - 1].lowercase() in particles) start--
        return parts.drop(start).joinToString(" ")
    }

    fun label(edited: Boolean, role: String, surname: String, name: String): String {
        val actor = if (role == "admin" || (role.isBlank() && Regex("^admin(?:\\\\b|$)", RegexOption.IGNORE_CASE).containsMatchIn(name))) "Admin"
            else listOf("Teacher", surname.ifBlank { lastName(name) }).filter { it.isNotBlank() }.joinToString(" ")
        return (if (edited) "Edited" else "Added") + " by " + actor
    }
}
`);
edit(base + 'data/entity/TeacherDictionaryEntity.kt', 'val fixedSyllables: String', 'val fixedSyllables: String,\n    @androidx.room.ColumnInfo(defaultValue = "\'\'") val attribution: String = ""');
edit(base + 'data/database/AppDatabase.kt', 'version = 17', 'version = 18');
edit(base + 'data/database/AppDatabase.kt', '        @Volatile', `        /** v18: retain dictionary creator/editor attribution offline. */
        private val MIGRATION_17_18 = object : Migration(17, 18) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE teacher_dictionary ADD COLUMN attribution TEXT NOT NULL DEFAULT ''")
            }
        }

        @Volatile`);
edit(base + 'data/database/AppDatabase.kt', '                        MIGRATION_16_17\n', '                        MIGRATION_16_17, MIGRATION_17_18\n');
edit(base + 'data/dictionary/Dictionary.kt', 'val fixedSyllables: String = "",', 'val fixedSyllables: String = "",\n        val attribution: String = "",');
edit(base + 'data/dictionary/Dictionary.kt', 'fixedSyllables = entity.fixedSyllables', 'fixedSyllables = entity.fixedSyllables,\n            attribution = entity.attribution');
edit(base + 'data/dictionary/TeacherDictionarySync.kt', '                        val entries = snapshot.documents.map { doc ->', `                        val entries = snapshot.documents.map { doc ->
                            val created = doc.getTimestamp("createdAt")
                            val updated = doc.getTimestamp("updatedAt")
                            val edited = doc.getBoolean("edited") ?: (
                                (created != null && updated != null && updated > created) ||
                                (doc.getString("updatedBy") != null && doc.getString("createdBy") != null &&
                                    doc.getString("updatedBy") != doc.getString("createdBy")))
                            val actor = if (edited) "updated" else "created"
                            val attribution = DictionaryAttribution.label(
                                edited,
                                doc.getString(actor + "ByRole").orEmpty(),
                                doc.getString(actor + "ByLastName").orEmpty(),
                                doc.getString(actor + "ByName") ?: doc.getString("createdByName").orEmpty()
                            )`);
edit(base + 'data/dictionary/TeacherDictionarySync.kt', 'fixedSyllables = doc.getString("syllables").orEmpty()', 'fixedSyllables = doc.getString("syllables").orEmpty(),\n                                attribution = attribution');
edit(base + 'ui/dictionary/DictionaryActivity.kt', 'if (entry.fromTeacher) {\n            detailCard', 'if (entry.fromTeacher && entry.attribution.isNotBlank()) {\n            detailCard');
edit(base + 'ui/dictionary/DictionaryActivity.kt', 'text = getString(R.string.dict_from_teacher)', 'text = entry.attribution');
console.log('Updated Android dictionary attribution and non-destructive Room migration.');
