const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const stage = __dirname;
const game = 'app/src/main/java/ph/basaya/app/ui/game/';
const manifest = [];
function stageFile(relative, transform) {
  const target = path.join(root, relative);
  const original = fs.existsSync(target) ? fs.readFileSync(target) : null;
  const next = transform(original?.toString('utf8'));
  const staged = path.join(stage, 'files', relative);
  fs.mkdirSync(path.dirname(staged), {recursive:true});
  fs.writeFileSync(staged, next);
  manifest.push({relative, hash:original ? crypto.createHash('sha256').update(original).digest('hex') : null});
}
function replace(source, before, after) {
  if (!source.includes(before)) throw Error('Missing expected source: ' + before.slice(0,80));
  return source.replace(before, after);
}
for (const name of ['GameWordOutbox.kt', 'GameWordSaves.kt'])
  stageFile(game + name, () => fs.readFileSync(path.join(stage,name),'utf8'));
stageFile('app/src/test/java/ph/basaya/app/ui/game/GameWordOutboxTest.kt', () => fs.readFileSync(path.join(stage,'GameWordOutboxTest.kt'),'utf8'));
stageFile(game + 'PreparedCrossword.kt', source => {
  source = source.replace(/\r\n/g,'\n');
  return replace(source, '            val progress = AppDatabase.getDatabase(context).crosswordProgressDao().getProgress(key)', `            fun ownsSession() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
                ProgressSession.gameKey(lessonId, owner) == key
            // Recover every locally revealed word before selecting the authoritative next level.
            GameWordSaves.open(context, key, ::ownsSession).drain { command ->
                GameWordSaves.send(context, key, levels, assessment, command, ::ownsSession)
            }
            val progress = AppDatabase.getDatabase(context).crosswordProgressDao().getProgress(key)`);
});
stageFile(game + 'CrosswordActivity.kt', source => {
  source = source.replace(/\r\n/g,'\n');
  source = replace(source, 'import ph.basaya.app.ui.AssessmentUi\n', 'import kotlinx.coroutines.CancellationException\nimport kotlinx.coroutines.Job\n');
  source = replace(source, '    private var submitting = false', `    private var saveJob: Job? = null
    private lateinit var wordSaves: GameWordOutbox
    private lateinit var syncStatus: TextView
    private var saveRejected = false`);
  source = replace(source, '        gameAttemptId = ready.attemptId', `        gameAttemptId = ready.attemptId
        wordSaves = GameWordSaves.open(this, progressKey, ::ownsProgress)`);
  source = replace(source, '        tempTv = findViewById(R.id.tempTv)', `        syncStatus = findViewById(R.id.cwSyncStatus)
        syncStatus.setOnClickListener {
            if (saveRejected) finish() else syncWords()
        }
        tempTv = findViewById(R.id.tempTv)`);
  source = replace(source, '!::lineView.isInitialized || isShuffling || levelCompleted', '!::lineView.isInitialized || isShuffling || levelCompleted || saveRejected');
  const start = source.indexOf('    private fun onWordFound(wordIndex: Int) {');
  const end = source.indexOf('    private fun findTouchLetter(', start);
  if (start < 0 || end < 0) throw Error('Missing game submit block');
  return source.slice(0,start) + `    private fun onWordFound(wordIndex: Int) {
        if (!ownsProgress() || levelCompleted || saveRejected) return
        val word = currentLevelWords?.getOrNull(wordIndex) ?: return
        if (isWordFound(word)) return
        val words = findWord + word
        val completed = currentLevelWords.orEmpty().all { target -> words.any { normalize(it) == normalize(target) } }
        // Persist before revealing; swipes never wait for the network.
        try {
            wordSaves.enqueue(fields("operation" to if (completed) "finish" else "answer",
                "level" to currentLevel!!.level, "attemptId" to gameAttemptId,
                "word" to word, "words" to words))
        } catch (e: Exception) {
            showSyncStatus(getString(R.string.cw_save_local_error))
            return
        }
        findWord = words.toMutableList()
        previewSuccess()
        revealWord(wordIndex)
        updateProgress(animate = true)
        if (completed) {
            levelCompleted = true
            celebrateLevel()
            showSyncStatus(getString(R.string.cw_sync_finishing))
        }
        syncWords()
    }

    private fun showSyncStatus(message: String) {
        syncStatus.text = message
        syncStatus.visibility = View.VISIBLE
    }

    private fun syncWords() {
        if (saveJob?.isActive == true || saveRejected || !ownsProgress()) return
        saveJob = lifecycleScope.launch {
            var retry = 0
            while (ownsProgress()) {
                try {
                    val accepted = wordSaves.drain { command ->
                        GameWordSaves.send(this@CrosswordActivity, progressKey, allGameLevels,
                            assessment, command, ::ownsProgress)
                    }
                    if (!ownsProgress()) { finish(); return@launch }
                    syncStatus.visibility = View.GONE
                    if (levelCompleted && accepted != null) {
                        // The board celebrates immediately; recorded completion waits for acceptance.
                        delay(2000)
                        if (!ownsProgress()) { finish(); return@launch }
                        startActivity(Intent(this@CrosswordActivity, CrosswordCompleteScreen::class.java).apply {
                            putExtra("NEXT_LEVEL", allGameLevels.indexOf(currentLevel) + 1)
                            putExtra("LESSON_ID", lessonId)
                        })
                        finish()
                    }
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (!ownsProgress()) { finish(); return@launch }
                    if (e is AssessmentFailure && !e.retryable) {
                        saveRejected = true
                        showSyncStatus(getString(R.string.cw_sync_rejected))
                        return@launch
                    }
                    showSyncStatus(getString(R.string.cw_sync_pending))
                    delay((1000L shl retry.coerceAtMost(4)).coerceAtMost(10000L))
                    retry++
                }
            }
        }
    }

` + source.slice(end);
});
stageFile('app/src/main/res/layout/activity_crossword.xml', source => {
  source = source.replace(/\r\n/g,'\n');
  // Reserve a compact status line between the header and puzzle only when needed.
  source = replace(source, '        <!-- Word being spelled -->', `        <TextView
            android:id="@+id/cwSyncStatus"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:minHeight="44dp"
            android:gravity="center"
            android:paddingHorizontal="16dp"
            android:fontFamily="@font/be_vietnam_bold"
            android:textColor="@color/cw_ink"
            android:textSize="12sp"
            android:accessibilityLiveRegion="polite"
            android:visibility="gone"
            app:layout_constraintTop_toBottomOf="@id/btnBack"
            app:layout_constraintStart_toStartOf="parent"
            app:layout_constraintEnd_toEndOf="parent" />

        <!-- Word being spelled -->`);
  return replace(source, 'app:layout_constraintTop_toBottomOf="@id/btnBack">', 'app:layout_constraintTop_toBottomOf="@id/cwSyncStatus">');
});
stageFile('app/src/main/res/values/strings_crossword_sync.xml', () => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="cw_sync_finishing">Sine-save ang antas…</string>
    <string name="cw_sync_pending">Naka-save sa telepono. Hindi pa naka-sync; awtomatikong susubukan muli.</string>
    <string name="cw_sync_rejected">Hindi tinanggap ang progreso. Pindutin dito upang bumalik sa aralin at suriin ito.</string>
    <string name="cw_save_local_error">Hindi ma-save sa telepono. Magbakante ng storage at buuin muli ang salita.</string>
</resources>
`);
fs.writeFileSync(path.join(stage,'manifest.json'), JSON.stringify(manifest,null,2));
console.log('Prepared ' + manifest.length + ' scoped files.');
