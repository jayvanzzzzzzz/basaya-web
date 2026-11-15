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
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, output);
  manifest.push({relative, hash:before ? crypto.createHash('sha256').update(before).digest('hex') : null});
}
function replace(s, a, b) {
  if (!s.includes(a)) throw Error('Missing expected source: ' + a.slice(0,100));
  return s.replace(a,b);
}
stage('app/src/main/java/ph/basaya/app/ui/activity/PreparedPractice.kt', () => fs.readFileSync(path.join(__dirname,'PreparedPractice.kt'),'utf8'));
stage('app/src/main/java/ph/basaya/app/ui/DashboardActivity.kt', s => {
  s = replace(s,'import ph.basaya.app.ui.activity.PracticeActivity', 'import ph.basaya.app.ui.activity.PreparedPractice\nimport ph.basaya.app.ui.activity.PracticeAlreadyFinished\nimport ph.basaya.app.ui.activity.PracticeActivity');
  s = replace(s,'        const val EXTRA_PREPARE_GAME = "PREPARE_GAME"', '        const val EXTRA_PREPARE_GAME = "PREPARE_GAME"\n        const val EXTRA_PREPARE_ACTIVITY = "PREPARE_ACTIVITY"');
  s = replace(s,'    private var preparedGameToken: String? = null', '    private var preparedPracticeToken: String? = null\n    private var preparedGameToken: String? = null');
  s = replace(s,'        if (intent.getBooleanExtra(EXTRA_PREPARE_GAME, false)) {', `        if (intent.getBooleanExtra(EXTRA_PREPARE_ACTIVITY, false)) {
            intent.removeExtra(EXTRA_PREPARE_ACTIVITY)
            openContentIfAvailable(PracticeActivity::class.java)
        }
        if (intent.getBooleanExtra(EXTRA_PREPARE_GAME, false)) {`);
  s = replace(s,'            } catch (e: GameAlreadyFinished) {', `            } catch (e: PracticeAlreadyFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Nakumpleto mo na ang gawaing ito. Hindi na ito maaaring ulitin."
                )
            } catch (e: GameAlreadyFinished) {`);
  s = replace(s,'        if (destination == CrosswordActivity::class.java) {\n            findViewById<View>', `        if (destination == PracticeActivity::class.java) {
            findViewById<View>(R.id.activityPlayIcon).visibility = if (loading) View.INVISIBLE else View.VISIBLE
            findViewById<View>(R.id.activityPreparing).visibility = if (loading) View.VISIBLE else View.GONE
            tvActivityCount.visibility = if (loading) View.GONE else View.VISIBLE
            findViewById<View>(R.id.activityPreparingText).visibility = if (loading) View.VISIBLE else View.GONE
            activityCard.isEnabled = !loading
            return
        }
        if (destination == CrosswordActivity::class.java) {
            findViewById<View>`);
  s = replace(s,'    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {', `    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {
        if (destination == PracticeActivity::class.java) {
            preparedPracticeToken = null
            preparedPracticeToken = PreparedPractice.store(PreparedPractice.prepare(this, lessonId))
            return AudioWait.READY
        }`);
  s = replace(s,`            PracticeActivity::class.java -> {
                val activity = ActivityRepository(this).getActivity(lessonId)
                    ?.takeIf { it.pages.isNotEmpty() }
                    ?: throw IllegalStateException("No activity content is available")
                LessonContentPrefetch.storeActivity(lessonId, activity)
                AudioWait.READY
            }
`, '');
  s = replace(s,'            if (reading != null) putExtra(ReadingActivity.EXTRA_PREPARED_READING, reading)', `            if (reading != null) putExtra(ReadingActivity.EXTRA_PREPARED_READING, reading)
            if (destination == PracticeActivity::class.java) {
                putExtra(PracticeActivity.EXTRA_PREPARED_ACTIVITY, preparedPracticeToken)
            }`);
  return s;
});
stage('app/src/main/java/ph/basaya/app/ui/activity/PracticeActivity.kt', s => {
  s = replace(s,'    private lateinit var activityRepository: ActivityRepository\n','');
  s = replace(s,'    private companion object {\n        const val MAX_LIVES = 3', `    companion object {
        const val EXTRA_PREPARED_ACTIVITY = "PREPARED_ACTIVITY"
        private const val MAX_LIVES = 3`);
  s = replace(s,'    private var allAnswered = false\n','');
  s = replace(s,'import ph.basaya.app.data.repository.ActivityRepository\n','');
  s = replace(s,'import ph.basaya.app.data.progress.LessonResume\n','');
  s = replace(s,'        tvPageTag = findViewById(R.id.tvPageTag)', `        val ready = PreparedPractice.take(intent.getStringExtra(EXTRA_PREPARED_ACTIVITY), lessonId)
        if (ready == null) {
            // Direct entry or process recreation must prepare on the dashboard as well.
            startActivity(Intent(this, ph.basaya.app.ui.DashboardActivity::class.java).apply {
                putExtra("LESSON_ID", lessonId)
                putExtra(ph.basaya.app.ui.DashboardActivity.EXTRA_PREPARE_ACTIVITY, true)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
            finish()
            return
        }

        tvPageTag = findViewById(R.id.tvPageTag)`);
  const start = s.indexOf('        activityRepository = ActivityRepository(this)');
  const end = s.indexOf('            setupProgressTrack()',start);
  if(start<0 || end<0) throw Error('Missing initialization');
  s = s.slice(0,start) + `        assessment = ready.assessment
        practiceData = ready.content
        currentPageIndex = ready.pageIndex
        score = ready.score
        retries = ready.retries
        lives = ready.lives
        tvActivityTitle.text = practiceData.title
        tvInstruction.text = practiceData.instruction
        if (ready.completion != null) {
            showCompletion(ready.completion)
            return
        }

` + s.slice(end);
  s = replace(s,`            // Every page was answered before closing: only the result is left to save.
            if (allAnswered) {
                finishActivity()
                return@run
            }

`, '');
  // Remove the old preparation lambda's closing brace, retaining the button handler unchanged.
  s = replace(s,'            }\n        }\n    }\n\n    // Progress', '            }\n    }\n\n    // Progress');
  const initStart = s.indexOf('            setupProgressTrack()');
  const initEnd = s.indexOf('\n    }\n\n    // Progress',initStart);
  s = s.slice(0,initStart) + s.slice(initStart,initEnd).split('\n').map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n') + s.slice(initEnd);
  const finishStart = s.indexOf('            val intent = Intent(this@PracticeActivity, PracticeCompleteScreen::class.java).apply {');
  const finishEnd = s.indexOf('\n    // Feedback', finishStart);
  if(finishStart<0 || finishEnd<0) throw Error('Missing completion');
  s = s.slice(0,finishStart) + `            showCompletion(accepted)
        }
    }

    private fun showCompletion(accepted: com.google.gson.JsonObject?) {
        val intent = Intent(this, PracticeCompleteScreen::class.java).apply {
            putExtra("SCORE", accepted?.number("score", score) ?: score)
            putExtra("TOTAL", accepted?.number("total", practiceData.pages.size) ?: practiceData.pages.size)
            putExtra("ACTIVITY_TITLE", practiceData.title)
            putExtra("LESSON_ID", lessonId)
        }
        startActivity(intent)
        finish()
    }
` + s.slice(finishEnd);
  return s;
});
stage('app/src/main/res/layout/activity_dashboard.xml', s => {
  const start = s.indexOf('android:id="@+id/activityCard"');
  const end = s.indexOf('</com.google.android.material.card.MaterialCardView>',start);
  if(start<0 || end<0) throw Error('Missing activity card');
  let card = s.slice(start,end);
  card = replace(card,`                                            style="@style/Dl.Count" />`, `                                            style="@style/Dl.Count" />
                                        <TextView
                                            android:id="@+id/activityPreparingText"
                                            style="@style/Dl.Count"
                                            android:text="@string/lesson_dash_activity_preparing"
                                            android:accessibilityLiveRegion="polite"
                                            android:visibility="gone" />`);
  card = replace(card,`                                    <ImageView
                                        style="@style/Dl.Play" />`, `                                    <ImageView
                                        android:id="@+id/activityPlayIcon"
                                        style="@style/Dl.Play" />
                                    <ProgressBar
                                        android:id="@+id/activityPreparing"
                                        android:layout_width="24dp"
                                        android:layout_height="24dp"
                                        android:layout_gravity="center"
                                        android:indeterminateTint="@color/dash_gawain"
                                        android:importantForAccessibility="no"
                                        android:visibility="gone" />`);
  return s.slice(0,start) + card + s.slice(end);
});
stage('app/src/main/res/values/strings_practice_preparation.xml', () => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="lesson_dash_activity_preparing">Inihahanda ang pagsasanay…</string>
</resources>
`);
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Prepared ' + manifest.length + ' files.');
