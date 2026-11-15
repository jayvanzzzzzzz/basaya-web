package ph.basaya.app.ui

import android.animation.ObjectAnimator
import android.content.Intent
import android.content.res.Configuration
import android.view.animation.DecelerateInterpolator
import java.util.Calendar
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.PopupWindow
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.fragment.app.Fragment
import ph.basaya.app.R
import ph.basaya.app.controller.BottomNavController
import ph.basaya.app.data.auth.AuthHelper
import ph.basaya.app.data.auth.StudentOnly
import ph.basaya.app.data.notifications.ClassNotifications
import ph.basaya.app.data.notifications.LessonInbox
import ph.basaya.app.data.notifications.NotificationReadState
import ph.basaya.app.ui.fragment.HomeFragment
import androidx.appcompat.widget.TooltipCompat
import ph.basaya.app.ui.dictionary.DictionaryActivity
import ph.basaya.app.ui.notifications.NotificationsActivity
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import ph.basaya.app.data.chat.ClassChat
import ph.basaya.app.ui.fragment.ChatFragment
import ph.basaya.app.ui.fragment.ProfileFragment
import ph.basaya.app.ui.theme.ThemeReveal
import com.google.firebase.firestore.ListenerRegistration
import ph.basaya.app.ui.fragment.ProgressFragment
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

class MainActivity : AppCompatActivity() {

