const fs=require('node:fs');
const path=require('node:path');
const root='C:/Projects/BaSaya/app/src/main';
const changes=[];
function change(file,fn){const p=path.join(root,file),before=fs.readFileSync(p,'utf8');if(before.includes('import ph.basaya.app.ui.feedback.ActionConfirmation'))return;const after=fn(before.replace(/\r\n/g,'\n'));changes.push({p,before,after});}
function swap(s,a,b){if(!s.includes(a))throw Error('Missing native anchor '+a);return s.replace(a,b);}
const base='java/ph/basaya/app/ui/';
const helper=`package ph.basaya.app.ui.feedback

import android.app.Activity
import android.content.Context
import java.util.WeakHashMap

/** Confirmation only; callers keep validation, network writes and loading states. */
object ActionConfirmation {
    private val showing = WeakHashMap<Context, Boolean>()
    fun show(context: Context, title: String, message: String, action: String,
             danger: Boolean = false, onCancel: () -> Unit = {}, onConfirm: () -> Unit) {
        if ((context as? Activity)?.let { it.isFinishing || it.isDestroyed } == true) return
        if (showing[context] == true) return
        showing[context] = true
        var accepted = false
        val dialog = StudioDialogBuilder(context, if (danger) FeedbackTone.DANGER else FeedbackTone.INFO)
            .setTitle(title)
            .setMessage(message)
            .setNegativeButton("Bumalik", null)
            .setPositiveButton(action) { _, _ ->
                accepted = true
                if ((context as? Activity)?.let { it.isFinishing || it.isDestroyed } != true) onConfirm()
            }.create()
        dialog.setOnDismissListener {
            showing.remove(context)
            if (!accepted) onCancel()
        }
        dialog.show()
        dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEGATIVE)?.requestFocus()
    }
}
`;
changes.push({p:path.join(root,base+'feedback/ActionConfirmation.kt'),before:null,after:helper});
const imp='import ph.basaya.app.ui.feedback.ActionConfirmation\n';
function imported(s){return s.replace(/(package [^\n]+\n)/,'$1\n'+imp);}
change(base+'fragment/ProfileFragment.kt',s=>{
 s=imported(s);
 s=swap(s,'            saveProfile(updated, btnSave) { sheet.dismiss() }',`            ActionConfirmation.show(requireContext(), "I-save ang mga pagbabago?", "Maa-update ang impormasyon sa iyong account.", "I-save") {
                if (isAdded && view != null && sheet.isShowing) saveProfile(updated, btnSave) { sheet.dismiss() }
            }`);
 return swap(s,'            changePassword(current, new, btnSave, tilCurrent, tilNew) { sheet.dismiss() }',`            ActionConfirmation.show(requireContext(), "Palitan ang password?", "Gamitin ang bagong password sa susunod mong pag-sign in.", "Palitan") {
                if (isAdded && view != null && sheet.isShowing) changePassword(current, new, btnSave, tilCurrent, tilNew) { sheet.dismiss() }
            }`);
});
change(base+'RegisterActivity.kt',s=>{
 s=imported(s);s=swap(s,'private fun submit() {','private fun submit(confirmed: Boolean = false) {');
 return swap(s,'        setLoading(true)\n',`        if (!confirmed) {
            ActionConfirmation.show(this, "Gumawa ng account?", "Gagawin ang student account gamit ang impormasyong inilagay mo.", "Gumawa ng account") { submit(true) }
            return
        }
        setLoading(true)
`);
});
change(base+'CompleteProfileActivity.kt',s=>{
 s=imported(s);s=swap(s,'private fun saveProfile() {','private fun saveProfile(confirmed: Boolean = false) {');
 return swap(s,'        setLoading(true)\n        val profile = User(',`        if (!confirmed) {
            ActionConfirmation.show(this, "I-save ang iyong impormasyon?", "Tatapusin nito ang pag-set up ng iyong account.", "I-save") { saveProfile(true) }
            return
        }
        setLoading(true)
        val profile = User(`);
});
change(base+'JoinClassActivity.kt',s=>{
 s=imported(s);
 return swap(s,'                joinClass(code)',`                ActionConfirmation.show(this, "Ipadala ang kahilingan?", "Susuriin ng guro ang iyong kahilingang sumali sa klase.", "Ipadala") { if (!submitting && !pending) joinClass(code) }`);
});
change(base+'fragment/HomeFragment.kt',s=>{
 s=imported(s);
 s=swap(s,'private fun handleRemoveDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {',`private fun handleRemoveDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {
        ActionConfirmation.show(requireContext(), "Alisin ang na-download na aralin?", "Kailangan mo ng internet para i-download muli ito. Mananatili ang iyong mga resulta.", "Alisin", danger = true, onCancel = { onResult(false) }) {
            if (isAdded && view != null) removeConfirmedDownload(lesson, onResult) else onResult(false)
        }
    }

    private fun removeConfirmedDownload(lesson: LessonEntity, onResult: (Boolean) -> Unit) {`);
 return s;
});
change(base+'LogInActivity.kt',s=>{
 s=imported(s);
 return swap(s,`                    if (RecentAccounts.remove(this@LogInActivity, account.uid)) showRecentAccounts()
                    else Toast.makeText(this@LogInActivity, R.string.recent_accounts_remove_failed, Toast.LENGTH_SHORT).show()`,
 `                    ActionConfirmation.show(this@LogInActivity, "Alisin ang account sa device?", "Mawawala ito sa listahan ng mga kamakailang account. Hindi mabubura ang mismong account.", "Alisin", danger = true) {
                        if (RecentAccounts.remove(this@LogInActivity, account.uid)) showRecentAccounts()
                        else Toast.makeText(this@LogInActivity, R.string.recent_accounts_remove_failed, Toast.LENGTH_SHORT).show()
                    }`);
});
change(base+'pronunciation/ReadingActivity.kt',s=>{
 s=imported(s);
 return swap(s,`                stopAudio()
                lifecycleScope.launch {
                    try { if(pageIndex < total - 1) { session.act("next"); render(); sync() } else { busy=true; render(); session.submit(); busy=false; render() } }
                    catch(error:Exception) { busy=false; message=error.message.orEmpty(); render() }
                }`,
 `                val advance = {
                    stopAudio()
                    lifecycleScope.launch {
                        try { if(pageIndex < total - 1) { session.act("next"); render(); sync() } else { busy=true; render(); session.submit(); busy=false; render() } }
                        catch(error:Exception) { busy=false; message=error.message.orEmpty(); render() }
                    }
                }
                if (pageIndex == total - 1) {
                    ActionConfirmation.show(this, "Ipasa ang iyong pagbasa?", "Ipapasa ang mga recording sa iyong guro para mabigyan ng marka.", "Ipasa") { if (!busy) { advance(); } }
                } else { advance(); }`);
});
// All anchors must match before any file is written; preview is read-only.
if(process.argv.includes('--apply')){
 for(const c of changes){if(c.before!==null&&fs.readFileSync(c.p,'utf8')!==c.before)throw Error('Changed during preparation: '+c.p);}
 for(const c of changes)fs.writeFileSync(c.p,c.after);
 console.log('Applied '+changes.length+' native confirmation files.');
}else console.log(changes.map(c=>c.p).join('\n'));
