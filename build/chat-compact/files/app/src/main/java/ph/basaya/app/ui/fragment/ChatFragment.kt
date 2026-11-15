package ph.basaya.app.ui.fragment

import android.content.res.ColorStateList
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import ph.basaya.app.ui.feedback.StudioToast as Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import ph.basaya.app.R
import ph.basaya.app.adapter.ChatAdapter
import ph.basaya.app.data.chat.ClassChat
import com.google.android.material.bottomsheet.BottomSheetDialog
import ph.basaya.app.ui.feedback.StudioDialogBuilder as MaterialAlertDialogBuilder
import ph.basaya.app.ui.feedback.FeedbackTone
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.Normalizer
import kotlin.math.ceil
import kotlin.math.max

/** The Chat tab: the class's group chat with the teacher and classmates (see [ClassChat]). Firestore listeners run only while this tab is on screen. */
class ChatFragment : Fragment() {

    private lateinit var tvChatClass: TextView
    private lateinit var rvMessages: RecyclerView
    private lateinit var chatEmpty: View
    private lateinit var ivEmptyIcon: ImageView
    private lateinit var tvEmptyTitle: TextView
    private lateinit var tvEmptyBody: TextView
    private lateinit var chatLoading: ProgressBar
    private lateinit var tvClosedBanner: View
    private lateinit var chatComposer: View
    private lateinit var etMessage: EditText
    private lateinit var tvCounter: TextView
    private lateinit var btnSend: ImageButton
    private lateinit var tvCooldown: TextView
    private lateinit var jumpToNewest: View
    private lateinit var btnJumpToNewest: ImageButton
    private lateinit var tvJumpCount: TextView
    private lateinit var btnMembers: ImageButton

    private var className = ""
    private val uid get() = FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    private var adapter: ChatAdapter? = null

    private var classId: String? = null
    private var myName = ""
    private var state = ClassChat.State()

    /** Every message seen for this class (the live window slides; older ones stay here). */
    private val known = LinkedHashMap<String, ClassChat.Message>()
    private var recentFull = false
    private var olderMore: Boolean? = null
    private var loadingOlder = false
    private var loaded = false

    /** Messages from others that came in while the student was scrolled up. */
    private var unseen = 0

    private var recentListener: ListenerRegistration? = null
    private var stateListener: ListenerRegistration? = null
    private var started = false

