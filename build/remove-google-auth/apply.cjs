const fs = require('node:fs');
const path = require('node:path');
const android = process.argv.includes('--android');
const root = android ? 'C:/Projects/BaSaya' : path.resolve(__dirname, '../..');
function edit(file, change) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8');
  const result = change(source.replace(/\r\n/g, '\n'));
  if (result === source.replace(/\r\n/g, '\n')) throw Error('No change: ' + file);
  fs.writeFileSync(target, result.replace(/\n/g, '\r\n'));
  console.log('Updated ' + file);
}
if (!android) {
  edit('index.html', s => s.replace(/            <p class="auth-google-divider"[\s\S]*?\n            <\/button>\n/, ''));
  edit('js/login.js', s => s.replace(/googleLoginButton\.addEventListener\("click",[\s\S]*?\nonAuthStateChanged\(/, 'onAuthStateChanged('));
} else {
  edit('app/src/main/java/ph/basaya/app/ui/LogInActivity.kt', s => {
    s = s.replace(/^import (?:androidx\.activity\.result\.contracts\.ActivityResultContracts|com\.google\.android\.gms\..*|com\.google\.firebase\.auth\.GoogleAuthProvider)\n/gm, '');
    s = s.replace(/^.*(?:private lateinit var btnGoogleLogin|btnGoogleLogin =|btnGoogleLogin\.setOnClickListener|btnGoogleLogin\.isEnabled|btnGoogleLogin\.visibility|val google =).*\n/gm, '');
    s = s.replace(/    private val googleSignInLauncher =[\s\S]*?    override fun onCreate/, '    override fun onCreate');
    s = s.replace(/    private fun startGoogleSignIn\(\)[\s\S]*?    override fun onDestroy/, '    override fun onDestroy');
    s = s.replace(/row\.findViewById<TextView>\(R\.id\.recentAccountHint\)\.setText\(\n\s*if \(account\.provider == "google.com"\) R.string.recent_accounts_google else R.string.recent_accounts_password\)/, 'row.findViewById<TextView>(R.id.recentAccountHint).setText(R.string.recent_accounts_password)');
    s = s.replace(/^\s*google -> R.string.recent_accounts_google\n/m, '');
    s = s.replace(/if \(google\) View.GONE else View.VISIBLE/g, 'View.VISIBLE');
    s = s.replace('val target = if (google) btnGoogleLogin else if (account != null) etPassword else etEmail', 'val target = if (account != null) etPassword else etEmail');
    s = s.replace('if (!google) target.post', 'target.post');
    if (/btnGoogleLogin|googleSignIn|startGoogle|signInWithGoogle|\(google\)|google ->/.test(s)) throw Error('Google login reference remains');
    return s;
  });
  edit('app/src/main/res/layout/activity_log_in.xml', s => s.replace(/\n                <com.google.android.material.button.MaterialButton\n                    android:id="@\+id\/btnGoogleLogin"[\s\S]*?\/>\n/, '\n'));
}
