const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
for (const {relative,hash} of manifest) {
  const target = path.resolve(root,relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Outside target app');
  const actual = fs.existsSync(target) ? crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') : null;
  if (actual !== hash) throw Error('Source changed since inspection: ' + relative);
}
for (const {relative} of manifest) {
  const target = path.join(root,relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'files',relative),target);
}
console.log('Applied ' + manifest.length + ' game files.');
