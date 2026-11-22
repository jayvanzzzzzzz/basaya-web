const fs=require('fs'),path=require('path'),crypto=require('crypto');const root='C:/Projects/BaSaya/',out=path.join(__dirname,'staged'),file='app/src/main/java/ph/basaya/app/data/membership/EnrollmentAccess.kt';const original=fs.readFileSync(root+file);let s=original.toString('utf8');s=s.replace('currentClass=classId;classListener?.remove();archived=false','currentClass=classId;classListener?.remove();classSignature=null;archived=ProgressSession.isArchived(uid)');s=s.replace('private var foreground =','private var wasBlocked=false\n    private var foreground =');s=s.replace('private fun changed() { observers.toList().forEach { it() };foreground.get()?.let(::enforce) }',`private fun changed() {
        val newlyBlocked=blocked && !wasBlocked;wasBlocked=blocked
        observers.toList().forEach { it() }
        foreground.get()?.let { activity ->
            if(newlyBlocked && activity is MainActivity)activity.findViewById<android.view.View>(ph.basaya.app.R.id.navHome)?.performClick()
            enforce(activity)
        }
    }`);fs.writeFileSync(path.join(out,file),s);fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify([{file,hash:crypto.createHash('sha256').update(original).digest('hex')}],null,2));
