const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='C:/Projects/BaSaya', manifest=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function edit(file,transform){const before=fs.readFileSync(path.join(root,file));const after=transform(before.toString('utf8').replace(/\r\n/g,'\n'));const out=path.join(__dirname,'files',file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,after);manifest.push({file,before:hash(before),after:hash(Buffer.from(after))});}
function once(s,a,b){if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))throw Error('Anchor: '+a);return s.replace(a,b);}
edit('app/src/main/res/layout/fragment_chat.xml',s=>{
const start=s.indexOf('    <!-- Header:');const end=s.indexOf('    <!-- Messages,',start);if(start<0||end<0)throw Error('Header anchors missing');
return s.slice(0,start)+`    <!-- Compact class identity: reserve the screen for conversation. -->
    <LinearLayout
        android:id="@+id/chatHeader"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:minHeight="64dp"
        android:background="@drawable/ch_header"
        android:gravity="center_vertical"
        android:orientation="horizontal"
        android:paddingHorizontal="16dp"
        android:paddingVertical="8dp">
        <TextView
            android:id="@+id/tvChatClass"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:accessibilityHeading="true"
            android:fontFamily="@font/be_vietnam_semi_bold"
            android:text="@string/ch_title"
            android:textColor="@color/ch_ink"
            android:textSize="16sp"
            android:maxLines="2"
            android:ellipsize="end"
            tools:text="Grade 8 - Aguinaldo" />
        <ImageButton
            android:id="@+id/btnMembers"
            android:layout_width="48dp"
            android:layout_height="48dp"
            android:layout_marginStart="8dp"
            android:background="@drawable/ch_info_button"
            android:contentDescription="@string/ch_members"
            android:padding="14dp"
            android:scaleType="fitCenter"
            android:src="@drawable/ic_info"
            android:tooltipText="@string/ch_members"
            android:visibility="gone"
            app:tint="@color/ch_ink_soft"
            tools:visibility="visible"
            android:stateListAnimator="@animator/chat_press" />
    </LinearLayout>
`+s.slice(end);
});
edit('app/src/main/java/ph/basaya/app/ui/fragment/ChatFragment.kt',s=>{
s=once(s,'    private lateinit var tvClassTile: TextView\n','');
s=once(s,'        tvClassTile = view.findViewById(R.id.tvClassTile)\n','');
s=once(s,`        tvChatClass.text = className
        tvChatClass.visibility = if (hasClass && className.isNotBlank()) View.VISIBLE else View.GONE
        tvClassTile.text = initials(className)`,`        tvChatClass.text = className.takeIf { hasClass && it.isNotBlank() }
            ?: getString(R.string.ch_title)`);
return s;
});
edit('app/src/main/java/ph/basaya/app/ui/MainActivity.kt',s=>{
s=once(s,'ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { _, insets ->','ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { root, insets ->');
s=once(s,'            val statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top',`            val statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            // Chat uses its own compact header in place of the shared masthead.
            root.setPadding(root.paddingLeft, if (selectedTab == TAB_CHAT) statusBarHeight else 0,
                root.paddingRight, root.paddingBottom)`);
s=once(s,'        setupBottomNav()\n        deliverHighlight()', '        setupBottomNav()\n        updateChatChrome()\n        deliverHighlight()');
s=once(s,'        if (fragment === activeFragment) return','        if (fragment === activeFragment) { updateChatChrome(); return }');
s=once(s,'        activeFragment = fragment\n    }',`        activeFragment = fragment
        updateChatChrome()
    }

    private fun updateChatChrome() {
        val inChat = activeFragment === chatFragment
        findViewById<View>(R.id.appBarLayout).visibility = if (inChat) View.GONE else View.VISIBLE
        val root = findViewById<View>(R.id.main)
        root.setBackgroundResource(if (inChat) R.color.ch_surface else R.color.home_bg)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars =
            inChat && (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES
        ViewCompat.requestApplyInsets(root)
    }`);
return s;
});
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(__dirname,'apply.cjs'),fs.readFileSync(path.join(__dirname,'../pagsasanay-ui/apply.cjs'),'utf8').replace('Pagsasanay UI files.','compact chat files.'));
console.log('Staged '+manifest.length+' compact chat files.');
