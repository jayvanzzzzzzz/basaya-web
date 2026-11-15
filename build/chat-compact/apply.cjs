const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json')));
for (const entry of manifest) {
  const target = path.resolve(root,entry.file);
  if (!target.startsWith(path.resolve(root)+path.sep)) throw Error('Invalid path');
  if(hash(fs.existsSync(target)?fs.readFileSync(target):Buffer.alloc(0))!==entry.before) throw Error('Source changed: '+entry.file);
  if(hash(fs.readFileSync(path.join(__dirname,'files',entry.file)))!==entry.after) throw Error('Stage changed');
}
for(const entry of manifest) {
  const target = path.join(root,entry.file);
  if(fs.existsSync(target)) {
    const backup = path.join(__dirname,'before',entry.file);
    fs.mkdirSync(path.dirname(backup),{recursive:true});
    fs.copyFileSync(target,backup);
  }
  fs.copyFileSync(path.join(__dirname,'files',entry.file),target);
}
console.log('Applied '+manifest.length+' compact chat files.');
