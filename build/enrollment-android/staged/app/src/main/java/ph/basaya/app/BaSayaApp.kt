package ph.basaya.app

import ph.basaya.app.data.progress.ProgressSession

import android.app.Application
import ph.basaya.app.data.dictionary.TeacherDictionarySync
import ph.basaya.app.ui.theme.ThemeMode

class BaSayaApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Apply the theme before the first screen appears.
        ProgressSession.initialize(this)
        ph.basaya.app.data.membership.EnrollmentAccess.initialize(this)
        ph.basaya.app.data.assessment.OfflineLessons.initialize(this)
        ThemeMode.applySaved(this)
        TeacherDictionarySync.initialize(this)
    }
}
