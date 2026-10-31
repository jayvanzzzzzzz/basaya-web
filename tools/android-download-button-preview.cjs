const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const changes = [
  ['app/src/main/res/values/strings.xml',
    '<string name="lesson_download_all">I-download lahat ng aralin</string>',
    '<string name="lesson_download_all">I-download lahat</string>'],
  ['app/src/main/res/layout/fragment_home.xml',
    '            android:text="@string/lesson_download_all"',
    '            app:icon="@drawable/ic_download"\n            app:iconGravity="textStart"\n            app:iconPadding="8dp"\n            app:iconSize="20dp"\n            app:iconTint="@color/lesson_card_primary"\n            android:text="@string/lesson_download_all"'],
];
const manifest = [];
for (const [file, before, after] of changes) {
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  if (!normalized.includes(before) || normalized.indexOf(before) !== normalized.lastIndexOf(before)) throw new Error('Unexpected source: ' + file);
  const result = normalized.replace(before, after);
  const target = path.join(preview, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, result);
  manifest.push({ file, originalHash: sha(original), resultHash: sha(result) });
}
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Prepared Filipino button label and download icon for Android.');
