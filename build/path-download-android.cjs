const fs=require('node:fs'),path=require('node:path');
const root='C:/Projects/BaSaya', staged=path.resolve('build/path-download-android');
const files=['app/src/main/java/ph/basaya/app/adapter/StudentGroupAdapter.kt','app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt'];
if(process.argv.includes('--apply')) { for(const file of files) fs.copyFileSync(path.join(staged,file),path.join(root,file)); console.log('Applied Android path download controls'); process.exit(); }
if(process.argv.includes('--refine')) {
 const target=path.join(staged,files[1]);let s=fs.readFileSync(target,'utf8');
 s=s.replace('modules · ${members.size} aralin"','modules · ${members.size} aralin · ${members.count { it.isDownloaded }}/${members.size} na-download"');
 s=s.replace('batchAdapter.setBulkDownloading(true)\n        updateDownloadAllButton()','batchAdapter.setBulkDownloading(true)\n        showLessons()');
 fs.writeFileSync(target,s);process.exit();
}
for(const file of files) {
 let s=fs.readFileSync(path.join(root,file),'utf8');
 const rep=(a,b)=>{if(!s.includes(a))throw Error('Missing '+a);s=s.replace(a,b)};
 if(file.includes('StudentGroupAdapter')) {
  rep('private val open: (StudentGroup) -> Unit','private val download: ((StudentGroup) -> Unit)? = null, private val options: ((StudentGroup, View) -> Unit)? = null, private val canDownload: (StudentGroup) -> Boolean = { false }, private val open: (StudentGroup) -> Unit');
  rep('        frame.addView(column)', `        if (download != null) column.addView(text("I-download",14f,R.color.home_ink).apply {
            minHeight=(48*d).toInt(); gravity=Gravity.CENTER_VERTICAL
            setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_download,0,0,0)
            compoundDrawablePadding=(8*d).toInt(); compoundDrawableTintList=android.content.res.ColorStateList.valueOf(ContextCompat.getColor(c,R.color.home_ink))
            isEnabled=canDownload(group); alpha=if(isEnabled) 1f else 0.45f
            isClickable=true; isFocusable=true; contentDescription="I-download: "+group.title
            setOnClickListener { download.invoke(group) }
        })
        frame.addView(column)`);
  rep('topMargin=(22*d).toInt();rightMargin=(18*d).toInt()', 'topMargin=(70*d).toInt();rightMargin=(18*d).toInt()');
  rep('        card.addView(frame);', `        if(options != null) frame.addView(android.widget.ImageButton(c).apply {
            setImageResource(R.drawable.ic_lesson_more); setColorFilter(ContextCompat.getColor(c,R.color.home_ink))
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            contentDescription="Mga opsyon sa download: "+group.title
            setOnClickListener { options.invoke(group,this) }
        },FrameLayout.LayoutParams((48*d).toInt(),(48*d).toInt(),Gravity.TOP or Gravity.END).apply { topMargin=(10*d).toInt();rightMargin=(8*d).toInt() })
        card.addView(frame);`);
 } else {
  rep('    private var isBulkDownloading = false','    private var isRemovingDownloads = false\n    private var isBulkDownloading = false');
  rep('modules · ${members.size} aralin"', 'modules · ${members.size} aralin · ${members.count { it.isDownloaded }}/${members.size} na-download"');
  rep('        btnDownloadAll.visibility=View.GONE','        if (!isBulkDownloading) btnDownloadAll.visibility=View.GONE');
  rep('StudentGroupAdapter(rows) { row ->', `StudentGroupAdapter(rows,
            download = if(selectedPath == null) { row -> downloadAllLessons(row.id) } else null,
            options = if(selectedPath == null) { row, anchor -> showPathDownloadOptions(row.id, anchor) } else null,
            canDownload = { row -> !isBulkDownloading && !isRemovingDownloads && !adapter.hasActiveDownloads() && hasInternetConnection() && allLessons.any { hierarchy.path(it) == row.id && !it.isDownloaded && hierarchy.blocker(it,allLessons) == null && LessonSchedule.canOpen(requireContext(),it) } }
        ) { row ->`);
  rep('    private fun downloadAllLessons() {','    private fun downloadAllLessons(pathId: String? = selectedPath) {');
  rep('if (isBulkDownloading || adapter.hasActiveDownloads() || !hasInternetConnection()) return','if (isBulkDownloading || isRemovingDownloads || adapter.hasActiveDownloads() || !hasInternetConnection()) return');
  rep('val queue = allLessons.filter { !it.isDownloaded && LessonSchedule.availability(context, it) == Availability.OPEN }','val queue = hierarchy.ordered(allLessons.filter { (pathId == null || hierarchy.path(it) == pathId) && !it.isDownloaded && hierarchy.blocker(it,allLessons) == null && LessonSchedule.canOpen(context,it) })');
  rep('if (lesson.isDownloaded || LessonSchedule.availability(context, lesson) != Availability.OPEN) continue','if (lesson.isDownloaded || hierarchy.blocker(lesson,allLessons) != null || !LessonSchedule.canOpen(context,lesson)) continue');
  rep('if (view === ownerView) updateDownloadAllButton()', 'if (view === ownerView) showLessons()');
  rep('batchAdapter.setBulkDownloading(true)\n        updateDownloadAllButton()', 'batchAdapter.setBulkDownloading(true)\n        showLessons()');
  rep('!isBulkDownloading && !adapter.hasActiveDownloads() && hasInternetConnection()', '!isBulkDownloading && !isRemovingDownloads && !adapter.hasActiveDownloads() && hasInternetConnection()');
  rep('    private fun handleDownload(lesson:', `    private fun showPathDownloadOptions(pathId: String, anchor: View) {
        val content = layoutInflater.inflate(R.layout.popup_lesson_options, null)
        val density = resources.displayMetrics.density
        val popup = PopupWindow(content, minOf((260*density).toInt(), resources.displayMetrics.widthPixels-(32*density).toInt()), ViewGroup.LayoutParams.WRAP_CONTENT, true).apply {
            setBackgroundDrawable(ContextCompat.getDrawable(requireContext(),R.drawable.bg_account_menu))
            elevation=12*density; isOutsideTouchable=true
        }
        val busy=isBulkDownloading || isRemovingDownloads || adapter.hasActiveDownloads()
        content.findViewById<View>(R.id.actionDownload).apply {
            isEnabled=!busy && hasInternetConnection() && allLessons.any { hierarchy.path(it)==pathId && !it.isDownloaded && hierarchy.blocker(it,allLessons)==null && LessonSchedule.canOpen(requireContext(),it) }
            alpha=if(isEnabled) 1f else 0.45f
            setOnClickListener { popup.dismiss(); downloadAllLessons(pathId) }
        }
        content.findViewById<View>(R.id.actionRemoveDownload).apply {
            visibility=if(allLessons.any { hierarchy.path(it)==pathId && it.isDownloaded }) View.VISIBLE else View.GONE
            isEnabled=!busy; alpha=if(isEnabled) 1f else 0.45f
            setOnClickListener { popup.dismiss(); removePathDownloads(pathId) }
        }
        popup.showAsDropDown(anchor,0,0,Gravity.END)
    }

    private fun removePathDownloads(pathId: String) {
        if(isBulkDownloading || isRemovingDownloads || adapter.hasActiveDownloads()) return
        val uid=authHelper.getCurrentUser()?.uid ?: return
        val classId=currentClassId ?: return
        ActionConfirmation.show(requireContext(), "Alisin ang download ng lesson path?", "Kailangan mo ng internet para i-download muli ang mga aralin. Mananatili ang iyong mga resulta.", "Alisin", danger=true) {
            if(!isAdded || view==null || currentClassId!=classId || authHelper.getCurrentUser()?.uid!=uid || isBulkDownloading || isRemovingDownloads || adapter.hasActiveDownloads()) return@show
            isRemovingDownloads=true; adapter.setBulkDownloading(true); showLessons()
            viewLifecycleOwner.lifecycleScope.launch {
                var success=true
                try {
                    val repo=LessonRepository(requireContext())
                    val queue=allLessons.filter { hierarchy.path(it)==pathId && it.isDownloaded }
                    for(lesson in queue) {
                        if(currentClassId!=classId || authHelper.getCurrentUser()?.uid!=uid) break
                        if(repo.removeDownload(lesson.id)) allLessons=allLessons.map { if(it.id==lesson.id) it.copy(isDownloaded=false) else it }
                        else success=false
                    }
                    if(isAdded) Toast.makeText(requireContext(),if(success) R.string.toast_remove_download_success else R.string.toast_remove_download_failed,Toast.LENGTH_SHORT).show()
                } finally {
                    isRemovingDownloads=false; adapter.setBulkDownloading(false)
                    if(isAdded && view!=null) showLessons()
                }
            }
        }
    }

    private fun handleDownload(lesson:`);
 }
 fs.mkdirSync(path.dirname(path.join(staged,file)),{recursive:true});fs.writeFileSync(path.join(staged,file),s);
}
console.log('Prepared Android changes in '+staged);
