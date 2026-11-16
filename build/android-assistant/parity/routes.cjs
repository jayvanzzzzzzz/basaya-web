const fs=require('node:fs');
const file='C:/Projects/BaSaya/app/src/main/java/ph/basaya/app/ui/MainActivity.kt';
let source=fs.readFileSync(file,'utf8');
const newline=source.includes('\r\n')?'\r\n':'\n'; source=source.replaceAll('\r\n','\n');
const edits=[
 ['        private const val EXTRA_OPEN_CHAT = "openChat"','        const val EXTRA_ASSISTANT_TAB = "assistantTab"\n        private const val EXTRA_OPEN_CHAT = "openChat"'],
 ['        selectedTab = savedInstanceState?.getInt(STATE_TAB, 0) ?: 0',`        selectedTab = if (intent.hasExtra(EXTRA_ASSISTANT_TAB)) {
            intent.getIntExtra(EXTRA_ASSISTANT_TAB, 0).coerceIn(0, 3).also { intent.removeExtra(EXTRA_ASSISTANT_TAB) }
        } else savedInstanceState?.getInt(STATE_TAB, 0) ?: 0`],
 ['        setIntent(intent)\n        highlightIds(intent)',`        setIntent(intent)
        if (intent.hasExtra(EXTRA_ASSISTANT_TAB)) {
            selectedTab = intent.getIntExtra(EXTRA_ASSISTANT_TAB, 0).coerceIn(0, 3)
            intent.removeExtra(EXTRA_ASSISTANT_TAB)
            if (isUserReady) bottomNavController?.selectTab(selectedTab, animate = true)
        }
        highlightIds(intent)`]
];
if(source.includes('const val EXTRA_ASSISTANT_TAB')) {console.log('Assistant article routes already applied.');process.exit(0);}
for(const [before,after] of edits) {if(!source.includes(before))throw Error('Route anchor missing');source=source.replace(before,after);}
if(process.argv.includes('--apply'))fs.writeFileSync(file,source.replaceAll('\n',newline));
console.log('Prepared guide navigation for Home, Progress, Account, and Class Chat.');
