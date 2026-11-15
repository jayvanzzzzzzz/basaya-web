const fs = require('node:fs');
const path = require('node:path');

const before = 'header.addView(button("‹", false) { finish() }.apply { contentDescription = "Bumalik" }, LinearLayout.LayoutParams(dp(50), dp(50)))';
const after = `header.addView(ImageButton(this).apply {
            setImageResource(R.drawable.cw_ic_back)
            imageTintList = ColorStateList.valueOf(ink)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(11), dp(11), dp(11), dp(11))
            background = shape(paper, 16)
            contentDescription = "Bumalik"
            tooltipText = "Bumalik"
            setOnClickListener { if (!held && !busy) finish() }
        }, LinearLayout.LayoutParams(dp(50), dp(50)))`;
const target = process.argv.includes('--android')
  ? 'C:/Projects/BaSaya/app/src/main/java/ph/basaya/app/ui/pronunciation/ReadingActivity.kt'
  : path.resolve(__dirname, '../../tools/android-fluency/ReadingActivity.kt');
const source = fs.readFileSync(target, 'utf8');
if (source.includes(after)) {
  console.log('Back icon already updated.');
} else {
  if (source.split(before).length !== 2) throw new Error('Expected exactly one Bigkas back button');
  fs.writeFileSync(target, source.replace(before, after));
  console.log('Updated Bigkas back arrow to 28dp inside a 50dp touch target.');
}
