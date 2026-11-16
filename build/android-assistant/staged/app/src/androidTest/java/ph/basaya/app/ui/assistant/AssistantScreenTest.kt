package ph.basaya.app.ui.assistant

import android.widget.EditText
import android.widget.LinearLayout
import android.view.View
import android.widget.TextView
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.espresso.assertion.ViewAssertions.doesNotExist
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.auth.FirebaseAuth
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume.assumeNotNull
import org.junit.Test
import org.junit.Before
import org.junit.runner.RunWith
import ph.basaya.app.R
import ph.basaya.app.data.auth.awaitInitialUser
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.flow.first
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.File

@RunWith(AndroidJUnit4::class)
class AssistantScreenTest {
    @Before fun waitForSavedSignIn() {
        assumeNotNull(runBlocking { FirebaseAuth.getInstance().awaitInitialUser() })
        InstrumentationRegistry.getInstrumentation().runOnMainSync { AssistantSession.transcript.clearUnless(null) }
    }

    @Test fun draftSurvivesRecreationWithoutSendingAQuestion() {
        val question = "Paano sumali sa klase?"
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantInput).setText(question) }
            scenario.recreate()
            scenario.onActivity {
                assertEquals(question, it.findViewById<EditText>(R.id.assistantInput).text.toString())
                assertTrue(ViewModelProvider(it)[AssistantViewModel::class.java].state.value.messages.isEmpty())
                assertEquals(1, it.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
            }
        }
    }

    @Test fun welcomeAndKeyboardMatchTheWebComposer() {
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            lateinit var model: AssistantViewModel
            scenario.onActivity { model = ViewModelProvider(it)[AssistantViewModel::class.java] }
            runBlocking { withTimeout(25_000) { model.state.first { it.ready } } }
            scenario.onActivity { activity ->
                val input = activity.findViewById<EditText>(R.id.assistantInput)
                val editor = android.view.inputmethod.EditorInfo()
                input.onCreateInputConnection(editor)
                assertEquals(android.view.inputmethod.EditorInfo.IME_ACTION_SEND,
                    editor.imeOptions and android.view.inputmethod.EditorInfo.IME_MASK_ACTION)
                assertEquals(0, editor.imeOptions and android.view.inputmethod.EditorInfo.IME_FLAG_NO_ENTER_ACTION)
                assertEquals(1, activity.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
                capture(activity, "assistant-web-welcome")
            }
        }
    }

    @Test fun guidesAreBundledAndCanBeExpandedWithoutAskingTheAI() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val articles = context.assets.open("assistant-help.json").bufferedReader().use { JSONArray(it.readText()) }
        assertEquals(8, articles.length())
        val first = articles.getJSONObject(0)
        ActivityScenario.launch(AssistantActivity::class.java).use {
            onView(withId(R.id.assistantGuides)).perform(click())
            closeSoftKeyboard()
            onView(withText("▸  " + first.getString("title"))).perform(click())
            onView(withText(first.getString("text"))).check(matches(isDisplayed()))
            onView(withText("▾  " + first.getString("title"))).perform(click())
            onView(withText("▸  " + first.getString("title"))).check(matches(isDisplayed()))
        }
    }

    @Test fun guidesFilterByTopicAndShowAnEmptyState() {
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            onView(withId(R.id.assistantGuides)).perform(click())
            closeSoftKeyboard()
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantSearch).setText("zzzz-no-match") }
            onView(withId(R.id.assistantNoHelp)).check(matches(isDisplayed()))
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantSearch).setText("BIGKAS") }
            onView(withText("▸  Paggamit ng Bigkas")).check(matches(isDisplayed()))
            scenario.onActivity { capture(it, "assistant-web-guides") }
            onView(withId(R.id.assistantNoHelp)).check(matches(withEffectiveVisibility(Visibility.GONE)))
            onView(withId(R.id.assistantGuides)).perform(click())
            onView(withId(R.id.assistantHelp)).check(matches(withEffectiveVisibility(Visibility.GONE)))
            onView(withId(R.id.assistantScroll)).check(matches(isDisplayed()))
        }
    }

    @Test fun guideLinkOpensTheNativeProgressTab() {
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            onView(withId(R.id.assistantGuides)).perform(click())
            closeSoftKeyboard()
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantSearch).setText("Progreso") }
            onView(withText("▸  Progreso at resulta")).perform(click())
            onView(withText("Progreso →")).perform(click())
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val main = androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED)
                    .filterIsInstance<ph.basaya.app.ui.MainActivity>().single()
                assertTrue(main.supportFragmentManager.fragments.any { !it.isHidden && it is ph.basaya.app.ui.fragment.ProgressFragment })
            }
        }
    }

    /** Explicit opt-in only: this consumes one server-controlled AI attempt. */
    @Test fun sendsOneAuthenticatedAppHelpQuestion() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("assistantLive") == "true")
        var savedAnswer = ""
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            lateinit var model: AssistantViewModel
            scenario.onActivity { model = ViewModelProvider(it)[AssistantViewModel::class.java] }
            val ready = runBlocking { withTimeout(25_000) { model.state.first { !it.checking && it.usage != null } } }
            assertTrue("Assistant service must be available for the opt-in live check", ready.available)
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantInput).setText("Paano sumali sa klase?") }
            scenario.onActivity {
                val send = it.findViewById<View>(R.id.assistantSend)
                assertTrue("Server quota/cooldown must permit the live check", send.isEnabled)
                send.performClick()
            }
            val result = runBlocking { withTimeout(40_000) {
                model.state.first { !it.busy && it.messages.size >= 2 }
            } }
            assertEquals("assistant", result.messages.last().role)
            assertTrue(result.messages.last().text.isNotBlank())
            savedAnswer = result.messages.last().text
            scenario.onActivity {
                assertEquals(3, it.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
                assertTrue(it.findViewById<TextView>(R.id.assistantQuota).text.isNotBlank())
            }
        }
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            scenario.onActivity {
                val state = ViewModelProvider(it)[AssistantViewModel::class.java].state.value
                assertEquals(savedAnswer, state.messages.last().text)
                assertFalse(state.busy)
                assertNull(state.revealingId)
                assertEquals(3, it.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
            }
        }
    }

    private fun capture(activity: AssistantActivity, name: String) {
        val root = activity.window.decorView
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        root.draw(Canvas(bitmap))
        File(activity.cacheDir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
