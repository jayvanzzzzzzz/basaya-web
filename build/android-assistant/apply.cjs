const fs = require('node:fs');
const path = require('node:path');
const root = 'C:/Projects/BaSaya';
const stage = path.join(__dirname, 'staged');
if (process.argv.includes('--sync') && process.argv.includes('--apply')) {
  let count = 0;
  const sync = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) sync(path.join(dir, entry.name), relative);
      else {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), {recursive:true});
        const next = fs.readFileSync(path.join(stage, relative));
        if (!fs.existsSync(target) || !fs.readFileSync(target).equals(next)) {
          fs.writeFileSync(target, next);
          count++;
        }
      }
    }
  };
  sync(stage);
  console.log('Updated ' + count + ' Assistant-owned files.');
  process.exit(0);
}
const pending = new Map();
function replace(file, before, after) {
  const content = pending.get(file) ?? fs.readFileSync(path.join(root, file), 'utf8');
  const normalized = content.replaceAll('\r\n', '\n');
  before = before.replaceAll('\r\n', '\n');
  if (!normalized.includes(before)) throw new Error('Expected edit anchor missing: ' + file);
  const result = normalized.replace(before, after.replaceAll('\r\n', '\n'));
  pending.set(file, content.includes('\r\n') ? result.replaceAll('\n', '\r\n') : result);
}
replace('app/src/main/res/layout/activity_main.xml', '                <!-- Dictionary: tactile book tab. -->', `                <ImageButton
                    android:id="@+id/btnAssistant"
                    android:layout_width="48dp"
                    android:layout_height="48dp"
                    android:layout_marginEnd="6dp"
                    android:background="@drawable/bg_assistant_launcher"
                    android:stateListAnimator="@animator/masthead_press"
                    android:focusable="true"
                    android:contentDescription="@string/assistant_title"
                    android:padding="11dp"
                    android:src="@drawable/ic_assistant_robot"
                    app:tint="@color/mh_avatar_ink" />
                <!-- Dictionary: tactile book tab. -->`);
replace('app/src/main/res/layout/activity_main.xml', 'android:text="@string/tb_greeting_morning"', 'android:ellipsize="end"\n                        android:maxLines="1"\n                        android:text="@string/tb_greeting_morning"');
replace('app/src/main/java/ph/basaya/app/ui/MainActivity.kt', '        // Icon only: long-press (or a mouse hover) shows "Diksiyonaryo".', `        findViewById<View>(R.id.btnAssistant).apply {
            TooltipCompat.setTooltipText(this, getString(R.string.assistant_title))
            setOnClickListener { startActivity(Intent(this@MainActivity, ph.basaya.app.ui.assistant.AssistantActivity::class.java)) }
        }

        // Icon only: long-press (or a mouse hover) shows "Diksiyonaryo".`);
replace('app/src/main/java/ph/basaya/app/ui/MainActivity.kt', '        accountMenu = popup', `        content.findViewById<View>(R.id.accountMenuAssistant).setOnClickListener {
            popup.dismiss()
            startActivity(Intent(this, ph.basaya.app.ui.assistant.AssistantActivity::class.java))
        }
        accountMenu = popup`);
replace('app/src/main/res/layout/popup_account_menu.xml', '    <LinearLayout\n        android:id="@+id/accountMenuLogout"'.replaceAll('\n', '\r\n'), `    <LinearLayout
        android:id="@+id/accountMenuAssistant"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:minHeight="64dp"
        android:padding="14dp"
        android:gravity="center_vertical"
        android:background="@drawable/bg_account_menu_action"
        android:clickable="true"
        android:focusable="true">
        <ImageView android:layout_width="24dp" android:layout_height="24dp"
            android:src="@drawable/ic_assistant_robot" android:tint="@color/account_menu_accent"
            android:importantForAccessibility="no" />
        <TextView android:layout_width="0dp" android:layout_height="wrap_content"
            android:layout_weight="1" android:layout_marginStart="14dp"
            android:text="@string/assistant_title" android:textColor="@color/account_menu_title"
            android:fontFamily="@font/be_vietnam_semi_bold" android:textSize="15sp" />
        <ImageView android:layout_width="16dp" android:layout_height="16dp"
            android:src="@drawable/ic_chevron_right" android:tint="@color/account_menu_body"
            android:importantForAccessibility="no" />
    </LinearLayout>

    <LinearLayout
        android:id="@+id/accountMenuLogout"`);
replace('app/src/main/AndroidManifest.xml', '        <activity\r\n            android:name=".ui.dictionary.DictionaryActivity"', `        <activity
            android:name=".ui.assistant.AssistantActivity"
            android:exported="false"
            android:windowSoftInputMode="adjustResize" />
        <activity
            android:name=".ui.dictionary.DictionaryActivity"`);
function walk(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
    else {
      if (fs.existsSync(path.join(root, relative))) throw new Error('New file already exists: ' + relative);
      pending.set(relative, fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    }
  }
}
walk(stage);
if (!process.argv.includes('--apply')) {
  console.log('Prepared Android changes:\n' + [...pending.keys()].join('\n'));
  process.exit(0);
}
// All anchors and new paths are checked before writing. Preserve existing unrelated edits.
for (const [file, content] of pending) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, content);
}
console.log('Applied ' + pending.size + ' files to ' + root);
