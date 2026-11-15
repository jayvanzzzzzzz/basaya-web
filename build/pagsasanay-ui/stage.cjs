const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const stage = __dirname;
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = [];
function edit(file, transform) {
  const target = path.join(root, file);
  const before = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.alloc(0);
  const after = transform(before.toString('utf8').replace(/\r\n/g, '\n'));
  const out = path.join(stage, 'files', file);
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, after);
  manifest.push({file, before:hash(before), after:hash(Buffer.from(after))});
}
function once(s, a, b) {
  if (!s.includes(a) || s.indexOf(a) !== s.lastIndexOf(a)) throw Error('Anchor not unique: '+a);
  return s.replace(a,b);
}
edit('app/src/main/res/layout/activity_practice.xml', s => {
  const start = s.indexOf('        <LinearLayout\n', s.indexOf('tools:text="Hanapin ang Pangngalan"'));
  const end = s.indexOf('        <!-- Worksheet -->', start);
  if(start<0 || end<0) throw Error('Missing instruction layout');
  s = s.slice(0,start) + `        <!-- Compact help and the current page's answer count. Wrap for large text. -->
        <com.google.android.flexbox.FlexboxLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginStart="20dp"
            android:layout_marginTop="10dp"
            android:layout_marginEnd="20dp"
            app:alignItems="center"
            app:flexWrap="wrap">

            <androidx.appcompat.widget.AppCompatButton
                android:id="@+id/btnInstruction"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:minWidth="0dp"
                android:minHeight="48dp"
                android:background="@drawable/ac_btn_instruction"
                android:fontFamily="@font/be_vietnam_bold"
                android:gravity="center"
                android:paddingHorizontal="16dp"
                android:paddingVertical="10dp"
                android:text="@string/ac_instruction_title"
                android:textAllCaps="false"
                android:textColor="@color/ac_ink"
                android:textSize="14sp"
                app:backgroundTint="@null" />

            <TextView
                android:id="@+id/tvPickCount"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="12dp"
                android:fontFamily="@font/be_vietnam_bold"
                android:paddingVertical="8dp"
                android:textColor="@color/ac_ink_soft"
                android:textSize="14sp"
                android:visibility="gone"
                tools:text="Pumili ng 2 salita"
                tools:visibility="visible" />
        </com.google.android.flexbox.FlexboxLayout>

` + s.slice(end);
  s = once(s, 'android:layout_weight="1"\n            android:clipChildren="false"\n            android:clipToPadding="false"\n            android:fillViewport="true"', 'android:layout_weight="1"\n            android:clipChildren="true"\n            android:clipToPadding="true"\n            android:fillViewport="true"');
  return s;
});
edit('app/src/main/java/ph/basaya/app/ui/activity/PracticeActivity.kt', s => {
  s = once(s,'import android.widget.Button','import ph.basaya.app.ui.feedback.StudioDialogBuilder\nimport android.widget.Button');
  s = once(s,'    private lateinit var tvInstruction: TextView\n','');
  s = once(s,'        tvInstruction = findViewById(R.id.tvInstruction)\n','');
  s = once(s,'        tvInstruction.text = practiceData.instruction',`        findViewById<View>(R.id.btnInstruction).apply {
            visibility = if (practiceData.instruction.isBlank()) View.GONE else View.VISIBLE
            setOnClickListener {
                StudioDialogBuilder(this@PracticeActivity)
                    .setTitle(R.string.ac_instruction_title)
                    .setMessage(practiceData.instruction)
                    .setPositiveButton(R.string.ac_close, null)
                    .show()
            }
        }`);
  s = once(s, '        chipsContainer.removeAllViews()', `        // A new page starts at its first choice, including after feedback auto-scroll.
        findViewById<android.widget.ScrollView>(R.id.worksheetScroll).scrollTo(0, 0)
        chipsContainer.animate().cancel()
        chipsContainer.translationX = 0f
        chipsContainer.alpha = 1f
        chipsContainer.removeAllViews()`);
  return s;
});
edit('app/src/main/res/values/strings_practice_instruction.xml', () => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="ac_instruction_title">Panuto</string>
</resources>
`);
edit('app/src/main/res/drawable/ac_btn_instruction.xml', () => `<?xml version="1.0" encoding="utf-8"?>
<ripple xmlns:android="http://schemas.android.com/apk/res/android"
    android:color="?attr/colorControlHighlight">
    <item android:drawable="@drawable/ac_instruction_pill" />
</ripple>
`);
fs.writeFileSync(path.join(stage,'manifest.json'), JSON.stringify(manifest,null,2));
console.log('Staged '+manifest.length+' files.');
