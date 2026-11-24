package ph.basaya.app.ui.fragment

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.DrawableCompat
import androidx.fragment.app.Fragment
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ph.basaya.app.R
import ph.basaya.app.adapter.LessonAdapter
import ph.basaya.app.data.auth.AuthHelper
import ph.basaya.app.data.entity.LessonEntity
import ph.basaya.app.data.progress.LessonStatus
import ph.basaya.app.data.notifications.ClassNotifications
import ph.basaya.app.data.repository.LessonPrefetch
import ph.basaya.app.data.repository.LessonRepository
import ph.basaya.app.data.schedule.LessonSchedule
import ph.basaya.app.data.schedule.LessonSchedule.Availability
import ph.basaya.app.ui.DashboardActivity
import android.widget.ImageView
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.google.android.material.appbar.AppBarLayout
import com.google.android.material.bottomsheet.BottomSheetDialog
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import ph.basaya.app.ui.JoinClassActivity
import com.google.android.material.button.MaterialButton


class HomeFragment : Fragment() {

    private var dotsAnimatorSet: AnimatorSet? = null
    private var refreshAnimator: ObjectAnimator? = null
    private var isRefreshing = false
    private var bulkDownloadJob: Job? = null
    private var isBulkDownloading = false
    private var bulkCancelRequested = false
    private lateinit var btnCancelDownloadAll: ImageButton
    private lateinit var btnDownloadAll: MaterialButton

    private var allLessons: List<LessonEntity> = emptyList()
    // What the list shows now: allLessons filtered by tab and search, in schedule order.
    private var shownLessons: List<LessonEntity> = emptyList()

    // Lahat / Bukas / Sarado. "Hindi pa bukas" lessons count as Bukas.
    private enum class LessonTab { ALL, OPEN, CLOSED, DOWNLOADED }
    private var currentTab = LessonTab.ALL
    private lateinit var lessonTabs: View
    private lateinit var tabViews: Map<LessonTab, TextView>

    // Status chips under the tabs (null = Lahat). Practice lessons save no progress, so they're only under Lahat. Same as basaya-web's home status chips.
    private var currentStatus: LessonStatus? = null
    private lateinit var statusFilters: View
    private lateinit var statusChips: Map<LessonStatus?, TextView>

    private lateinit var recyclerView: RecyclerView
    private lateinit var tvEmptyLessons: TextView
    private lateinit var emptyStateScroll: View
    private lateinit var loadingContainer: LinearLayout
    private lateinit var etSearch: EditText
    private lateinit var btnRefresh: ImageButton
    private lateinit var tvClassName: TextView
    private lateinit var appBar: AppBarLayout
    // Shown only while the student has no class (leaving is on the account screen).
    private lateinit var btnJoinClass: ImageButton

    private val authHelper = AuthHelper()
    private var currentClassId: String? = null

    private val firestore by lazy { FirebaseFirestore.getInstance() }

    // The three distinct reasons the lesson list can be empty — each maps to its own icon, tint color, and message via showEmptyState() below.
    private enum class EmptyLessonsState {
        NOT_IN_CLASS,
        NO_LESSONS_IN_CLASS
    }

