package ph.basaya.app.ui.pronunciation

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.text.SpannableString
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.lifecycle.lifecycleScope
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import com.google.gson.JsonObject
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.audio.PronunciationAudioStore
import ph.basaya.app.data.model.PronunciationActivityData
import ph.basaya.app.speech.VoiceRecorder
import ph.basaya.app.R
import ph.basaya.app.ui.lecture.ReadAlongTextView
import com.google.gson.Gson
import java.util.Locale

/** Page-based Bigkas: prepare, listen, hold to read, and keep a recording. */
class ReadingActivity : AppCompatActivity() {
    private lateinit var session: ReadingSession
    private lateinit var column: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var lessonId: String
    private var content: PronunciationActivityData? = null
    private val wordRecorder = VoiceRecorder()
    private val sentenceRecorder = VoiceRecorder(2250)
    private var recorder = wordRecorder
    private var recordingJob: Job? = null
    private var syncing: Job? = null
    private var player: MediaPlayer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var held = false
    private var busy = false
    private var started = false
    private var active = true
    private var audioPlaying = false
    private var retakingPage = -1
    private var voiceBars: List<View> = emptyList()
    private var checking = false
    private var checkingRow: LinearLayout? = null
    private var checkingHint: TextView? = null
    private var checkingInstruction: TextView? = null
    private var checkingBars: List<View> = emptyList()
    private var checkingAnimator: ValueAnimator? = null
    private var message = ""
    private var syncMessage = ""
    private var wordCard: View? = null
    private var remark: TextView? = null
    private var feedbackBox: LinearLayout? = null
    private var messageKind = "info"
    private var readingText: TextView? = null
    private var highlightedText: TextView? = null
    private var highlightTicker: Runnable? = null
    private val handler = Handler(Looper.getMainLooper())
    private var ticker: Runnable? = null
    private val dark get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    private val ink get() = Color.parseColor(if (dark) "#F3EFE8" else "#292D3D")
    private val muted get() = Color.parseColor(if (dark) "#B9B5C4" else "#757184")
    private val paper get() = Color.parseColor(if (dark) "#272635" else "#FFFFFF")
    private val canvas get() = Color.parseColor(if (dark) "#191923" else "#F8F6F1")
    private val purple get() = Color.parseColor(if (dark) "#B2A4FF" else "#6351D8")
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        message = if (granted) "Hawakan muli ang mic upang magsimula." else "Payagan ang mikropono upang makapagbasa."
        if (granted) recorder.prepare()
        render()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lessonId = intent.getStringExtra("LESSON_ID").orEmpty()
        content = intent.getStringExtra("READING_CONTENT")?.let { Gson().fromJson(it, PronunciationActivityData::class.java) }
        scroll = ScrollView(this).apply { setBackgroundColor(canvas); isFillViewport = true }
        column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(20), dp(22), dp(32)) }
        scroll.addView(column); setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        tts = TextToSpeech(this) { status -> if (status == TextToSpeech.SUCCESS) { ttsReady = true; tts?.language = Locale.forLanguageTag("fil-PH") } }
        open()
    }
    private fun open() {
        column.removeAllViews(); column.addView(text("Inihahanda ang iyong pagbasa…", 18f))
        lifecycleScope.launch {
            try {
                session = ReadingSession(this@ReadingActivity, lessonId); session.open(); started = true; render(); sync()
                if (content == null) content = ph.basaya.app.data.repository.PronunciationRepository(this@ReadingActivity).getActivity(lessonId)
            }
            catch (error: Exception) {
                column.removeAllViews(); column.addView(text(error.message ?: "Hindi mabuksan ang pagbasa.", 16f))
                column.addView(button("Subukan muli") { open() }); column.addView(button("Bumalik", false) { finish() })
            }
        }
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun shape(color: Int, radius: Int = 20, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), stroke)
    }
    private fun text(value: String, size: Float, color: Int = ink, bold: Boolean = false) = TextView(this).apply {
        this.text = value; textSize = size; setTextColor(color); if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(dp(4).toFloat(), 1f)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) }
    }
    private fun button(value: String, primary: Boolean = true, action: () -> Unit) = MaterialButton(this).apply {
        text = value; isAllCaps = false; textSize = 14f; cornerRadius = dp(16)
        backgroundTintList = ColorStateList.valueOf(if (primary) purple else paper)
        setTextColor(if (primary && !dark) Color.WHITE else if (primary) canvas else ink)
        minHeight = dp(50)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) }
        setOnClickListener { if (!held && !busy) action() }
    }
    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(20), dp(22), dp(20)); background = shape(paper)
        elevation = dp(2).toFloat(); layoutParams = LinearLayout.LayoutParams(-1,-2).apply { topMargin = dp(16); bottomMargin = dp(12) }
    }
    private fun currentPage() = session.state.getAsJsonArray("pages")[session.state.number("page")].asJsonObject

    @SuppressLint("ClickableViewAccessibility")
    private fun render() {
        if (!active || !started || held) return
        stopCheckingAnimation()
        checkingRow=null; checkingHint=null; checkingInstruction=null; checkingBars=emptyList()
        column.removeAllViews()
        val state = session.state
        val pageIndex = state.number("page")
        val total = state.getAsJsonArray("pages").size()
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(button("‹", false) { finish() }.apply { contentDescription = "Bumalik" }, LinearLayout.LayoutParams(dp(50), dp(50)))
        header.addView(text((0 until total).joinToString("  ") { i -> if (i < pageIndex) "✓" else if (i == pageIndex) "●" else "○" }, 20f, purple, true).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(0,-2,1f))
        header.addView(text("${pageIndex + 1}/$total", 15f, muted, true), LinearLayout.LayoutParams(dp(40),-2))
        column.addView(header)
        column.addView(text("ANG AKING TINIG", 11f, purple, true).apply { gravity = Gravity.CENTER; letterSpacing = .18f; setPadding(0,dp(26),0,0) })
        if (state.text("status") != "draft") {
            column.addView(text("Naipasa mo na. Ang galing!", 27f, ink, true))
            val grade = state.get("grade")?.takeUnless { it.isJsonNull }?.asJsonObject
            if (grade != null) {
                column.addView(text("Katumpakan: ${grade.number("accuracy")}/4\nTuloy-tuloy na pagbasa: ${grade.number("smoothness")}/4\nPagpapahayag: ${grade.number("expression")}/4",18f))
                column.addView(text(state.text("feedback"),16f,muted))
            } else column.addView(text("Pakikinggan ng iyong guro ang mga recording mo.",17f,muted))
            column.addView(button("Bumalik sa aralin") { setResult(RESULT_OK); finish() }); return
        }
        val stage = state.text("stage")
        val warm = stage == "words"
        val retaking = stage == "preview" && retakingPage == pageIndex
        val preview = stage == "preview" && !retaking
        val page = currentPage()
        column.addView(text(if (warm) "Handa, bigkas!" else if (preview) "Pakinggan ang iyong pagbasa" else "Ikaw naman ang bumasa", 27f, ink, true).apply { gravity = Gravity.CENTER })
        column.addView(text("1 Get Ready    →    2 Basahin    →    3 Pakinggan", 12f, muted, true).apply { gravity = Gravity.CENTER })
        val stageRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        stageRow.addView(PronunciationBookView(this), LinearLayout.LayoutParams(dp(66),dp(105)))
        val readingCard = card()
        wordCard = if (warm) readingCard else null
        readingCard.background = shape(paper,20,Color.parseColor(if(dark) "#68573E" else "#E7BC75"))
        val word = if (warm) page.getAsJsonArray("words")[state.number("word")].asJsonObject else null
        readingCard.addView(text(if (warm) "SALITA ${state.number("word") + 1}/${page.getAsJsonArray("words").size()}" else "PAGBASA ${pageIndex + 1}",11f,muted,true))
        readingText = text(word?.text("word") ?: page.text("sentence"),if(warm) 30f else 23f,ink,true)
        readingCard.addView(readingText)
        readingCard.addView(button(if(warm) "Pakinggan ang salita" else "Pakinggan ang halimbawa",false) { listen(word ?: page, !warm && stage == "sentence") })
        stageRow.addView(readingCard, LinearLayout.LayoutParams(0,-2,1f))
        column.addView(stageRow)
        if (preview) {
            val previewCard = card()
            previewCard.background=shape(ColorUtils.blendARGB(paper,purple,.06f),24,ColorUtils.blendARGB(paper,purple,.24f))
            previewCard.addView(text("ANG AKING TINIG",10f,purple,true).apply { letterSpacing=.16f })
            previewCard.addView(text("Ang aking recording",19f,ink,true))
            val transport=LinearLayout(this).apply { gravity=Gravity.CENTER_VERTICAL }
            val seek = SeekBar(this).apply { max = 1000; progressTintList = ColorStateList.valueOf(purple); contentDescription="Posisyon ng recording" }
            val time=text("0:00 / 0:00",12f,muted,true)
            var previewMedia:MediaPlayer?=null
            val playButton=ImageButton(this).apply {
                setImageResource(R.drawable.ic_lecture_play); contentDescription="Pakinggan ang recording"
                background=shape(purple,21); imageTintList=ColorStateList.valueOf(if(dark) canvas else Color.WHITE)
                setPadding(dp(17),dp(17),dp(17),dp(17)); elevation=dp(4).toFloat()
            }
            playButton.setOnClickListener {
                val existing=previewMedia
                if(existing != null && player === existing) {
                    if(existing.isPlaying) { existing.pause(); audioPlaying=false } else { existing.start(); audioPlaying=true }
                    playButton.setImageResource(if(existing.isPlaying) R.drawable.ic_lecture_pause else R.drawable.ic_lecture_play)
                    playButton.contentDescription=if(existing.isPlaying) "I-pause ang recording" else "Pakinggan ang recording"
                    return@setOnClickListener
                }
                playButton.isEnabled=false
                lifecycleScope.launch {
                    try {
                        val source = session.localClip()?.absolutePath ?: session.remoteClip()
                        if(!active || !playButton.isAttachedToWindow) return@launch
                        play(source,onComplete={ playButton.setImageResource(R.drawable.ic_lecture_play); playButton.contentDescription="Pakinggan ang recording" }) { mp ->
                            previewMedia=mp; playButton.isEnabled=true; playButton.setImageResource(R.drawable.ic_lecture_pause); playButton.contentDescription="I-pause ang recording"
                            updateSeek(seek,mp,time)
                        }
                    } catch(error:Exception) { message = error.message.orEmpty(); render() }
                }
            }
            transport.addView(playButton,LinearLayout.LayoutParams(dp(60),dp(60)).apply { marginEnd=dp(16) })
            val track=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL }
            val waveform=LinearLayout(this).apply { gravity=Gravity.CENTER_VERTICAL }
            listOf(9,18,12,27,19,33,14,24,36,18,29,13,32,22,15,28,11).forEach { height ->
                waveform.addView(View(this).apply { background=shape(ColorUtils.blendARGB(paper,purple,.6f),4); importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO },LinearLayout.LayoutParams(0,dp(height),1f).apply { marginEnd=dp(3) })
            }
            track.addView(waveform,LinearLayout.LayoutParams(-1,dp(38))); track.addView(seek); track.addView(time)
            transport.addView(track,LinearLayout.LayoutParams(0,-2,1f)); previewCard.addView(transport)
            seek.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(view:SeekBar?,progress:Int,fromUser:Boolean) { if(fromUser) previewMedia?.let { mp -> if(player === mp) mp.seekTo((mp.duration * progress / 1000).coerceAtLeast(0)) } }
                override fun onStartTrackingTouch(view:SeekBar?) {}
                override fun onStopTrackingTouch(view:SeekBar?) {}
            })
            column.addView(previewCard)
        }
        val feedbackSlot=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; gravity=Gravity.CENTER_VERTICAL; minimumHeight=if(warm) dp(102) else 0 }
        feedbackBox=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL
            layoutParams=LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(12); bottomMargin=dp(12) }
        }
        feedbackSlot.addView(feedbackBox); column.addView(feedbackSlot); paintRemark()
        voiceBars=emptyList()
        if(!preview) {
        val hint = text(if(stage == "sentence") "Pakinggan muna ang halimbawa" else if(warm) "Hawakan ang mic at bigkasin ang salita" else "Hawakan ang mic habang bumabasa",14f,ink,true).apply { gravity = Gravity.CENTER }
        hint.minimumHeight=dp(48); checkingHint=hint
        val recordRow=LinearLayout(this).apply { gravity=Gravity.CENTER }
        fun bars():LinearLayout=LinearLayout(this).apply {
            gravity=Gravity.CENTER_VERTICAL
            listOf(16,30,42,30,16).forEach { height ->
                val bar=View(this@ReadingActivity).apply { background=shape(ColorUtils.blendARGB(paper,purple,.45f),4); importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO }
                voiceBars=voiceBars+bar
                addView(bar,LinearLayout.LayoutParams(dp(4),dp(height)).apply { marginEnd=dp(4) })
            }
        }
        recordRow.addView(bars())
        val mic = ImageButton(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(ColorUtils.blendARGB(purple,Color.WHITE,.18f),purple)).apply { cornerRadius=dp(34).toFloat(); setStroke(dp(2),ColorUtils.blendARGB(purple,Color.WHITE,.4f)) }; contentDescription = "Hawakan ang mikropono habang bumabasa"
            elevation=dp(7).toFloat()
            setImageResource(R.drawable.ic_mic); imageTintList = ColorStateList.valueOf(if(dark) canvas else Color.WHITE)
            setPadding(dp(25), dp(25), dp(25), dp(25))
            layoutParams = LinearLayout.LayoutParams(dp(88),dp(88)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(22); bottomMargin = dp(18) }
            isEnabled = stage != "sentence" && !busy; alpha = if(isEnabled) 1f else .35f
            isFocusable = true
        }
        mic.setOnTouchListener { view, event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { if(mic.isEnabled) { view.parent.requestDisallowInterceptTouchEvent(true); beginHold(mic,hint) }; true }
                MotionEvent.ACTION_UP -> { releaseHold(false); true }
                MotionEvent.ACTION_CANCEL -> { releaseHold(true); true }
                else -> true
            }
        }
        mic.setOnKeyListener { _, keyCode, event ->
            if(keyCode !in listOf(KeyEvent.KEYCODE_SPACE,KeyEvent.KEYCODE_ENTER,KeyEvent.KEYCODE_DPAD_CENTER)) false
            else { if(event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) beginHold(mic,hint) else if(event.action == KeyEvent.ACTION_UP) releaseHold(false); true }
        }
        recordRow.addView(mic,LinearLayout.LayoutParams(dp(92),dp(92)).apply { marginStart=dp(24); marginEnd=dp(24); topMargin=dp(22); bottomMargin=dp(18) })
        recordRow.addView(bars()); column.addView(recordRow); column.addView(hint)
        checkingRow=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL; minimumHeight=dp(48)
            setPadding(dp(14),dp(10),dp(14),dp(10))
            background=shape(Color.parseColor(if(dark) "#342B1E" else "#FFF6E5"),14,Color.parseColor(if(dark) "#6D542D" else "#EAD2A1"))
            layoutParams=LinearLayout.LayoutParams(-2,-2).apply { gravity=Gravity.CENTER_HORIZONTAL; bottomMargin=dp(10) }
            accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
            val bars=LinearLayout(this@ReadingActivity).apply { gravity=Gravity.CENTER; importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO }
            repeat(5) {
                val bar=View(this@ReadingActivity).apply { background=shape(Color.parseColor(if(dark) "#E3B35D" else "#BD8429"),3) }
                checkingBars=checkingBars+bar
                bars.addView(bar,LinearLayout.LayoutParams(dp(3),dp(18)).apply { marginEnd=dp(3) })
            }
            addView(bars,LinearLayout.LayoutParams(dp(30),dp(22)).apply { marginEnd=dp(11) })
            addView(text("Sinusuri ang sagot…",14f,Color.parseColor(if(dark) "#F3CA78" else "#855516"),true).apply { layoutParams=LinearLayout.LayoutParams(-2,-2) })
        }
        column.addView(checkingRow)
        checkingInstruction=text("Bitawan ang mic kapag tapos na",12f,muted).apply { gravity = Gravity.CENTER }
        column.addView(checkingInstruction)
        setChecking(checking)
        }
        if(syncMessage.isNotBlank()) {
            column.addView(text(syncMessage,12f,muted))
            column.addView(button("Subukan ang upload muli",false) { sync() })
            column.addView(button("Gamitin ang pinakabagong progreso",false) {
                lifecycleScope.launch { try { session.refresh(); syncMessage=""; render() } catch(error:Exception) { message=error.message.orEmpty(); render() } }
            })
        }
        if(preview) {
            column.addView(button("Bumasa muli",false) { stopAudio(); retakingPage=pageIndex; message=""; render(); column.post { val stageView=readingText?.parent?.parent as? View; scroll.smoothScrollTo(0,stageView?.top ?: 0) } })
            column.addView(button(if(busy) "Ipinapasa…" else if(pageIndex == total - 1) "Tapusin at ipasa" else "Susunod na pahina") {
                stopAudio()
                lifecycleScope.launch {
                    try { if(pageIndex < total - 1) { session.act("next"); render(); sync() } else { busy=true; render(); session.submit(); busy=false; render() } }
                    catch(error:Exception) { busy=false; message=error.message.orEmpty(); render() }
                }
            })
        }
        if(retaking) column.addView(button("Bumalik sa dating recording",false) { stopAudio(); retakingPage=-1; message=""; render() })
    }

    private fun updateSeek(seek:SeekBar, mp:MediaPlayer, label:TextView) {
        ticker?.let(handler::removeCallbacks)
        fun clock(ms:Int):String { val seconds=ms.coerceAtLeast(0)/1000; return "${seconds/60}:${(seconds%60).toString().padStart(2,'0')}" }
        ticker=object:Runnable { override fun run() { if(!active || player !== mp || !seek.isAttachedToWindow) return; runCatching { if(mp.duration>0) seek.progress=mp.currentPosition*1000/mp.duration; label.text="${clock(mp.currentPosition)} / ${clock(mp.duration)}" }; handler.postDelayed(this,200) } }
        handler.post(ticker!!)
    }
    private fun clearHighlight() {
        highlightTicker?.let(handler::removeCallbacks); highlightTicker=null
        highlightedText?.let { it.text=it.text.toString() }; highlightedText=null
    }
    private fun showSpokenWord(line:TextView,index:Int) {
        val plain=line.text.toString()
        val range=Regex("\\S+").findAll(plain).elementAtOrNull(index)?.range ?: return
        line.text=SpannableString(plain).apply {
            setSpan(BackgroundColorSpan(Color.parseColor("#FFE7A1")),range.first,range.last+1,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(ForegroundColorSpan(Color.parseColor("#352B16")),range.first,range.last+1,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        highlightedText=line
    }
    private fun followExample(mp:MediaPlayer,item:JsonObject) {
        val line=readingText ?: return
        val words=Regex("\\S+").findAll(line.text).map { it.value }.toList()
        val saved=runCatching { item.getAsJsonArray("wordStarts")?.map { it.asDouble } }.getOrNull().orEmpty()
        val starts=if(saved.size==words.size && saved.withIndex().all { (i,time) -> time.isFinite() && time>=0 && (i==0 || time>=saved[i-1]) }) saved else ReadAlongTextView.estimateStarts(words,mp.duration/1000.0)
        var current=-1
        highlightTicker=object:Runnable {
            override fun run() {
                if(!active || player !== mp || !line.isAttachedToWindow) { clearHighlight(); return }
                val seconds=runCatching { mp.currentPosition/1000.0 }.getOrDefault(0.0)
                val index=starts.indexOfLast { it<=seconds }
                if(index>=0 && index!=current) { showSpokenWord(line,index); current=index }
                handler.postDelayed(this,40)
            }
        }
        handler.post(highlightTicker!!)
    }
    private fun stopAudio() { clearHighlight(); audioPlaying=false; player?.release(); player=null; tts?.stop(); ticker?.let(handler::removeCallbacks) }
    private fun play(source:String,onComplete:()->Unit,onReady:(MediaPlayer)->Unit = {}) {
        stopAudio(); audioPlaying=true
        player=MediaPlayer().apply {
            setDataSource(source)
            setOnPreparedListener { it.start(); onReady(it) }
            setOnCompletionListener { clearHighlight(); audioPlaying=false; onComplete() }
            setOnErrorListener { _,_,_ -> clearHighlight(); audioPlaying=false; message="Hindi mapatugtog ang audio. Subukan muli."; render(); true }
            prepareAsync()
        }
    }
    private fun listen(item:JsonObject, advance:Boolean) {
        val complete:()->Unit = { if(active && advance) lifecycleScope.launch { try { session.act("listen"); render(); sync() } catch(error:Exception) { message=error.message.orEmpty(); render() } } }
        val url=item.text("audioUrl")
        if(url.isNotBlank()) {
            val index = content?.audioRefs?.indexOf(url) ?: -1
            val local = if(index>=0) PronunciationAudioStore.localFile(this,lessonId,index) else null
            play(local?.takeIf { it.exists() }?.absolutePath ?: url,complete) { followExample(it,item) }
        } else if(ttsReady && item.has("word")) {
            stopAudio(); audioPlaying=true
            tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener() {
                override fun onStart(id:String?) { runOnUiThread { if(active && audioPlaying) readingText?.let { showSpokenWord(it,0) } } }
                override fun onDone(id:String?) { runOnUiThread { clearHighlight(); audioPlaying=false; complete() } }
                @Deprecated("Deprecated in Java") override fun onError(id:String?) { runOnUiThread { clearHighlight(); audioPlaying=false; message="Hindi mapatugtog ang salita."; render() } }
            })
            tts?.speak(item.text("word"),TextToSpeech.QUEUE_FLUSH,null,"ready-word")
        } else { message="Hindi mapatugtog ang halimbawa. Subukan muli."; render() }
    }
    private fun beginHold(mic:View,hint:TextView) {
        if(held || busy || recordingJob?.isActive == true) return
        val stage=session.state.text("stage")
        val nextRecorder = if (stage == "words") wordRecorder else sentenceRecorder
        if (recorder !== nextRecorder) { recorder.close(); recorder = nextRecorder }
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { permission.launch(Manifest.permission.RECORD_AUDIO); return }
        stopAudio(); held=true; message=""; messageKind="info"; paintRemark()
        mic.background=shape(Color.parseColor("#D44969"),29); hint.text="Nakikinig ako… bitawan kapag tapos na"
        val limit = Runnable { if (held) { message=if(stage=="words") "Bigkasin ang isang salita lamang." else "Umabot sa 45 segundo ang recording. Pakinggan ito o bumasa muli."; releaseHold(false) } }
        handler.postDelayed(limit, if(stage=="words") 7000L else 45000L)
        recordingJob=lifecycleScope.launch {
            try {
                val result=recorder.record({held}) { level -> runOnUiThread { if(held) { mic.scaleX=1f+level*.12f; mic.scaleY=1f+level*.12f; voiceBars.forEach { it.scaleY=.4f+level*1.8f } } } }
                handler.removeCallbacks(limit)
                when(result) {
                    is VoiceRecorder.Result.Speech -> {
                        busy=true; mic.isEnabled=false
                        if(stage=="words") {
                            mic.scaleX=1f; mic.scaleY=1f; mic.alpha=.6f
                            mic.background=shape(ColorUtils.blendARGB(paper,ink,.05f),34)
                            if(mic is ImageView) mic.imageTintList=ColorStateList.valueOf(muted)
                            voiceBars.forEach { it.alpha=.18f; it.scaleY=1f }
                            setChecking(true)
                            val checked=try { session.checkWord(result.wav) } catch(error:Exception) {
                                if (error is kotlinx.coroutines.CancellationException) throw error
                                message=when {
                                    error is AssessmentFailure && error.status == 409 -> error.message.orEmpty()
                                    error is AssessmentFailure && error.status in listOf(401,403) -> "Mag-log in muli upang maipagpatuloy ang pagsasanay."
                                    error is AssessmentFailure && error.status == 429 -> "Magpahinga muna sandali, pagkatapos ay subukan muli."
                                    error is IllegalStateException -> error.message.orEmpty()
                                    else -> "Hindi makakonekta. Tingnan ang iyong internet at subukan muli."
                                }
                                messageKind=if(error is IllegalStateException) "info" else "connection"
                                return@launch
                            } finally { setChecking(false) }
                            if (!active) return@launch
                            val correct=checked.flag("wordAccepted")
                            message=if(correct) "Tama! Ang galing mo!" else if(checked.flag("noSpeech")) "Wala akong narinig, subukan muli." else "Subukan ulit. Kaya mo ’yan!"
                            messageKind=if(correct) "correct" else if(checked.flag("noSpeech")) "silence" else "retry"
                            if(!checked.flag("noSpeech")) {
                                showWordFeedback(correct)
                                delay(if(correct) 1100L else 550L)
                            }
                            if(correct) message=""
                        } else { session.act("upload",result.wav); retakingPage=-1; sync() }
                    }
                    VoiceRecorder.Result.NoSpeech -> { message="Wala akong narinig, subukan muli."; messageKind="silence" }
                    VoiceRecorder.Result.MicUnavailable -> message="Hindi magamit ang mikropono ngayon."
                }
            } catch(error:Exception) { message=error.message.orEmpty() }
            finally { setChecking(false); handler.removeCallbacks(limit); held=false; busy=false; mic.scaleX=1f; mic.scaleY=1f; if(active) render() }
        }
    }
    private fun stopCheckingAnimation() { checkingAnimator?.cancel(); checkingAnimator=null }
    private fun setChecking(value:Boolean) {
        checking=value; stopCheckingAnimation()
        checkingRow?.visibility=if(value) View.VISIBLE else View.GONE
        checkingHint?.visibility=if(value) View.GONE else View.VISIBLE
        checkingInstruction?.visibility=if(value) View.INVISIBLE else View.VISIBLE
        checkingBars.forEachIndexed { index,bar -> bar.scaleY=if(index%2==0) .4f else .65f }
        if(value && active && (android.os.Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled())) {
            checkingAnimator=ValueAnimator.ofFloat(0f,1f).apply {
                duration=1100; repeatCount=ValueAnimator.INFINITE; interpolator=android.view.animation.LinearInterpolator()
                addUpdateListener { animation ->
                    val phase=(animation.animatedValue as Float).toDouble()
                    checkingBars.forEachIndexed { index,bar -> bar.scaleY=.35f+.65f*(.5+.5*kotlin.math.cos(phase*2*Math.PI-index*.8)).toFloat() }
                }
                start()
            }
        }
    }
    private fun paintRemark() {
        val box=feedbackBox ?: return
        box.removeAllViews(); remark=null
        box.visibility=if(message.isBlank()) View.GONE else View.VISIBLE
        if(message.isBlank()) return
        val accent=Color.parseColor(when(messageKind) { "correct" -> "#299564"; "retry" -> "#C18A2F"; "connection" -> "#8170C9"; else -> "#437DB2" })
        box.setPadding(dp(18),dp(18),dp(18),dp(18))
        box.background=shape(ColorUtils.blendARGB(paper,accent,.12f),18,ColorUtils.blendARGB(paper,accent,.45f))
        box.elevation=dp(3).toFloat()
        box.addView(ImageView(this).apply {
            setImageResource(when(messageKind) { "correct" -> R.drawable.ic_check; "retry" -> R.drawable.ic_refresh; "silence" -> R.drawable.ic_mic; else -> R.drawable.ic_info })
            imageTintList=ColorStateList.valueOf(ink)
            background=shape(ColorUtils.blendARGB(paper,accent,.2f),22)
            setPadding(dp(10),dp(10),dp(10),dp(10))
            importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
        },LinearLayout.LayoutParams(dp(44),dp(44)).apply { marginEnd=dp(14) })
        remark=text(message,17f,ink,true).apply {
            layoutParams=LinearLayout.LayoutParams(0,-2,1f)
            accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        box.addView(remark)
        if(android.os.Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()) {
            box.alpha=0f; box.translationY=dp(5).toFloat()
            box.animate().alpha(1f).translationY(0f).setDuration(250).start()
        }
    }
    private fun showWordFeedback(correct:Boolean) {
        paintRemark()
        val tint=Color.parseColor(if(correct) "#36A871" else "#D59A43")
        wordCard?.background=shape(paper,20,tint)
        remark?.apply {
            setTextColor(if(correct && !dark) Color.parseColor("#248454") else ink)
            setTypeface(typeface,Typeface.BOLD)
        }
        val motion=android.os.Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()
        if(motion) {
            wordCard?.let { card ->
                val values=if(correct) floatArrayOf(0f,-dp(9).toFloat(),0f,-dp(3).toFloat(),0f) else floatArrayOf(0f,-dp(5).toFloat(),dp(5).toFloat(),-dp(3).toFloat(),0f)
                ObjectAnimator.ofFloat(card,if(correct) "translationY" else "translationX",*values).apply { duration=if(correct) 600L else 450L; start() }
            }
            remark?.apply { alpha=0f; animate().alpha(1f).setDuration(250).start() }
        }
    }
    private fun releaseHold(cancel:Boolean) { if(!held) return; held=false; if(cancel) { recordingJob?.cancel(); recorder.close() } else recorder.finish() }
    private fun sync() {
        if(syncing?.isActive==true || !started) return
        syncing=lifecycleScope.launch {
            try { session.sync(); syncMessage="" }
            catch(error:Exception) { syncMessage=(error.message ?: "Hindi ma-upload ngayon.")+" Naka-save sa device ang progreso." }
            finally { if(active && !held && !audioPlaying && !busy) render() }
        }
    }
    override fun onResume() { super.onResume(); active=true; if(started) { render(); sync() } }
    override fun onStop() { super.onStop(); active=false; stopCheckingAnimation(); releaseHold(true); wordRecorder.close(); sentenceRecorder.close(); stopAudio() }
    override fun onDestroy() { super.onDestroy(); stopCheckingAnimation(); wordRecorder.close(); sentenceRecorder.close(); stopAudio(); tts?.shutdown() }
}
