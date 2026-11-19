const fs = require('node:fs');
const path = require('node:path');
const root = 'C:/Projects/BaSaya/app/src/main';
const source = fs.readFileSync(path.resolve(__dirname, '../../js/registration-terms.js'), 'utf8');
const title = source.match(/termsTitle = "([^"]+)"/)[1];
const reminder = source.match(/termsReminder = "([^"]+)"/)[1];
const text = source.match(/termsText = `([\s\S]*?)`;/)[1];
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll("'", "\\'").replaceAll('\n', '\\n');
const resources = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="register_terms_title">${xml(title)}</string>\n    <string name="register_terms_agree">Sumasang-ayon ako sa Mga Tuntunin at Kondisyon.</string>\n    <string name="register_terms_required_title">Kailangan ang iyong pagsang-ayon</string>\n    <string name="register_terms_required">${xml(reminder)}</string>\n    <string name="register_terms_understood">Nauunawaan ko</string>\n    <string name="register_terms_text">${xml(text)}</string>\n</resources>\n`;
const activityFile = path.join(root, 'java/ph/basaya/app/ui/RegisterActivity.kt');
const layoutFile = path.join(root, 'res/layout/activity_register.xml');
let activity = fs.readFileSync(activityFile, 'utf8');
let layout = fs.readFileSync(layoutFile, 'utf8');
if (activity.includes('private lateinit var agreeTerms:')) throw Error('Already applied');
activity = activity.replace('import android.content.Intent', `import android.content.Intent
import android.content.res.ColorStateList
import androidx.core.content.ContextCompat
import com.google.android.material.checkbox.MaterialCheckBox
import ph.basaya.app.ui.feedback.StudioDialogBuilder`);
activity = activity.replace('    private lateinit var btnRegister:', '    private lateinit var agreeTerms: MaterialCheckBox\n\n    private lateinit var btnRegister:');
activity = activity.replace('        btnRegister = findViewById(R.id.btnRegister)', `        agreeTerms = findViewById(R.id.agreeTerms)
        findViewById<TextView>(R.id.viewTerms).setOnClickListener {
            StudioDialogBuilder(this)
                .setTitle(R.string.register_terms_title)
                .setMessage(R.string.register_terms_text)
                .setPositiveButton(R.string.register_terms_understood, null)
                .show()
        }
        btnRegister = findViewById(R.id.btnRegister)`);
activity = activity.replace('    private fun submit(confirmed: Boolean = false) {', `    private fun submit(confirmed: Boolean = false) {
        if (!btnRegister.isEnabled) return
        if (!agreeTerms.isChecked) {
            StudioDialogBuilder(this)
                .setTitle(R.string.register_terms_required_title)
                .setMessage(R.string.register_terms_required)
                .setPositiveButton(R.string.register_terms_understood) { _, _ -> agreeTerms.requestFocus() }
                .show()
            return
        }`);
activity = activity.replace('        btnRegister.isEnabled = !isLoading', '        btnRegister.isEnabled = !isLoading\n        agreeTerms.isEnabled = !isLoading');
// A separate text button keeps reading the terms independent from accepting them.
layout = layout.replace('                        <!-- Primary action.', `                        <com.google.android.material.checkbox.MaterialCheckBox
                            android:id="@+id/agreeTerms"
                            android:layout_width="match_parent"
                            android:layout_height="wrap_content"
                            android:layout_marginTop="16dp"
                            android:checked="false"
                            android:minHeight="48dp"
                            android:text="@string/register_terms_agree"
                            android:textColor="?attr/colorOnSurface"
                            android:textAppearance="@style/TextAppearance.BaSaya.Login.Body" />

                        <com.google.android.material.button.MaterialButton
                            android:id="@+id/viewTerms"
                            style="@style/Widget.Material3.Button.TextButton"
                            android:layout_width="match_parent"
                            android:layout_height="wrap_content"
                            android:minHeight="48dp"
                            android:textAllCaps="false"
                            android:text="@string/register_terms_title" />

                        <!-- Primary action.`);
// Verify both anchors before any writes.
if (!activity.includes('if (!agreeTerms.isChecked)') || !layout.includes('@+id/agreeTerms')) throw Error('Missing anchors');
activity = activity.replace('import android.content.res.ColorStateList\n', '').replace('import androidx.core.content.ContextCompat\n', '');
fs.writeFileSync(activityFile, activity);
fs.writeFileSync(layoutFile, layout);
fs.writeFileSync(path.join(root, 'res/values/strings_registration_terms.xml'), resources);
console.log('Updated Android registration activity, layout and Tagalog terms strings.');
