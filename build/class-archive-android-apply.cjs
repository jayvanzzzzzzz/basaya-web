const fs = require('node:fs');
const path = require('node:path');
const root = 'C:/Projects/BaSaya';
const edits = [
 ['app/src/main/java/ph/basaya/app/ui/fragment/ProfileFragment.kt', s => {
   s = s.replace('    private var declinedNote = ""', '    private var declinedNote = ""\n    private var stopArchiveObserver: (() -> Unit)? = null');
   s = s.replace('        val uid = AuthHelper().getCurrentUser()?.uid ?: return\n        membershipListener =', '        stopArchiveObserver = ph.basaya.app.data.membership.EnrollmentAccess.observe {\n            if (isAdded && view != null) showClassSection()\n        }\n        val uid = AuthHelper().getCurrentUser()?.uid ?: return\n        membershipListener =');
   s = s.replace('        membershipListener?.remove()\n        membershipListener = null', '        stopArchiveObserver?.invoke()\n        stopArchiveObserver = null\n        membershipListener?.remove()\n        membershipListener = null');
   s = s.replace('        if (!hasClass) pfClassName.text', '        if (hasClass && ph.basaya.app.data.membership.EnrollmentAccess.archived) {\n            pfClassName.text = getString(R.string.pf_class_archived_name, profile.className.ifBlank { profile.classId })\n        }\n        if (!hasClass) pfClassName.text');
   s = s.replace('pfLeaveStatusText.setText(R.string.pf_leave_pending_text)', 'pfLeaveStatusText.setText(if (ph.basaya.app.data.membership.EnrollmentAccess.archived) R.string.pf_leave_archived_pending else R.string.pf_leave_pending_text)');
   s = s.replace('getString(R.string.pf_leave_dialog_message, className)', 'getString(if (ph.basaya.app.data.membership.EnrollmentAccess.archived) R.string.pf_leave_archived_message else R.string.pf_leave_dialog_message, className)');
   return s;
 }],
 ['app/src/main/java/ph/basaya/app/ui/fragment/HomeFragment.kt', s => s.replace('tvEmptyLessons.text=ph.basaya.app.data.membership.EnrollmentAccess.message + "\\n\\nMakipag-ugnayan sa guro"\n                    tvEmptyLessons.setOnClickListener { requireActivity().findViewById<View>(R.id.navChat)?.performClick() }', 'tvEmptyLessons.text=ph.basaya.app.data.membership.EnrollmentAccess.message + if (ph.basaya.app.data.membership.EnrollmentAccess.archived) "\\n\\nBuksan ang Account upang humiling na umalis sa klase" else "\\n\\nMakipag-ugnayan sa guro"\n                    tvEmptyLessons.setOnClickListener {\n                        val destination = if (ph.basaya.app.data.membership.EnrollmentAccess.archived) R.id.navProfile else R.id.navChat\n                        requireActivity().findViewById<View>(destination)?.performClick()\n                    }')],
 ['app/src/main/res/values/strings_profile.xml', s => s.replace('</resources>', '    <string name="pf_class_archived_name">%1$s (Naka-archive)</string>\n    <string name="pf_leave_archived_pending">Humiling kang umalis sa naka-archive na klase. Hinihintay ang pag-apruba ng iyong guro. Napanatili ang iyong progreso.</string>\n    <string name="pf_leave_archived_message">Naka-archive ang %1$s. Maaari ka pa ring humiling na umalis. Kapag pumayag ang iyong guro, matatapos ang iyong pagiging miyembro at itatabi ang iyong progreso.</string>\n</resources>')],
];
for (const [relative, edit] of edits) {
 const file = path.join(root, relative), before = fs.readFileSync(file,'utf8');
 const after = edit(before.replace(/\r\n/g,'\n'));
 if (after === before.replace(/\r\n/g,'\n')) throw Error('No replacement: '+relative);
 fs.writeFileSync(file, after);
 console.log('Updated '+relative);
}
