const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const workspace = 'C:/xampp/htdocs/BaSaya-web';
const stage = path.join(__dirname,'production-api');
const tree = JSON.parse(fs.readFileSync(path.join(__dirname,'production-files.json'),'utf8').replace(/^\uFEFF/,''));
let verified = 0;
function walk(nodes,prefix='') {
  for(const item of nodes) {
    const relative = prefix+item.name;
    if(item.type==='directory') { walk(item.children,relative+'/'); continue; }
    const bytes = fs.readFileSync(path.join(stage,relative));
    if(relative==='lib/assessments.js') {
      if(!bytes.equals(fs.readFileSync(path.join(workspace,'notify-api',relative)))) throw Error('Activity API source differs');
    } else if(crypto.createHash('sha1').update(bytes).digest('hex')!==item.uid) throw Error('Unrelated production change: '+relative);
    verified++;
  }
}
walk(tree.find(n=>n.name==='src').children);
console.log('Verified '+verified+' source files; only lib/assessments.js differs from production.');
const dependencies = path.join(stage,'node_modules');
if(!fs.existsSync(dependencies)) fs.symlinkSync(path.join(workspace,'notify-api/node_modules'),dependencies,'junction');