    companion object {
        private const val EXTRA_HIGHLIGHT_LESSONS = "highlightLessonIds"
        private const val EXTRA_OPEN_CHAT = "openChat"
        private const val TAB_CHAT = 2
        private const val STATE_TAB = "selectedTab"
        private const val STATE_FIRST_NAME = "firstName"

        /** Opens the Chat tab (reusing the running screen); from a class chat notification. */
        fun chatIntent(context: Context): Intent =
            Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_OPEN_CHAT, true)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )

        /** Opens Home (reusing the running screen) and highlights these lessons. */
        fun highlightIntent(context: Context, lessonIds: List<String>): Intent =
            Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_HIGHLIGHT_LESSONS, lessonIds.toTypedArray())
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
    }

    private lateinit var auth: FirebaseAuth
    private lateinit var tvName: TextView
    private var isUserReady = false
    // Set when the signed-in account turned out not to be a student's (StudentOnly).
    private var notStudent = false

    private var isProfileMenuActive = false
    private var accountMenu: PopupWindow? = null

    // Class-level now — needed by animateChevron(), and by the avatar click listener below.
    private lateinit var ivProfileChevron: ImageView
    private lateinit var tvAvatarInitial: TextView

    private lateinit var authStateListener: FirebaseAuth.AuthStateListener

    // After a recreate (e.g. switching light/dark) the fragment manager has already restored the tabs.
    private val homeFragment by lazy { restoredTab("home") ?: HomeFragment() }
    private val progressFragment by lazy { restoredTab("progress") ?: ProgressFragment() }
    private val chatFragment by lazy { restoredTab("chat") ?: ChatFragment() }
    private val profileFragment by lazy { restoredTab("profile") ?: ProfileFragment() }
    private var selectedTab = 0
    private var renderedNightMode = Configuration.UI_MODE_NIGHT_UNDEFINED
    private var savedFirstName: String? = null

    private inline fun <reified T : Fragment> restoredTab(tag: String): T? =
        supportFragmentManager.findFragmentByTag(tag) as? T

    // Chat tab's unread dot: follows the class's chat/state while this screen is visible.
    private lateinit var chatUnreadDot: View
    private var userListener: ListenerRegistration? = null
    private var chatStateListener: ListenerRegistration? = null
    private var chatClassId: String? = null
    private var chatMyName = ""
    private var chatState: ClassChat.State? = null
    private var pendingOpenChat = false

    private lateinit var btnNotification: ImageButton
    private lateinit var tvNotifBadge: TextView
    private var bellAnimator: AnimatorSet? = null
    private var bottomNavController: BottomNavController? = null
    // Lessons to highlight once Home is ready (from a tapped notification).
    private var pendingHighlight: List<String>? = null
    private var activeFragment: Fragment? = null

    // Android 13+ asks before an app may show notifications ("new lesson" pushes).
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) return
        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderedNightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        ThemeReveal.prepareWindow(this)

        auth = FirebaseAuth.getInstance()

        if (auth.currentUser == null) {
            // A restored activity must also wait for the initial auth state on a cold start.
            startActivity(Intent(this, SplashActivity::class.java).apply {
                intent.getStringArrayExtra(EXTRA_HIGHLIGHT_LESSONS)?.let {
                    putExtra(EXTRA_HIGHLIGHT_LESSONS, it)
                }
                putExtra(EXTRA_OPEN_CHAT, intent.getBooleanExtra(EXTRA_OPEN_CHAT, false))
            })
            finish()
            return
        }

        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        selectedTab = savedInstanceState?.getInt(STATE_TAB, 0) ?: 0
        savedFirstName = savedInstanceState?.getString(STATE_FIRST_NAME)
        ThemeReveal.playIfPending(this)

        ClassNotifications.createChannels(this)
        if (savedInstanceState == null) askNotificationPermission()

        val appBar = findViewById<View>(R.id.appBarLayout)
        val bottomNavContent = findViewById<View>(R.id.bottomNavContent)

        // Extend both bars to the screen edges while keeping controls clear of system navigation.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { root, insets ->
            val statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            // Chat uses its own compact header in place of the shared masthead.
            root.setPadding(root.paddingLeft, if (selectedTab == TAB_CHAT) statusBarHeight else 0,
                root.paddingRight, root.paddingBottom)
            appBar.setPadding(appBar.paddingLeft, statusBarHeight, appBar.paddingRight, appBar.paddingBottom)
            val navInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            bottomNavContent.setPadding(navInsets.left, 0, navInsets.right, navInsets.bottom)
            insets
        }

        findViewById<TextView>(R.id.tvGreeting).setText(greetingForNow())
        btnNotification = findViewById(R.id.btnNotification)
        tvNotifBadge = findViewById(R.id.tvNotifBadge)
        pendingHighlight = highlightIds(intent)
        pendingOpenChat = openChat(intent)
        chatUnreadDot = findViewById(R.id.chatUnreadDot)

        // Unread count follows new pushes, lesson syncs and "mark all read".
        lifecycleScope.launch {
            LessonInbox.changes.collect {
                if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) refreshBell()
            }
        }

        ivProfileChevron = findViewById(R.id.ivProfileChevron)

        findViewById<View>(R.id.tvAvatarInitial).apply {
            contentDescription = getString(R.string.account_menu_open)
            setOnClickListener { view -> showToolbarMenu(view) }
        }

        // Both masthead palettes use a blue surface with light status-bar icons.
        WindowInsetsControllerCompat(window, window.decorView)
            .isAppearanceLightStatusBars = false

        authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser

            if (user == null) {
                // Logged out: stop this phone getting the class's lesson notifications.
                ClassNotifications.syncTopic(this@MainActivity, null)
                if (!isDestroyed && !isFinishing) {
                    startActivity(
                        Intent(this@MainActivity, LogInActivity::class.java)
                            .putExtra(StudentOnly.EXTRA_STUDENTS_ONLY, notStudent)
                    )
                    finish()
                }
            } else {
                if (!isUserReady) {
                    isUserReady = true
                    setupUI()
                }
            }
        }

        // Icon only: long-press (or a mouse hover) shows "Diksiyonaryo".
        findViewById<View>(R.id.btnDictionary).apply {
            TooltipCompat.setTooltipText(this, getString(R.string.dict_title))
            setOnClickListener { startActivity(DictionaryActivity.intent(this@MainActivity)) }
        }

        // Opens the notification list and marks everything as read.
        btnNotification.setOnClickListener {
            val uid = auth.currentUser?.uid ?: return@setOnClickListener
            val readBefore = NotificationReadState.readAt(this, uid)
            startActivity(NotificationsActivity.intent(this, readBefore))
            NotificationReadState.markAllRead(this, uid)
            showUnread(0)
        }

        auth.addAuthStateListener(authStateListener)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val nightMode = newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK
        if (nightMode != renderedNightMode && !isFinishing && !isDestroyed) {
            renderedNightMode = nightMode
            // A client-side recreate preserves the current window surface. Letting the system
            // relaunch this activity for uiMode can discard it before the reveal can be drawn.
            recreate()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        highlightIds(intent)?.let { ids ->
            pendingHighlight = ids
            if (isUserReady) deliverHighlight()
        }
        if (openChat(intent)) {
            pendingOpenChat = true
            if (isUserReady) deliverOpenChat()
        }
    }

    override fun onStart() {
        super.onStart()
        refreshBell()
        watchChatDot()
    }

    override fun onStop() {
        super.onStop()
        bellAnimator?.cancel()
        bellAnimator = null
        stopChatDot()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt(STATE_TAB, selectedTab)
        if (::tvName.isInitialized && tvName.text != "...") outState.putString(STATE_FIRST_NAME, tvName.text.toString())
    }

    private fun highlightIds(intent: Intent?): List<String>? =
        intent?.getStringArrayExtra(EXTRA_HIGHLIGHT_LESSONS)?.toList()?.takeIf { it.isNotEmpty() }
            ?.also { intent.removeExtra(EXTRA_HIGHLIGHT_LESSONS) }

    private fun openChat(intent: Intent?): Boolean =
        (intent?.getBooleanExtra(EXTRA_OPEN_CHAT, false) == true)
            .also { if (it) intent?.removeExtra(EXTRA_OPEN_CHAT) }

    /** A tapped chat notification: go to the Chat tab (after the nav's own first layout). */
    private fun deliverOpenChat() {
        if (!pendingOpenChat) return
        pendingOpenChat = false
        findViewById<View>(R.id.navUnderline).post {
            bottomNavController?.selectTab(TAB_CHAT, animate = true)
        }
    }

    /** Signs out; the auth listener then opens LogInActivity with the "students only" pop-up. */
    private fun signOutNotStudent() {
        if (notStudent) return
        notStudent = true
        stopChatDot()
        auth.signOut()
    }

    // Chat tab unread dot

    /** Follows the student's class (it can change: joined, left) and that class's chat/state. */
    private fun watchChatDot() {
        val uid = auth.currentUser?.uid ?: return
        if (userListener != null) return
        userListener = FirebaseFirestore.getInstance().collection("users").document(uid)
            .addSnapshotListener { doc, _ ->
                // A saved login (or a role changed later) that isn't a student's: sign out.
                // A missing profile is left alone here so a slow first sync can't lock a student out.
                if (doc != null && doc.exists() && !StudentOnly.isStudent(doc)) {
                    signOutNotStudent()
                    return@addSnapshotListener
                }
                val classId = doc?.getString("classId")?.takeIf { it.isNotBlank() }
                if (doc == null || classId == chatClassId) return@addSnapshotListener
                chatClassId = classId
                chatStateListener?.remove()
                chatStateListener = null
                chatState = null
                chatMyName = ""
                showChatDot()
                if (classId == null) return@addSnapshotListener
                lifecycleScope.launch {
                    val name = runCatching { ClassChat.rosterName(classId, uid) }.getOrDefault("")
                    if (chatClassId == classId) chatMyName = name.ifEmpty { doc.getString("fullName").orEmpty() }
                    showChatDot()
                }
                chatStateListener = ClassChat.watchState(classId) { state ->
                    if (chatClassId != classId) return@watchState
                    chatState = state
                    showChatDot()
                }
            }
    }

    private fun stopChatDot() {
        userListener?.remove()
        chatStateListener?.remove()
        userListener = null
        chatStateListener = null
        chatClassId = null
    }

    private fun showChatDot() {
        if (!::chatUnreadDot.isInitialized) return
        val classId = chatClassId
        val state = chatState
        val unread = classId != null && state != null && activeFragment !== chatFragment &&
            ClassChat.isUnread(this, classId, state, chatMyName)
        chatUnreadDot.visibility = if (unread) View.VISIBLE else View.GONE
        findViewById<View>(R.id.navChat).contentDescription =
            if (unread) getString(R.string.ch_unread_cd) else getString(R.string.nav_chat)
    }

    /** A tapped notification: go to Home and make its lesson(s) glow. */
    private fun deliverHighlight() {
        val ids = pendingHighlight ?: return
        pendingHighlight = null
        bottomNavController?.selectTab(0, animate = true)
        homeFragment.highlightLessons(ids)
    }

    private fun refreshBell() {
        val uid = auth.currentUser?.uid ?: return
        lifecycleScope.launch {
            showUnread(LessonInbox.unreadCount(this@MainActivity, uid))
        }
    }

    private fun showUnread(count: Int) {
        if (count <= 0) {
            tvNotifBadge.visibility = View.GONE
            btnNotification.contentDescription = getString(R.string.notif_bell_cd_none)
            bellAnimator?.cancel()
            bellAnimator = null
            return
        }

        btnNotification.contentDescription =
            resources.getQuantityString(R.plurals.notif_bell_cd_unread, count, count)
        tvNotifBadge.text = if (count > 99) "99+" else count.toString()
        if (tvNotifBadge.visibility != View.VISIBLE) {
            tvNotifBadge.visibility = View.VISIBLE
            tvNotifBadge.scaleX = 0f
            tvNotifBadge.scaleY = 0f
            tvNotifBadge.animate().scaleX(1f).scaleY(1f).setDuration(220)
                .setInterpolator(DecelerateInterpolator()).start()
            startBellRinging()
        }
    }

    /** A single, restrained nudge when the unread badge first appears. */
    private fun startBellRinging() {
        if (bellAnimator != null) return
        btnNotification.pivotX = btnNotification.width / 2f
        btnNotification.pivotY = btnNotification.height * 0.2f

        val ring = ObjectAnimator.ofFloat(
            btnNotification, View.ROTATION, 0f, 5f, -3f, 0f
        ).setDuration(220)

        bellAnimator = AnimatorSet().apply {
            playTogether(ring)
            interpolator = DecelerateInterpolator()
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    btnNotification.rotation = 0f
                    bellAnimator = null
                }
            })
            start()
        }
    }

    override fun onDestroy() {
        accountMenu?.dismiss()
        super.onDestroy()
        if (::authStateListener.isInitialized) {
            auth.removeAuthStateListener(authStateListener)
        }
    }

    private fun setupUI() {
        tvName = findViewById(R.id.tvFirstName)
        // Recreated (e.g. theme switch): keep the name instead of flashing "..." while it reloads.
        tvName.text = savedFirstName ?: "..."
        tvAvatarInitial = findViewById(R.id.tvAvatarInitial)

        tvAvatarInitial.text = savedFirstName?.firstOrNull()?.uppercase() ?: "0"

        val authHelper = AuthHelper()
        val uid = authHelper.getCurrentUser()?.uid

        if (uid != null) {
            FirebaseFirestore.getInstance()
                .collection("users")
                .document(uid)
                .get()
                .addOnSuccessListener { doc ->
                    val firstName = doc.getString("firstName") ?: ""

                    tvName.text = doc.getString("firstName") ?: ""
                    tvAvatarInitial.text = firstName.firstOrNull()?.uppercase() ?: "B"
                }
                .addOnFailureListener { e ->
                    Log.e("MainActivity", "Failed to fetch user", e)
                }
        }

        if (restoredTab<Fragment>("home") == null) {
            supportFragmentManager.beginTransaction().apply {
                add(R.id.frameLayout, profileFragment, "profile").hide(profileFragment)
                add(R.id.frameLayout, chatFragment, "chat").hide(chatFragment)
                add(R.id.frameLayout, progressFragment, "progress").hide(progressFragment)
                add(R.id.frameLayout, homeFragment, "home")
            }.commitAllowingStateLoss()
            activeFragment = homeFragment
        } else {
            activeFragment = listOf(homeFragment, progressFragment, chatFragment, profileFragment)
                .firstOrNull { !it.isHidden } ?: homeFragment
        }

        setupBottomNav()
        updateChatChrome()
        deliverHighlight()
        deliverOpenChat()
    }

    private fun setupBottomNav() {
        val navUnderline = findViewById<View>(R.id.navUnderline)

        val navHome = findViewById<View>(R.id.navHome)
        val iconHome = findViewById<ImageView>(R.id.iconHome)
        val labelHome = findViewById<TextView>(R.id.labelHome)

        val navProgress = findViewById<View>(R.id.navProgress)
        val iconProgress = findViewById<ImageView>(R.id.iconPractice)
        val labelProgress = findViewById<TextView>(R.id.labelPractice)

        val navChat = findViewById<View>(R.id.navChat)
        val iconChat = findViewById<ImageView>(R.id.iconChat)
        val labelChat = findViewById<TextView>(R.id.labelChat)

        val navProfile = findViewById<View>(R.id.navProfile)
        val iconProfile = findViewById<ImageView>(R.id.iconProfile)
        val labelProfile = findViewById<TextView>(R.id.labelProfile)

        bottomNavController = BottomNavController(
            underline = navUnderline,
            items = listOf(
                BottomNavController.NavItem(navHome, iconHome, labelHome),
                BottomNavController.NavItem(navProgress, iconProgress, labelProgress),
                BottomNavController.NavItem(navChat, iconChat, labelChat),
                BottomNavController.NavItem(navProfile, iconProfile, labelProfile)
            ),
            initialIndex = selectedTab
        ) { index ->
            selectedTab = index
            val target = when (index) {
                0 -> homeFragment
                1 -> progressFragment
                TAB_CHAT -> chatFragment
                3 -> profileFragment
                else -> homeFragment
            }
            switchTo(target)
            showChatDot()
        }
    }

    // btnMoreOptions now delegates to the same shared menu as the avatar tap.
   /* private fun setupToolbarMenu() {
        val btnMoreOptions = findViewById<ImageButton>(R.id.btnMoreOptions)
        btnMoreOptions.setOnClickListener { view ->
            showToolbarMenu(view)
        }
    }*/

    // Account details and sign-out, anchored to the avatar.
    private fun showToolbarMenu(anchor: View) {
        if (accountMenu?.isShowing == true) {
            accountMenu?.dismiss()
            return
        }
        if (isFinishing || isDestroyed) return

        val content = layoutInflater.inflate(R.layout.popup_account_menu, null)
        val user = auth.currentUser
        val name = findViewById<TextView>(R.id.tvFirstName).text.toString().trim()
            .takeIf { it.isNotBlank() && it != "..." }
            ?: user?.displayName?.takeIf { it.isNotBlank() }
            ?: getString(R.string.pf_student)
        content.findViewById<TextView>(R.id.accountMenuName).text = name
        content.findViewById<TextView>(R.id.accountMenuInitial).text = name.take(1).uppercase()
        content.findViewById<TextView>(R.id.accountMenuEmail).apply {
            text = user?.email.orEmpty()
            visibility = if (text.isNullOrBlank()) View.GONE else View.VISIBLE
        }

        val density = resources.displayMetrics.density
        val popup = PopupWindow(
            content,
            minOf((304 * density).toInt(), resources.displayMetrics.widthPixels - (32 * density).toInt()),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        ).apply {
            setBackgroundDrawable(ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_account_menu))
            elevation = 16 * density
            isOutsideTouchable = true
        }
        accountMenu = popup
        content.findViewById<View>(R.id.accountMenuLogout).setOnClickListener {
            popup.dismiss()
            LogoutDialog.show(this) {
                ph.basaya.app.data.auth.RecentAccounts.remember(this, auth.currentUser)
                auth.signOut()
            }
        }

        // Reset the chevron if this menu was opened via the avatar and the user dismisses it without picking anything.
        popup.setOnDismissListener {
            if (accountMenu === popup) accountMenu = null
            if (isProfileMenuActive) {
                isProfileMenuActive = false
                animateChevron(false)
            }
        }

        isProfileMenuActive = true
        animateChevron(true)
        popup.showAsDropDown(anchor, 0, (8 * density).toInt(), Gravity.START)
    }

    private fun switchTo(fragment: Fragment) {
        if (fragment === activeFragment) { updateChatChrome(); return }
        if (isDestroyed || isFinishing) return

        supportFragmentManager.beginTransaction()
            .setCustomAnimations(
                android.R.anim.fade_in,
                android.R.anim.fade_out
            )
            .hide(activeFragment!!)
            .show(fragment)
            .commitAllowingStateLoss()

        activeFragment = fragment
        updateChatChrome()
    }

    private fun updateChatChrome() {
        val inChat = activeFragment === chatFragment
        findViewById<View>(R.id.appBarLayout).visibility = if (inChat) View.GONE else View.VISIBLE
        val root = findViewById<View>(R.id.main)
        root.setBackgroundResource(if (inChat) R.color.ch_surface else R.color.home_bg)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars =
            inChat && (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES
        ViewCompat.requestApplyInsets(root)
    }

    private fun greetingForNow(): Int = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
        in 4..11 -> R.string.tb_greeting_morning
        in 12..17 -> R.string.tb_greeting_afternoon
        else -> R.string.tb_greeting_evening
    }


    private fun animateChevron(active: Boolean) {
        val targetRotation = if (active) 90f else 0f
        ivProfileChevron.animate()
            .rotation(targetRotation)
            .setDuration(200)
            .setInterpolator(android.view.animation.AccelerateDecelerateInterpolator())
            .start()
    }
}
