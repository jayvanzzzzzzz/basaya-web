package ph.basaya.app.ui.assistant

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.view.ContextThemeWrapper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import ph.basaya.app.R
import java.io.File

/** Measures and renders real Android resources, including large text at a 320dp width. */
@RunWith(AndroidJUnit4::class)
class AssistantLayoutTest {
    @Test fun controlsFitBothThemesAndNarrowScreensWithLargerText() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val base = instrumentation.targetContext
        instrumentation.runOnMainSync {
            for (night in listOf(false, true)) for (width in listOf(320, 411)) {
                val config = Configuration(base.resources.configuration).apply {
                    uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
                        if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
                    fontScale = if (width == 320) 1.5f else 1f
                    screenWidthDp = width
                    screenHeightDp = 800
                }
                val context = ContextThemeWrapper(base.createConfigurationContext(config), R.style.Theme_BaSaya)
                val density = context.resources.displayMetrics.density
                fun px(dp: Int) = (dp * density).toInt()
                val assistant = LayoutInflater.from(context).inflate(R.layout.activity_assistant, null) as ViewGroup
                assistant.findViewById<TextView>(R.id.assistantStatus).setText(R.string.assistant_ready)
                fun measure(view: View) {
                    view.measure(View.MeasureSpec.makeMeasureSpec(px(width), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(px(800), View.MeasureSpec.EXACTLY))
                    view.layout(0, 0, view.measuredWidth, view.measuredHeight)
                }
                fun bounds(root: ViewGroup, id: Int): Rect {
                    val child = root.findViewById<View>(id)
                    assertTrue("Touch target too small: $id", child.width >= px(48) && child.height >= px(48))
                    return Rect(0, 0, child.width, child.height).also { root.offsetDescendantRectToMyCoords(child, it) }
                }
                measure(assistant)
                val send = bounds(assistant, R.id.assistantSend)
                assertTrue(send.left >= 0 && send.right <= assistant.width && send.bottom <= assistant.height)
                val back = bounds(assistant, R.id.assistantBack)
                val guides = bounds(assistant, R.id.assistantGuides)
                assertFalse(Rect.intersects(back, guides))
                val main = LayoutInflater.from(context).inflate(R.layout.activity_main, null) as ViewGroup
                measure(main)
                val launcher = bounds(main, R.id.btnAssistant)
                val dictionary = bounds(main, R.id.btnDictionary)
                val notifications = bounds(main, R.id.btnNotification)
                assertFalse(Rect.intersects(launcher, dictionary))
                assertFalse(Rect.intersects(dictionary, notifications))
                assertTrue(launcher.left >= 0 && notifications.right <= main.width)
                assertTrue(main.findViewById<View>(R.id.tvFirstName).width > 0)
                val label = "${if (night) "dark" else "light"}-$width"
                val directory = File(base.cacheDir, "assistant-layout").apply { mkdirs() }
                val bitmap = Bitmap.createBitmap(assistant.width, assistant.height, Bitmap.Config.ARGB_8888)
                assistant.draw(Canvas(bitmap))
                File(directory, "$label.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                bitmap.recycle()
            }
        }
    }
}
