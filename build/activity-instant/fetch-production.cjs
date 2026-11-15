const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const workspace = 'C:/xampp/htdocs/BaSaya-web';
const missing = JSON.parse(fs.readFileSync(path.join(__dirname,'production-missing.json'),'utf8'));
for(const file of missing) {
  if(!['lib/assessmentScoring.js','lib/fluency.js'].includes(file.relative) || !/^[a-f0-9]{40}$/.test(file.uid)) throw Error('Unexpected file');
  const endpoint = '/v8/deployments/dpl_FtdXBsywGDofSYrWhYBry9sxFv2a/files/'+file.uid+
    '?teamId=team_yQ9vFBIcgHxnTD3wKRpn1LJU&path='+encodeURIComponent(file.relative);
  const output = cp.execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile','-Command',"npx.cmd --yes vercel@65.9.0 api '"+endpoint+"' --raw"],
    {cwd:path.join(workspace,'notify-api'),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const reply = JSON.parse(output);
  if(typeof reply.data!=='string') throw Error('Unexpected file response keys: '+Object.keys(reply).join(','));
  const bytes = Buffer.from(reply.data,'base64');
  if(crypto.createHash('sha1').update(bytes).digest('hex')!==file.uid) throw Error('Production source hash mismatch');
  const target = path.resolve(__dirname,'production-api',file.relative);
  if(!target.startsWith(path.resolve(__dirname,'production-api')+path.sep)) throw Error('Unsafe path');
  fs.writeFileSync(target,bytes);
  console.log('Restored production '+file.relative);
}
