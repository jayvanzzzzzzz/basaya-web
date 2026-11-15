const fs = require('node:fs');
const path = require('node:path');
const root = 'C:/Projects/BaSaya/app/src/main/res/layout';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const changes = new Map();
const main = read('activity_main.xml');
const start = main.indexOf('        <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:minHeight="48dp"');
const end = main.indexOf('    </com.google.android.material.appbar.AppBarLayout>', start);
if (start < 0 || end < 0) throw Error('Expected shared branding ribbon');
const ribbon = main.slice(start, end).trim();
if (!ribbon.includes('@string/tb_studio_motto')) throw Error('Wrong ribbon');
const brand = ribbon.replace('<LinearLayout ', '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" ')
  .replace('android:minHeight="48dp"', 'android:minHeight="56dp" android:paddingTop="8dp" android:paddingBottom="8dp" android:background="@drawable/bg_home_masthead"');
changes.set('include_scrolling_brand.xml', '<?xml version="1.0" encoding="utf-8"?>\n<!-- Shared branding belongs to the page scroll, below the persistent account controls. -->\n' + brand + '\n');
changes.set('activity_main.xml', main.slice(0, start) + main.slice(end));
let home = read('fragment_home.xml');
const homeAnchor = '        app:liftOnScroll="false">';
if (!home.includes(homeAnchor)) throw Error('Expected Home app bar');
home = home.replace(homeAnchor, homeAnchor + `
        <include
            layout="@layout/include_scrolling_brand"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            app:layout_scrollFlags="scroll" />`);
changes.set('fragment_home.xml', home);
for (const name of ['fragment_progress.xml', 'fragment_profile.xml']) {
  let source = read(name);
  const match = source.match(/    <LinearLayout\s[\s\S]*?android:orientation="vertical"[\s\S]*?>/);
  if (!match) throw Error('Expected scroll content in ' + name);
  const contentOpen = match[0];
  const contentClose = source.lastIndexOf('    </LinearLayout>');
  if (contentClose < 0) throw Error('Expected closing content in ' + name);
  // Keep the existing page padding on its content; the ribbon spans the full width.
  const outer = `    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical">
        <include layout="@layout/include_scrolling_brand" />
`;
  source = source.slice(0, contentClose) + source.slice(contentClose).replace('    </LinearLayout>', '    </LinearLayout>\n    </LinearLayout>');
  source = source.replace(contentOpen, outer + contentOpen);
  changes.set(name, source);
}
if (!process.argv.includes('--apply')) {
  for (const [name, source] of changes) {
    fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'preview', name), source);
  }
  console.log('Prepared five layout changes in build/scrolling-brand/preview.');
} else {
  for (const [name, source] of changes) fs.writeFileSync(path.join(root, name), source);
  console.log('Applied scrolling branding to Home, Progress and Profile.');
}
