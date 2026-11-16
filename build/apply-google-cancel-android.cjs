const fs=require('node:fs');
const file='C:/Projects/BaSaya/app/src/main/java/ph/basaya/app/ui/LogInActivity.kt';
const before=fs.readFileSync(file,'utf8');
let source=before.replace(/\r\n/g,'\n');
function replace(a,b){if(!source.includes(a))throw Error('Missing anchor: '+a);source=source.replace(a,b);}
replace('    private fun startGoogleSignIn() {','    private fun startGoogleSignIn() {\n        if (loginBusy) return');
replace('            googleSignInLauncher.launch(googleSignInClient.signInIntent)',`            try {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            } catch (error: RuntimeException) {
                Log.e("LOGIN_DEBUG", "Could not open Google account selection", error)
                setLoading(false)
                Toast.makeText(this, R.string.register_google_failed, Toast.LENGTH_SHORT).show()
            }`);
replace('                Toast.makeText(this, R.string.register_google_failed, Toast.LENGTH_SHORT).show()\n            }\n        }\n\n    override fun onCreate',`                if (e.statusCode != com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes.SIGN_IN_CANCELLED) {
                    Toast.makeText(this, R.string.register_google_failed, Toast.LENGTH_SHORT).show()
                }
            }
        }

    override fun onCreate`);
if(process.argv.includes('--apply')){
 if(fs.readFileSync(file,'utf8')!==before)throw Error('File changed');
 fs.writeFileSync(file,source);console.log('Android Google cancellation safeguards applied.');
}else console.log('Prepared Android launch-error recovery, repeat-tap guard and quiet chooser cancellation.');
