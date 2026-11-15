const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest=[];
function edit(file, transform) {
 const target=path.join(root,file), before=fs.existsSync(target)?fs.readFileSync(target):Buffer.alloc(0);
 const after=transform(before.toString('utf8').replace(/\r\n/g,'\n'));
 const out=path.join(__dirname,'files',file); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,after);
 manifest.push({file,before:hash(before),after:hash(Buffer.from(after))});
}
function once(s,a,b) {if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))throw Error('Anchor: '+a);return s.replace(a,b);}
edit('app/src/main/java/ph/basaya/app/ui/quiz/PreparedQuiz.kt',()=>`package ph.basaya.app.ui.quiz

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.model.Quiz
import ph.basaya.app.data.progress.PracticeLessons
import ph.basaya.app.data.progress.ProgressSession
import ph.basaya.app.data.repository.QuizRepository
import ph.basaya.app.utils.Network
import java.util.UUID

/** Session verification and resume loading finish on the dashboard before questions appear. */
internal data class PreparedQuiz(
    val lessonId: String,
    val owner: String,
    val sessionStamp: Map<String, Any>,
    val assessment: AssessmentSession?,
    val quiz: Quiz,
    val attemptId: String,
    val answered: Set<Int>,
    val missed: List<String>,
    val score: Int
) {
    fun isCurrent() = FirebaseAuth.getInstance().currentUser?.uid == owner &&
        ProgressSession.stamp(owner, emptyMap()) == sessionStamp

    companion object {
        private var pending: Pair<String, PreparedQuiz>? = null

        suspend fun prepare(context: Context, lessonId: String): PreparedQuiz {
            val owner = FirebaseAuth.getInstance().currentUser?.uid
                ?: throw AssessmentFailure(401, "Mag-log in muli.")
            val assessment = if (!PracticeLessons.refresh(context, lessonId) || Network.isOnline(context))
                AssessmentSession.open(context.applicationContext, lessonId) else null
            val stamp = ProgressSession.stamp(owner, emptyMap())
            val quiz = QuizRepository(context).getQuiz(lessonId)
                ?.takeIf { it.questions.isNotEmpty() } ?: error("No quiz content is available")
            if (assessment == null && quiz.questions.any { it.requiresServerValidation })
                throw AssessmentFailure(0, "Kumonekta upang masuri ang mga sagot sa pagsasanay.")
            val graded = assessment?.takeUnless { it.practice }
            if (graded?.progress()?.flag("quizFinished") == true) throw QuizAlreadyFinished()
            val begin = graded?.request("begin", "quiz")
            if (begin?.flag("finished") == true) throw QuizAlreadyFinished()
            val resume = begin?.getAsJsonObject("resume")
            val answered = resume?.getAsJsonArray("answered")?.map { it.asInt }.orEmpty()
                .filter { it in quiz.questions.indices }.toSet()
            val missed = resume?.getAsJsonArray("missed")?.map { it.asString }.orEmpty()
            return PreparedQuiz(lessonId, owner, stamp, assessment, quiz,
                begin?.text("attemptId").orEmpty(), answered, missed,
                (resume?.number("score") ?: 0).coerceIn(0, answered.size))
                .also { check(it.isCurrent()) { "The quiz account or session changed" } }
        }

        fun store(quiz: PreparedQuiz): String = UUID.randomUUID().toString().also { pending = it to quiz }

        fun take(token: String?, lessonId: String): PreparedQuiz? {
            val entry = pending ?: return null
            if (entry.first != token) return null
            pending = null
            return entry.second.takeIf { it.lessonId == lessonId && it.isCurrent() }
        }
    }
}

internal class QuizAlreadyFinished : Exception()
`);
edit('app/src/main/java/ph/basaya/app/ui/DashboardActivity.kt',s=>{
 s=once(s,'import ph.basaya.app.ui.quiz.QuizActivity','import ph.basaya.app.ui.quiz.PreparedQuiz\nimport ph.basaya.app.ui.quiz.QuizAlreadyFinished\nimport ph.basaya.app.ui.quiz.QuizActivity');
 s=once(s,'        const val EXTRA_PREPARE_GAME = "PREPARE_GAME"','        const val EXTRA_PREPARE_QUIZ = "PREPARE_QUIZ"\n        const val EXTRA_PREPARE_GAME = "PREPARE_GAME"');
 s=once(s,'    private var preparedGameToken: String? = null','    private var preparedQuizToken: String? = null\n    private var preparedGameToken: String? = null');
 s=once(s,'        if (intent.getBooleanExtra(EXTRA_PREPARE_GAME, false)) {',`        if (intent.getBooleanExtra(EXTRA_PREPARE_QUIZ, false)) {
            intent.removeExtra(EXTRA_PREPARE_QUIZ)
            openContentIfAvailable(QuizActivity::class.java)
        }
        if (intent.getBooleanExtra(EXTRA_PREPARE_GAME, false)) {`);
 s=once(s,'            } catch (e: GameAlreadyFinished) {',`            } catch (e: QuizAlreadyFinished) {
                showLessonDialog(
                    iconRes = R.drawable.ic_check_completed,
                    title = "Tapos na",
                    message = "Natapos mo na ang pagsusulit. Hindi na ito maaaring ulitin."
                )
            } catch (e: GameAlreadyFinished) {`);
 s=once(s,'        if (destination == CrosswordActivity::class.java) {\n            findViewById',`        if (destination == QuizActivity::class.java) {
            findViewById<View>(R.id.quizPlayIcon).visibility = if (loading) View.INVISIBLE else View.VISIBLE
            findViewById<View>(R.id.quizPreparing).visibility = if (loading) View.VISIBLE else View.GONE
            tvQuizCount.visibility = if (loading) View.GONE else View.VISIBLE
            findViewById<View>(R.id.quizPreparingText).visibility = if (loading) View.VISIBLE else View.GONE
            quizCard.isEnabled = !loading
            return
        }
        if (destination == CrosswordActivity::class.java) {
            findViewById`);
 s=once(s,'    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {',`    private suspend fun prepareContent(destination: Class<out Activity>): AudioWait {
        if (destination == QuizActivity::class.java) {
            preparedQuizToken = null
            preparedQuizToken = PreparedQuiz.store(PreparedQuiz.prepare(this, lessonId))
            return AudioWait.READY
        }`);
 const old=`            QuizActivity::class.java -> {
                val quiz = QuizRepository(this).getQuiz(lessonId)
                    ?.takeIf { it.questions.isNotEmpty() }
                    ?: throw IllegalStateException("No quiz content is available")
                LessonContentPrefetch.storeQuiz(lessonId, quiz)
                AudioWait.READY
            }
`;
 s=once(s,old,'');
 s=once(s,'            if (destination == CrosswordActivity::class.java) {\n                putExtra',`            if (destination == QuizActivity::class.java) {
                putExtra(QuizActivity.EXTRA_PREPARED_QUIZ, preparedQuizToken)
            }
            if (destination == CrosswordActivity::class.java) {
                putExtra`);
 return s;
});
edit('app/src/main/java/ph/basaya/app/ui/quiz/QuizActivity.kt',s=>{
 s=once(s,'class QuizActivity : AppCompatActivity() {',`class QuizActivity : AppCompatActivity() {
    companion object { const val EXTRA_PREPARED_QUIZ = "PREPARED_QUIZ" }
    private lateinit var preparedState: PreparedQuiz`);
 s=once(s,'    private lateinit var quizRepository: QuizRepository\n','');
 s=once(s,'        tvQuizTitle = findViewById(R.id.tvQuizTitle)',`        val ready = PreparedQuiz.take(intent.getStringExtra(EXTRA_PREPARED_QUIZ), lessonId)
        if (ready == null) {
            startActivity(Intent(this, ph.basaya.app.ui.DashboardActivity::class.java).apply {
                putExtra("LESSON_ID", lessonId)
                putExtra(ph.basaya.app.ui.DashboardActivity.EXTRA_PREPARE_QUIZ, true)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
            finish()
            return
        }
        preparedState = ready

        tvQuizTitle = findViewById(R.id.tvQuizTitle)`);
 const start=s.indexOf('        quizRepository = QuizRepository(this)');
 const end=s.indexOf('            // A new random order of questions and choices every time.',start);
 if(start<0||end<0)throw Error('Missing quiz preparation');
 s=s.slice(0,start)+`        assessment = ready.assessment
        val fetchedQuiz = ready.quiz
        total = fetchedQuiz.questions.size
        attemptId = ready.attemptId
        answeredBefore = ready.answered
        missedBefore = ready.missed
        scoreBefore = ready.score

`+s.slice(end);
 // Remove the startup coroutine wrapper while retaining the independent answer-saving block.
 s=once(s,'                return@run\n            }\n\n            showQuestion','                return\n            }\n\n            showQuestion');
 s=once(s,'            }\n        }\n    }\n\n    // Questions','            }\n    }\n\n    // Questions');
 // Normalize the former startup block's indent, without changing nested answer handling.
 const blockStart=s.indexOf('            // A new random order');
 const blockEnd=s.indexOf('\n    }\n\n    // Questions',blockStart);
 s=s.slice(0,blockStart)+s.slice(blockStart,blockEnd).split('\n').map(l=>l.startsWith('    ')?l.slice(4):l).join('\n')+s.slice(blockEnd);
 s=once(s,'            if (submitting) return@setOnClickListener',`            if (submitting) return@setOnClickListener
            if (!preparedState.isCurrent()) { finish(); return@setOnClickListener }`);
 return s;
});
edit('app/src/main/res/layout/activity_dashboard.xml',s=>{
 const start=s.indexOf('android:id="@+id/quizCard"');
 let section=s.slice(start), prefix=s.slice(0,start);
 section=once(section,'android:id="@+id/tvQuizCount"\n                                                style="@style/Dl.Count" />',`android:id="@+id/tvQuizCount"
                                                style="@style/Dl.Count" />
                                            <TextView
                                                android:id="@+id/quizPreparingText"
                                                style="@style/Dl.Count"
                                                android:text="@string/lesson_dash_preparing"
                                                android:accessibilityLiveRegion="polite"
                                                android:visibility="gone" />`);
 section=once(section,'<ImageView\n                                            style="@style/Dl.Play" />',`<ImageView
                                            android:id="@+id/quizPlayIcon"
                                            style="@style/Dl.Play" />
                                        <ProgressBar
                                            android:id="@+id/quizPreparing"
                                            android:layout_width="24dp"
                                            android:layout_height="24dp"
                                            android:layout_gravity="center"
                                            android:indeterminateTint="@color/dash_quiz"
                                            android:importantForAccessibility="no"
                                            android:visibility="gone" />`);
 return prefix+section;
});
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));
fs.copyFileSync(path.join(__dirname,'../pagsasanay-ui/apply.cjs'),path.join(__dirname,'apply.cjs'));
console.log('Staged '+manifest.length+' quiz dashboard files.');
