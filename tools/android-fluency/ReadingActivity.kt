package ph.basaya.app.ui.pronunciation

import android.Manifest
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
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.button.MaterialButton
import com.google.gson.JsonObject
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import ph.basaya.app.data.assessment.*
import ph.basaya.app.data.audio.PronunciationAudioStore
import ph.basaya.app.data.model.PronunciationActivityData
import ph.basaya.app.speech.VoiceRecorder
import ph.basaya.app.R
import com.google.gson.Gson
import java.util.Locale

/** Page-based Bigkas: prepare, listen, hold to read, and keep a recording. */
class ReadingActivity : AppCompatActivity() {
    private lateinit var session: ReadingSession
    private lateinit var column: LinearLayout
    private lateinit var lessonId: String
    private var content: PronunciationActivityData? = null
    private val recorder = VoiceRecorder(2250)
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
    private var message = ""
    private var syncMessage = ""
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
        val scroll = ScrollView(this).apply { setBackgroundColor(canvas); isFillViewport = true }
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
        val preview = stage == "preview"
        val page = currentPage()
        column.addView(text(if (warm) "Handa, bigkas!" else if (preview) "Pakinggan ang iyong pagbasa" else "Ikaw naman ang bumasa", 27f, ink, true).apply { gravity = Gravity.CENTER })
        column.addView(text("1 Get Ready    →    2 Basahin    →    3 Pakinggan", 12f, muted, true).apply { gravity = Gravity.CENTER })
        val stageRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        stageRow.addView(PronunciationBookView(this), LinearLayout.LayoutParams(dp(66),dp(105)))
        val readingCard = card()
        readingCard.background = shape(paper,20,Color.parseColor(if(dark) "#68573E" else "#E7BC75"))
        val word = if (warm) page.getAsJsonArray("words")[state.number("word")].asJsonObject else null
        readingCard.addView(text(if (warm) "SALITA ${state.number("word") + 1}/${page.getAsJsonArray("words").size()}" else "PAGBASA ${pageIndex + 1}",11f,muted,true))
        readingCard.addView(text(word?.text("word") ?: page.text("sentence"),if(warm) 30f else 23f,ink,true))
        readingCard.addView(button(if(warm) "Pakinggan ang salita" else "Pakinggan ang halimbawa",false) { listen(word ?: page, !warm && stage == "sentence") })
        stageRow.addView(readingCard, LinearLayout.LayoutParams(0,-2,1f))
        column.addView(stageRow)
        if (preview) {
            val previewCard = card()
            previewCard.addView(text("Ang aking recording",16f,ink,true))
            val seek = SeekBar(this).apply { max = 1000; progressTintList = ColorStateList.valueOf(purple) }
            val play = button("▶ Pakinggan ang recording", false) {
                lifecycleScope.launch {
                    try {
                        val source = session.localClip()?.absolutePath ?: session.remoteClip()
                        play(source, onComplete = {})
                        player?.setOnPreparedListener { mp -> mp.start(); updateSeek(seek, mp) }
                    } catch(error:Exception) { message = error.message.orEmpty(); render() }
                }
            }
            previewCard.addView(play); previewCard.addView(seek)
            seek.setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(view:SeekBar?,progress:Int,fromUser:Boolean) { if(fromUser) player?.let { if(it.isPlaying) it.seekTo((it.duration * progress / 1000).coerceAtLeast(0)) } }
                override fun onStartTrackingTouch(view:SeekBar?) {}
                override fun onStopTrackingTouch(view:SeekBar?) {}
            })
            column.addView(previewCard)
        }
        val hint = text(if(stage == "sentence") "Pakinggan muna ang halimbawa" else if(warm) "Hawakan ang mic at bigkasin ang salita" else "Hawakan ang mic habang bumabasa",14f,ink,true).apply { gravity = Gravity.CENTER }
        val mic = ImageButton(this).apply {
            background = shape(purple,29); contentDescription = "Hawakan ang mikropono habang bumabasa"
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
        column.addView(mic); column.addView(hint)
        column.addView(text("Bitawan ang mic kapag tapos na",12f,muted).apply { gravity = Gravity.CENTER })
        if(message.isNotBlank()) column.addView(text(message,14f,muted))
        if(syncMessage.isNotBlank()) {
            column.addView(text(syncMessage,12f,muted))
            column.addView(button("Subukan ang upload muli",false) { sync() })
            column.addView(button("Gamitin ang pinakabagong progreso",false) {
                lifecycleScope.launch { try { session.refresh(); syncMessage=""; render() } catch(error:Exception) { message=error.message.orEmpty(); render() } }
            })
        }
        if(preview) {
            column.addView(button("Bumasa muli",false) { message = "Hawakan muli ang mic. Mananatili ang lumang recording hanggang ma-save ang bago."; render() })
            column.addView(button(if(busy) "Ipinapasa…" else if(pageIndex == total - 1) "Tapusin at ipasa" else "Susunod na pahina") {
                stopAudio()
                lifecycleScope.launch {
                    try { if(pageIndex < total - 1) { session.act("next"); render(); sync() } else { busy=true; render(); session.submit(); busy=false; render() } }
                    catch(error:Exception) { busy=false; message=error.message.orEmpty(); render() }
                }
            })
        }
        column.addView(text(if(session.pending) "● Naka-save sa device" else "✓ Naka-save ang iyong progreso",11f,muted).apply { gravity=Gravity.CENTER; setPadding(0,dp(18),0,0) })
    }

    private fun updateSeek(seek:SeekBar, mp:MediaPlayer) {
        ticker?.let(handler::removeCallbacks)
        ticker=object:Runnable { override fun run() { if(!active || player !== mp || !seek.isAttachedToWindow) return; runCatching { if(mp.duration>0) seek.progress=mp.currentPosition*1000/mp.duration }; handler.postDelayed(this,200) } }
        handler.post(ticker!!)
    }
    private fun stopAudio() { audioPlaying=false; player?.release(); player=null; tts?.stop(); ticker?.let(handler::removeCallbacks) }
    private fun play(source:String,onComplete:()->Unit) {
        stopAudio(); audioPlaying=true
        player=MediaPlayer().apply {
            setDataSource(source)
            setOnPreparedListener { it.start() }
            setOnCompletionListener { audioPlaying=false; onComplete() }
            setOnErrorListener { _,_,_ -> audioPlaying=false; message="Hindi mapatugtog ang audio. Subukan muli."; render(); true }
            prepareAsync()
        }
    }
    private fun listen(item:JsonObject, advance:Boolean) {
        val complete:()->Unit = { if(active && advance) lifecycleScope.launch { try { session.act("listen"); render(); sync() } catch(error:Exception) { message=error.message.orEmpty(); render() } } }
        val url=item.text("audioUrl")
        if(url.isNotBlank()) {
            val index = content?.audioRefs?.indexOf(url) ?: -1
            val local = if(index>=0) PronunciationAudioStore.localFile(this,lessonId,index) else null
            play(local?.takeIf { it.exists() }?.absolutePath ?: url,complete)
        } else if(ttsReady && item.has("word")) {
            stopAudio(); audioPlaying=true
            tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener() {
                override fun onStart(id:String?) {}
                override fun onDone(id:String?) { runOnUiThread { audioPlaying=false; complete() } }
                @Deprecated("Deprecated in Java") override fun onError(id:String?) { runOnUiThread { audioPlaying=false; message="Hindi mapatugtog ang salita."; render() } }
            })
            tts?.speak(item.text("word"),TextToSpeech.QUEUE_FLUSH,null,"ready-word")
        } else { message="Hindi mapatugtog ang halimbawa. Subukan muli."; render() }
    }
    private fun beginHold(mic:View,hint:TextView) {
        if(held || busy || recordingJob?.isActive == true) return
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { permission.launch(Manifest.permission.RECORD_AUDIO); return }
        stopAudio(); held=true; message=""
        mic.background=shape(Color.parseColor("#D44969"),29); hint.text="Nakikinig ako… bitawan kapag tapos na"
        val stage=session.state.text("stage")
        val limit = Runnable { if (held) { message="Umabot sa 45 segundo ang recording. Pakinggan ito o bumasa muli."; releaseHold(false) } }
        handler.postDelayed(limit, 45000)
        recordingJob=lifecycleScope.launch {
            try {
                when(val result=recorder.record({held}) { level -> runOnUiThread { if(held) { mic.scaleX=1f+level*.12f; mic.scaleY=1f+level*.12f } } }) {
                    is VoiceRecorder.Result.Speech -> { if(stage=="words") session.act("word") else session.act("upload",result.wav); sync() }
                    VoiceRecorder.Result.NoSpeech -> message="Wala akong narinig. Hawakan muli ang mic at magsalita nang malinaw."
                    VoiceRecorder.Result.MicUnavailable -> message="Hindi magamit ang mikropono ngayon."
                }
            } catch(error:Exception) { message=error.message.orEmpty() }
            finally { handler.removeCallbacks(limit); held=false; mic.scaleX=1f; mic.scaleY=1f; if(active) render() }
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
    override fun onStop() { super.onStop(); active=false; releaseHold(true); recorder.close(); stopAudio() }
    override fun onDestroy() { super.onDestroy(); recorder.close(); stopAudio(); tts?.shutdown() }
}