    private var sending = false
    private var cooldownUntil = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            updateSendButton()
            if (System.currentTimeMillis() < cooldownUntil) handler.postDelayed(this, 250)
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.fragment_chat, container, false)
        tvChatClass = view.findViewById(R.id.tvChatClass)
        rvMessages = view.findViewById(R.id.rvMessages)
        chatEmpty = view.findViewById(R.id.chatEmpty)
        ivEmptyIcon = view.findViewById(R.id.ivEmptyIcon)
        tvEmptyTitle = view.findViewById(R.id.tvEmptyTitle)
        tvEmptyBody = view.findViewById(R.id.tvEmptyBody)
        chatLoading = view.findViewById(R.id.chatLoading)
        tvClosedBanner = view.findViewById(R.id.tvClosedBanner)
        chatComposer = view.findViewById(R.id.chatComposer)
        etMessage = view.findViewById(R.id.etMessage)
        tvCounter = view.findViewById(R.id.tvCounter)
        btnSend = view.findViewById(R.id.btnSend)
        tvCooldown = view.findViewById(R.id.tvCooldown)
        jumpToNewest = view.findViewById(R.id.jumpToNewest)
        btnJumpToNewest = view.findViewById(R.id.btnJumpToNewest)
        tvJumpCount = view.findViewById(R.id.tvJumpCount)
        btnMembers = view.findViewById(R.id.btnMembers)
        return view
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = ChatAdapter(uid, onLoadOlder = ::loadOlder, onLongPressMine = ::confirmDelete)
        rvMessages.layoutManager = LinearLayoutManager(requireContext()).apply { stackFromEnd = true }
        rvMessages.adapter = adapter
        rvMessages.itemAnimator = null

        etMessage.setOnFocusChangeListener { _, focused ->
            (etMessage.parent as View).isActivated = focused
        }

        rvMessages.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) = updateJumpButton()
        })
        btnJumpToNewest.setOnClickListener { smoothScrollToBottom() }

        etMessage.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                val length = s?.length ?: 0
                tvCounter.visibility = if (length >= ClassChat.MAX_LENGTH - 60) View.VISIBLE else View.GONE
                tvCounter.text = getString(R.string.ch_counter, length, ClassChat.MAX_LENGTH)
                updateSendButton()
            }
        })
        btnSend.setOnClickListener { send() }
        btnMembers.setOnClickListener { showMembers() }

        // Edge-to-edge (Android 11+): the window doesn't shrink for the keyboard, so lift the
        // composer by the part of the keyboard that covers this screen (the bottom nav sits below it).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ViewCompat.setOnApplyWindowInsetsListener(view) { v, insets ->
                val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                val location = IntArray(2)
                v.getLocationInWindow(location)
                val below = v.rootView.height - (location[1] + v.height)
                v.updatePadding(bottom = max(0, ime - below))
                if (ime > 0) scrollToBottom()
                insets
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!isHidden) start()
    }

    override fun onPause() {
        super.onPause()
        stop()
    }

    override fun onHiddenChanged(hidden: Boolean) {
        super.onHiddenChanged(hidden)
        if (hidden) stop() else if (isResumed) start()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        stop()
        handler.removeCallbacks(tick)
        adapter = null
    }

    // Listening (only while on screen)

    private fun start() {
        if (started) return
        started = true
        if (!loaded) chatLoading.visibility = View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            val user = try {
                FirebaseFirestore.getInstance().collection("users").document(uid).get().await()
            } catch (e: Exception) {
                Log.e("ChatFragment", "Couldn't load the user", e)
                null
            }
            if (!started || view == null) return@launch
            if (user == null) {
                chatLoading.visibility = View.GONE
                if (!loaded) Toast.makeText(requireContext(), R.string.ch_load_failed, Toast.LENGTH_SHORT).show()
                return@launch
            }

            val newClass = user.getString("classId")?.takeIf { it.isNotBlank() }
            showHeader(user.getString("className").orEmpty(), newClass != null)
            if (newClass != classId) resetFor(newClass)
            if (newClass == null) return@launch showNoClass()

            if (myName.isEmpty()) {
                myName = try {
                    ClassChat.rosterName(newClass, uid)
                } catch (e: Exception) {
                    ""
                }.ifEmpty { user.getString("fullName").orEmpty() }
            }
            val teacher = ClassChat.classTeacher(newClass)
            if (!started || view == null) return@launch
            adapter?.teacher = teacher
            attach(newClass)
        }
    }

    private fun attach(id: String) {
        ClassChat.visibleClassId = id
        recentListener?.remove()
        stateListener?.remove()
        recentListener = ClassChat.watchRecent(id, onChange = { messages, full ->
            if (classId != id || view == null) return@watchRecent
            val wasAtBottom = isAtBottom()
            val hadNewest = known.values.maxOfOrNull { it.sentAt } ?: 0L
            if (loaded && !wasAtBottom) {
                unseen += messages.count { it.sentAt > hadNewest && it.senderId != uid && !it.deleted }
            }
            messages.forEach { known[it.id] = it }
            recentFull = full
            loaded = true
            render {
                val newest = messages.lastOrNull()
                if (wasAtBottom || (newest != null && newest.senderId == uid && newest.sentAt > hadNewest)) {
                    scrollToBottom()
                }
            }
            markRead()
        }, onError = { e ->
            Log.e("ChatFragment", "Chat listener failed", e)
            if (view == null) return@watchRecent
            chatLoading.visibility = View.GONE
            Toast.makeText(requireContext(), R.string.ch_load_failed, Toast.LENGTH_SHORT).show()
        })
        stateListener = ClassChat.watchState(id) { newState ->
            if (classId != id || view == null) return@watchState
            state = newState
            showOpen(newState.open)
            markRead()
        }
    }

    private fun stop() {
        started = false
        recentListener?.remove()
        stateListener?.remove()
        recentListener = null
        stateListener = null
        ClassChat.visibleClassId = null
    }

    private fun resetFor(newClass: String?) {
        classId = newClass
        myName = ""
        state = ClassChat.State()
        known.clear()
        recentFull = false
        olderMore = null
        loadingOlder = false
        loaded = false
        unseen = 0
        if (::jumpToNewest.isInitialized) jumpToNewest.visibility = View.GONE
        adapter?.show(emptyList(), hasOlder = false, loadingOlder = false, context = requireContext())
    }

    // Showing

    private fun showHeader(className: String, hasClass: Boolean) {
        this.className = className
        tvChatClass.text = className.takeIf { hasClass && it.isNotBlank() }
            ?: getString(R.string.ch_title)
        btnMembers.visibility = if (hasClass) View.VISIBLE else View.GONE
    }

    private fun initials(name: String): String {
        val parts = name.split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }
        return parts.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "💬" }
    }

    private fun showNoClass() {
        chatLoading.visibility = View.GONE
        rvMessages.visibility = View.GONE
        jumpToNewest.visibility = View.GONE
        chatComposer.visibility = View.GONE
        tvClosedBanner.visibility = View.GONE
        tvEmptyTitle.setText(R.string.ch_no_class_title)
        tvEmptyBody.setText(R.string.ch_no_class_body)
        chatEmpty.visibility = View.VISIBLE
    }

    private fun showOpen(open: Boolean) {
        tvClosedBanner.visibility = if (open) View.GONE else View.VISIBLE
        chatComposer.visibility = if (open) View.VISIBLE else View.GONE
        updateSendButton()
    }

    private fun sortedMessages() = known.values.sortedBy { it.sentAt }

    private fun render(after: (() -> Unit)? = null) {
        val adapter = adapter ?: return
        val messages = sortedMessages()
        chatLoading.visibility = View.GONE
        rvMessages.visibility = View.VISIBLE
        tvEmptyTitle.setText(R.string.ch_empty_title)
        tvEmptyBody.setText(R.string.ch_empty_body)
        chatEmpty.visibility = if (messages.isEmpty()) View.VISIBLE else View.GONE
        adapter.show(messages, hasOlder = olderMore ?: recentFull, loadingOlder = loadingOlder, context = requireContext())
        rvMessages.post {
            if (view == null) return@post
            after?.invoke()
            updateJumpButton()
        }
    }

    private fun isAtBottom(): Boolean = !rvMessages.canScrollVertically(1)

    private fun scrollToBottom() {
        val count = adapter?.itemCount ?: 0
        if (count > 0) rvMessages.post { rvMessages.scrollToPosition((adapter?.itemCount ?: 1) - 1) }
    }

    private fun smoothScrollToBottom() {
        val count = adapter?.itemCount ?: 0
        if (count > 0) rvMessages.smoothScrollToPosition(count - 1)
    }

    /** How far above the newest message the list is scrolled, in pixels. */
    private fun distanceFromBottom(): Int =
        rvMessages.computeVerticalScrollRange() -
            rvMessages.computeVerticalScrollOffset() -
            rvMessages.computeVerticalScrollExtent()

    /** The "go to newest" button shows once the student scrolls a little way up. */
    private fun updateJumpButton() {
        if (view == null) return
        val away = rvMessages.visibility == View.VISIBLE &&
            distanceFromBottom() > (120 * resources.displayMetrics.density).toInt()
        if (isAtBottom()) unseen = 0
        jumpToNewest.visibility = if (away) View.VISIBLE else View.GONE
        tvJumpCount.visibility = if (unseen > 0) View.VISIBLE else View.GONE
        tvJumpCount.text = if (unseen > 99) "99+" else unseen.toString()
        btnJumpToNewest.contentDescription =
            if (unseen > 0) getString(R.string.ch_jump_new, unseen) else getString(R.string.ch_jump)
    }

    /** The student has seen everything up to now. */
    private fun markRead() {
        val id = classId ?: return
        if (!started) return
        val newest = max(state.lastAt, known.values.maxOfOrNull { it.sentAt } ?: 0L)
        if (newest > 0) ClassChat.markRead(requireContext(), id, newest)
    }

    // Class members (the (i) button)

    /** Teacher on top (or "no assigned teacher yet"), then the students A–Z; this student is tagged "IKAW". */
    private fun showMembers() {
        val id = classId ?: return
        val sheet = BottomSheetDialog(requireContext())
        val content = layoutInflater.inflate(R.layout.sheet_class_members, null)
        sheet.setContentView(content)

        content.findViewById<TextView>(R.id.tvMembersTile).text = initials(className)
        content.findViewById<TextView>(R.id.tvMembersClass).text = className.ifBlank { getString(R.string.ch_title) }
        val tvCount = content.findViewById<TextView>(R.id.tvMembersCount)
        val loading = content.findViewById<View>(R.id.membersLoading)
        val empty = content.findViewById<TextView>(R.id.tvMembersEmpty)
        val list = content.findViewById<LinearLayout>(R.id.studentList)
        val studentCount = content.findViewById<TextView>(R.id.tvStudentCount)
        sheet.show()

        viewLifecycleOwner.lifecycleScope.launch {
            val members = try {
                ClassChat.members(id)
            } catch (e: Exception) {
                Log.e("ChatFragment", "Couldn't load the class members", e)
                null
            }
            if (!sheet.isShowing || view == null) return@launch
            loading.visibility = View.GONE
            if (members == null) {
                empty.setText(R.string.ch_members_failed)
                empty.visibility = View.VISIBLE
                return@launch
            }

            val teacher = members.teacher
            content.findViewById<View>(R.id.teacherCard).visibility = if (teacher != null) View.VISIBLE else View.GONE
            content.findViewById<View>(R.id.noTeacherCard).visibility = if (teacher == null) View.VISIBLE else View.GONE
            if (teacher != null) {
                content.findViewById<TextView>(R.id.tvTeacherName).text = teacher.name
                content.findViewById<TextView>(R.id.tvTeacherAvatar).text = personInitials(teacher.name)
            }

            val students = members.students
            tvCount.text = getString(R.string.ch_members_count, students.size + if (teacher != null) 1 else 0)
            studentCount.text = students.size.toString()
            studentCount.visibility = View.VISIBLE
            if (students.isEmpty()) {
                empty.setText(R.string.ch_members_no_students)
                empty.visibility = View.VISIBLE
            }

            var letter = ""
            students.forEach { student ->
                val next = letterOf(student.name)
                if (next != letter) {
                    letter = next
                    val header = layoutInflater.inflate(R.layout.item_class_member_letter, list, false) as TextView
                    header.text = letter
                    list.addView(header)
                }
                val row = layoutInflater.inflate(R.layout.item_class_member, list, false)
                val me = student.id == uid
                row.findViewById<TextView>(R.id.tvMemberName).text = student.name
                row.findViewById<TextView>(R.id.tvMemberAvatar).apply {
                    text = personInitials(student.name)
                    backgroundTintList = ColorStateList.valueOf(
                        ChatAdapter.AVATAR_COLORS[Math.floorMod(student.id.hashCode(), ChatAdapter.AVATAR_COLORS.size)]
                    )
                }
                row.findViewById<View>(R.id.tvMemberYou).visibility = if (me) View.VISIBLE else View.GONE
                if (me) {
                    row.setBackgroundResource(R.drawable.ch_member_me)
                    row.contentDescription = "${student.name}, ${getString(R.string.ch_you)}"
                }
                list.addView(row)
            }
        }
    }

    /** "Singca, Jay Vanz" → "JS" (first name, then surname). */
    private fun personInitials(name: String): String {
        val parts = name.split(",").map { it.trim() }
        if (parts.size >= 2 && parts[1].isNotEmpty()) {
            return "${parts[1].first()}${parts[0].firstOrNull() ?: ""}".uppercase()
        }
        return initials(name)
    }

    /** "Ñ" and "É" file under N and E; anything that isn't a letter goes under "#". */
    private fun letterOf(name: String): String {
        val first = Normalizer.normalize(name, Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .firstOrNull()?.uppercaseChar()
        return if (first != null && first in 'A'..'Z') first.toString() else "#"
    }

    // Older messages

    private fun loadOlder() {
        val id = classId ?: return
        val oldest = sortedMessages().firstOrNull { !it.pending } ?: return
        if (loadingOlder) return
        loadingOlder = true
        render()
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val (older, more) = ClassChat.loadOlder(id, oldest)
                if (classId != id) return@launch
                older.forEach { known.putIfAbsent(it.id, it) }
                olderMore = more
            } catch (e: Exception) {
                Log.e("ChatFragment", "Couldn't load older messages", e)
                if (view != null) Toast.makeText(requireContext(), R.string.ch_load_failed, Toast.LENGTH_SHORT).show()
            }
            loadingOlder = false
            if (view != null && classId == id) render()
        }
    }

    // Sending

    /**
     * Right after a message the text box is locked for the rules' 5 seconds and counts down
     * in its hint ("Maghintay lamang ng 5 segundo…"); it can't be tapped or typed in until then.
     */
    private fun updateSendButton() {
        if (view == null) return
        val left = ceil((cooldownUntil - System.currentTimeMillis()) / 1000.0).toInt()
        val cooling = left > 0
        val locked = sending || cooling || !state.open || classId == null
        etMessage.isEnabled = !locked
        etMessage.hint = when {
            sending -> getString(R.string.ch_sending)
            cooling -> getString(R.string.ch_wait, left)
            !state.open -> getString(R.string.ch_closed_hint)
            else -> getString(R.string.ch_hint)
        }
        etMessage.setHintTextColor(
            if (sending || cooling) ContextCompat.getColor(requireContext(), R.color.ch_teacher)
            else defaultHintColor
        )
        btnSend.isEnabled = !locked && etMessage.text.trim().isNotEmpty()
        tvCooldown.visibility = View.GONE
        btnSend.imageAlpha = if (btnSend.isEnabled) 255 else 140
    }

    private val defaultHintColor by lazy { etMessage.currentHintTextColor }

    private fun hideKeyboard() {
        etMessage.clearFocus()
        val imm = requireContext().getSystemService(InputMethodManager::class.java)
        imm?.hideSoftInputFromWindow(etMessage.windowToken, 0)
    }

    private fun send() {
        val id = classId ?: return
        val text = etMessage.text.toString().trim()
        if (text.isEmpty() || text.length > ClassChat.MAX_LENGTH || sending) return
        if (System.currentTimeMillis() < cooldownUntil) {
            Toast.makeText(requireContext(), R.string.ch_too_fast, Toast.LENGTH_SHORT).show()
            return
        }
        val name = myName
        sending = true
        etMessage.setText("")
        hideKeyboard() // the box stays locked until the countdown ends
        updateSendButton()
        scrollToBottom()

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                ClassChat.send(id, uid, name, text)
                // The rules count the 5 seconds from when the server got it.
                cooldownUntil = System.currentTimeMillis() + ClassChat.COOLDOWN_MS
                handler.removeCallbacks(tick)
                handler.post(tick)
            } catch (e: Exception) {
                Log.e("ChatFragment", "Send failed", e)
                if (view != null) {
                    if (etMessage.text.isEmpty()) {
                        etMessage.setText(text)
                        etMessage.setSelection(etMessage.text.length)
                    }
                    val tooFast = (e as? FirebaseFirestoreException)?.code ==
                        FirebaseFirestoreException.Code.PERMISSION_DENIED && state.open
                    Toast.makeText(
                        requireContext(),
                        if (tooFast) R.string.ch_too_fast else R.string.ch_send_failed,
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } finally {
                sending = false
                updateSendButton()
            }
        }
    }

    // Deleting your own message (within 5 minutes)

    private fun confirmDelete(message: ClassChat.Message) {
        val id = classId ?: return
        MaterialAlertDialogBuilder(requireContext(), FeedbackTone.DANGER)
            .setTitle(R.string.ch_delete_title)
            .setMessage(R.string.ch_delete_body)
            .setNegativeButton(R.string.ch_delete_no, null)
            .setPositiveButton(R.string.ch_delete_yes) { _, _ ->
                if (!ClassChat.canDelete(message, uid)) {
                    Toast.makeText(requireContext(), R.string.ch_delete_failed, Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        ClassChat.deleteOwn(id, message, state)
                    } catch (e: Exception) {
                        Log.e("ChatFragment", "Delete failed", e)
                        if (view != null) {
                            Toast.makeText(requireContext(), R.string.ch_delete_failed, Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .show()
    }
}
