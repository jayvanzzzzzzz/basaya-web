const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const manifest = [];
function stage(relative, transform) {
  const target = path.join(root, relative);
  const before = fs.existsSync(target) ? fs.readFileSync(target) : null;
  const output = transform(before?.toString('utf8').replace(/\r\n/g,'\n'));
  const file = path.join(__dirname, 'files', relative);
  fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, output);
  manifest.push({relative, hash:before ? crypto.createHash('sha256').update(before).digest('hex') : null});
}
function replace(s, a, b) {
  if (!s.includes(a)) throw Error('Missing expected source: ' + a.slice(0,100));
  return s.replace(a,b);
}
const ui = 'app/src/main/java/ph/basaya/app/ui/activity/';
for (const name of ['PreparedPractice.kt','ActivityAttemptQueue.kt','ActivityAttemptSaves.kt'])
  stage(ui + name, () => fs.readFileSync(path.join(__dirname,name),'utf8'));
stage('app/src/test/java/ph/basaya/app/ui/activity/ActivityAttemptQueueTest.kt', () => fs.readFileSync(path.join(__dirname,'ActivityAttemptQueueTest.kt'),'utf8'));
stage('app/src/main/java/ph/basaya/app/data/model/ActivityPage.kt', s => replace(s, '    val pickCount: Int? = null', '    val pickCount: Int? = null,\n    val answerKeyLoaded: Boolean = false'));
stage('app/src/main/java/ph/basaya/app/data/assessment/SubmissionDispatcher.kt', s => {
  s = replace(s, '            if (answer(existing) != answer(request))', `            if ((request.has("eventId") && existing.get("eventId") != request.get("eventId")) || answer(existing) != answer(request))`);
  return replace(s, 'if (get("operation")?.asString in listOf("answer", "speech")) addProperty', 'if (!has("eventId") && get("operation")?.asString in listOf("answer", "speech")) addProperty');
});
stage('app/src/test/java/ph/basaya/app/data/assessment/SubmissionDispatcherTest.kt', s => {
  const end = s.lastIndexOf('}');
  return s.slice(0,end) + `    @Test fun durableActivityAttemptIdsArePreserved() = runBlocking {
        val store = Storage()
        val command = answer().apply { addProperty("eventId", "persisted-activity-attempt") }
        val dispatcher = SubmissionDispatcher(store, { true }) {
            assertEquals("persisted-activity-attempt", it.get("eventId").asString)
            JsonObject()
        }
        dispatcher.submit("activity", command)
        assertTrue(store.values.isEmpty())
    }
` + s.slice(end);
});
stage(ui + 'PracticeActivity.kt', s => {
  s = replace(s, 'import ph.basaya.app.ui.AssessmentUi', 'import kotlinx.coroutines.CancellationException\nimport kotlinx.coroutines.Job\nimport kotlinx.coroutines.delay');
  s = replace(s, '    private var acceptedRight: Boolean? = null\n    private var submitting = false', `    private lateinit var preparedState: PreparedPractice
    private lateinit var attempts: ActivityAttemptQueue
    private lateinit var syncStatus: TextView
    private var saveJob: Job? = null
    private var saveRejected = false
    private var finishQueued = false`);
  s = replace(s, '        assessment = ready.assessment', `        preparedState = ready
        attempts = ActivityAttemptSaves.open(this, ready.queueKey, ready::isCurrent)
        syncStatus = findViewById(R.id.acSyncStatus)
        syncStatus.setOnClickListener { if (saveRejected) finish() else syncAttempts() }
        assessment = ready.assessment`);
  const start = s.indexOf('            if (submitting) return@setOnClickListener');
  const end = s.indexOf('\n        }\n    }\n\n    // Progress',start);
  if(start<0 || end<0) throw Error('Missing check listener');
  s = s.slice(0,start) + `            if (saveRejected || finishQueued || !preparedState.isCurrent()) return@setOnClickListener
            if (!hasChecked) {
                val right = isPageCorrect(practiceData.pages[currentPageIndex])
                val nextLives = if (right) lives else lives - 1
                val over = right || nextLives == 0
                if (assessment != null && assessment?.practice != true) {
                    try {
                        attempts.enqueue(fields("operation" to "answer", "index" to currentPageIndex,
                            "selected" to selectedIndices.sorted(), "attemptId" to preparedState.attemptId,
                            "contentVersion" to preparedState.contentVersion), fields(
                            "right" to right, "done" to if (over) currentPageIndex + 1 else currentPageIndex,
                            "score" to score + if (right) 1 else 0,
                            "retries" to retries + if (right) 0 else 1,
                            "lives" to if (over) MAX_LIVES else nextLives))
                    } catch (e: Exception) {
                        showSyncStatus(getString(R.string.ac_save_local_error))
                        return@setOnClickListener
                    }
                }
                checkAnswer()
                syncAttempts()
            } else {
                goToNext()
            }` + s.slice(end);
  s = replace(s,'        acceptedRight = null\n','');
  s = replace(s,'acceptedRight ?: isPageCorrect(practiceData.pages[currentPageIndex])','isPageCorrect(practiceData.pages[currentPageIndex])');
  s = replace(s,'acceptedRight ?: isPageCorrect(page)','isPageCorrect(page)');
  const finishStart = s.indexOf('    private fun finishActivity() {');
  const finishEnd = s.indexOf('    private fun showCompletion(',finishStart);
  if(finishStart<0 || finishEnd<0) throw Error('Missing finish');
  s = s.slice(0,finishStart) + `    private fun finishActivity() {
        if (finishQueued || saveRejected || !preparedState.isCurrent()) return
        if (assessment == null || assessment?.practice == true) {
            showCompletion(null)
            return
        }
        try {
            attempts.enqueue(fields("operation" to "finish", "attemptId" to preparedState.attemptId,
                "contentVersion" to preparedState.contentVersion))
        } catch (e: Exception) {
            showSyncStatus(getString(R.string.ac_save_local_error))
            return
        }
        finishQueued = true
        btnAction.isEnabled = false
        showSyncStatus(getString(R.string.ac_sync_finishing))
        syncAttempts()
    }

    private fun showSyncStatus(message: String) {
        syncStatus.text = message
        syncStatus.visibility = View.VISIBLE
    }

    private fun syncAttempts() {
        val session = assessment?.takeUnless { it.practice } ?: return
        if (saveJob?.isActive == true || saveRejected || !preparedState.isCurrent()) return
        saveJob = lifecycleScope.launch {
            var retry = 0
            while (preparedState.isCurrent()) {
                try {
                    val result = attempts.drain { command ->
                        session.request(command.text("operation"), "activity", command)
                    }
                    if (!preparedState.isCurrent()) { finish(); return@launch }
                    syncStatus.visibility = View.GONE
                    if (finishQueued && result?.flag("finished") == true) showCompletion(result)
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (!preparedState.isCurrent()) { finish(); return@launch }
                    if (e is AssessmentFailure && !e.retryable) {
                        saveRejected = true
                        btnAction.isEnabled = false
                        for (i in 0 until chipsContainer.childCount) chipsContainer.getChildAt(i).isEnabled = false
                        showSyncStatus(getString(R.string.ac_sync_rejected))
                        return@launch
                    }
                    showSyncStatus(getString(R.string.ac_sync_pending))
                    delay((1000L shl retry.coerceAtMost(4)).coerceAtMost(10000L))
                    retry++
                }
            }
        }
    }

` + s.slice(finishEnd);
  return s;
});
stage('app/src/main/res/layout/activity_practice.xml', s => replace(s, '        <LinearLayout\n            android:id="@+id/llProgressBars"', `        <TextView
            android:id="@+id/acSyncStatus"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:minHeight="44dp"
            android:gravity="center"
            android:paddingHorizontal="20dp"
            android:paddingVertical="6dp"
            android:fontFamily="@font/quicksand_medium"
            android:textColor="@color/ac_ink"
            android:textSize="13sp"
            android:accessibilityLiveRegion="polite"
            android:visibility="gone" />

        <LinearLayout
            android:id="@+id/llProgressBars"`));
stage('app/src/main/res/values/strings_activity_sync.xml', () => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="ac_sync_finishing">Sine-save ang resulta…</string>
    <string name="ac_sync_pending">Naka-save sa telepono. Hindi pa naka-sync; awtomatikong susubukan muli.</string>
    <string name="ac_sync_rejected">Nagbago o hindi tinanggap ang progreso. Pindutin dito upang bumalik sa aralin at suriin ito.</string>
    <string name="ac_save_local_error">Hindi ma-save ang sagot sa telepono. Magbakante ng storage at subukan muli.</string>
</resources>
`);
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Prepared ' + manifest.length + ' Activity files.');