    private val joinClassLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == android.app.Activity.RESULT_OK) {
                checkClassMembershipAndLoad()
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {

        val view = inflater.inflate(R.layout.fragment_home, container, false)

        val dot1 = view.findViewById<View>(R.id.dot1)
        val dot2 = view.findViewById<View>(R.id.dot2)
        val dot3 = view.findViewById<View>(R.id.dot3)

        startDotsAnimation(dot1, dot2, dot3)

        btnJoinClass = view.findViewById(R.id.btnJoinClass)
        btnJoinClass.visibility = View.GONE // Until membership is known.
        btnJoinClass.setOnClickListener {
            if(hasInternetConnection())showJoinClassSheet()
            else Toast.makeText(requireContext(),
                getString(R.string.internet_connection_required),
                Toast.LENGTH_SHORT).show()
        }

        recyclerView = view.findViewById(R.id.recyclerLessons)
        tvEmptyLessons = view.findViewById(R.id.tvEmptyLessons)
        emptyStateScroll = view.findViewById(R.id.emptyStateScroll)
        loadingContainer = view.findViewById(R.id.loadingContainer)
        etSearch = view.findViewById(R.id.etSearch)
        btnRefresh = view.findViewById(R.id.btnRefresh)
        tvClassName = view.findViewById(R.id.tvClassName)
        lessonTabs = view.findViewById(R.id.lessonTabs)
        appBar = view.findViewById(R.id.homeAppBar)
        tabViews = mapOf(
            LessonTab.ALL to view.findViewById(R.id.tabAll),
            LessonTab.OPEN to view.findViewById(R.id.tabOpen),
            LessonTab.CLOSED to view.findViewById(R.id.tabClosed),
            LessonTab.DOWNLOADED to view.findViewById(R.id.tabDownloaded)
        )
        tabViews.forEach { (tab, tabView) ->
            tabView.setOnClickListener {
                if (tab != currentTab) {
                    currentTab = tab
                    showLessons()
                }
            }
        }
        statusFilters = view.findViewById(R.id.statusFilters)
        setupStatusChips(view.findViewById(R.id.llStatusFilters))

        var adapter = LessonAdapter(
            emptyList(),
            onItemClick = { lesson -> openLessonIfAvailable(lesson) },
            onDownloadClick = { lesson, onProgress, onResult -> handleDownload(lesson, onProgress, onResult) },
            onRemoveDownloadClick = { lesson, onResult -> handleRemoveDownload(lesson, onResult) }
        )
        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = adapter
        this.adapter = adapter
        btnDownloadAll = view.findViewById(R.id.btnDownloadAll)
        btnDownloadAll.setOnClickListener { downloadAllLessons() }
        btnCancelDownloadAll = view.findViewById(R.id.btnCancelDownloadAll)
        btnCancelDownloadAll.setOnClickListener {
            bulkCancelRequested = true
            btnCancelDownloadAll.isEnabled = false
            bulkDownloadJob?.cancel()
        }

        btnRefresh.setOnClickListener {
            if (currentClassId == null) {
                Toast.makeText(requireContext(), getString(R.string.toast_join_class_first), Toast.LENGTH_SHORT).show()
            } else {
                fetchLessons(isManualRefresh = true)
            }
        }

        etSearch.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: android.text.Editable?) {
                // With no lessons, the class-empty state from fetchLessons() stays.
                if (allLessons.isNotEmpty() && currentClassId != null) showLessons()
            }
        })

        checkClassMembershipAndLoad()

        return view
    }

    private lateinit var adapter: LessonAdapter

    /** The empty message and its scroll area are always shown and hidden together. */
    private fun setEmptyVisible(visible: Boolean) {
        if (currentClassId == null || allLessons.isEmpty()) btnDownloadAll.visibility = View.GONE
        val visibility = if (visible) View.VISIBLE else View.GONE
        tvEmptyLessons.visibility = visibility
        emptyStateScroll.visibility = visibility
        // Bring the scrolled-away header back so search and refresh are in reach.
        if (visible) appBar.setExpanded(true, true)
    }

    /** Fills the list from allLessons: the picked tab, then the search, in schedule order. */
    private fun showLessons() {
        updateDownloadAllButton()
        val context = requireContext()
        val closedIds = allLessons
            .filter { LessonSchedule.availability(context, it) == Availability.CLOSED }
            .map { it.id }
            .toSet()
        val closedCount = closedIds.size
        tabViews.getValue(LessonTab.ALL).text = getString(R.string.lesson_tab_all, allLessons.size)
        tabViews.getValue(LessonTab.OPEN).text = getString(R.string.lesson_tab_open, allLessons.size - closedCount)
        tabViews.getValue(LessonTab.CLOSED).text = getString(R.string.lesson_tab_closed, closedCount)
        tabViews.getValue(LessonTab.DOWNLOADED).text = getString(R.string.lesson_tab_downloaded, allLessons.count { it.isDownloaded })
        tabViews.forEach { (tab, tabView) -> tabView.isSelected = tab == currentTab }
        lessonTabs.visibility = View.VISIBLE

        val query = etSearch.text?.toString()?.trim().orEmpty()
        val inTab = when (currentTab) {
            LessonTab.ALL -> allLessons
            LessonTab.OPEN -> allLessons.filter { it.id !in closedIds }
            LessonTab.CLOSED -> allLessons.filter { it.id in closedIds }
            LessonTab.DOWNLOADED -> allLessons.filter { it.isDownloaded }
        }
        // Chip counts follow the tab, so they match the list.
        statusChips.forEach { (status, chip) ->
            val count = inTab.count { inStatus(it, status) }
            chip.text = getString(statusLabel(status), count)
            chip.isSelected = status == currentStatus
            styleStatusChip(chip, status)
        }
        statusFilters.visibility = View.VISIBLE
        val filtered = inTab.filter { inStatus(it, currentStatus) }
        shownLessons = LessonSchedule.sortForList(
            context,
            if (query.isEmpty()) filtered else filtered.filter { it.title.contains(query, ignoreCase = true) }
        )

        if (shownLessons.isEmpty()) {
            recyclerView.visibility = View.GONE
            val (iconRes, message) = when {
                query.isNotEmpty() ->
                    R.drawable.ic_empty_search to getString(R.string.empty_no_search_results, query)
                currentStatus == LessonStatus.DONE ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_done_lessons)
                currentStatus == LessonStatus.IN_PROGRESS ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_progress_lessons)
                currentStatus == LessonStatus.NOT_STARTED ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_new_lessons)
                currentTab == LessonTab.DOWNLOADED ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_downloaded_lessons)
                currentTab == LessonTab.CLOSED ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_closed_lessons)
                else ->
                    R.drawable.ic_empty_lessons to getString(R.string.empty_no_open_lessons)
            }
            tvEmptyLessons.text = message
            val icon = ContextCompat.getDrawable(context, iconRes)
            icon?.setBounds(0, 0, icon.intrinsicWidth, icon.intrinsicHeight)
            tvEmptyLessons.setCompoundDrawables(null, icon, null, null)
            setEmptyVisible(true)
        } else {
            recyclerView.visibility = View.VISIBLE
            setEmptyVisible(false)
        }
        adapter.updateList(shownLessons, query)
    }

    private fun inStatus(lesson: LessonEntity, status: LessonStatus?): Boolean =
        status == null || (!lesson.practice && LessonStatus.of(lesson) == status)

    private fun statusLabel(status: LessonStatus?): Int = when (status) {
        null -> R.string.lesson_status_all
        LessonStatus.DONE -> R.string.lesson_status_done
        LessonStatus.IN_PROGRESS -> R.string.lesson_status_progress
        LessonStatus.NOT_STARTED -> R.string.lesson_status_new
    }

    private fun setupStatusChips(row: LinearLayout) {
        val density = resources.displayMetrics.density
        row.contentDescription = getString(R.string.lesson_status_filters_cd)
        val statuses = listOf(null, LessonStatus.DONE, LessonStatus.IN_PROGRESS, LessonStatus.NOT_STARTED)
        statusChips = statuses.associateWith { status ->
            TextView(requireContext()).apply {
                textSize = 13f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                gravity = android.view.Gravity.CENTER
                minHeight = (40 * density).toInt()
                setPadding((14 * density).toInt(), 0, (14 * density).toInt(), 0)
                isClickable = true
                isFocusable = true
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { if (status != null) marginStart = (6 * density).toInt() }
                setOnClickListener {
                    if (status != currentStatus) {
                        currentStatus = status
                        showLessons()
                    }
                }
                row.addView(this)
            }
        }
    }

    /** A pill: white with a thin border, or the status's soft tint and color when picked. */
    private fun styleStatusChip(chip: TextView, status: LessonStatus?) {
        val context = requireContext()
        val (bg, fg) = when (status) {
            null -> R.color.home_surface to R.color.home_accent
            LessonStatus.DONE -> R.color.lesson_status_done_bg to R.color.lesson_status_done_fg
            LessonStatus.IN_PROGRESS -> R.color.lesson_status_progress_bg to R.color.lesson_status_progress_fg
            LessonStatus.NOT_STARTED -> R.color.lesson_status_new_bg to R.color.lesson_status_new_fg
        }
        val density = resources.displayMetrics.density
        chip.background = android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = 999f
            if (chip.isSelected) {
                setColor(ContextCompat.getColor(context, bg))
                setStroke((1.5f * density).toInt(), ContextCompat.getColor(context, fg))
            } else {
                setColor(ContextCompat.getColor(context, R.color.lesson_card_surface))
                setStroke((1 * density).toInt(), ContextCompat.getColor(context, R.color.lesson_card_stroke))
            }
        }
        chip.setTextColor(ContextCompat.getColor(context, if (chip.isSelected) fg else R.color.home_hint))
    }

    private fun showEmptyState(state: EmptyLessonsState) {
        lessonTabs.visibility = View.GONE
        statusFilters.visibility = View.GONE
        recyclerView.visibility = View.GONE
        setEmptyVisible(true)

        val (iconRes, message) = when (state) {
            EmptyLessonsState.NOT_IN_CLASS -> Pair(
                R.drawable.ic_empty_join_class,
                getString(R.string.empty_not_in_class)
            )
            EmptyLessonsState.NO_LESSONS_IN_CLASS -> Pair(
                R.drawable.ic_empty_lessons,
                getString(R.string.empty_no_lessons)
            )
        }

        tvEmptyLessons.text = message

        val icon = ContextCompat.getDrawable(requireContext(), iconRes)
        icon?.setBounds(0, 0, icon.intrinsicWidth, icon.intrinsicHeight)
        tvEmptyLessons.setCompoundDrawables(null, icon, null, null)
    }

    private fun checkClassMembershipAndLoad() {
        val uid = authHelper.getCurrentUser()?.uid
        if (uid == null) {
            Log.e("HomeFragment", "No logged-in user — cannot check class membership")
            return
        }

        loadingContainer.visibility = View.VISIBLE
        lessonTabs.visibility = View.GONE
        statusFilters.visibility = View.GONE
        recyclerView.visibility = View.GONE
        setEmptyVisible(false)

        firestore
            .collection("users")
            .document(uid)
            .get()
            .addOnSuccessListener { doc ->
                if (!isAdded) return@addOnSuccessListener

                val classId = doc.getString("classId")
                val className = doc.getString("className")
                currentClassId = classId?.takeIf { it.isNotBlank() }
                btnJoinClass.visibility = if (currentClassId == null) View.VISIBLE else View.GONE
                // "New lesson" pushes come from this class only.
                ClassNotifications.syncTopic(requireContext(), classId)

                if (classId.isNullOrBlank()) {
                    tvClassName.text = ""
                    tvClassName.visibility = View.GONE
                    loadingContainer.visibility = View.GONE
                    dotsAnimatorSet?.cancel()
                    showEmptyState(EmptyLessonsState.NOT_IN_CLASS)
                } else {
                    tvClassName.text = className.orEmpty()
                    tvClassName.visibility =
                        if (className.isNullOrBlank()) View.GONE else View.VISIBLE
                    fetchLessons(isManualRefresh = false)
                }
            }
            .addOnFailureListener { e ->
                Log.e("HomeFragment", "Failed to check class membership", e)
                if (!isAdded) return@addOnFailureListener
                btnJoinClass.visibility = if (currentClassId == null) View.VISIBLE else View.GONE
                loadingContainer.visibility = View.GONE
                tvClassName.visibility = View.GONE
                dotsAnimatorSet?.cancel()
                tvEmptyLessons.text = getString(R.string.error_checking_class_membership)
                setEmptyVisible(true)
                recyclerView.visibility = View.GONE
            }
    }

    private fun updateDownloadAllButton() {
        if (!::btnDownloadAll.isInitialized || !isAdded) return
        btnDownloadAll.visibility = if (currentClassId != null && allLessons.isNotEmpty()) View.VISIBLE else View.GONE
        btnDownloadAll.isEnabled = !isBulkDownloading && !adapter.hasActiveDownloads() && hasInternetConnection() &&
            allLessons.any { !it.isDownloaded && LessonSchedule.availability(requireContext(), it) == Availability.OPEN }
        (btnDownloadAll.parent as View).visibility = btnDownloadAll.visibility
        btnCancelDownloadAll.visibility = if (isBulkDownloading) View.VISIBLE else View.GONE
        btnCancelDownloadAll.isEnabled = !bulkCancelRequested
        if (!isBulkDownloading) btnDownloadAll.setText(R.string.lesson_download_all)
    }

    private fun downloadAllLessons() {
        if (isBulkDownloading || adapter.hasActiveDownloads() || !hasInternetConnection()) return
        val uid = authHelper.getCurrentUser()?.uid ?: return
        val classId = currentClassId ?: return
        val context = requireContext()
        val ownerView = view ?: return
        val batchAdapter = adapter
        val queue = allLessons.filter { !it.isDownloaded && LessonSchedule.availability(context, it) == Availability.OPEN }
        if (queue.isEmpty()) return
        isBulkDownloading = true
        bulkCancelRequested = false
        batchAdapter.setBulkDownloading(true)
        updateDownloadAllButton()
        bulkDownloadJob = viewLifecycleOwner.lifecycleScope.launch {
            var downloaded = 0
            var failed = 0
            var stopped = false
            var activeId: String? = null
            try {
                val repo = LessonRepository(context)
                for ((index, entry) in queue.withIndex()) {
                    ensureActive()
                    if (!hasInternetConnection() || currentClassId != classId || authHelper.getCurrentUser()?.uid != uid) {
                        stopped = true
                        break
                    }
                    val lesson = allLessons.firstOrNull { it.id == entry.id } ?: continue
                    if (lesson.isDownloaded || LessonSchedule.availability(context, lesson) != Availability.OPEN) continue
                    activeId = lesson.id
                    batchAdapter.showBulkProgress(lesson.id, 0)
                    btnDownloadAll.text = getString(R.string.lesson_download_all_progress, index + 1, queue.size, 0)
                    val success = repo.downloadLesson(lesson.id) { percent ->
                        activity?.runOnUiThread {
                            if (view === ownerView && isBulkDownloading && !bulkCancelRequested) {
                                batchAdapter.showBulkProgress(lesson.id, percent)
                                btnDownloadAll.text = getString(R.string.lesson_download_all_progress, index + 1, queue.size, percent)
                            }
                        }
                    }
                    ensureActive()
                    batchAdapter.finishBulkLesson(lesson.id, success)
                    activeId = null
                    if (success) {
                        downloaded++
                        allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = true) else it }
                    } else failed++
                    if (view === ownerView) showLessons()
                }
                if (view === ownerView) Toast.makeText(context,
                    getString(R.string.lesson_download_all_result, downloaded, failed) +
                        if (stopped) " " + getString(R.string.lesson_download_all_stopped) else "",
                    Toast.LENGTH_LONG).show()
            } catch (cancelled: CancellationException) {
                if (view === ownerView && bulkCancelRequested) {
                    Toast.makeText(context, R.string.lesson_download_cancelled, Toast.LENGTH_SHORT).show()
                }
                throw cancelled
            } finally {
                activeId?.let { batchAdapter.finishBulkLesson(it, false) }
                batchAdapter.setBulkDownloading(false)
                isBulkDownloading = false
                bulkCancelRequested = false
                if (view === ownerView) updateDownloadAllButton()
            }
        }
    }

    private fun handleDownload(lesson: LessonEntity, onProgress: (Int) -> Unit, onResult: (Boolean) -> Unit) {
        updateDownloadAllButton()
        if (!LessonSchedule.canOpen(requireContext(), lesson)) {
            Toast.makeText(requireContext(), getString(R.string.schedule_download_locked), Toast.LENGTH_SHORT).show()
            onResult(false)
            return
        }
        lifecycleScope.launch {
            val repo = LessonRepository(requireContext())
            // Audio progress arrives on the IO thread; the card is updated on the main thread.
            val success = repo.downloadLesson(lesson.id) { percent ->
                activity?.runOnUiThread { onProgress(percent) }
            }

            if (isAdded) {
                Toast.makeText(
                    requireContext(),
                    if (success) getString(R.string.toast_download_success)
                    else getString(R.string.toast_download_failed),
                    Toast.LENGTH_SHORT
                ).show()
            }
            if (success) allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = true) else it }
            onResult(success)
            if (view != null && isAdded) showLessons()
        }
    }

    private fun handleRemoveDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {
        updateDownloadAllButton()
        lifecycleScope.launch {
            val repo = LessonRepository(requireContext())
            val success = repo.removeDownload(lesson.id)

            if (isAdded) {
                Toast.makeText(
                    requireContext(),
                    if (success) getString(R.string.toast_remove_download_success)
                    else getString(R.string.toast_remove_download_failed),
                    Toast.LENGTH_SHORT
                ).show()
            }
            if (success) allLessons = allLessons.map { if (it.id == lesson.id) it.copy(isDownloaded = false) else it }
            onResult(success)
            if (view != null && isAdded) showLessons()
        }
    }

    private fun fetchLessons(isManualRefresh: Boolean) {
        val uid = authHelper.getCurrentUser()?.uid
        if (uid == null) {
            Log.e("HomeFragment", "No logged-in user — cannot load lessons")
            return
        }
        if (isRefreshing) return
        isRefreshing = true

        if (isManualRefresh) {
            startRefreshSpin(btnRefresh)
        }

        lifecycleScope.launch {
            val repo = LessonRepository(requireContext())
            // Right after launch, the splash screen's sync (done or still running) stands in for a new one.
            val prefetched = if (isManualRefresh) null else LessonPrefetch.take(uid)
            if (prefetched != null) prefetched.await() else repo.syncLessons(uid)
            val lessons = repo.getLessons(uid)

            allLessons = lessons

            if (!isAdded) return@launch

            loadingContainer.visibility = View.GONE
            dotsAnimatorSet?.cancel()

            if (lessons.isEmpty()) {
                showEmptyState(EmptyLessonsState.NO_LESSONS_IN_CLASS)
            } else {
                showLessons()
                applyHighlight()
            }

            if (isManualRefresh) {
                stopRefreshSpin(btnRefresh)
            }
            isRefreshing = false
        }
    }

    private fun startDotsAnimation(dot1: View, dot2: View, dot3: View) {
        val dots = listOf(dot1, dot2, dot3)
        val staggerDelay = 150L

        val animators = dots.mapIndexed { index, dot ->
            createDotPulse(dot).apply {
                startDelay = index * staggerDelay
            }
        }

        dotsAnimatorSet = AnimatorSet().apply {
            playTogether(animators)
            start()
        }
    }

    private fun createDotPulse(dot: View): AnimatorSet {
        val scaleUpX = ObjectAnimator.ofFloat(dot, View.SCALE_X, 1f, 1.4f, 1f)
        val scaleUpY = ObjectAnimator.ofFloat(dot, View.SCALE_Y, 1f, 1.4f, 1f)
        val alpha = ObjectAnimator.ofFloat(dot, View.ALPHA, 0.4f, 1f, 0.4f)

        return AnimatorSet().apply {
            playTogether(scaleUpX, scaleUpY, alpha)
            duration = 900
            interpolator = AccelerateDecelerateInterpolator()
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (dot.isAttachedToWindow) {
                        animation.start()
                    }
                }
            })
        }
    }

    private fun startRefreshSpin(btnRefresh: ImageButton) {
        btnRefresh.isEnabled = false
        refreshAnimator?.cancel()
        refreshAnimator = ObjectAnimator.ofFloat(btnRefresh, View.ROTATION, 0f, 360f).apply {
            duration = 700
            repeatCount = ObjectAnimator.INFINITE
            interpolator = LinearInterpolator()
            start()
        }
    }

    private fun stopRefreshSpin(btnRefresh: ImageButton) {
        refreshAnimator?.let { anim ->
            val currentAngle = btnRefresh.rotation % 360f
            anim.cancel()
            ObjectAnimator.ofFloat(
                btnRefresh, View.ROTATION,
                currentAngle, currentAngle + (360f - currentAngle % 360f)
            ).apply {
                duration = 300
                interpolator = AccelerateDecelerateInterpolator()
                start()
            }
        }
        btnRefresh.isEnabled = true
    }

    private fun hasInternetConnection(): Boolean {
        val connectivityManager =
            requireContext().getSystemService(Context.CONNECTIVITY_SERVICE)
                    as ConnectivityManager

        val network = connectivityManager.activeNetwork ?: return false
        val capabilities =
            connectivityManager.getNetworkCapabilities(network) ?: return false

        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun openLessonIfAvailable(lesson: LessonEntity) {
        if (!isAdded || requireActivity().isFinishing) return

        if (!LessonSchedule.canOpen(requireContext(), lesson)) {
            showScheduleLockedDialog(lesson)
            return
        }

        if (lesson.isDownloaded || hasInternetConnection()) {
            startActivity(
                Intent(requireContext(), DashboardActivity::class.java).apply {
                    putExtra("LESSON_ID", lesson.id)
                }
            )
        } else {
            showOfflineLessonDialog(lesson)
        }
    }

    private fun showOfflineLessonDialog(lesson: LessonEntity) {
        val dialog = Dialog(requireContext())
        val dialogView = layoutInflater.inflate(R.layout.dialog_offline_lesson, null)

        dialog.setContentView(dialogView)

        dialogView.findViewById<TextView>(R.id.tvOfflineMessage).text =
            getString(R.string.offline_lesson_message, lesson.title)

        dialogView.findViewById<MaterialButton>(R.id.btnOfflineOkay)
            .setOnClickListener { dialog.dismiss() }

        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(
                (resources.displayMetrics.widthPixels * 0.88).toInt(),
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        dialog.show()
    }

    /** Before the open date, or after the deadline of an unfinished lesson. */
    private fun showScheduleLockedDialog(lesson: LessonEntity) {
        val opens = LessonSchedule.format(lesson.openAt)
        val (title, message) = when (LessonSchedule.availability(requireContext(), lesson)) {
            Availability.NEEDS_INTERNET ->
                getString(R.string.schedule_not_open_title) to
                    getString(R.string.schedule_needs_internet_msg, lesson.title, opens)
            Availability.CLOSED ->
                getString(R.string.schedule_closed_title) to
                    getString(R.string.schedule_closed_msg, lesson.title, LessonSchedule.format(lesson.dueAt))
            else ->
                getString(R.string.schedule_not_open_title) to
                    getString(R.string.schedule_not_open_msg, lesson.title, opens)
        }

        val dialog = Dialog(requireContext())
        val dialogView = layoutInflater.inflate(R.layout.dialog_lesson_status, null)
        dialogView.findViewById<ImageView>(R.id.ivDialogIcon).setImageResource(R.drawable.ic_lock_small)
        dialogView.findViewById<TextView>(R.id.tvDialogTitle).text = title
        dialogView.findViewById<TextView>(R.id.tvDialogMessage).text = message
        dialogView.findViewById<MaterialButton>(R.id.btnDialogPrimary).apply {
            text = "OK"
            setOnClickListener { dialog.dismiss() }
        }

        dialog.setContentView(dialogView)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.show()
        dialog.window?.setLayout(
            (resources.displayMetrics.widthPixels * 0.88).toInt(),
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

    // Lessons to highlight once the list is loaded (from a tapped notification).
    private var pendingHighlight: List<String>? = null

    /** From a tapped notification: scroll to the lesson(s) and make them glow for a moment. */
    fun highlightLessons(lessonIds: List<String>) {
        pendingHighlight = lessonIds
        if (view == null) return // Applied after the first load.
        if (allLessons.none { it.id in lessonIds }) {
            // A brand-new lesson that isn't in the list yet: refresh first.
            if (currentClassId != null) fetchLessons(isManualRefresh = false)
        } else {
            applyHighlight()
        }
    }

    private fun applyHighlight() {
        val ids = pendingHighlight ?: return
        if (allLessons.none { it.id in ids }) return
        pendingHighlight = null

        // The lesson may be hidden by a search or another tab.
        if (etSearch.text.isNotEmpty() || currentTab != LessonTab.ALL || currentStatus != null) {
            currentTab = LessonTab.ALL
            currentStatus = null
            etSearch.setText("") // Its watcher redraws the list...
            showLessons() // ...unless the search was already empty.
        }
        val position = shownLessons.indexOfFirst { it.id in ids }
        if (position < 0) return
        val offset = (24 * resources.displayMetrics.density).toInt()
        (recyclerView.layoutManager as LinearLayoutManager).scrollToPositionWithOffset(position, offset)
        adapter.highlight(ids)
    }

    // The bottom nav hides/shows fragments: when Home comes back, pick up a class change (e.g. the teacher approved leaving) without reloading the list every time.
    override fun onHiddenChanged(hidden: Boolean) {
        super.onHiddenChanged(hidden)
        if (hidden || !isAdded) return
        val uid = authHelper.getCurrentUser()?.uid ?: return
        firestore.collection("users").document(uid).get()
            .addOnSuccessListener { doc ->
                if (!isAdded) return@addOnSuccessListener
                val classId = doc.getString("classId")?.takeIf { it.isNotBlank() }
                if (classId != currentClassId) checkClassMembershipAndLoad()
            }
    }

    override fun onResume() {
        super.onResume()
        // Re-check open dates and deadlines that may have passed while away (a lesson can move from Bukas to Sarado).
        if (allLessons.isNotEmpty() && currentClassId != null && ::tabViews.isInitialized) {
            showLessons()
            refreshProgress()
        } else if (::adapter.isInitialized) adapter.notifyDataSetChanged()
    }

    /** Back from a lesson: pick up what the student just finished, without the refresh button. */
    private fun refreshProgress() {
        val uid = authHelper.getCurrentUser()?.uid ?: return
        if (isRefreshing) return
        isRefreshing = true
        lifecycleScope.launch {
            val repo = LessonRepository(requireContext())
            repo.refreshProgress(uid)
            val lessons = repo.getLessons(uid)
            isRefreshing = false
            if (!isAdded || lessons.isEmpty()) return@launch
            allLessons = lessons
            showLessons()
        }
    }

    private fun showJoinClassSheet() {
        if (!isAdded) return

        val sheet = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.bottom_sheet_join_class, null)
        sheet.setContentView(sheetView)

        sheetView.findViewById<View>(R.id.btnEnterClass).setOnClickListener {
            sheet.dismiss()
            joinClassLauncher.launch(Intent(requireContext(), JoinClassActivity::class.java))
        }

        sheet.show()
    }

    override fun onDestroyView() {
        bulkDownloadJob?.cancel()
        super.onDestroyView()
        dotsAnimatorSet?.cancel()
        refreshAnimator?.cancel()
    }
}