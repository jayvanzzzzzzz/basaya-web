package ph.basaya.app.ui.assistant

import android.animation.ValueAnimator
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.Spannable
import android.text.SpannableString
import android.text.TextPaint
import android.text.TextWatcher
import android.text.style.CharacterStyle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.TooltipCompat
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.core.widget.NestedScrollView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.material.card.MaterialCardView
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import ph.basaya.app.R
import ph.basaya.app.ui.JoinClassActivity
import ph.basaya.app.ui.MainActivity
import ph.basaya.app.ui.dictionary.DictionaryActivity

/** Native counterpart of student/views/assistant.js and student-resources.css. */
class AssistantActivity : AppCompatActivity() {
    private lateinit var model: AssistantViewModel
    private lateinit var input: EditText
    private lateinit var scroll: NestedScrollView
    private lateinit var messages: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }
    private var collection: Job? = null
    private var online = false
    private var registered = false
    private var displayed: List<AssistantMessage>? = null
    private var pending: View? = null
    private var lastBusy = false
    private var shownHelp: Boolean? = null
    private var visibleQuery: String? = null
    private var fade: ValueAnimator? = null
    private var typing: ValueAnimator? = null
    private val answerViews = mutableMapOf<Long, TextView>()
    private val guideRows = mutableListOf<Pair<String, View>>()
    private val questionButtons = mutableListOf<View>()
    private var needsInputFocus = false
    private val authListener = FirebaseAuth.AuthStateListener {
        if (::model.isInitialized && it.currentUser?.uid != model.uid) finish()
    }
    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = changedConnection()
        override fun onLost(network: Network) = changedConnection()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = changedConnection()
    }
    private val tick = object : Runnable {
        override fun run() {
            val state = model.state.value
            if (online && state.usage?.needsRefresh(System.currentTimeMillis()) == true &&
                !state.busy && !state.checking && state.available) model.refresh()
            render(model.state.value)
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        model = ViewModelProvider(this)[AssistantViewModel::class.java]
        if (model.uid.isBlank()) { finish(); return }
        setContentView(R.layout.activity_assistant)
        input = findViewById(R.id.assistantInput)
        // Keep wrapping and Shift+Enter while asking the software keyboard for a Send action.
        input.setRawInputType(android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
        scroll = findViewById(R.id.assistantScroll)
        messages = findViewById(R.id.assistantMessages)
        val root = findViewById<View>(R.id.assistantRoot)
        val toolbar = findViewById<View>(R.id.assistantToolbar)
        val bottom = root.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            root.updatePadding(left = bars.left, right = bars.right, bottom = bottom + maxOf(bars.bottom, ime))
            toolbar.updatePadding(top = dp(8) + bars.top)
            // The web page heading scrolls away on short viewports; keep the chat usable with an IME.
            findViewById<View>(R.id.assistantPageTitle).visibility = if (ime > 0) View.GONE else View.VISIBLE
            findViewById<View>(R.id.assistantPageDescription).visibility = if (ime == 0 && resources.configuration.screenWidthDp >= 736) View.VISIBLE else View.GONE
            insets
        }
        val light = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK != Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = light; isAppearanceLightNavigationBars = light
        }
        findViewById<View>(R.id.assistantBack).setOnClickListener { onBackPressedDispatcher.onBackPressed() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (model.state.value.helpOpen) model.help(false) else finish() }
        })
        findViewById<View>(R.id.assistantGuides).apply {
            TooltipCompat.setTooltipText(this, getString(R.string.assistant_guides))
            setOnClickListener { model.help(!model.state.value.helpOpen) }
        }
        findViewById<View>(R.id.assistantRetry).setOnClickListener { online = isOnline(); if (online) model.refresh() }
        input.watch { model.draft(it) }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEND) { sendQuestion(); true } else false
        }
        input.setOnKeyListener { _, key, event ->
            if (key == KeyEvent.KEYCODE_ENTER && !event.isShiftPressed) {
                if (event.action == KeyEvent.ACTION_DOWN) sendQuestion()
                true
            } else false
        }
        findViewById<View>(R.id.assistantSend).setOnClickListener { sendQuestion() }
        findViewById<View>(R.id.assistantSend).pressMotion()
        val pageTitle = findViewById<TextView>(R.id.assistantPageTitle)
        val title = getString(R.string.assistant_title) + "."
        pageTitle.text = SpannableString(title).apply {
            setSpan(android.text.style.ForegroundColorSpan(color(R.color.assistant_primary)), length - 1, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        val articles = assets.open("assistant-help.json").bufferedReader().use { JSONArray(it.readText()) }
        val questions = findViewById<LinearLayout>(R.id.assistantQuestions)
        // One column on phones, two on a tablet, as in the web resource stylesheet.
        var line: LinearLayout? = null
        val columns = if (resources.configuration.screenWidthDp >= 736) 2 else 1
        for (index in 0 until minOf(4, articles.length())) {
            if (index % columns == 0) {
                line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                questions.addView(line)
            }
            val question = articles.getJSONObject(index).getString("question")
            val button = label(question, 13f, R.color.assistant_soft).apply {
                minHeight = dp(52); gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(12), dp(16), dp(12))
                setBackgroundResource(R.drawable.bg_assistant_question)
                isFocusable = true
                setOnClickListener {
                    if (!model.state.value.busy) {
                        model.draft(question); input.requestFocus()
                        getSystemService(InputMethodManager::class.java).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
                    }
                }
            }
            questionButtons.add(button)
            button.pressMotion()
            line!!.addView(button, LinearLayout.LayoutParams(0, -2, 1f).apply {
                bottomMargin = dp(12); if (index % columns != 0) marginStart = dp(12)
            })
        }
        buildGuides(articles)
        findViewById<EditText>(R.id.assistantSearch).watch { model.search(it) }
        findViewById<View>(R.id.assistantClassChat).setOnClickListener { openRoute("/chat") }
    }

    override fun onStart() {
        super.onStart()
        if (!::input.isInitialized) return
        online = isOnline()
        collection = lifecycleScope.launch { model.state.collect { render(it) } }
        FirebaseAuth.getInstance().addAuthStateListener(authListener)
        try { connectivity.registerDefaultNetworkCallback(callback); registered = true } catch (_: RuntimeException) { }
        if (online) model.refresh()
        handler.post(tick)
    }
    override fun onStop() {
        if (registered) { connectivity.unregisterNetworkCallback(callback); registered = false }
        FirebaseAuth.getInstance().removeAuthStateListener(authListener)
        handler.removeCallbacksAndMessages(null)
        collection?.cancel(); collection = null
        fade?.end(); typing?.cancel(); typing = null
        super.onStop()
    }
    private fun isOnline() = connectivity.getNetworkCapabilities(connectivity.activeNetwork)?.let {
        it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } == true
    private fun changedConnection() { handler.post {
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return@post
        val restored = !online && isOnline(); online = isOnline()
        if (restored) model.refresh()
        render(model.state.value)
    } }
    private fun sendQuestion() {
        online = isOnline()
        if (model.state.value.canAsk(System.currentTimeMillis(), online)) {
            needsInputFocus = true
            model.send(online, motionEnabled())
        }
    }

    private fun render(state: AssistantState) {
        if (!::input.isInitialized) return
        val now = System.currentTimeMillis()
        if (input.text.toString() != state.draft) { input.setText(state.draft); input.setSelection(input.length()) }
        input.isEnabled = !state.busy
        val send = findViewById<View>(R.id.assistantSend)
        send.isEnabled = state.canAsk(now, online)
        send.contentDescription = if (state.busy) getString(R.string.assistant_thinking) else getString(R.string.assistant_send)
        findViewById<TextView>(R.id.assistantSendLabel).setText(if (state.busy) R.string.assistant_sending else R.string.assistant_send)
        findViewById<View>(R.id.assistantSendIcon).visibility = if (state.busy) View.GONE else View.VISIBLE
        findViewById<TextView>(R.id.assistantSendLabel).setTextColor(color(if (send.isEnabled) R.color.assistant_on_primary else R.color.assistant_muted))
        findViewById<ImageView>(R.id.assistantSendIcon).imageTintList = android.content.res.ColorStateList.valueOf(color(if (send.isEnabled) R.color.assistant_on_primary else R.color.assistant_muted))
        findViewById<View>(R.id.assistantSuggestions).visibility = if (state.messages.any { it.role == "user" }) View.GONE else View.VISIBLE
        questionButtons.forEach { it.isEnabled = !state.busy; it.alpha = if (state.busy) .55f else 1f }
        findViewById<TextView>(R.id.assistantCount).apply {
            visibility = if (state.draft.length >= 400) View.VISIBLE else View.GONE
            val count = "${state.draft.length} / 500"; if (text.toString() != count) text = count
        }
        val usage = state.usage
        val quota = when {
            !state.ready -> ""
            usage?.unlimited == true -> getString(R.string.assistant_unlimited)
            usage?.remaining != null -> resources.getQuantityString(R.plurals.assistant_remaining, usage.remaining, usage.remaining)
            else -> ""
        }
        findViewById<TextView>(R.id.assistantQuota).setIfChanged(quota)
        val status = when {
            !online -> getString(R.string.assistant_offline)
            state.busy -> ""
            !state.ready -> getString(R.string.assistant_checking)
            state.notice.isNotBlank() -> state.notice
            !state.available -> getString(R.string.assistant_unavailable)
            usage?.exhausted(now) == true -> getString(R.string.assistant_reset,
                android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(usage.resetAt)))
            state.waitSeconds(now) > 0 -> getString(R.string.assistant_wait, state.waitSeconds(now))
            else -> ""
        }
        findViewById<TextView>(R.id.assistantStatus).apply { setIfChanged(status); visibility = if (status.isBlank()) View.GONE else View.VISIBLE }
        findViewById<View>(R.id.assistantRetry).visibility = if (state.ready && !state.available && online && !state.busy) View.VISIBLE else View.GONE
        renderMessages(state)
        renderHelp(state)
        if (lastBusy && !state.busy && needsInputFocus) { needsInputFocus = false; input.requestFocus() }
        lastBusy = state.busy
    }

    private fun renderMessages(state: AssistantState) {
        if (displayed != state.messages) {
            displayed = state.messages
            fade?.end(); typing?.cancel(); typing = null
            messages.removeAllViews(); answerViews.clear(); pending = null
            messages.addView(messageRow(AssistantMessage("assistant", getString(R.string.assistant_welcome), 0)))
            state.messages.forEach { message -> messages.addView(messageRow(message, state)) }
            if (state.messages.isNotEmpty()) scrollToEnd()
        }
        val waiting = state.busy && state.revealingId == null
        if (waiting && pending == null) {
            pending = messageRow(AssistantMessage("typing", ""))
            messages.addView(pending); scrollToEnd()
        } else if (!waiting && pending != null) {
            messages.removeView(pending); pending = null; typing?.cancel(); typing = null
        }
        if (waiting && typing == null && lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) startTyping()
        val revealing = state.revealingId?.let { answerViews[it] }
        if (revealing != null && revealing.text.toString() != state.visibleAnswer) {
            val follow = atBottom()
            val oldLength = revealing.text.length.coerceAtMost(state.visibleAnswer.length)
            fade?.end()
            val span = SentenceFade()
            revealing.text = SpannableString(state.visibleAnswer).apply {
                if (motionEnabled()) setSpan(span, oldLength, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            if (motionEnabled()) fade = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 300
                addUpdateListener { span.opacity = it.animatedValue as Float; revealing.invalidate() }
                start()
            }
            if (follow) scrollToEnd()
        }
        // A retained screen that returns after the reveal completed shows the saved full answer.
        if (state.revealingId == null) state.messages.forEach { answerViews[it.id]?.setIfChanged(it.text) }
    }

    private fun messageRow(message: AssistantMessage, state: AssistantState? = null): View {
        val mine = message.role == "user"
        val row = LinearLayout(this).apply {
            gravity = Gravity.BOTTOM; orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(-2, -2).apply {
                gravity = if (mine) Gravity.END else Gravity.START
                topMargin = dp(9); bottomMargin = dp(3)
            }
        }
        val max = ((resources.displayMetrics.widthPixels - dp(64)) * .88f).toInt()
        if (!mine) row.addView(ImageView(this).apply {
            setImageResource(R.drawable.logo); scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(2), dp(2), dp(2), dp(2)); background = shape(R.color.assistant_surface, 999, true)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, LinearLayout.LayoutParams(dp(32), dp(32)).apply { marginEnd = dp(8) })
        val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        if (!mine) body.addView(label(getString(if (message.role == "error") R.string.assistant_failed else R.string.assistant_title), 12f, R.color.assistant_soft).apply {
            setTypeface(ResourcesCompat.getFont(this@AssistantActivity, R.font.be_vietnam_bold))
            setPadding(dp(10), 0, 0, dp(5))
        })
        val bubble = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(13), dp(16), dp(13))
            background = GradientDrawable().apply {
                setColor(color(if (mine) R.color.assistant_primary else if (message.role == "error") R.color.assistant_error_bg else R.color.assistant_surface))
                cornerRadii = (if (mine) listOf(18,18,18,18,6,6,18,18) else listOf(18,18,18,18,18,18,6,6)).map { dp(it).toFloat() }.toFloatArray()
                if (!mine) setStroke(dp(1), color(R.color.assistant_border))
            }
        }
        if (message.role == "typing") {
            val dots = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(21); tag = "assistantTypingDots" }
            for (i in 0..2) dots.addView(View(this).apply { background = shape(R.color.assistant_primary, 999) },
                LinearLayout.LayoutParams(dp(6), dp(6)).apply { if (i > 0) marginStart = dp(5) })
            bubble.addView(dots)
            bubble.contentDescription = getString(R.string.assistant_thinking)
        } else {
            val paragraph = label(if (state?.revealingId == message.id) "" else message.text, 14f,
                if (mine) R.color.assistant_on_primary else R.color.assistant_ink).apply {
                maxWidth = max - if (mine) dp(32) else dp(72)
                setLineSpacing(dp(5).toFloat(), 1f); setTextIsSelectable(true)
            }
            answerViews[message.id] = paragraph
            bubble.addView(paragraph)
        }
        body.addView(bubble)
        row.addView(body)
        return row
    }
    private fun startTyping() {
        val dots = pending?.findViewWithTag<LinearLayout>("assistantTypingDots") ?: return
        if (!motionEnabled()) { for (i in 0..2) dots.getChildAt(i).alpha = 1f; return }
        typing = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1200; repeatCount = ValueAnimator.INFINITE
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener { animation ->
                for (i in 0..2) {
                    val phase = ((animation.animatedFraction - i * .125f) % 1f + 1f) % 1f
                    val pulse = if (phase <= .6f) kotlin.math.sin(phase / .6f * Math.PI).toFloat() else 0f
                    dots.getChildAt(i).apply { translationY = -dp(4) * pulse; alpha = .4f + .6f * pulse }
                }
            }
            start()
        }
    }

    private fun renderHelp(state: AssistantState) {
        val panel = findViewById<View>(R.id.assistantHelp)
        if (shownHelp != state.helpOpen) {
            val first = shownHelp == null; shownHelp = state.helpOpen
            panel.visibility = if (state.helpOpen) View.VISIBLE else View.GONE
            findViewById<View>(R.id.assistantConversation).importantForAccessibility = if (state.helpOpen)
                View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
            findViewById<MaterialCardView>(R.id.assistantGuides).apply {
                strokeColor = color(if (state.helpOpen) R.color.assistant_primary else R.color.assistant_border)
                setCardBackgroundColor(color(if (state.helpOpen) R.color.assistant_tint else R.color.assistant_chat_bg))
                contentDescription = getString(if (state.helpOpen) R.string.assistant_close_guides else R.string.assistant_guides)
                ViewCompat.setStateDescription(this, if (state.helpOpen) "Nakabukas" else "Nakatiklop")
            }
            if (state.helpOpen && !first) findViewById<EditText>(R.id.assistantSearch).apply {
                requestFocus()
                getSystemService(InputMethodManager::class.java).showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
            } else if (!state.helpOpen) {
                findViewById<EditText>(R.id.assistantSearch).clearFocus()
                if (!first) getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(panel.windowToken, 0)
            }
        }
        val search = findViewById<EditText>(R.id.assistantSearch)
        if (search.text.toString() != state.helpQuery) search.setText(state.helpQuery)
        if (visibleQuery != state.helpQuery) {
            visibleQuery = state.helpQuery
            val query = state.helpQuery.trim().lowercase(java.util.Locale.ROOT)
            var count = 0
            guideRows.forEach { (haystack, view) ->
                val visible = haystack.contains(query); view.visibility = if (visible) View.VISIBLE else View.GONE
                if (visible) count++
            }
            findViewById<View>(R.id.assistantNoHelp).visibility = if (count == 0) View.VISIBLE else View.GONE
        }
    }

    private fun buildGuides(articles: JSONArray) {
        val container = findViewById<LinearLayout>(R.id.assistantArticles)
        for (index in 0 until articles.length()) {
            val article = articles.getJSONObject(index)
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; background = shape(R.color.assistant_chat_bg, 13, true)
                setPadding(dp(16), 0, dp(16), 0)
            }
            val title = article.getString("title")
            val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
            body.addView(label(article.getString("text"), 13f, R.color.assistant_soft).apply {
                setLineSpacing(dp(7).toFloat(), 1f); setTextIsSelectable(true)
            })
            body.addView(label(article.getString("link") + " →", 13f, R.color.assistant_primary).apply {
                minHeight = dp(48); gravity = Gravity.CENTER_VERTICAL; isFocusable = true
                setOnClickListener { openRoute(article.getString("route")) }
            })
            val heading = label("▸  $title", 13f, R.color.assistant_ink).apply {
                minHeight = dp(56); gravity = Gravity.CENTER_VERTICAL
                setTypeface(ResourcesCompat.getFont(this@AssistantActivity, R.font.be_vietnam_semi_bold))
                isFocusable = true
                ViewCompat.setStateDescription(this, "Nakatiklop")
                setOnClickListener {
                    val open = body.visibility != View.VISIBLE
                    body.visibility = if (open) View.VISIBLE else View.GONE
                    text = "${if (open) "▾" else "▸"}  $title"
                    ViewCompat.setStateDescription(this, if (open) "Nakabukas" else "Nakatiklop")
                }
            }
            card.addView(heading); card.addView(body)
            container.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            guideRows.add((title + " " + article.getString("text")).lowercase(java.util.Locale.ROOT) to card)
        }
    }
    private fun openRoute(route: String) {
        val target = when (route) {
            "/join" -> Intent(this, JoinClassActivity::class.java)
            "/diksiyonaryo" -> DictionaryActivity.intent(this)
            "/chat" -> MainActivity.chatIntent(this)
            else -> Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_ASSISTANT_TAB, when (route) { "/progress" -> 1; "/account" -> 3; else -> 0 })
        }
        startActivity(target); finish()
    }

    private fun EditText.watch(onChange: (String) -> Unit) { addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { onChange(s?.toString().orEmpty()) }
        override fun afterTextChanged(s: Editable?) = Unit
    }) }
    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private fun View.pressMotion() { setOnTouchListener { target, event ->
        if (target.isEnabled && motionEnabled()) when (event.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> target.animate().translationY(dp(2).toFloat()).setDuration(140).start()
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> target.animate().translationY(0f).setDuration(180).start()
        }
        false
    } }
    private fun TextView.setIfChanged(value: String) { if (text.toString() != value) text = value }
    private fun label(value: String, size: Float, ink: Int) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color(ink)); typeface = ResourcesCompat.getFont(this@AssistantActivity, R.font.be_vietnam_regular)
    }
    private fun shape(ink: Int, radius: Int, border: Boolean = false) = GradientDrawable().apply {
        setColor(color(ink)); cornerRadius = dp(radius).toFloat()
        if (border) setStroke(dp(1), color(R.color.assistant_border))
    }
    private fun color(id: Int) = ContextCompat.getColor(this, id)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun atBottom() = scroll.getChildAt(0).height - scroll.height - scroll.scrollY < dp(80)
    private fun scrollToEnd() { scroll.post { scroll.scrollTo(0, scroll.getChildAt(0).height) } }
    private fun motionEnabled() = if (android.os.Build.VERSION.SDK_INT >= 26) ValueAnimator.areAnimatorsEnabled()
        else android.provider.Settings.Global.getFloat(contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f
    private class SentenceFade : CharacterStyle() {
        var opacity = 1f
        override fun updateDrawState(paint: TextPaint) { paint.alpha = (paint.alpha * opacity).toInt() }
    }
}
