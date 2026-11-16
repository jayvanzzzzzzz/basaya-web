package ph.basaya.app.ui.assistant

import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ImageButton
import android.widget.TextView
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
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

@RunWith(AndroidJUnit4::class)
class AssistantScreenTest {
    @Before fun waitForSavedSignIn() {
        assumeNotNull(runBlocking { FirebaseAuth.getInstance().awaitInitialUser() })
    }

    @Test fun draftSurvivesRecreationWithoutSendingAQuestion() {
        val question = "Paano sumali sa klase?"
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantInput).setText(question) }
            scenario.recreate()
            scenario.onActivity {
                assertEquals(question, it.findViewById<EditText>(R.id.assistantInput).text.toString())
                assertTrue(ViewModelProvider(it)[AssistantViewModel::class.java].state.value.messages.isEmpty())
                assertEquals(0, it.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
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
            onView(withText(first.getString("title") + "  +")).perform(click())
            onView(withText(first.getString("text"))).check(matches(isDisplayed()))
            onView(withText(first.getString("title") + "  −")).perform(click())
            onView(withText(first.getString("title") + "  +")).check(matches(isDisplayed()))
        }
    }

    /** Explicit opt-in only: this consumes one server-controlled AI attempt. */
    @Test fun sendsOneAuthenticatedAppHelpQuestion() {
        org.junit.Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("assistantLive") == "true")
        ActivityScenario.launch(AssistantActivity::class.java).use { scenario ->
            lateinit var model: AssistantViewModel
            scenario.onActivity { model = ViewModelProvider(it)[AssistantViewModel::class.java] }
            val ready = runBlocking { withTimeout(25_000) { model.state.first { !it.checking && it.usage != null } } }
            assertTrue("Assistant service must be available for the opt-in live check", ready.available)
            scenario.onActivity { it.findViewById<EditText>(R.id.assistantInput).setText("Paano sumali sa klase?") }
            scenario.onActivity {
                val send = it.findViewById<ImageButton>(R.id.assistantSend)
                assertTrue("Server quota/cooldown must permit the live check", send.isEnabled)
                send.performClick()
            }
            val result = runBlocking { withTimeout(40_000) {
                model.state.first { !it.busy && it.messages.size >= 2 }
            } }
            assertEquals("assistant", result.messages.last().role)
            assertTrue(result.messages.last().text.isNotBlank())
            scenario.onActivity {
                assertEquals(2, it.findViewById<LinearLayout>(R.id.assistantMessages).childCount)
                assertTrue(it.findViewById<TextView>(R.id.assistantQuota).text.isNotBlank())
            }
        }
    }
}
