package ph.basaya.app.ui.assistant

import android.animation.ValueAnimator
import android.content.res.Configuration
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
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
import com.google.android.flexbox.FlexboxLayout
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import org.json.JSONArray
import ph.basaya.app.R

class AssistantActivity : AppCompatActivity() {
    private lateinit var model: AssistantViewModel
    private lateinit var input: EditText
    private lateinit var send: ImageButton
    private lateinit var scroll: NestedScrollView
    private lateinit var messages: LinearLayout
    private var displayed: List<AssistantMessage>? = null
    private var wasBusy = false
    private var online = false
    private var imeVisible = false
    private var guides: BottomSheetDialog? = null
    private var collection: Job? = null
    private val handler = Handler(Looper.getMainLooper())
    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }
    private var registered = false
    private val authListener = FirebaseAuth.AuthStateListener {
        if (::model.isInitialized && it.currentUser?.uid != model.uid) finish()
    }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = connectionChanged()
        override fun onLost(network: Network) = connectionChanged()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = connectionChanged()
    }
    private val tick = object : Runnable {
        override fun run() {
            if (!::model.isInitialized) return
            val state = model.state.value
            if (online && state.usage?.needsRefresh(System.currentTimeMillis()) == true &&
                !state.checking && !state.busy && state.available) model.refresh()
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
        send = findViewById(R.id.assistantSend)
        scroll = findViewById(R.id.assistantScroll)
        messages = findViewById(R.id.assistantMessages)
        val root = findViewById<View>(R.id.assistantRoot)
        val toolbar = findViewById<View>(R.id.assistantToolbar)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            root.updatePadding(left = bars.left, right = bars.right, bottom = maxOf(bars.bottom, ime))
            toolbar.updatePadding(top = dp(8) + bars.top)
            val changed = imeVisible != (ime > 0)
            imeVisible = ime > 0
            if (changed) { render(model.state.value); scrollToEnd() }
            insets
        }
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = resources.configuration.uiMode and
                Configuration.UI_MODE_NIGHT_MASK != Configuration.UI_MODE_NIGHT_YES
        }
        findViewById<View>(R.id.assistantBack).setOnClickListener { finish() }
        findViewById<View>(R.id.assistantGuides).apply {
            TooltipCompat.setTooltipText(this, getString(R.string.assistant_guides))
            setOnClickListener { showGuides() }
        }
        findViewById<View>(R.id.assistantRetry).apply {
            TooltipCompat.setTooltipText(this, getString(R.string.assistant_retry))
            setOnClickListener {
                online = isOnline()
                if (online) model.refresh() else render(model.state.value)
            }
        }
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                model.draft(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) = Unit
        })
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEND) { model.send(isOnline()); true } else false
        }
        send.setOnClickListener { model.send(isOnline()) }
        val questions = findViewById<FlexboxLayout>(R.id.assistantQuestions)
        val articles = readGuides()
        for (index in 0 until minOf(4, articles.length())) {
            val article = articles.getJSONObject(index)
            val question = article.getString("question")
            questions.addView(label(question, 13f, R.color.assistant_ink).apply {
                layoutParams = FlexboxLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(0, 0, dp(8), dp(8)) }
                minHeight = dp(48)
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                setBackgroundResource(R.drawable.bg_assistant_question)
                isFocusable = true
                setOnClickListener {
                    if (!model.state.value.busy) {
                        model.draft(question)
                        input.requestFocus()
                        getSystemService(InputMethodManager::class.java).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
                    }
                }
            })
        }
        if (savedInstanceState == null && motionEnabled()) {
            findViewById<View>(R.id.assistantBuddy).apply {
                scaleX = .85f; scaleY = .85f; rotation = -8f
                animate().scaleX(1f).scaleY(1f).rotation(0f).setDuration(350)
                    .setInterpolator(android.view.animation.OvershootInterpolator(1.2f)).start()
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (!::input.isInitialized) return
        collection = lifecycleScope.launch { model.state.collect { render(it) } }
        FirebaseAuth.getInstance().addAuthStateListener(authListener)
        online = isOnline()
        try { connectivity.registerDefaultNetworkCallback(networkCallback); registered = true }
        catch (_: RuntimeException) { /* The explicit retry also rechecks connectivity. */ }
        if (online) model.refresh()
        handler.post(tick)
    }

    override fun onStop() {
        if (registered) { connectivity.unregisterNetworkCallback(networkCallback); registered = false }
        FirebaseAuth.getInstance().removeAuthStateListener(authListener)
        handler.removeCallbacksAndMessages(null)
        collection?.cancel()
        collection = null
        super.onStop()
    }

    override fun onDestroy() {
        guides?.dismiss()
        super.onDestroy()
    }

    private fun isOnline(): Boolean = connectivity.getNetworkCapabilities(connectivity.activeNetwork)?.let {
        it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } == true

    private fun connectionChanged() {
        handler.post {
            if (!lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) return@post
            val connected = isOnline()
            val restored = connected && !online
            online = connected
            if (restored) model.refresh()
            render(model.state.value)
        }
    }

    private fun render(state: AssistantState) {
        if (!::input.isInitialized) return
        val now = System.currentTimeMillis()
        if (input.text.toString() != state.draft) {
            input.setText(state.draft)
            input.setSelection(input.length())
        }
        input.isEnabled = !state.busy
        send.isEnabled = state.canAsk(now, online)
        send.alpha = if (send.isEnabled) 1f else .45f
        findViewById<View>(R.id.assistantSuggestions).visibility = if (state.messages.isEmpty()) View.VISIBLE else View.GONE
        findViewById<View>(R.id.assistantHero).visibility = if (state.messages.isEmpty() && !imeVisible) View.VISIBLE else View.GONE
        findViewById<View>(R.id.assistantPending).visibility = if (state.busy) View.VISIBLE else View.GONE
        val count = findViewById<TextView>(R.id.assistantCount)
        count.visibility = if (state.draft.length >= 400) View.VISIBLE else View.GONE
        val counter = "${state.draft.length} / 500"
        if (count.text.toString() != counter) count.text = counter
        val quota = findViewById<TextView>(R.id.assistantQuota)
        val quotaText = state.usage?.let {
            if (it.unlimited) getString(R.string.assistant_unlimited)
            else getString(R.string.assistant_remaining, it.remaining ?: 0)
        }.orEmpty()
        if (quota.text.toString() != quotaText) quota.text = quotaText
        val status = findViewById<TextView>(R.id.assistantStatus)
        val text = when {
            !online -> getString(R.string.assistant_offline)
            state.busy -> getString(R.string.assistant_thinking)
            state.checking -> getString(R.string.assistant_checking)
            state.usage?.exhausted(now) == true -> getString(R.string.assistant_reset,
                android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(state.usage.resetAt)))
            state.notice.isNotBlank() -> state.notice
            !state.available -> getString(R.string.assistant_unavailable)
            state.waitSeconds(now) > 0 -> getString(R.string.assistant_wait, state.waitSeconds(now))
            else -> getString(R.string.assistant_ready)
        }
        if (status.text.toString() != text) status.text = text
        val compact = imeVisible && online && state.available && state.notice.isBlank() &&
            !state.busy && !state.checking && state.waitSeconds(now) == 0L && state.usage?.exhausted(now) != true
        (status.parent as View).visibility = if (compact) View.GONE else View.VISIBLE
        (quota.parent as View).visibility = if (imeVisible) View.GONE else View.VISIBLE
        findViewById<View>(R.id.assistantRetry).isEnabled = online && !state.busy && !state.checking
        if (displayed != state.messages) {
            val animate = displayed != null && state.messages.isNotEmpty()
            displayed = state.messages
            messages.removeAllViews()
            state.messages.forEachIndexed { index, message ->
                val row = messageView(message)
                messages.addView(row)
                if (animate && index == state.messages.lastIndex && motionEnabled()) {
                    row.alpha = 0f; row.translationY = dp(8).toFloat()
                    row.animate().alpha(1f).translationY(0f).setDuration(200).start()
                }
            }
            if (state.messages.isNotEmpty()) scrollToEnd()
        }
        if (wasBusy != state.busy) { wasBusy = state.busy; scrollToEnd() }
    }

    private fun messageView(message: AssistantMessage): View {
        val mine = message.role == "user"
        val error = message.role == "error"
        val ink = if (error) R.color.assistant_error else R.color.assistant_ink
        val bubble = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(14))
            background = GradientDrawable().apply {
                setColor(color(if (error) R.color.assistant_error_bg else if (mine) R.color.assistant_tint else R.color.assistant_surface))
                cornerRadii = if (mine) floatArrayOf(20f,20f,6f,6f,20f,20f,20f,20f).map { dp(it.toInt()).toFloat() }.toFloatArray()
                    else floatArrayOf(6f,6f,20f,20f,20f,20f,20f,20f).map { dp(it.toInt()).toFloat() }.toFloatArray()
                setStroke(dp(1), color(R.color.assistant_border))
            }
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(if (mine) dp(28) else 0, 0, if (mine) 0 else dp(20), dp(12))
            }
        }
        bubble.addView(label(getString(if (mine) R.string.assistant_you else if (error) R.string.assistant_failed else R.string.assistant_title), 11f, ink).apply {
            setTypeface(typeface, Typeface.BOLD)
        })
        bubble.addView(label(message.text, 14f, ink).apply {
            setPadding(0, dp(6), 0, 0)
            setLineSpacing(dp(3).toFloat(), 1f)
            setTextIsSelectable(true)
        })
        return bubble
    }

    private fun readGuides(): JSONArray = runCatching {
        assets.open("assistant-help.json").bufferedReader().use { JSONArray(it.readText()) }
    }.getOrElse { JSONArray() }

    private fun showGuides() {
        if (guides?.isShowing == true) return
        val dialog = BottomSheetDialog(this)
        guides = dialog
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setBackgroundColor(color(R.color.assistant_bg))
        }
        content.addView(label(getString(R.string.assistant_guides), 24f, R.color.assistant_ink).apply {
            ViewCompat.setAccessibilityHeading(this, true)
        })
        content.addView(label(getString(R.string.assistant_guides_subtitle), 13f, R.color.assistant_soft).apply {
            setPadding(0, dp(8), 0, dp(16))
        })
        val articles = readGuides()
        if (articles.length() == 0) content.addView(label(getString(R.string.assistant_guides_empty), 14f, R.color.assistant_ink))
        for (index in 0 until articles.length()) {
            val article = articles.getJSONObject(index)
            val body = label(article.getString("text"), 14f, R.color.assistant_soft).apply {
                visibility = View.GONE
                setPadding(dp(14), dp(10), dp(14), dp(18))
                setLineSpacing(dp(4).toFloat(), 1f)
                setTextIsSelectable(true)
            }
            val title = article.getString("title")
            val heading = label("$title  +", 15f, R.color.assistant_ink).apply {
                minHeight = dp(56)
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                setBackgroundResource(R.drawable.bg_assistant_question)
                isFocusable = true
                ViewCompat.setStateDescription(this, "Nakatiklop")
                setOnClickListener {
                    val open = body.visibility != View.VISIBLE
                    body.visibility = if (open) View.VISIBLE else View.GONE
                    text = "$title  ${if (open) "−" else "+"}"
                    ViewCompat.setStateDescription(this, if (open) "Nakabukas" else "Nakatiklop")
                    if (open && motionEnabled()) {
                        body.alpha = 0f; body.animate().alpha(1f).setDuration(180).start()
                    }
                }
            }
            content.addView(heading, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
            content.addView(body)
        }
        content.addView(label(getString(R.string.assistant_close), 14f, R.color.home_accent).apply {
            minHeight = dp(56); gravity = Gravity.CENTER
            isFocusable = true
            setBackgroundResource(R.drawable.bg_assistant_question)
            setOnClickListener { dialog.dismiss() }
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20) })
        dialog.setContentView(ScrollView(this).apply { addView(content) })
        dialog.show()
    }

    private fun label(value: String, size: Float, ink: Int) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color(ink))
        typeface = ResourcesCompat.getFont(this@AssistantActivity, R.font.be_vietnam_regular)
    }
    private fun color(resource: Int) = ContextCompat.getColor(this, resource)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun motionEnabled() = if (android.os.Build.VERSION.SDK_INT >= 26) ValueAnimator.areAnimatorsEnabled()
        else android.provider.Settings.Global.getFloat(contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f
    private fun scrollToEnd() { scroll.post { scroll.smoothScrollTo(0, scroll.getChildAt(0)?.height ?: 0) } }
}
