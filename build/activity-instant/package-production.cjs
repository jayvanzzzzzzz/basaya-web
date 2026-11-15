const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const workspace = 'C:/xampp/htdocs/BaSaya-web';
const tree = JSON.parse(fs.readFileSync(path.join(__dirname,'production-files.json'),'utf8').replace(/^\uFEFF/,''));
const stage = path.join(__dirname,'production-api');
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const missing = [];
function variants(buffer) {
  const text = buffer.toString('utf8');
  return [buffer,Buffer.from(text.replace(/\r\n/g,'\n')),Buffer.from(text.replace(/\r?\n/g,'\r\n'))];
}
function visit(nodes,prefix='') {
  for (const item of nodes) {
    const relative = prefix + item.name;
    if(item.type==='directory') { visit(item.children || [],relative+'/'); continue; }
    if(item.type!=='file' || !/^[a-f0-9]{40}$/.test(item.uid)) throw Error('Unexpected source file');
    const target = path.resolve(stage,relative);
    if(!target.startsWith(path.resolve(stage)+path.sep)) throw Error('Unsafe source path');
    const candidates = [];
    const local = path.join(workspace,'notify-api',relative);
    if(fs.existsSync(local)) candidates.push(...variants(fs.readFileSync(local)));
    try { candidates.push(...variants(cp.execFileSync('git',['show','HEAD:notify-api/'+relative],{cwd:workspace,windowsHide:true,stdio:['ignore','pipe','ignore']}))); } catch {}
    const matching = candidates.find(buffer=>sha(buffer)===item.uid);
    if(!matching) { missing.push({relative,uid:item.uid}); continue; }
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,relative==='lib/assessments.js' ? fs.readFileSync(local) : matching);
  }
}
visit(tree.find(item=>item.name==='src').children);
fs.writeFileSync(path.join(__dirname,'production-missing.json'),JSON.stringify(missing,null,2));
console.log('Production files requiring retrieval: '+missing.map(x=>x.relative).join(', '));
if(missing.some(x=>x.relative==='lib/assessments.js')) throw Error('Production assessment baseline differs; inspect before packaging');
fs.mkdirSync(path.join(stage,'.vercel'),{recursive:true});
fs.copyFileSync(path.join(workspace,'notify-api/.vercel/project.json'),path.join(stage,'.vercel/project.json'));
